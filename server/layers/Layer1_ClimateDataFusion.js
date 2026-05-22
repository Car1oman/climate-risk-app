/**
 * Layer 1 — Climate Data Fusion
 * Fusiona datos de climate_cells (Supabase/PostGIS), GRI, Open-Meteo y World Bank
 * en una estructura normalizada uniforme.
 */

import { supabase } from '../supabaseClient.js';
import { getGriRiskByLocation }    from '../services/griRiskService.js';
import { getClimateTrends }        from '../services/openMeteoService.js';
import { getTerritorialContext }   from '../services/worldBankService.js';
import { getEnsoContext }          from '../services/ensoService.js';
import { getTerrainIntelligence }  from '../services/terrainService.js';  // Sprint 6

// Variables climáticas extraídas del JSONB de climate_cells
// Refleja las columnas reales de la DB: tr (noches tropicales), prpercnt (% cambio precip),
// r20mm/r50mm (días con lluvia intensa), tasmax (temp máx media), tx84rr (días cálidos)
const CLIMATE_VARS = [
  'txx', 'tas', 'tasmax',            // temperatura
  'hd30', 'hd35',                    // días calurosos (hd40 no está en DB)
  'tr',                              // noches tropicales (Tmin > 20°C) — señal clave Perú
  'rx1day', 'rx5day',               // extremos de precipitación
  'r20mm', 'r50mm',                 // días con lluvia intensa
  'pr', 'prpercnt',                  // precipitación total y % vs histórico
  'tx84rr',                          // días/noches cálidos (percentil 84)
];

/**
 * Construye el mapa horizonte→clave interna para el escenario solicitado.
 * Permite usar SSP245 (conservador) o SSP585 (pesimista) dependiendo del request.
 */
function buildHorizonMap(scenario) {
  const sc = (scenario || 'ssp245').toLowerCase();
  return {
    historical:                              'historical',
    [`ensemble-all-${sc}_2020-2039`]:        'short_term',
    [`ensemble-all-${sc}_2040-2059`]:        'mid_term',
  };
}

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
 * Normaliza un período JSONB extrayendo {median, p10, p90} por variable.
 * Usado para transmitir el spread del ensamble CMIP6 a la capa de incertidumbre.
 * @returns {Object} { varName: {median, p10, p90} }
 */
function normalizePeriodStats(periodData) {
  if (!periodData || typeof periodData !== 'object') return null;
  const result = {};
  for (const v of CLIMATE_VARS) {
    const entry = periodData?.[v];
    if (entry == null) continue;
    if (typeof entry === 'object') {
      result[v] = {
        median: entry.median ?? null,
        p10:    entry.p10   ?? null,
        p90:    entry.p90   ?? null,
      };
    } else if (typeof entry === 'number') {
      result[v] = { median: entry, p10: null, p90: null };
    }
  }
  return result;
}

/**
 * Consulta la celda climática más cercana vía RPC PostGIS.
 * @param {number} lat
 * @param {number} lon
 * @param {string} scenario - 'ssp245' | 'ssp585'
 * @returns {{ climateData, distanceKm }} o null si no hay datos
 */
async function fetchClimateCell(lat, lon, scenario) {
  try {
    const { data, error } = await supabase
      .rpc('get_nearest_climate_cell', { p_lat: lat, p_lon: lon });

    if (error || !data || data.length === 0) return null;

    const cell       = data[0];
    const raw        = typeof cell.data === 'string' ? JSON.parse(cell.data) : (cell.data || {});
    const horizonMap = buildHorizonMap(scenario);
    const climateData      = {};
    const climateDataStats = {};

    for (const [rawKey, mappedKey] of Object.entries(horizonMap)) {
      if (raw[rawKey]) {
        climateData[mappedKey]      = normalizePeriod(raw[rawKey]);
        climateDataStats[mappedKey] = normalizePeriodStats(raw[rawKey]);
      }
    }

    // Validar que al menos tenemos el período histórico
    if (!climateData.historical) return null;

    const distanceKm = haversineKm(lat, lon, cell.lat, cell.lon);
    return { climateData, climateDataStats, distanceKm, cellLat: cell.lat, cellLon: cell.lon };
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
  const [cellResult, griResult, meteoResult, territorialResult, ensoResult, terrainResult] = await Promise.allSettled([
    fetchClimateCell(latNum, lonNum, scenario),
    getGriRiskByLocation(latNum, lonNum),
    getClimateTrends(latNum, lonNum),
    getTerritorialContext(),
    getEnsoContext(),                           // Sprint 5: ENSO — informacional, non-blocking
    getTerrainIntelligence(latNum, lonNum),    // Sprint 6: terrain — informacional, non-blocking
  ]);

  const cellData      = cellResult.status      === 'fulfilled' ? cellResult.value      : null;
  const griData       = griResult.status        === 'fulfilled' ? griResult.value        : null;
  const meteoResult_  = meteoResult.status      === 'fulfilled' ? meteoResult.value      : null;
  const territorial   = territorialResult.status === 'fulfilled' ? territorialResult.value : null;
  const ensoData      = ensoResult.status        === 'fulfilled' ? ensoResult.value        : null;
  const terrainData   = terrainResult.status     === 'fulfilled' ? terrainResult.value     : null;

  if (cellResult.status === 'rejected')
    console.warn('[Layer1] climate_cells falló:', cellResult.reason?.message);
  if (griResult.status === 'rejected')
    console.warn('[Layer1] GRI falló:', griResult.reason?.message);
  if (meteoResult.status === 'rejected')
    console.warn('[Layer1] Open-Meteo falló:', meteoResult.reason?.message);
  if (territorialResult.status === 'rejected')
    console.warn('[Layer1] World Bank falló:', territorialResult.reason?.message);
  if (ensoResult.status === 'rejected')
    console.warn('[Layer1] ENSO falló (non-blocking):', ensoResult.reason?.message);
  if (terrainResult.status === 'rejected')
    console.warn('[Layer1] Terrain falló (non-blocking):', terrainResult.reason?.message);

  // Cuando climate_cells no tiene datos, usar los índices extremos computados
  // por Open-Meteo (hd35, hd40, cdd, rx5day, rx1day, pr, tas) como fallback.
  // climateIndices ya está en el mismo formato que climateData (historical/short_term/mid_term).
  const climateData      = cellData?.climateData ?? meteoResult_?.climateIndices ?? null;
  const climateDataStats = cellData?.climateDataStats ?? null; // only available for climate_cells (CMIP6)

  return {
    // Datos climáticos normalizados: climate_cells (preferido) u Open-Meteo computed
    climateData,
    climateDataStats,  // {historical,short_term,mid_term} × {varName:{median,p10,p90}} — CMIP6 only
    climateSource:   cellData?.climateData ? 'climate_cells' : (meteoResult_?.climateIndices ? 'open_meteo_derived' : null),
    // Datos GRI (probabilidades de amenaza por peligro)
    griData:         griData                  ?? null,
    // Datos Open-Meteo (deltas de temperatura y precipitación para narrativa)
    meteoData:       meteoResult_?.meteo      ?? null,
    // Contexto territorial World Bank
    territorialData: territorial              ?? null,
    // Sprint 5: ENSO — informacional, null cuando NOAA no responde
    ensoData:        ensoData                 ?? null,
    // Sprint 6: Terrain — informacional, null cuando elevation APIs no responden
    terrainData:     terrainData              ?? null,
    // Metadatos de ubicación
    distanceKm:      cellData?.distanceKm     ?? null,
    scenario,
    generated_at:    new Date().toISOString(),
  };
}
