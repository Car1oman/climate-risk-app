/**
 * CMIP6 Ensemble Service — Multi-model climate projections from Open-Meteo Climate API
 *
 * Fetches per-model daily climate data for 7 CMIP6 HighResMIP models
 * and computes ensemble statistics (median, p10, p90) and model agreement.
 *
 * Source: Open-Meteo Climate API (https://climate-api.open-meteo.com/v1/climate)
 * Models: CMCC_CM2_VHR4, FGOALS_f3_H, HiRAM_SIT_HR, MRI_AGCM3_2_S,
 *         EC_Earth3P_HR, MPI_ESM1_2_XR, NICAM16_8S
 *
 * Coverage: 1950-01-01 to 2050-01-01
 * Scenario: HighResMIP (closest to SSP5-8.5)
 *
 * Fallback: IPCC AR6 WGI Atlas data (PROJECTION_DATA in projection.js)
 *           for variables/windows beyond Open-Meteo coverage.
 */

import { logger } from '../utils/logger.js';
import * as openMeteoCache from './openMeteoCache.js';

const CLIMATE_API = 'https://climate-api.open-meteo.com/v1/climate';
const FETCH_TIMEOUT_MS = 60_000;
const MODELS = [
  'CMCC_CM2_VHR4',
  'FGOALS_f3_H',
  'HiRAM_SIT_HR',
  'MRI_AGCM3_2_S',
  'EC_Earth3P_HR',
  'MPI_ESM1_2_XR',
  'NICAM16_8S',
];

const MODEL_META = {
  CMCC_CM2_VHR4:   { institution: 'CMCC (Italy)', resolution: '30 km' },
  FGOALS_f3_H:     { institution: 'CAS (China)', resolution: '28 km' },
  HiRAM_SIT_HR:    { institution: 'AS-RCEC (Taiwan)', resolution: '25 km' },
  MRI_AGCM3_2_S:   { institution: 'MRI (Japan)', resolution: '20 km' },
  EC_Earth3P_HR:   { institution: 'EC-Earth (Europe)', resolution: '29 km' },
  MPI_ESM1_2_XR:   { institution: 'MPI-M (Germany)', resolution: '51 km' },
  NICAM16_8S:      { institution: 'MIROC (Japan)', resolution: '31 km' },
};

const TIME_WINDOWS = {
  near_term: { start: '2020-01-01', end: '2039-12-31', baseline_start: '1981-01-01', baseline_end: '2014-12-31' },
  mid_term:  { start: '2040-01-01', end: '2049-12-31', baseline_start: '1981-01-01', baseline_end: '2014-12-31' },
};

/**
 * Fetches daily climate data for all 7 CMIP6 models from Open-Meteo.
 * Splits into model batches and variable requests to stay within API limits.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object|null>} Merged daily data per model
 */
async function fetchModelData(lat, lon) {
  // Split models into batches of 4 to avoid API overload
  const modelBatches = [
    MODELS.slice(0, 4),
    MODELS.slice(4),
  ];

  const allResults = [];


  for (const [batchIdx, batch] of modelBatches.entries()) {
    const modelsStr = batch.join(',');

    const fetchBatch = async (variables, retries = 2) => {
      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        start_date: '1981-01-01',
        end_date: '2050-01-01',
        models: modelsStr,
        daily: variables,
      });
      const url = `${CLIMATE_API}?${params}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        if (r.status === 429 && retries > 0) {
          logger.info('cmip6EnsembleService', 'Rate limited, retrying in 3s', { models: modelsStr, retriesLeft: retries });
          await new Promise(r => setTimeout(r, 3000));
          return fetchBatch(variables, retries - 1);
        }
        logger.warn('cmip6EnsembleService', 'Open-Meteo batch failed', {
          models: modelsStr, status: r.status, body: text.substring(0, 200),
        });
        return null;
      }
      return r.json();
    };

    // Fetch temperature and precipitation in separate calls per batch
    const [tempData, precipData] = await Promise.all([
      fetchBatch('temperature_2m_mean,temperature_2m_max'),
      fetchBatch('precipitation_sum'),
    ]);

    if (tempData) {
      allResults.push({ tempData, precipData });
    }
  }

  if (!allResults.length) {
    logger.warn('cmip6EnsembleService', 'All Open-Meteo batches failed');
    return null;
  }

  // Merge results from batches
  const merged = {
    tempData: { daily: { time: allResults[0].tempData.daily.time } },
    precipData: { daily: { time: allResults[0].precipData?.daily?.time ?? allResults[0].tempData.daily.time } },
  };

  for (const result of allResults) {
    if (result.tempData?.daily) {
      for (const [key, val] of Object.entries(result.tempData.daily)) {
        if (key !== 'time') {
          merged.tempData.daily[key] = val;
        }
      }
      // Copy units
      if (result.tempData.daily_units) {
        merged.tempData.daily_units = { ...merged.tempData.daily_units, ...result.tempData.daily_units };
      }
    }
    if (result.precipData?.daily) {
      for (const [key, val] of Object.entries(result.precipData.daily)) {
        if (key !== 'time') {
          if (!merged.precipData.daily) merged.precipData.daily = { time: merged.tempData.daily.time };
          merged.precipData.daily[key] = val;
        }
      }
      if (result.precipData.daily_units) {
        merged.precipData.daily_units = { ...merged.precipData.daily_units, ...result.precipData.daily_units };
      }
    }
  }

  logger.info('cmip6EnsembleService', 'Open-Meteo data fetched', {
    models: Object.keys(merged.tempData.daily).filter(k => k !== 'time').length,
    days: merged.tempData.daily.time?.length,
  });

  return merged;
}

/**
 * Computes the mean of an array of numbers.
 */
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Computes percentile (0-100) from sorted array.
 */
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Computes mean and population stddev in a single O(n) pass (Welford's algorithm).
 */
function meanAndStddev(values) {
  if (!values.length) return { mean: 0, stddev: 0 };
  let m = 0, M2 = 0;
  for (let i = 0; i < values.length; i++) {
    const delta = values[i] - m;
    m += delta / (i + 1);
    M2 += delta * (values[i] - m);
  }
  return { mean: m, stddev: values.length > 1 ? Math.sqrt(M2 / values.length) : 0 };
}

/**
 * Binary search on a sorted date-string array. O(log n) vs O(n) findIndex.
 * mode 'gte': first index where times[i] >= target
 * mode 'gt':  first index where times[i] >  target
 */
function binarySearchDate(times, target, mode) {
  let lo = 0, hi = times.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (mode === 'gte' ? times[mid] >= target : times[mid] > target) {
      result = mid; hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return result;
}

/**
 * Computes ensemble statistics and per-model breakdown for a given time window.
 * @param {Object} data - Merged temperature + precipitation data
 * @param {string} windowKey - 'near_term' or 'mid_term'
 * @returns {Object|null} { models: {temperature, precipitation}[], ensemble: {median, p10, p90, agreement} }
 */
function computeWindowEnsemble(data, windowKey) {
  const win = TIME_WINDOWS[windowKey];
  if (!win || !data?.tempData?.daily?.time) return null;

  const times = data.tempData.daily.time;
  // Binary search on sorted date array — O(log n) vs O(n) findIndex
  const startIdx = binarySearchDate(times, win.start, 'gte');
  const endIdx   = binarySearchDate(times, win.end,   'gt');
  const range = startIdx >= 0 && endIdx > startIdx ? { startIdx, endIdx } : null;
  if (!range) return null;

  // Compute baseline (1981-2014) mean for temperature
  const blStart = binarySearchDate(times, win.baseline_start, 'gte');
  const blEnd   = binarySearchDate(times, win.baseline_end,   'gt');

  const modelValues = [];

  for (const model of MODELS) {
    const tempKey = `temperature_2m_mean_${model}`;
    const maxKey = `temperature_2m_max_${model}`;
    const precipKey = `precipitation_sum_${model}`;

    const temps = data.tempData?.daily?.[tempKey];
    const maxs = data.tempData?.daily?.[maxKey];
    const precips = data.precipData?.daily?.[precipKey];

    if (!temps) continue;

    // Baseline mean temperature
    const blTemps = blStart >= 0 && blEnd > blStart
      ? temps.slice(blStart, blEnd).filter(t => t != null)
      : [];
    const baselineTemp = mean(blTemps);

    // Window mean temperature (anomaly vs baseline)
    const winTemps = temps.slice(range.startIdx, range.endIdx).filter(t => t != null);
    const winTemp = mean(winTemps);
    const anomaly = winTemp - baselineTemp;

    // Window mean precipitation (proxy for change signal)
    let meanPrecip = null;
    let pctChange = null;
    if (precips) {
      const winPrecips = precips.slice(range.startIdx, range.endIdx).filter(p => p != null);
      meanPrecip = mean(winPrecips);

      // Baseline precipitation
      const blPrecips = blStart >= 0 && blEnd > blStart
        ? precips.slice(blStart, blEnd).filter(p => p != null)
        : [];
      const blPrecip = mean(blPrecips);

      // Precipitation change percentage
      pctChange = blPrecip > 0 ? ((meanPrecip - blPrecip) / blPrecip) * 100 : null;
    }

    // Count days with Tmax > 35°C (hd35 proxy)
    const hd35Count = maxs
      ? maxs.slice(range.startIdx, range.endIdx).filter(t => t != null && t > 35).length
      : null;

    modelValues.push({
      model,
      temperature_anomaly: anomaly,
      temperature_mean: winTemp,
      precipitation_mean: meanPrecip,
      precipitation_change_pct: pctChange,
      hd35_count: hd35Count,
      meta: MODEL_META[model],
    });
  }

  if (!modelValues.length) return null;

  // Ensemble statistics
  const tempAnomalies = modelValues.map(m => m.temperature_anomaly).sort((a, b) => a - b);
  const precipChanges = modelValues.map(m => m.precipitation_change_pct).sort((a, b) => a - b);
  const hd35Counts = modelValues.filter(m => m.hd35_count != null).map(m => m.hd35_count).sort((a, b) => a - b);

  // Model agreement: % of models with warming > 0 (positive anomaly)
  const warmingModels = modelValues.filter(m => m.temperature_anomaly > 0).length;
  const agreementTemp = (warmingModels / modelValues.length) * 100;

  // Precipitation sign agreement
  const dryingModels = modelValues.filter(m => m.precipitation_change_pct < 0).length;
  const agreementPrecip = Math.max(dryingModels, modelValues.length - dryingModels) / modelValues.length * 100;

  const round2 = v => Math.round(v * 100) / 100;
  const { mean: ensembleMean, stddev: ensembleStd } = meanAndStddev(tempAnomalies);

  return {
    models: modelValues,
    n_models: modelValues.length,
    // Flat summary fields (Fase 5.2 spec: ensemble_mean/min/max/std/models)
    ensemble_mean: round2(ensembleMean),
    ensemble_min:  round2(tempAnomalies[0]),
    ensemble_max:  round2(tempAnomalies[tempAnomalies.length - 1]),
    ensemble_std:  round2(ensembleStd),
    model_names:   modelValues.map(m => m.model),
    ensemble: {
      temperature: {
        median: round2(percentile(tempAnomalies, 50)),
        p10:    round2(percentile(tempAnomalies, 10)),
        p90:    round2(percentile(tempAnomalies, 90)),
        agreement_pct: round2(agreementTemp),
        range: { min: round2(tempAnomalies[0]), max: round2(tempAnomalies[tempAnomalies.length - 1]) },
      },
      precipitation: {
        median: round2(percentile(precipChanges, 50)),
        p10:    round2(percentile(precipChanges, 10)),
        p90:    round2(percentile(precipChanges, 90)),
        agreement_pct: round2(agreementPrecip),
        range: { min: round2(precipChanges[0] ?? 0), max: round2(precipChanges[precipChanges.length - 1] ?? 0) },
      },
      hd35_proxy: hd35Counts.length > 0 ? {
        median: round2(percentile(hd35Counts, 50)),
        p10:    round2(percentile(hd35Counts, 10)),
        p90:    round2(percentile(hd35Counts, 90)),
      } : null,
    },
  };
}

/**
 * Fetches and computes ensemble spread for a given location.
 * Falls back gracefully if Open-Meteo API is unavailable.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object>} { spread: { near_term, mid_term }, source, available }
 */
export async function buildEnsembleSpread(lat, lon) {
  const cached = openMeteoCache.get(lat, lon);
  if (cached) {
    logger.info('cmip6EnsembleService', 'Cache hit', { lat, lon });
    return cached;
  }

  try {
    const data = await fetchModelData(lat, lon);
    if (!data) {
      return { available: false, source: 'fallback_ipcc_ar6', spread: {} };
    }

    const nearTerm = computeWindowEnsemble(data, 'near_term');
    const midTerm = computeWindowEnsemble(data, 'mid_term');

    logger.info('cmip6EnsembleService', 'Ensemble spread computed', {
      lat, lon,
      nearTermModels: nearTerm?.n_models ?? 0,
      midTermModels: midTerm?.n_models ?? 0,
    });

    const result = {
      available: true,
      source: 'open_meteo_climate_api',
      models_used: MODELS,
      spread: {
        near_term: nearTerm,
        mid_term: midTerm,
      },
    };
    openMeteoCache.set(lat, lon, result);
    return result;
  } catch (err) {
    logger.warn('cmip6EnsembleService', 'Failed to compute ensemble spread', {
      error: err.message,
      lat, lon,
    });
    return { available: false, source: 'fallback_ipcc_ar6', spread: {} };
  }
}

export { MODELS, MODEL_META };
