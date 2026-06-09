/**
 * Test script to demonstrate NASA POWER service usage
 * Shows how to get recent data and climatology for specific coordinates
 */

import 'dotenv/config';

// Import the newly created NASA POWER service
import { getRecentPowerData, getClimatologyData, buildPowerNarrative } from './server/services/nasaPowerService.js';

// Coordinates from the user's validation script
const LAT = -10.79014;
const LON = -76.23413;

console.log(`\n${'='.repeat(80)}`);
console.log(`  NASA POWER DEMOSTRACIÓN — lat: ${LAT}, lon: ${LON}`);
console.log(`  Fecha: ${new Date().toISOString()}`);
console.log(${'='.repeat(80)}\n`);

// Test 1: Get recent basic meteorological data
console.log('1. DATOS RECENTES BASICOS (últimos 7 días)');
console.log('-'.repeat(50));

try {
  const recentData = await getRecentPowerData(
    LAT, 
    LON, 
    ['T2M', 'PRECTOT', 'WS2M', 'RH2M'],  // Temperature, precipitation, wind, humidity
    'RE'  // Renewable Energy community
  );

  if (recentData) {
    console.log('✅ Datos recientes obtenidos:');
    for (const [param, data] of Object.entries(recentData)) {
      if (data && data.value !== null) {
        console.log(`   ${param}: ${data.value} ${data.units} (${data.date})`);
      } else {
        console.log(`   ${param}: datos no disponibles`);
      }
    }
    
    // Show narrative
    const narrative = buildPowerNarrative(recentData);
    if (narrative) {
      console.log(`\n   Narrativa: ${narrative}`);
    }
  } else {
    console.log('❌ No se pudieron obtener datos recientes');
  }
} catch (err) {
  console.log(`❌ Error obteniendo datos recientes: ${err.message}`);
}

console.log('\n');

// Test 2: Get climatological data (monthly averages)
console.log('2. DATOS CLIMATOLÓGICOS (promedios mensuales históricos)');
console.log('-'.repeat(50));

try {
  const climatologyData = await getClimatologyData(
    LAT, 
    LON, 
    ['T2M', 'PRECTOT', 'WS2M']  // Temperature, precipitation, wind
  );

  if (climatologyData) {
    console.log('✅ Datos climatológicos obtenidos:');
    for (const [param, data] of Object.entries(climatologyData)) {
      if (data && data.annualMean !== null) {
        console.log(`   ${param}:`);
        console.log(`     Media anual: ${data.annualMean.toFixed(2)} ${data.monthly[0].units}`);
        console.log(`     Valores mensuales:`);
        // Show first 3 months as example
        for (let i = 0; i < Math.min(3, data.monthly.length); i++) {
          const month = data.monthly[i];
          console.log(`       ${month.monthName}: ${month.value !== null ? month.value.toFixed(2) : 'N/A'} ${month.units}`);
        }
        if (data.monthly.length > 3) {
          console.log(`       ... y ${data.monthly.length - 3} meses más`);
        }
      } else {
        console.log(`   ${param}: datos climatológicos no disponibles`);
      }
    }
  } else {
    console.log('❌ No se pudieron obtener datos climatológicos');
  }
} catch (err) {
  console.log(`❌ Error obteniendo datos climatológicos: ${err.message}`);
}

console.log('\n');

// Test 3: Show available parameter sets
console.log('3. CONJUNTOS DE PARÁMETROS DISPONIBLES');
console.log('-'.repeat(50));
console.log('El servicio POWER ofrece estos conjuntos predefinidos:');
console.log('   basic:    T2M, PRECTOT, WS2M, RH2M (temperatura, precipitación, viento, humedad)');
console.log('   energy:   ALLSKY_SFC_SW_DWN, T2M, WS2M (radiación solar, temperatura, viento)');
console.log('   detailed: T2M, T2M_MAX, T2M_MIN, PRECTOT, WS2M, RH2M, PS (datos meteorológicos completos)');
console.log('   drought:  PRECTOT, T2M, WS2M, RH2M, ALLSKY_SFC_SW_DWN (índices de sequía)');
console.log('\nPuede solicitar cualquier combinación de los parámetros disponibles de NASA POWER.');

console.log(`\n${'='.repeat(80)}`);
console.log(`  FIN DE LA DEMOSTRACIÓN`);
console.log(${'='.repeat(80)}\n`);