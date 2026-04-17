/**
 * Script de transformación: intercorp_riesgos_climaticos_db.json → climate_cells
 * Convierte el JSON actual al formato esperado por el nuevo sistema
 */

/**
 * Cargar JSON desde archivo y transformar a formato climate_cells
 * 
 * Uso: node transform-data.js
 */

import fs from 'fs';
import path from 'path';

// Leer archivo original
const jsonPath = './intercorp_riesgos_climaticos_db.json';
console.log(`📂 Leyendo archivo: ${jsonPath}`);

const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const records = rawData.data || [];

console.log(`📊 Registros originales: ${records.length}`);

/**
 * Transformar de formato antiguo al nuevo
 * 
 * De:
 * {
 *   "lat": -18.5,
 *   "lng": -81.5,
 *   "risk_type": "calor_extremo",
 *   "horizon": "historico",
 *   "level": "bajo",
 *   "value": 24.001,
 *   "unit": "°C",
 *   "scenario": "ensemble-all-historical",
 *   "source": "world_bank"
 * }
 * 
 * A:
 * {
 *   "lat": -18.5,
 *   "lon": -81.5,
 *   "data": {
 *     "historical": {
 *       "txx": 24.001,
 *       "risk_type": "calor_extremo",
 *       "level": "bajo"
 *     }
 *   }
 * }
 */

// Agrupar datos por (lat, lon)
const groupedByLocation = records.reduce((acc, record) => {
  const key = `${record.lat},${record.lng}`;
  
  if (!acc[key]) {
    acc[key] = {
      lat: record.lat,
      lon: record.lng,
      data: {}
    };
  }
  
  return acc;
}, {});

console.log(`🗺️ Ubicaciones únicas: ${Object.keys(groupedByLocation).length}`);

/**
 * Mapeo de horizontes temporales
 */
const horizonMapping = {
  'historico': 'historical',
  'corto': 'ensemble-all-ssp245_2020-2039',
  'mediano': 'ensemble-all-ssp245_2040-2059',
  'largo': 'ensemble-all-ssp585_2060-2079'
};

/**
 * Mapeo de tipos de riesgo a variables climáticas
 * (puedes ajustar según tu necesidad)
 */
const riskToVariableMapping = {
  'calor_extremo': 'txx',
  'temperatura_maxima': 'txx',
  'temperatura_media': 'tas',
  'noches_calurosas': 'tnn',
  'mortalidad_calor': 'hd35',
  'precipitacion_extrema': 'rx1day',
  'precipitacion_media': 'pr',
  'cambio_precipitacion': 'pr_change',
  'inundacion': 'rx5day'
};

/**
 * Procesar cada registro y agrupar por horizonte temporal
 */
records.forEach(record => {
  const key = `${record.lat},${record.lng}`;
  const location = groupedByLocation[key];
  
  // Mapear horizonte temporal
  const horizonKey = horizonMapping[record.horizon] || record.horizon;
  
  if (!location.data[horizonKey]) {
    location.data[horizonKey] = {};
  }
  
  // Mapear variable climática
  const variableKey = riskToVariableMapping[record.risk_type] || record.risk_type;
  
  // Almacenar valor + metadatos
  location.data[horizonKey][variableKey] = {
    value: record.value,
    level: record.level,
    unit: record.unit,
    risk_type: record.risk_type,
    scenario: record.scenario
  };
});

// Convertir a array
const transformedRecords = Object.values(groupedByLocation);

console.log(`✅ Registros transformados: ${transformedRecords.length}`);

/**
 * Mostrar ejemplo
 */
console.log('\n📋 Ejemplo de registro transformado:');
console.log(JSON.stringify(transformedRecords[0], null, 2));

/**
 * Guardar versión transformada
 */
const outputPath = './intercorp_riesgos_climaticos_db_transformed.json';
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    metadata: {
      source: 'Transformación de intercorp_riesgos_climaticos_db.json',
      transformed_at: new Date().toISOString(),
      original_records: records.length,
      unique_locations: transformedRecords.length,
      format: 'climate_cells compatible'
    },
    data: transformedRecords
  }, null, 2)
);

console.log(`\n💾 Guardado en: ${outputPath}`);

/**
 * Script de carga para enviar a backend
 */
console.log('\n🚀 Para cargar estos datos al backend, ejecuta:');
console.log(`
curl -X POST http://localhost:3001/api/climate-cells/upload \\
  -H "Content-Type: application/json" \\
  -d @${outputPath}
`);

console.log('\n📊 Estadísticas:');
console.log(`  - Total de ubicaciones: ${transformedRecords.length}`);
console.log(`  - Coordenadas válidas: ${transformedRecords.filter(r => 
  r.lat >= -90 && r.lat <= 90 && r.lon >= -180 && r.lon <= 180
).length}`);

// Estadísticas de horizontes
const horizonStats = {};
records.forEach(r => {
  horizonStats[r.horizon] = (horizonStats[r.horizon] || 0) + 1;
});

console.log(`  - Distribución por horizonte:`);
Object.entries(horizonStats).forEach(([horizon, count]) => {
  console.log(`    • ${horizon}: ${count} registros`);
});

// Estadísticas de tipos de riesgo
const riskStats = {};
records.forEach(r => {
  riskStats[r.risk_type] = (riskStats[r.risk_type] || 0) + 1;
});

console.log(`  - Tipos de riesgo:`);
Object.entries(riskStats).sort((a, b) => b[1] - a[1]).forEach(([risk, count]) => {
  console.log(`    • ${risk}: ${count} registros`);
});

console.log('\n✨ Transformación completada exitosamente\n');

/**
 * Exportar para uso en otros scripts
 */
export { transformedRecords };
