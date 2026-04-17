/**
 * Script de prueba: Validar sistema de climate_cells
 * 
 * Este script prueba todos los nuevos endpoints sin necesidad de datos reales
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

// Colores para output ANSI
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

function success(msg) {
  log(colors.green, '✅', msg);
}

function error(msg) {
  log(colors.red, '❌', msg);
}

function info(msg) {
  log(colors.blue, 'ℹ️', msg);
}

function warn(msg) {
  log(colors.yellow, '⚠️', msg);
}

async function runTests() {
  console.log('\n');
  log(colors.bold, '🧪 SUITE DE PRUEBAS - CLIMATE CELLS API');
  console.log('='.repeat(50));

  // Test 1: Verificar que el servidor está corriendo
  console.log('\n📡 Test 1: Conexión al servidor');
  try {
    const response = await fetch(`${BASE_URL}/api/test`);
    const data = await response.json();
    if (response.ok) {
      success(`Servidor respondiendo: ${data.message}`);
    } else {
      error('Servidor no respondiendo correctamente');
      return;
    }
  } catch (err) {
    error(`No se pudo conectar al servidor: ${err.message}`);
    error('¿Está corriendo? npm run server');
    return;
  }

  // Test 2: Probar endpoint de query con coordenadas válidas
  console.log('\n🗺️ Test 2: Query de ubicación (/api/climate-cells/query)');
  try {
    const response = await fetch(
      `${BASE_URL}/api/climate-cells/query?lat=-12.5&lon=-75.5`
    );
    const data = await response.json();
    
    if (response.status === 404) {
      warn('No hay datos en climate_cells todavía (esperado)');
      info('Mensaje: ' + data.error);
    } else if (response.ok) {
      success('Datos recuperados correctamente');
      info(`Ubicación: ${data.location.lat}, ${data.location.lon}`);
      info(`Horizontes disponibles: ${Object.keys(data.climate).join(', ')}`);
      if (data.risks_interpretation) {
        info(`Riesgos identificados: ${data.risks_interpretation.length} horizontes`);
      }
    } else {
      error(`Error ${response.status}: ${data.error}`);
    }
  } catch (err) {
    error(`Error en prueba: ${err.message}`);
  }

  // Test 3: Probar validación de coordenadas inválidas
  console.log('\n⚠️ Test 3: Validación de coordenadas');
  try {
    const testCases = [
      { lat: 'invalid', lon: -75.5, name: 'Latitud inválida' },
      { lat: 100, lon: -75.5, name: 'Latitud fuera de rango' },
      { lat: -12.5, lon: 'invalid', name: 'Longitud inválida' }
    ];

    for (const testCase of testCases) {
      const response = await fetch(
        `${BASE_URL}/api/climate-cells/query?lat=${testCase.lat}&lon=${testCase.lon}`
      );
      
      if (!response.ok) {
        success(`${testCase.name}: Rechazado correctamente`);
      } else {
        error(`${testCase.name}: Debería ser rechazado`);
      }
    }
  } catch (err) {
    error(`Error en validación: ${err.message}`);
  }

  // Test 4: Probar carga de datos (/api/climate-cells/upload)
  console.log('\n📤 Test 4: Carga de datos (/api/climate-cells/upload)');
  
  const testRecords = [
    {
      lat: -12.5,
      lon: -75.5,
      data: {
        historical: {
          txx: 32.5,
          hd35: 45,
          rx1day: 125,
          tas: 28.5
        },
        'ensemble-all-ssp245_2020-2039': {
          txx: 33.2,
          hd35: 65,
          rx1day: 135,
          tas: 29.2
        },
        'ensemble-all-ssp245_2040-2059': {
          txx: 34.1,
          hd35: 90,
          rx1day: 145,
          tas: 30.1
        }
      }
    },
    {
      lat: -12.3,
      lon: -75.4,
      data: {
        historical: {
          txx: 31.8,
          hd35: 40,
          rx1day: 120
        }
      }
    }
  ];

  try {
    const response = await fetch(`${BASE_URL}/api/climate-cells/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: testRecords })
    });

    const result = await response.json();
    
    if (response.ok) {
      success('Carga completada');
      info(`Insertados: ${result.summary.inserted}`);
      info(`Actualizados: ${result.summary.updated}`);
      info(`Fallos: ${result.summary.failed}`);
      
      if (result.errors && result.errors.length > 0) {
        warn(`Errores encontrados (primeros 5):`);
        result.errors.slice(0, 5).forEach(err => {
          log(colors.yellow, '  -', err);
        });
      }
    } else {
      error(`Error en carga: ${result.error}`);
    }
  } catch (err) {
    error(`Error al cargar datos: ${err.message}`);
  }

  // Test 5: Probar validación de estructura
  console.log('\n✔️ Test 5: Validación de estructura de datos');
  
  const invalidRecords = [
    {
      name: 'Falta latitud',
      data: [{ lon: -75.5, data: { historical: { txx: 30 } } }],
      shouldFail: true
    },
    {
      name: 'Falta longitud',
      data: [{ lat: -12.5, data: { historical: { txx: 30 } } }],
      shouldFail: true
    },
    {
      name: 'Falta data',
      data: [{ lat: -12.5, lon: -75.5 }],
      shouldFail: true
    },
    {
      name: 'Data vacío pero válido',
      data: [{ lat: -12.5, lon: -75.5, data: {} }],
      shouldFail: false
    }
  ];

  for (const testCase of invalidRecords) {
    try {
      const response = await fetch(`${BASE_URL}/api/climate-cells/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: testCase.data })
      });

      const result = await response.json();

      if (testCase.shouldFail && result.summary.failed > 0) {
        success(`${testCase.name}: Validado correctamente`);
      } else if (!testCase.shouldFail && result.summary.failed === 0) {
        success(`${testCase.name}: Aceptado correctamente`);
      } else if (testCase.shouldFail && result.summary.failed === 0) {
        error(`${testCase.name}: Debería haber fallado`);
      } else {
        error(`${testCase.name}: Resultado inesperado`);
      }
    } catch (err) {
      error(`${testCase.name}: ${err.message}`);
    }
  }

  // Test 6: Probar status endpoint
  console.log('\n📊 Test 6: Status endpoint (/api/climate-cells/status)');
  try {
    const response = await fetch(`${BASE_URL}/api/climate-cells/status`);
    const data = await response.json();
    
    if (response.ok || response.status === 500) {
      if (data.database_stats) {
        success('Endpoint status funciona');
        info(`Registros en BD: ${data.database_stats.total_cells || 'N/A'}`);
      } else if (data.error) {
        warn('Función de stats no está configurada en Supabase todavía');
        info('Configurarla con: SUPABASE_SETUP.md (paso 3)');
      }
      info(`Cache size: ${data.cache_size}`);
    }
  } catch (err) {
    error(`Error en status: ${err.message}`);
  }

  // Test 7: Probar quese mantiene compatibilidad hacia atrás
  console.log('\n⏮️ Test 7: Compatibilidad hacia atrás');
  try {
    const response = await fetch(`${BASE_URL}/api/climate?lat=-12.5&lng=-75.5`);
    
    if (response.ok) {
      success('Endpoint antiguo /api/climate sigue funcionando');
    } else {
      warn('Endpoint antiguo no disponible (puede que falta WeatherAPI key)');
    }
  } catch (err) {
    warn('Endpoint /api/climate no está disponible');
  }

  // Test 8: Probar transformación de datos
  console.log('\n🔄 Test 8: Transformación de variables climáticas');
  try {
    const response = await fetch(
      `${BASE_URL}/api/climate-cells/query?lat=-12.5&lon=-75.5`
    );
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.climate && data.climate.past) {
        success('Variables mapeadas son accesibles');
        
        // Verificar que tenemos las transformaciones
        const samplePeriod = data.climate.past;
        const hasVariables = Object.keys(samplePeriod).length > 0;
        
        if (hasVariables) {
          success('Variables encontradas en período histórico');
          Object.entries(samplePeriod).forEach(([key, val]) => {
            if (val.name) {
              info(`  • ${key}: ${val.name}`);
            }
          });
        }
      }
    }
  } catch (err) {
    warn(`No se pudieron probar transformaciones: ${err.message}`);
  }

  // Resumen
  console.log('\n' + '='.repeat(50));
  log(colors.bold + colors.green, '✨ SUITE DE PRUEBAS COMPLETADA');
  console.log('\n' + colors.bold + '📋 Próximos pasos:' + colors.reset);
  console.log('  1. Configurar tabla climate_cells en Supabase');
  console.log('     → Ver: SUPABASE_SETUP.md');
  console.log('');
  console.log('  2. Cargar datos iniciales:');
  console.log('     → node scripts/transform-climate-data.js');
  console.log('     → Luego hacer POST a /api/climate-cells/upload');
  console.log('');
  console.log('  3. Integrar en UI');
  console.log('     → Ver: API_CLIMATE_CELLS.md para ejemplos');
  console.log('');
  console.log('  4. Desplegar a Vercel/producción');
  console.log('');
}

// Ejecutar pruebas
runTests().catch(err => {
  error(`Error crítico: ${err.message}`);
  process.exit(1);
});
