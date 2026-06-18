/**
 * MODIS NDVI Service — Vegetation health data from NASA Earthdata (MODIS MOD13Q1 v6.1)
 *
 * Provides NDVI current values, time series, and anomaly classification.
 * Data source: AppEEARS API v2 (https://appeears.earthdatacloud.nasa.gov/api/)
 *
 * Resolution: 250m, 16-day composites
 * Coverage: Global (2000-02-18 to present)
 */

import * as modisNdvCache from './modisNdvCache.js';
import { getToken } from './earthdataAuth.js';
import { calcNdviAnomaly, classifyVegetationHealth } from './modisNdviUtils.js';
import { logger } from '../utils/logger.js';

const APPEARS_BASE = 'https://appeears.earthdatacloud.nasa.gov/api';
const PRODUCT = 'MOD13Q1.061';
const NDVI_LAYER = '_250m_16_days_NDVI';
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 10;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Builds Earthdata auth headers from cached token.
 * @returns {Promise<Object|null>} headers object or null if no auth
 */
async function buildAuthHeaders() {
  const auth = await getToken();
  if (!auth?.token) {
    logger.warn('modisNdviService', 'No Earthdata auth available');
    return null;
  }
  return {
    Authorization: auth.type === 'bearer' ? `Bearer ${auth.token}` : `Basic ${auth.token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Creates an AppEEARS v2 point extraction task and polls until completion.
 * @param {number} lat
 * @param {number} lon
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<Object|null>} parsed NDVI result
 */
async function submitPointTask(lat, lon, startDate, endDate) {
  const headers = await buildAuthHeaders();
  if (!headers) return null;

  const taskBody = {
    task_type: 'point',
    task_name: `DataRisk_NDVI_${lat}_${lon}`,
    params: {
      products: [{ product: PRODUCT, layers: [NDVI_LAYER] }],
      coordinates: [{ latitude: lat, longitude: lon }],
      dateRange: { startDate, endDate },
    },
  };

  try {
    // Step 1: Create task
    const createRes = await fetch(`${APPEARS_BASE}/task`, {
      method: 'POST',
      headers,
      body: JSON.stringify(taskBody),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!createRes.ok) throw new Error(`Task creation failed: HTTP ${createRes.status}`);
    const task = await createRes.json();
    const taskId = task.task_id;
    if (!taskId) throw new Error('No task_id in response');

    // Step 2: Poll for completion
    let attempts = 0;
    let status = null;
    while (attempts < MAX_POLL_ATTEMPTS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      const pollRes = await fetch(`${APPEARS_BASE}/task/${taskId}`, { headers });
      if (!pollRes.ok) throw new Error(`Poll failed: HTTP ${pollRes.status}`);
      const pollData = await pollRes.json();
      status = pollData.status;
      if (status === 'done') break;
      if (status === 'error') throw new Error(`Task failed: ${pollData.error || 'unknown'}`);
      attempts++;
    }
    if (status !== 'done') throw new Error('Task timed out');

    // Step 3: Get bundle files
    const bundleRes = await fetch(`${APPEARS_BASE}/task/${taskId}`, { headers });
    const bundleData = await bundleRes.json();
    const files = bundleData.files || [];
    const ndviFile = files.find(f => f.file_name?.includes('csv') || f.file_name?.includes('json'));
    if (!ndviFile) throw new Error('No data file in bundle');

    // Step 4: Download result (CSV or JSON)
    const dlRes = await fetch(`${APPEARS_BASE}/task/${taskId}/bundle/${ndviFile.file_id}`, {
      headers: { Authorization: headers.Authorization },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`);
    const text = await dlRes.text();

    // Parse CSV or JSON
    return parseAppeearsResponse(text, ndviFile.file_name);
  } catch (err) {
    logger.warn('modisNdviService', 'submitPointTask failed', { error: err.message, lat, lon });
    return null;
  }
}

/**
 * Parses AppEEARS v2 response (CSV or JSON) to extract NDVI.
 * @param {string} text - Response body
 * @param {string} fileName - Original file name
 * @returns {{ ndvi: number, date: string, quality: string }|null}
 */
function parseAppeearsResponse(text, fileName) {
  if (fileName?.endsWith('.csv') || text.includes(',')) {
    // CSV format: date, layer, value, ...
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    // Find NDVI data rows (skip header)
    const dataRows = lines.slice(1).filter(l => l.includes(NDVI_LAYER));
    if (!dataRows.length) return null;
    const latestRow = dataRows.pop();
    const cols = latestRow.split(',');
    // Expect: date, layer, value, ...
    const date = cols[0]?.trim();
    const value = parseFloat(cols[2]);
    if (isNaN(value)) return null;
    const ndvi = Math.max(-1, Math.min(1, value));
    return { ndvi, date, quality: 'moderate' };
  }
  // JSON format fallback
  try {
    const data = JSON.parse(text);
    const records = data?.data?.filter(r => r?.data?.length) ?? [];
    if (!records.length) return null;
    const latest = records.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
    const raw = latest.data?.[0]?.[NDVI_LAYER];
    if (raw == null) return null;
    const ndvi = Math.max(-1, Math.min(1, raw));
    return { ndvi, date: latest.date, quality: 'moderate' };
  } catch { return null; }
}

/**
 * Parses AppEEARS API response to extract NDVI at the nearest point.
 * @param {Object} data - AppEEARS response JSON
 * @returns {{ ndvi: number, date: string, quality: string }|null}
 */
function parseNdviResponse(data) {
  if (!data?.data?.length) return null;
  const records = data.data.filter(r => r?.data?.length);
  if (!records.length) return null;

  const latest = records.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
  const ndviRaw = latest.data[0]?.[NDVI_LAYER];
  if (ndviRaw == null) return null;

  // MODIS NDVI scale factor is 0.0001
  const ndvi = ndviRaw * 0.0001;

  return { ndvi: Math.max(-1, Math.min(1, ndvi)), date: latest.date, quality: 'moderate' };
}

/**
 * Fetches recent NDVI for a given location using AppEEARS v2 task-based API.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ ndvi: number, date: string, quality: string }|null>}
 */
export async function getRecentNdvi(lat, lon) {
  const cacheKey = `ndvi_recent_${lat},${lon}`;
  const cached = modisNdvCache.get(cacheKey);
  if (cached) {
    logger.debug('modisNdviService', 'Cache hit', { cacheKey });
    return cached;
  }

  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = await submitPointTask(lat, lon, start, end);

  modisNdvCache.set(cacheKey, result);
  logger.info('modisNdviService', 'Recent NDVI fetched', { lat, lon, hasNdvi: !!result?.ndvi });
  return result;
}

/**
 * Gets NDVI anomaly for vegetation health assessment.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ current_ndvi: number, long_term_mean: number, anomaly_zscore: number|null, vegetation_health: string }|null>}
 */
export async function getNdviAnomaly(lat, lon) {
  const cacheKey = `ndvi_anomaly_${lat},${lon}`;
  const cached = modisNdvCache.get(cacheKey);
  if (cached) {
    logger.debug('modisNdviService', 'Cache hit', { cacheKey });
    return cached;
  }

  try {
    const ts = await getNdviTimeSeries(lat, lon);
    if (!ts?.monthly?.length) {
      modisNdvCache.set(cacheKey, null);
      return null;
    }

    const monthly = ts.monthly;
    const current = monthly[monthly.length - 1];
    const values = monthly.filter(m => m.ndvi != null).map(m => m.ndvi);
    const longTermMean = values.reduce((s, v) => s + v, 0) / values.length;
    const stdDev = values.length > 1
      ? Math.sqrt(values.reduce((s, v) => s + (v - longTermMean) ** 2, 0) / values.length)
      : null;

    const { anomaly, zScore } = calcNdviAnomaly(current.ndvi, longTermMean, stdDev);
    const vegetationHealth = classifyVegetationHealth(current.ndvi, anomaly);

    const result = {
      current_ndvi: current.ndvi,
      long_term_mean: longTermMean,
      anomaly_zscore: zScore,
      vegetation_health: vegetationHealth,
    };

    modisNdvCache.set(cacheKey, result);
    logger.info('modisNdviService', 'NDVI anomaly computed', { lat, lon, vegetation_health: result.vegetation_health });
    return result;
  } catch (err) {
    logger.warn('modisNdviService', 'getNdviAnomaly failed', { error: err.message, lat, lon });
    modisNdvCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Gets NDVI time series for trend analysis.
 * Uses AppEEARS v2 task-based API, polled synchronously.
 * @param {number} lat
 * @param {number} lon
 * @param {string} [startDate]
 * @param {string} [endDate]
 * @returns {Promise<{ monthly: Array<{date: string, ndvi: number, anomaly: number|null}>, greenness_trend: string }|null>}
 */
export async function getNdviTimeSeries(lat, lon, startDate, endDate) {
  const end = endDate || new Date().toISOString().slice(0, 10);
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cacheKey = `ndvi_ts_${lat},${lon}_${start}_${end}`;
  const cached = modisNdvCache.get(cacheKey);
  if (cached) {
    logger.debug('modisNdviService', 'Cache hit', { cacheKey });
    return cached;
  }

  try {
    // Try the old synchronous approach with new base URL as fallback
    const headers = await buildAuthHeaders();
    if (!headers) { modisNdvCache.set(cacheKey, null); return null; }

    const response = await fetch(`${APPEARS_BASE}/product/${PRODUCT}/point`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ latitude: lat, longitude: lon, startDate: start, endDate: end }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Fallback: try task-based API with wider date range
      if (response.status === 405 || response.status === 404) {
        logger.info('modisNdviService', 'Sync endpoint unavailable, trying task-based for time series');
        const data = await submitPointTask(lat, lon, start, end);
        if (!data) { modisNdvCache.set(cacheKey, null); return null; }
        // Build minimal time series from single point
        const monthly = [{ date: data.date, ndvi: data.ndvi, anomaly: null }];
        const result = { monthly, greenness_trend: 'stable' };
        modisNdvCache.set(cacheKey, result);
        return result;
      }
      throw new Error(`AppEEARS HTTP ${response.status}`);
    }

    const data = await response.json();
    const records = data?.data?.filter(r => r?.data?.length) ?? [];
    if (!records.length) { modisNdvCache.set(cacheKey, null); return null; }

    const monthly = records.map(r => {
      const raw = r.data[0]?.[NDVI_LAYER];
      const ndvi = raw != null ? Math.max(-1, Math.min(1, raw * 0.0001)) : null;
      return { date: r.date, ndvi, anomaly: null };
    }).filter(m => m.ndvi != null);

    if (!monthly.length) { modisNdvCache.set(cacheKey, null); return null; }

    const seriesMean = monthly.reduce((s, m) => s + m.ndvi, 0) / monthly.length;
    monthly.forEach(m => { m.anomaly = m.ndvi - seriesMean; });

    const n = monthly.length;
    const xMean = (n - 1) / 2;
    const yMean = seriesMean;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (monthly[i].ndvi - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    const greennessTrend = slope > 0.0001 ? 'increasing' : slope < -0.0001 ? 'declining' : 'stable';

    const result = { monthly, greenness_trend: greennessTrend };
    modisNdvCache.set(cacheKey, result);
    logger.info('modisNdviService', 'NDVI time series fetched', { lat, lon, points: monthly.length, trend: greennessTrend });
    return result;
  } catch (err) {
    logger.warn('modisNdviService', 'getNdviTimeSeries failed', { error: err.message, lat, lon });
    modisNdvCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Builds a narrative sentence for Layer6 from NDVI data.
 * @param {Object|null} ndviData - Output of getNdviAnomaly()
 * @returns {string}
 */
export function buildNdviNarrative(ndviData) {
  if (!ndviData) return '';
  const { current_ndvi, vegetation_health, long_term_mean } = ndviData;
  const healthLabel = vegetation_health === 'severe_stress' ? 'estrés severo'
    : vegetation_health === 'stress' ? 'estrés'
    : 'saludable';
  const pct = long_term_mean > 0
    ? ` (${((current_ndvi / long_term_mean - 1) * 100).toFixed(0)}% vs media histórica)`
    : '';
  return `Índice de vegetación NDVI: ${current_ndvi.toFixed(3)} — ${healthLabel}${pct} (datos MODIS Terra).`;
}

/**
 * Consolidated wrapper for Layer1 integration.
 * Fetches recent NDVI + anomaly and returns a single structured result.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object|null>}
 */
export async function getModisNdviData(lat, lon) {
  try {
    const [recent, anomaly] = await Promise.allSettled([
      getRecentNdvi(lat, lon),
      getNdviAnomaly(lat, lon),
    ]);
    const recentVal = recent.status === 'fulfilled' ? recent.value : null;
    const anomalyVal = anomaly.status === 'fulfilled' ? anomaly.value : null;
    if (!recentVal && !anomalyVal) {
      logger.warn('modisNdviService', 'getModisNdviData: both recent and anomaly returned null', { lat, lon });
      return null;
    }
    logger.info('modisNdviService', 'Consolidated data retrieved', { lat, lon, hasRecent: !!recentVal, hasAnomaly: !!anomalyVal });
    return { recent: recentVal, anomaly: anomalyVal };
  } catch (err) {
    logger.error('modisNdviService', 'getModisNdviData unexpected error', { error: err.message, lat, lon });
    return null;
  }
}
