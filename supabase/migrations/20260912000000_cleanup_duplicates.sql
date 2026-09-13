-- Limpieza de duplicados y constraints únicos
-- El sync de scripts/sync.js se ejecutó varias veces sin idempotencia,
-- duplicando filas. Este script elimina los duplicados existentes
-- conservando el id menor y añade constraints únicos (claves naturales)
-- para que el .upsert(..., { onConflict }) del sync sea idempotente.
-- Es seguro ejecutarlo varias veces (DROP CONSTRAINT IF EXISTS).

-- 1. salidas_cabeceras: eliminar duplicados conservando el id menor
DELETE FROM salidas_cabeceras a
USING salidas_cabeceras b
WHERE a.id > b.id
  AND a.ruta_id = b.ruta_id
  AND a.salida_origen = b.salida_origen
  AND a.tipo_dia = b.tipo_dia;

ALTER TABLE salidas_cabeceras DROP CONSTRAINT IF EXISTS salidas_cabeceras_unique;
ALTER TABLE salidas_cabeceras
  ADD CONSTRAINT salidas_cabeceras_unique UNIQUE (ruta_id, salida_origen, tipo_dia);

-- 2. secuencia_desfaces: eliminar duplicados conservando el id menor
DELETE FROM secuencia_desfaces a
USING secuencia_desfaces b
WHERE a.id > b.id
  AND a.ruta_id = b.ruta_id
  AND a.parada_id = b.parada_id
  AND a.orden_secuencia = b.orden_secuencia
  AND a.minutos_desde_origen = b.minutos_desde_origen;

ALTER TABLE secuencia_desfaces DROP CONSTRAINT IF EXISTS secuencia_desfaces_unique;
ALTER TABLE secuencia_desfaces
  ADD CONSTRAINT secuencia_desfaces_unique UNIQUE (ruta_id, parada_id, orden_secuencia, minutos_desde_origen);

-- 3. trenes: eliminar duplicados conservando el id menor
--    la clave natural ignora "linea" (hay trenes con línea vacía y con línea)
DELETE FROM trenes a
USING trenes b
WHERE a.id > b.id
  AND a.numero_tren = b.numero_tren
  AND a.codigo_estacion = b.codigo_estacion
  AND a.hora_de_paso = b.hora_de_paso
  AND a.estacion_destino = b.estacion_destino
  AND a.calendario = b.calendario;

ALTER TABLE trenes DROP CONSTRAINT IF EXISTS trenes_unique;
ALTER TABLE trenes
  ADD CONSTRAINT trenes_unique UNIQUE (numero_tren, codigo_estacion, hora_de_paso, estacion_destino, calendario);

-- 4. festivos: eliminar duplicados conservando el id menor
DELETE FROM festivos a
USING festivos b
WHERE a.id > b.id
  AND a.fecha = b.fecha
  AND a.ambito = b.ambito
  AND a.tipo_dia = b.tipo_dia;

ALTER TABLE festivos DROP CONSTRAINT IF EXISTS festivos_unique;
ALTER TABLE festivos
  ADD CONSTRAINT festivos_unique UNIQUE (fecha, ambito, tipo_dia);

-- 5. rutas: clave natural id_ruta (única)
ALTER TABLE rutas DROP CONSTRAINT IF EXISTS rutas_unique;
ALTER TABLE rutas
  ADD CONSTRAINT rutas_unique UNIQUE (id_ruta);

-- 6. paradas: clave natural id_parada (única)
ALTER TABLE paradas DROP CONSTRAINT IF EXISTS paradas_unique;
ALTER TABLE paradas
  ADD CONSTRAINT paradas_unique UNIQUE (id_parada);

-- 7. calendario: clave natural id (única)
ALTER TABLE calendario DROP CONSTRAINT IF EXISTS calendario_unique;
ALTER TABLE calendario
  ADD CONSTRAINT calendario_unique UNIQUE (id);

-- 8. trenes_estaciones: clave natural id (única)
ALTER TABLE trenes_estaciones DROP CONSTRAINT IF EXISTS trenes_estaciones_unique;
ALTER TABLE trenes_estaciones
  ADD CONSTRAINT trenes_estaciones_unique UNIQUE (id);