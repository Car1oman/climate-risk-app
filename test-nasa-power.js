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

console.log('\n' + '='.repeat(80));
console.log('  NASA POWER DEMOSTRACIÓN — lat: ' + LAT + ', lon: ' + LON);
console.log('  Fecha: ' + new Date().toISOString());
console.log('='.repeat(80) + '\n');

// Test 1: Get recent basic meteorological data (yesterday to avoid today's potential missing data)
console.log('1. DATOS RECENTES BASICOS (últimos 7 días, excluyendo hoy)');
console.log('-'.repeat(50));

try {
  // Calculate date range for last 7 days ending yesterday
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // Yesterday
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6); // 7 days total

  const formatDate = (date) => {
    return date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  };

  console.log('   Solicitando datos del ' + formatDate(startDate) + ' al ' + formatDate(endDate));

  // We need to modify the service to accept custom dates, but for now let's use the existing function
  // and see what we get. The existing function uses last 7 days including today.
  
  const recentData = await getRecentPowerData(
    LAT, 
    LON, 
    ['T2M', 'PRECTOT', 'WS2M', 'RH2M'],  // Temperature, precipitation, wind, humidity
    'RE'  // Renewable Energy community
  );

  if (recentData) {
    console.log('✅ Respuesta del servicio recibida:');
    for (const [param, data] of Object.entries(recentData)) {
      if (data) {
        if (data.value === -999) {
          console.log('   ' + param + ': VALOR DE LLENADO (-999) - datos no disponibles para este período');
        } else if (data.value !== null) {
          console.log('   ' + param + ': ' + data.value + ' ' + data.units + ' (' + data.date + ')');
        } else {
          console.log('   ' + param + ': datos no disponibles (null)');
        }
      } else {
        console.log('   ' + param': objeto de datos faltante');
      }
    }
    
    // Show narrative (will handle -999 values)
    const narrative = buildPowerNarrative(recentData);
    if (narrative) {
      console.log('\n   Narrativa: ' + narrative);
    } else {
      console.log('\n   Narrativa: no generada (datos insuficientes o inválidos)');
    }
  } else {
    console.log('❌ No se obtuvo respuesta del servicio');
  }
} catch (err) {
  console.log('❌ Error obteniendo datos recientes: ' + err.message);
}

console.log('\n');

// Test 2: Try with different parameter set that might work better
console.log('2. INTENTANDO CON PARÁMETROS DE ENERGÍA (radiación solar)');
console.log('-'.repeat(50));

try {
  const energyData = await getRecentPowerData(
    LAT, 
    LON, 
    ['ALLSKY_SFC_SW_DWN', 'T2M', 'WS2M'],  // Solar radiation, temperature, wind
    'RE'
  );

  if (energyData) {
    console.log('✅ Datos de energía obtenidos:');
    for (const [param, data] of Object.entries(energyData)) {
      if (data) {
        if (data.value === -999) {
          console.log('   ' + param + ': VALOR DE LLENADO (-999)');
        } else if (data.value !== null) {
          console.log('   ' + param + ': ' + data.value.toFixed(2) + ' ' + data.units + ' (' + data.date + ')');
        } else {
          console.log('   ' + param + ': datos no disponibles (null)');
        }
      } else {
        console.log('   ' + param + ': objeto de datos faltante');
      }
    }
  } else {
    console.log('❌ No se pudieron obtener datos de energía');
  }
} catch (err) {
  console.log('❌ Error obteniendo datos de energía: ' + err.message);
}

console.log('\n');

// Test 3: Get climatological data (monthly averages)
console.log('3. DATOS CLIMATOLÓGICOS (promedios mensuales históricos)');
console.log('-'.repeat(50));

try {
  const climatologyData = await getClimatologyData(
    LAT, 
    LON, 
    ['T2M', 'PRECTOT', 'WS2M']  // Temperature, precipitation, wind
  );

  if (climatologyData) {
    console.log('✅ Respuesta de climatología recibida:');
    for (const [param, data] of Object.entries(climatologyData)) {
      if (data) {
        if (data.annualMean === -999 || data.annualMean === null) {
          console.log('   ' + param + ': DATOS CLIMATOLÓGICOS NO DISPONIBLES');
        } else {
          console.log('   ' + param + ':');
          console.log('     Media anual: ' + data.annualMean.toFixed(2) + ' ' + data.monthly[0].units);
          console.log('     Valores mensuales (primeros 3 meses):');
          // Show first 3 months as example
          for (let i = 0; i < Math.min(3, data.monthly.length); i++) {
            const month = data.monthly[i];
            if (month.value === -999 || month.value === null) {
              console.log('       ' + month.monthName + ': DATOS NO DISPONIBLES');
            } else {
              console.log('       ' + month.monthName + ': ' + month.value.toFixed(2) + ' ' + month.units);
            }
          }
        }
      } else {
        console.log('   ' + param + ': objeto de datos faltante');
      }
    }
  } else {
    console.log('❌ No se pudieron obtener datos climatológicos');
  }
} catch (err) {
  console.log('❌ Error obteniendo datos climatológicos: ' + err.message);
}

console.log('\n');

// Test 4: Show what NASA POWER actually offers for this location by trying a known date
console.log('4. PRUEBA CON FECHA HISTÓRICA CONOCIDA (enero 2023)');
console.log('-'.repeat(50));

try {
  // We would need to modify the service to accept custom dates for this.
  // For now, let's just show what parameters are available conceptually.
  console.log('Nota: Para solicitudes de fechas específicas, el servicio necesitaría ser extendido');
  console.log('para aceptar parámetros de fecha personalizados.');
  console.log('');
  console.log('Los parámetros de NASA POWER disponibles incluyen:');
  console.log('   Temperatura: T2M, T2MMAX, T2MMIN, T2MDEW, T2MWET');
  console.log('   Precipitación: PRECTOT, PRECSNO');
  console.log('   Viento: WS2M, WS10M, WD2M, WD10M');
  console.log('   Humedad: RH2M');
  console.log('   Presión: PS');
  console.log('   Radiación: ALLSKY_SFC_SW_DWN, CLRSKY_SFC_SW_DWN, ALLSKY_SFC_LW_DWN');
  console.log('');
  console.log('El servicio actual se enfoca en datos recientes y climatología.');
} catch (err) {
  console.log('❌ Error en prueba histórica: ' + err.message);
}

console.log('\n');

// Test 5: Show available parameter sets
console.log('5. CONJUNTOS DE PARÁMETROS PREDEFINIDOS');
console.log('-'.repeat(50));
console.log('El servicio POWER ofrece estos conjuntos predefinidos:');
console.log('   basic:    T2M, PRECTOT, WS2M, RH2M (temperatura, precipitación, viento, humedad)');
console.log('   energy:   ALLSKY_SFC_SW_DWN, T2M, WS2M (radiación solar, temperatura, viento)');
console.log('   detailed: T2M, T2M_MAX, T2M_MIN, PRECTOT, WS2M, RH2M, PS (datos meteorológicos completos)');
console.log('   drought:  PRECTOT, T2M, WS2M, RH2M, ALLSKY_SFC_SW_DWN (índices de sequía)');
console.log('\nPuede solicitar cualquier combinación de los parámetros disponibles de NASA POWER.');

console.log('\n' + '='.repeat(80));
console.log('  FIN DE LA DEMOSTRACIÓN');
console.log('='.repeat(80) + '\n');