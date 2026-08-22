-- Esquema de Base de Datos para el Proyecto

-- 1. Calendarios
CREATE TABLE IF NOT EXISTS calendario (
    id TEXT PRIMARY KEY,
    lunes BOOLEAN, martes BOOLEAN, miercoles BOOLEAN, jueves BOOLEAN, viernes BOOLEAN, sabado BOOLEAN, domingo BOOLEAN,
    fecha_inicio DATE, fecha_fin DATE
);

-- 2. Rutas
CREATE TABLE IF NOT EXISTS rutas (
    id_ruta TEXT PRIMARY KEY,
    nombre TEXT,
    origen TEXT,
    destino TEXT
);

-- 3. Paradas
CREATE TABLE IF NOT EXISTS paradas (
    id_parada TEXT PRIMARY KEY,
    nombre TEXT,
    latitud NUMERIC,
    longitud NUMERIC,
    localidad TEXT
);

-- 4. Salidas (Cabeceras)
CREATE TABLE IF NOT EXISTS salidas_cabeceras (
    id SERIAL PRIMARY KEY,
    ruta_id TEXT REFERENCES rutas(id_ruta),
    salida_origen TIME,
    tipo_dia TEXT
);

-- 5. Secuencia Desfases
CREATE TABLE IF NOT EXISTS secuencia_desfaces (
    id SERIAL PRIMARY KEY,
    ruta_id TEXT REFERENCES rutas(id_ruta),
    parada_id TEXT REFERENCES paradas(id_parada),
    orden_secuencia INTEGER,
    minutos_desde_origen INTERVAL
);

-- 6. Trenes
CREATE TABLE IF NOT EXISTS trenes (
    id SERIAL PRIMARY KEY,
    linea TEXT,
    numero_tren TEXT,
    codigo_estacion TEXT,
    hora_de_paso TIME,
    estacion_destino TEXT,
    calendario TEXT
);

-- 7. Trenes Estaciones
CREATE TABLE IF NOT EXISTS trenes_estaciones (
    id TEXT PRIMARY KEY,
    estacion TEXT,
    latitud NUMERIC,
    longitud NUMERIC
);

-- 8. Festivos
CREATE TABLE IF NOT EXISTS festivos (
    id SERIAL PRIMARY KEY,
    fecha DATE,
    nombre TEXT,
    ambito TEXT,
    tipo_dia TEXT,
    anio INTEGER,
    activo BOOLEAN
);
