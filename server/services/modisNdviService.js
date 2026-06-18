/**
 * MODIS NDVI Service — Vegetation health data from MODIS MOD13Q1 v6.1
 *
 * Provides NDVI current values, time series, and anomaly classification.
 * Data source: ORNL DAAC MODIS Global Subset REST API (https://modis.ornl.gov/rst/api/v1)
 * No authentication required. Returns JSON directly — no HDF/CSV parsing.
 *
 * Resolution: 250m, 16-day composites
 * Coverage: Global (2000-02-18 to present)
 */

import * as modisNdvCache from './modisNdvCache.js';
import { calcNdviAnomaly, classifyVegetationHealth } from './modisNdviUtils.js';
import { logger } from '../utils/logger.js';

const ORNL_BASE = 'https://modis.ornl.gov/rst/api/v1';
const PRODUCT = 'MOD13Q1';
const NDVI_BAND = '250m_16_days_NDVI';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_SUBSET_RANGE = 10;
const NDVI_SCALE = 0.0001;
const NDVI_FILL = -3000;

/**
 * Converts a JavaScript Date to MODIS A-date format (AYYYYDDD).
 * @param {Date} date
 * @returns {string} e.g., "A2025001"
 */
function toModisDate(date) {
  const y = date.getUTCFullYear();
  const startOfYear = Date.UTC(y, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86400000) + 1;
  return `A${y}${String(dayOfYear).padStart(3, '0')}`;
}

/**
 * Converts ISO date string (YYYY-MM-DD) to MODIS A-date.
 * @param {string} isoDate
 * @returns {string}
 */
function isoToModis(isoDate) {
  return toModisDate(new Date(isoDate));
}

/**
 * Fetches available MODIS composite dates for a lat/lon from the ORNL API.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string[]>} Array of MODIS A-dates, newest first
 */
async function fetchModisDates(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
  });
  const url = `${ORNL_BASE}/${PRODUCT}/dates?${params}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) return [];
  const data = await r.json();
  if (!data?.dates?.length) return [];
  return data.dates
    .map(d => d.modis_date)
    .sort()
    .reverse();
}

/**
 * Queries the ORNL subset API for NDVI at a given point and date range.
 * Limited to 10 composite dates per request.
 * @param {number} lat
 * @param {number} lon
 * @param {string} startDate - MODIS A-date
 * @param {string} endDate - MODIS A-date
 * @returns {Promise<Array<{modis_date: string, calendar_date: string, ndvi: number|null}>>}
 */
async function queryNdviSubset(lat, lon, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    band: NDVI_BAND,
    startDate,
    endDate,
    kmAboveBelow: '0',
    kmLeftRight: '0',
  });
  const url = `${ORNL_BASE}/${PRODUCT}/subset?${params}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) return [];
  const data = await r.json();
  if (!data?.subset?.length) return [];

  return data.subset.map(entry => {
    const raw = entry.data?.[0];
    const ndvi = raw != null && raw !== NDVI_FILL
      ? clampNdvi(raw * NDVI_SCALE)
      : null;
    return {
      modis_date: entry.modis_date,
      calendar_date: entry.calendar_date,
      ndvi,
    };
  }).filter(e => e.ndvi != null);
}

function clampNdvi(v) {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Fetches recent NDVI for a given location using ORNL DAAC REST API.
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
    const dates = await fetchModisDates(lat, lon);
    if (!dates.length) {
      logger.warn('modisNdviService', 'No MODIS dates available', { lat, lon });
      modisNdvCache.set(cacheKey, null);
      return null;
    }

    const latestDate = dates[0];
    const entries = await queryNdviSubset(lat, lon, latestDate, latestDate);
    if (!entries.length) {
      modisNdvCache.set(cacheKey, null);
      return null;
    }

    const result = {
      ndvi: entries[0].ndvi,
      date: entries[0].calendar_date,
      quality: 'good',
    };

    modisNdvCache.set(cacheKey, result);
    logger.info('modisNdviService', 'Recent NDVI fetched', { lat, lon, ndvi: result.ndvi, date: result.date });
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
 * Gets NDVI time series for trend analysis using ORNL DAAC REST API.
 * Batches requests to respect the 10-composite-per-query limit.
 * @param {number} lat
 * @param {number} lon
 * @param {string} [startDate] - ISO date or MODIS A-date
 * @param {string} [endDate] - ISO date or MODIS A-date
 * @returns {Promise<{ monthly: Array<{date: string, ndvi: number, anomaly: number|null}>, greenness_trend: string }|null>}
 */
export async function getNdviTimeSeries(lat, lon, startDate, endDate) {
  const end = endDate || toModisDate(new Date());
  const start = startDate || toModisDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
  const cacheKey = `ndvi_ts_${lat},${lon}_${start}_${end}`;
  const cached = modisNdvCache.get(cacheKey);
  if (cached) {
    logger.debug('modisNdviService', 'Cache hit', { cacheKey });
    return cached;
  }

  try {
    const allDates = await fetchModisDates(lat, lon);
    if (!allDates.length) {
      modisNdvCache.set(cacheKey, null);
      return null;
    }

    const startStr = start.startsWith('A') ? start : isoToModis(start);
    const endStr = end.startsWith('A') ? end : isoToModis(end);

    // Filter dates within range
    const inRange = allDates.filter(d => d >= startStr && d <= endStr).sort();
    if (!inRange.length) {
      modisNdvCache.set(cacheKey, null);
      return null;
    }

    // Batch into groups of MAX_SUBSET_RANGE
    const batches = [];
    for (let i = 0; i < inRange.length; i += MAX_SUBSET_RANGE) {
      const batch = inRange.slice(i, i + MAX_SUBSET_RANGE);
      batches.push(queryNdviSubset(lat, lon, batch[0], batch[batch.length - 1]));
    }

    const batchResults = await Promise.all(batches);
    const allEntries = batchResults.flat().sort(
      (a, b) => a.modis_date.localeCompare(b.modis_date)
    );

    if (!allEntries.length) {
      modisNdvCache.set(cacheKey, null);
      return null;
    }

    const monthly = allEntries.map(e => ({
      date: e.calendar_date,
      ndvi: e.ndvi,
      anomaly: null,
    }));

    const seriesMean = monthly.reduce((s, m) => s + m.ndvi, 0) / monthly.length;
    monthly.forEach(m => { m.anomaly = m.ndvi - seriesMean; });

    const n = monthly.length;
    const xMean = (n - 1) / 2;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (monthly[i].ndvi - seriesMean);
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
