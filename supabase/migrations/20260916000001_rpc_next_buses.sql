-- RPC para obtener el siguiente autobús más cercano a una parada, filtrado por destino.
-- Lógica:
-- 1. Identificar rutas que tienen como destino el objetivo.
-- 2. Identificar paradas candidatas (paradas en esa ruta que están antes del destino).
-- 3. Ordenar paradas candidatas por cercanía (usando PostGIS).
-- 4. Tomar la parada más cercana y calcular las próximas salidas hoy.

CREATE OR REPLACE FUNCTION get_next_buses_for_destination(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    target_destination TEXT,
    current_time_mins INT,
    today DATE,
    dia_semana_idx INT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    result JSONB;
BEGIN
    -- 1. CTE: Rutas que van al destino
    WITH rutas_destino AS (
        SELECT id_ruta
        FROM rutas
        WHERE destino ILIKE '%' || target_destination || '%'
    ),
    -- 2. CTE: Paradas candidatas (paradas en ruta antes del destino)
    paradas_candidatas AS (
        SELECT DISTINCT
            s.parada_id,
            s.ruta_id
        FROM secuencia_desfaces s
        JOIN rutas_destino rd ON s.ruta_id = rd.id_ruta
    ),
    -- 3. La parada más cercana de las candidatas
    parada_cercana AS (
        SELECT 
            p.id_parada,
            p.parada,
            p.geom::geography as geom,
            ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) as dist
        FROM paradas p
        JOIN paradas_candidatas pc ON p.id_parada = pc.parada_id
        ORDER BY dist ASC
        LIMIT 1
    ),
    -- 4. Salidas de hoy para las rutas que pasan por la parada cercana
    salidas_candidatas AS (
        SELECT 
            sc.ruta_id,
            sc.salida_origen,
            sd.minutos_desde_origen,
            (EXTRACT(HOUR FROM sc.salida_origen::time) * 60 + EXTRACT(MINUTE FROM sc.salida_origen::time) + sd.minutos_desde_origen) as hora_llegada_mins
        FROM salidas_cabeceras sc
        JOIN secuencia_desfaces sd ON sc.ruta_id = sd.ruta_id
        JOIN parada_cercana pc ON sd.parada_id = pc.id_parada
        JOIN calendarios c ON sc.calendario_id = c.id
        WHERE (
            (dia_semana_idx = 0 AND c.domingo) OR
            (dia_semana_idx = 1 AND c.lunes) OR
            (dia_semana_idx = 2 AND c.martes) OR
            (dia_semana_idx = 3 AND c.miercoles) OR
            (dia_semana_idx = 4 AND c.jueves) OR
            (dia_semana_idx = 5 AND c.viernes) OR
            (dia_semana_idx = 6 AND c.sabado)
        )
        AND today >= c.fecha_inicio AND today <= c.fecha_fin
    )
    -- 5. Filtrar las futuras y tomar 5
    SELECT jsonb_build_object(
        'parada', pc.parada,
        'distancia_metros', pc.dist,
        'proximas_salidas', (
            SELECT jsonb_agg(s)
            FROM (
                SELECT 
                    sc.ruta_id,
                    sc.hora_llegada_mins,
                    (sc.hora_llegada_mins - current_time_mins) as tiempo_restante_mins
                FROM salidas_candidatas sc
                WHERE sc.hora_llegada_mins >= current_time_mins
                ORDER BY sc.hora_llegada_mins ASC
                LIMIT 5
            ) s
        )
    )
    INTO result
    FROM parada_cercana pc;

    RETURN result;
END;
$$;
