-- 1. Habilitar la extensión PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Asegurarse de que la tabla 'paradas' tenga una columna geom
-- Usaremos geometry para ser más flexibles, y luego haremos cast a geography para cálculos
ALTER TABLE paradas ADD COLUMN IF NOT EXISTS geom geometry(POINT, 4326);

-- 3. Poblar la columna geom usando latitud y longitud
UPDATE paradas
SET geom = ST_SetSRID(ST_MakePoint(longitud::double precision, latitud::double precision), 4326);

-- 4. Crear un índice espacial GIST para búsquedas rápidas de cercanía
CREATE INDEX IF NOT EXISTS paradas_geom_idx ON paradas USING GIST (geom);

-- 5. Crear una función RPC para buscar la parada más cercana
-- Esto es lo que usaremos desde el Frontend/Edge Functions
CREATE OR REPLACE FUNCTION buscar_parada_mas_cercana(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    max_distance_meters INT DEFAULT 1000
)
RETURNS TABLE(id_parada TEXT, parada TEXT, distancia_metros FLOAT) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id_parada,
        p.parada,
        ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) AS distancia_metros
    FROM paradas p
    WHERE ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography, max_distance_meters)
    ORDER BY distancia_metros ASC
    LIMIT 1;
END;
$$;
