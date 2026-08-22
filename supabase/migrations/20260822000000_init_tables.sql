-- Create calendarios table
CREATE TABLE calendarios (
 id VARCHAR(50) PRIMARY KEY,
 lunes BOOLEAN NOT NULL DEFAULT FALSE,
 martes BOOLEAN NOT NULL DEFAULT FALSE,
 miercoles BOOLEAN NOT NULL DEFAULT FALSE,
 jueves BOOLEAN NOT NULL DEFAULT FALSE,
 viernes BOOLEAN NOT NULL DEFAULT FALSE,
 sabado BOOLEAN NOT NULL DEFAULT FALSE,
 domingo BOOLEAN NOT NULL DEFAULT FALSE,
 fecha_inicio DATE NOT NULL,
 fecha_fin DATE NOT NULL
);

-- Create secuencia_desfases table
CREATE TABLE secuencia_desfases (
 id SERIAL PRIMARY KEY,
 ruta_id VARCHAR(50),
 parada_id VARCHAR(50),
 orden_secuencia INTEGER,
 minutos_desde_origen INTEGER
);

-- Create salidas_cabecera table
CREATE TABLE salidas_cabecera (
 id SERIAL PRIMARY KEY,
 ruta_id VARCHAR(50),
 hora_salida_origen TIME,
 calendario_id VARCHAR(50) REFERENCES calendarios(id)
);

-- Create avisos_rutas table
CREATE TABLE avisos_rutas (
 id SERIAL PRIMARY KEY,
 ruta_id VARCHAR(50),
 tipo_aviso VARCHAR(20),
 mensaje_es TEXT,
 mensaje_ca TEXT,
 mensaje_en TEXT,
 fecha_inicio DATE,
 fecha_fin DATE
);
