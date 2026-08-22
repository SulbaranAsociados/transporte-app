require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');
const WebSocket = require('ws');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: {
    transport: WebSocket,
  },
});

function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('/')) {
    let [day, month, year] = dateStr.split('/');
    if (year.length === 2) year = '20' + year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr; // Assume YYYY-MM-DD
}

async function syncCSV(filePath, tableName, mapFn) {
  console.log(`Sincronizando ${tableName}...`);
  const results = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Ignorar filas donde todas las columnas son vacías
        if (Object.values(data).every(val => !val || val === '')) return;
        results.push(mapFn(data));
      })
      .on('end', async () => {
        if (results.length === 0) {
          console.log(`No se encontraron datos para ${tableName}`);
          resolve();
          return;
        }
        const { error } = await supabase.from(tableName).upsert(results);
        if (error) {
          console.error(`Error en ${tableName}:`, error);
          reject(error);
        } else {
          console.log(`Tabla ${tableName} actualizada. Filas: ${results.length}`);
          resolve();
        }
      });
  });
}

async function runAllSyncs() {
  try {
    // 1. Calendario
    await syncCSV('../data/processed/dinamicos/calendario.csv', 'calendario', (row) => ({
      id: row.id,
      lunes: row.lunes === 'true', martes: row.martes === 'true', miercoles: row.miercoles === 'true',
      jueves: row.jueves === 'true', viernes: row.viernes === 'true', sabado: row.sabado === 'true', domingo: row.domingo === 'true',
      fecha_inicio: parseDate(row.fecha_inicio), fecha_fin: parseDate(row.fecha_fin)
    }));

    // 2. Rutas
    await syncCSV('../data/processed/dinamicos/descripcion_rutas.csv', 'rutas', (row) => ({
      id_ruta: row.id_ruta, nombre: row.Nombre, origen: row.Origen, destino: row.Destino
    }));

    // 3. Paradas
    await syncCSV('../data/processed/dinamicos/paradas_unicas.csv', 'paradas', (row) => ({
      id_parada: row.Id_parada, nombre: row.parada, latitud: parseFloat(row.latitud), longitud: parseFloat(row.longitud), localidad: row.localidad
    }));

    // 4. Salidas Cabeceras
    await syncCSV('../data/processed/dinamicos/salidas_cabeceras.csv', 'salidas_cabeceras', (row) => ({
      ruta_id: row.ruta_id, salida_origen: row.salida_origen, tipo_dia: row.tipo_dia
    }));

    // 5. Secuencia Desfases
    await syncCSV('../data/processed/dinamicos/secuencia_desfaces.csv', 'secuencia_desfaces', (row) => ({
      ruta_id: row.ruta_id, parada_id: row.parada_id, orden_secuencia: parseInt(row.orden_secuencia), minutos_desde_origen: row.minutos_desde_origen
    }));

    // 6. Trenes
    await syncCSV('../data/processed/trenes/datos_trenes.csv', 'trenes', (row) => ({
      linea: row['Línea'], numero_tren: row['Número Tren'], codigo_estacion: row['Código Estación'], hora_de_paso: row['Hora de Paso'], estacion_destino: row['Estación Destino'], calendario: row['Calendario']
    }));

    // 7. Trenes Estaciones
    await syncCSV('../data/processed/trenes/datos_trenes_estaciones.csv', 'trenes_estaciones', (row) => ({
      id: row.id, estacion: row.estacion, latitud: parseFloat(row.latitud), longitud: parseFloat(row.longitud)
    }));

    // 8. Festivos
    await syncCSV('../data/processed/trenes/datos_trenes_festivos.csv', 'festivos', (row) => ({
      fecha: parseDate(row.fecha), nombre: row.nombre, ambito: row['ámbito'], tipo_dia: row.tipo_dia, anio: parseInt(row.año), activo: row.activo === 'true'
    }));

    console.log('--- Sincronización completa ---');
  } catch (err) {
    console.error('Error durante la sincronización:', err);
  }
}

runAllSyncs();
