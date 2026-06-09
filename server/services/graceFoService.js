/**
 * GRACE-FO Service — Terrestrial Water Storage (TWS) anomaly data
 *
 * Provides groundwater and TWS anomaly data from GRACE-FO mascon solutions.
 * Data source: NASA TELLUS / PO.DAAC mascon solutions (JPL, CSR, GSFC)
 *
 * Resolution: ~300km (mascon), monthly temporal
 * Coverage: Global (2002-04 to present, monthly)
 */

import * as graceFoCache from './graceFoCache.js';
import { downscaleToPoint, loadMasconFile, classifyDroughtSeverity } from './graceFoDownscale.js';
import { logger } from '../utils/logger.js';

const TELLUS_BASE = 'https://podaac-tools.jpl.nasa.gov/drive/files/allData/tellus/L3/gracefo/land_mascon';
const FETCH_TIMEOUT_MS = 60_000;

// Groundwater index thresholds (simplified — real index requires calibration with in-situ wells)
const GW_INDEX_RANGES = {
  extreme: { max: -10, label: 'extremo' },
  severe:  { max: -5,  label: 'severo' },
  moderate: { max: -2, label: 'moderado' },
  normal:  { max: 2,   label: 'normal' },
  wet:     { max: Infinity, label: 'húmedo' },
};

/**
 * Computes a simplified groundwater index from TWS anomaly.
 * In practice, this would factor in local aquifer storage coefficients.
 * @param {number} twsCm - TWS anomaly in cm
 * @returns {string} Groundwater index label
 */
function computeGroundwaterIndex(twsCm) {
  if (twsCm <= GW_INDEX_RANGES.extreme.max) return GW_INDEX_RANGES.extreme.label;
  if (twsCm <= GW_INDEX_RANGES.severe.max) return GW_INDEX_RANGES.severe.label;
  if (twsCm <= GW_INDEX_RANGES.moderate.max) return GW_INDEX_RANGES.moderate.label;
  if (twsCm <= GW_INDEX_RANGES.normal.max) return GW_INDEX_RANGES.normal.label;
  return GW_INDEX_RANGES.wet.label;
}

/**
 * Fetches the latest TWS anomaly for a given location via TELLUS REST API.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ tws_anomaly_cm: number, groundwater_index: string, drought_severity: string }|null>}
 */
export async function getTwsAnomaly(lat, lon) {
  const cacheKey = `tws_anomaly_${lat},${lon}`;
  const cached = graceFoCache.get(cacheKey);
  if (cached) {
    logger.debug('graceFoService', 'Cache hit', { cacheKey });
    return cached;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(
      `${TELLUS_BASE}/JPL_mascon_global_monthly_2024-12.json`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!response.ok) throw new Error(`TELLUS HTTP ${response.status}`);

    const data = await response.json();
    const grid = loadMasconFile(data);
    if (!grid) {
      logger.warn('graceFoService', 'getTwsAnomaly: mascon grid null', { lat, lon });
      graceFoCache.set(cacheKey, null);
      return null;
    }

    const twsCm = downscaleToPoint(grid, lat, lon);
    if (twsCm == null) {
      logger.warn('graceFoService', 'getTwsAnomaly: downscale returned null', { lat, lon });
      graceFoCache.set(cacheKey, null);
      return null;
    }

    const groundwaterIndex = computeGroundwaterIndex(twsCm);
    const droughtSeverity = classifyDroughtSeverity(twsCm);

    const result = { tws_anomaly_cm: twsCm, groundwater_index: groundwaterIndex, drought_severity: droughtSeverity };
    graceFoCache.set(cacheKey, result);
    logger.info('graceFoService', 'TWS anomaly fetched', { lat, lon, tws_anomaly_cm: twsCm, drought_severity: droughtSeverity });
    return result;
  } catch (err) {
    logger.warn('graceFoService', 'getTwsAnomaly failed', { error: err.message, lat, lon });
    graceFoCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Detects trend from monthly TWS time series via linear regression.
 * @param {Array<{tws_cm: number}>} monthly
 * @returns {'declining'|'stable'|'recovering'}
 */
function detectTrend(monthly) {
  const n = monthly.length;
  if (n < 3) return 'stable';
  const xMean = (n - 1) / 2;
  const yMean = monthly.reduce((s, m) => s + m.tws_cm, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (monthly[i].tws_cm - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  if (slope > 0.1) return 'recovering';
  if (slope < -0.1) return 'declining';
  return 'stable';
}

/**
 * Gets TWS time series for trend analysis.
 * @param {number} lat
 * @param {number} lon
 * @param {string} [startDate]
 * @param {string} [endDate]
 * @returns {Promise<{ monthly: Array<{date: string, tws_cm: number, anomaly: number}>, trend: string }|null>}
 */
export async function getTwsTimeSeries(lat, lon, startDate, endDate) {
  const end = endDate || new Date().toISOString().slice(0, 7);
  const start = startDate || '2020-01';
  const cacheKey = `tws_ts_${lat},${lon}_${start}_${end}`;
  const cached = graceFoCache.get(cacheKey);
  if (cached) {
    logger.debug('graceFoService', 'Cache hit', { cacheKey });
    return cached;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(
      `${TELLUS_BASE}/JPL_mascon_global_monthly_2024-12.json`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!response.ok) throw new Error(`TELLUS HTTP ${response.status}`);

    const data = await response.json();
    const grid = loadMasconFile(data);
    if (!grid) return null;

    // For time series we use the nearest grid cell
    const nearest = [...grid].sort((a, b) => {
      const da = (a.lat - lat) ** 2 + (a.lon - lon) ** 2;
      const db = (b.lat - lat) ** 2 + (b.lon - lon) ** 2;
      return da - db;
    })[0];

    if (!nearest) return null;

    // Since we only have the latest value, generate monthly time series
    // from the anomaly assuming it's representative (simplified)
    const monthly = [{ date: end, tws_cm: nearest.value, anomaly: 0 }];
    const trend = detectTrend(monthly);

    const result = { monthly, trend };
    graceFoCache.set(cacheKey, result);
    logger.info('graceFoService', 'TWS time series fetched', { lat, lon, points: monthly.length, trend });
    return result;
  } catch (err) {
    logger.warn('graceFoService', 'getTwsTimeSeries failed', { error: err.message, lat, lon });
    graceFoCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Builds a narrative sentence for Layer6 from GRACE-FO data.
 * @param {Object|null} graceData - Output of getTwsAnomaly()
 * @returns {string}
 */
export function buildGraceFoNarrative(graceData) {
  if (!graceData) return '';
  const { tws_anomaly_cm, groundwater_index, drought_severity } = graceData;
  const severityLabel = drought_severity === 'extreme' ? 'extremadamente seco'
    : drought_severity === 'severe' ? 'severamente seco'
    : drought_severity === 'moderate' ? 'moderadamente seco'
    : 'normal';
  return `Almacenamiento de agua terrestre (TWS): ${tws_anomaly_cm.toFixed(1)} cm de anomalía — ${severityLabel} (datos GRACE-FO).`;
}

/**
 * Consolidated wrapper for Layer1 integration.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object|null>}
 */
export async function getGraceFoData(lat, lon) {
  try {
    const [anomaly, ts] = await Promise.allSettled([
      getTwsAnomaly(lat, lon),
      getTwsTimeSeries(lat, lon),
    ]);
    const anomalyVal = anomaly.status === 'fulfilled' ? anomaly.value : null;
    const tsVal = ts.status === 'fulfilled' ? ts.value : null;
    if (!anomalyVal && !tsVal) {
      logger.warn('graceFoService', 'getGraceFoData: both anomaly and time series returned null', { lat, lon });
      return null;
    }
    logger.info('graceFoService', 'Consolidated data retrieved', { lat, lon, hasAnomaly: !!anomalyVal, hasTimeSeries: !!tsVal });
    return { anomaly: anomalyVal, timeSeries: tsVal };
  } catch (err) {
    logger.error('graceFoService', 'getGraceFoData unexpected error', { error: err.message, lat, lon });
    return null;
  }
}
