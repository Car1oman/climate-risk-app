/**
 * MODIS NDVI Service — Vegetation health data from NASA Earthdata (MODIS MOD13Q1 v6.1)
 *
 * Provides NDVI current values, time series, and anomaly classification.
 * Data source: https://lpdaacsvc.cr.usgs.gov/appeears/api/
 *
 * Resolution: 250m, 16-day composites
 * Coverage: Global (2000-02-18 to present)
 */

import * as modisNdvCache from './modisNdvCache.js';
import { getToken } from './earthdataAuth.js';
import { calcNdviAnomaly, classifyVegetationHealth } from './modisNdviUtils.js';
import { logger } from '../utils/logger.js';

const APPEARS_BASE = 'https://lpdaacsvc.cr.usgs.gov/appeears/api';
const PRODUCT = 'MOD13Q1';
const FETCH_TIMEOUT_MS = 30_000;

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
  const ndviRaw = latest.data[0]?.['_250m_16_days_NDVI'];
  if (ndviRaw == null) return null;

  // MODIS NDVI scale factor is 0.0001
  const ndvi = ndviRaw * 0.0001;
  const quality = latest.data[0]?.['DetailedQA'] ?? 'unknown';

  return { ndvi: Math.max(-1, Math.min(1, ndvi)), date: latest.date, quality };
}

/**
 * Fetches recent NDVI for a given location.
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

  try {
    const auth = await getToken();
    if (!auth.token) {
      logger.warn('modisNdviService', 'No Earthdata auth available', { lat, lon });
      modisNdvCache.set(cacheKey, null);
      return null;
    }

    const headers = {
      Authorization: auth.type === 'bearer' ? `Bearer ${auth.token}` : `Basic ${auth.token}`,
      'Content-Type': 'application/json',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(`${APPEARS_BASE}/product/${PRODUCT}/point`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        latitude: lat,
        longitude: lon,
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`AppEEARS HTTP ${response.status}`);
    }

    const data = await response.json();
    const result = parseNdviResponse(data);

    modisNdvCache.set(cacheKey, result);
    logger.info('modisNdviService', 'Recent NDVI fetched', { lat, lon, hasNdvi: !!result?.ndvi });
    return result;
  } catch (err) {
    logger.warn('modisNdviService', 'getRecentNdvi failed', { error: err.message, lat, lon });
    modisNdvCache.set(cacheKey, null);
    return null;
  }
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
    const auth = await getToken();
    if (!auth.token) return null;

    const headers = {
      Authorization: auth.type === 'bearer' ? `Bearer ${auth.token}` : `Basic ${auth.token}`,
      'Content-Type': 'application/json',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(`${APPEARS_BASE}/product/${PRODUCT}/point`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ latitude: lat, longitude: lon, startDate: start, endDate: end }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`AppEEARS HTTP ${response.status}`);

    const data = await response.json();
    const records = data?.data?.filter(r => r?.data?.length) ?? [];
    if (!records.length) return null;

    const monthly = records.map(r => {
      const raw = r.data[0]?.['_250m_16_days_NDVI'];
      const ndvi = raw != null ? Math.max(-1, Math.min(1, raw * 0.0001)) : null;
      return { date: r.date, ndvi, anomaly: null };
    }).filter(m => m.ndvi != null);

    if (!monthly.length) return null;

    // Calculate anomalies (vs series mean)
    const seriesMean = monthly.reduce((s, m) => s + m.ndvi, 0) / monthly.length;
    monthly.forEach(m => { m.anomaly = m.ndvi - seriesMean; });

    // Trend detection via linear regression slope
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
