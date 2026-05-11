/**
 * Layer 1 — Climate Data Fusion
 * Fusiona datos de climate_cells (Supabase/PostGIS), GRI, Open-Meteo y World Bank
 * en una estructura normalizada uniforme.
 */

import { supabase } from '../supabaseClient.js';
import { getGriRiskByLocation } from '../services/griRiskService.js';
import { getClimateTrends } from '../services/openMeteoService.js';
import { getTerritorialContext } from '../services/worldBankService.js';

// Variables climáticas de interés extraídas de climate_cells JSONB
const CLIMATE_VARS = ['txx', 'tnn', 'hd35', 'hd40', 'rx1day', 'rx5day', 'cdd', 'cwd', 'pr', 'tas'];

// Mapeo de claves JSONB de climate_cells a nombres internos de horizonte
const HORIZON_MAP = {
  historical:                        'historical',
  'ensemble-all-ssp245_2020-2039':   'short_term',
  'ensemble-all-ssp245_2040-2059':   'mid_term',
};

/**
 * Calcula distancia Haversine en km entre dos puntos.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Extrae el valor mediano (o el valor directo si no hay estadísticas) de una variable
 * dentro de un período JSONB de climate_cells.
 */
function extractVarValue(periodData, varName) {
  const entry = periodData?.[varName];
  if (entry == null) return null;
  // El JSONB puede tener { median, p10, p90 } o ser un número directo
  if (typeof entry === 'object' && entry.median != null) return entry.median;
  if (typeof entry === 'number') return entry;
  return null;
}

/**
 * Normaliza un período JSONB de climate_cells extrayendo solo las variables de interés.
 * @returns {Object} { txx, tnn, hd35, hd40, rx1day, rx5day, cdd, cwd, pr, tas }
 */
function normalizePeriod(periodData) {
  if (!periodData || typeof periodData !== 'object') return null;
  const result = {};
  for (const v of CLIMATE_VARS) {
    result[v] = extractVarValue(periodData, v);
  }
  return result;
}

/**
 * Consulta la celda climática más cercana vía RPC PostGIS.
 * Retorna { climateData, distanceKm } o null si no hay datos.
 */
async function fetchClimateCell(lat, lon) {
  try {
    const { data, error } = await supabase
      .rpc('get_nearest_climate_cell', { p_lat: lat, p_lon: lon });

    if (error || !data || data.length === 0) return null;

    const cell = data[0];
    const raw = cell.data || {};
    const climateData = {};

    for (const [rawKey, mappedKey] of Object.entries(HORIZON_MAP)) {
      if (raw[rawKey]) {
        climateData[mappedKey] = normalizePeriod(raw[rawKey]);
      }
    }

    const distanceKm = haversineKm(lat, lon, cell.lat, cell.lon);
    return { climateData, distanceKm, cellLat: cell.lat, cellLon: cell.lon };
  } catch (err) {
    console.warn('[Layer1] climate_cells falló (fallo silencioso):', err.message);
    return null;
  }
}

/**
 * Función principal exportada.
 * @param {Object} params - { lat, lon, scenario? }
 * @returns {Object} Estructura fusionada normalizada
 */
export async function fusionClimateData({ lat, lon, scenario = 'ssp245' }) {
  const latNum = Number(lat);
  const lonNum = Number(lon);

  // Ejecutar todas las fuentes en paralelo; cada una falla silenciosamente
  const [cellResult, griResult, meteoResult, territorialResult] = await Promise.allSettled([
    fetchClimateCell(latNum, lonNum),
    getGriRiskByLocation(latNum, lonNum),
    getClimateTrends(latNum, lonNum),
    getTerritorialContext(),
  ]);

  const cellData      = cellResult.status      === 'fulfilled' ? cellResult.value      : null;
  const griData       = griResult.status        === 'fulfilled' ? griResult.value        : null;
  const meteoResult_  = meteoResult.status      === 'fulfilled' ? meteoResult.value      : null;
  const territorial   = territorialResult.status === 'fulfilled' ? territorialResult.value : null;

  if (cellResult.status === 'rejected')
    console.warn('[Layer1] GRI falló:', cellResult.reason?.message);
  if (griResult.status === 'rejected')
    console.warn('[Layer1] GRI falló:', griResult.reason?.message);
  if (meteoResult.status === 'rejected')
    console.warn('[Layer1] Open-Meteo falló:', meteoResult.reason?.message);
  if (territorialResult.status === 'rejected')
    console.warn('[Layer1] World Bank falló:', territorialResult.reason?.message);

  // Cuando climate_cells no tiene datos, usar los índices extremos computados
  // por Open-Meteo (hd35, hd40, cdd, rx5day, rx1day, pr, tas) como fallback.
  // climateIndices ya está en el mismo formato que climateData (historical/short_term/mid_term).
  const climateData = cellData?.climateData ?? meteoResult_?.climateIndices ?? null;

  return {
    // Datos climáticos normalizados: climate_cells (preferido) u Open-Meteo computed
    climateData,
    climateSource:   cellData?.climateData ? 'climate_cells' : (meteoResult_?.climateIndices ? 'open_meteo_derived' : null),
    // Datos GRI (probabilidades de amenaza por peligro)
    griData:         griData                  ?? null,
    // Datos Open-Meteo (deltas de temperatura y precipitación para narrativa)
    meteoData:       meteoResult_?.meteo      ?? null,
    // Contexto territorial World Bank
    territorialData: territorial              ?? null,
    // Metadatos de ubicación
    distanceKm:      cellData?.distanceKm     ?? null,
    scenario,
    generated_at:    new Date().toISOString(),
  };
}
