/**
 * GRACE-FO Service — Terrestrial Water Storage (TWS) anomaly data
 *
 * Data source: NASA TELLUS / PO.DAAC GRACE-FO JPL mascon RL06.3 via Earthdata Cloud OPeNDAP.
 * Auth: Bearer token from process.env.TOKEN (Earthdata Login JWT).
 *
 * Flow: CMR API (no-auth) → latest granule OPeNDAP URL → single-cell ASCII subset → parse float
 * No netCDF library required — OPeNDAP .ascii endpoint returns plain text.
 *
 * Resolution: 0.5° × 0.5° mascon grid, monthly temporal
 * Coverage: Global (2018-06 to present)
 */

import * as graceFoCache from './graceFoCache.js';
import { classifyDroughtSeverity } from './graceFoDownscale.js';
import { logger } from '../utils/logger.js';

const CMR_BASE = 'https://cmr.earthdata.nasa.gov/search';
const GRACE_SHORT_NAME = 'TELLUS_GRFO_L3_JPL_RL06.3_LND_v04';
const OPENDAP_PROVIDER_BASE = 'https://opendap.earthdata.nasa.gov/providers/POCLOUD/collections';

// 0.5° mascon grid — first cell centers
const GRID_STEP   = 0.5;
const LAT_ORIGIN  = -89.75; // lat[0]
const LON_ORIGIN  =   0.25; // lon[0], 0–360 convention

const FETCH_TIMEOUT_MS = 30_000;
const GRANULE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — refresh once per data update cycle

const GW_INDEX_RANGES = [
  { max: -10,        label: 'extremo'  },
  { max: -5,         label: 'severo'   },
  { max: -2,         label: 'moderado' },
  { max:  2,         label: 'normal'   },
  { max: Infinity,   label: 'húmedo'   },
];

function computeGroundwaterIndex(twsCm) {
  return (GW_INDEX_RANGES.find(r => twsCm <= r.max) ?? GW_INDEX_RANGES.at(-1)).label;
}

/**
 * Converts WGS-84 lat/lon to 0.5° mascon grid indices.
 * Lon is converted to the 0–360 convention used by GRACE-FO products.
 */
function toGridIndices(lat, lon) {
  const lon360 = lon < 0 ? lon + 360 : lon;
  return {
    latIdx: Math.max(0, Math.min(359, Math.round((lat  - LAT_ORIGIN) / GRID_STEP))),
    lonIdx: Math.max(0, Math.min(719, Math.round((lon360 - LON_ORIGIN) / GRID_STEP))),
  };
}

/**
 * Queries CMR for the latest GRACE-FO granule and returns its OPeNDAP base URL.
 * Result is cached 6 h to avoid hitting CMR on every request.
 */
async function fetchLatestGranuleUrl() {
  const cacheKey = 'grace_granule_opendap_url';
  const cached = graceFoCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    short_name: GRACE_SHORT_NAME,
    sort_key:   '-start_date',
    page_size:  '1',
  });

  const r = await fetch(`${CMR_BASE}/granules.json?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`CMR HTTP ${r.status}`);

  const data  = await r.json();
  const entry = data?.feed?.entry?.[0];
  if (!entry) throw new Error(`No GRACE-FO granules found in CMR for ${GRACE_SHORT_NAME}`);

  // Prefer an explicit OPeNDAP service link; fall back to constructing from granule title
  const links      = entry.links ?? [];
  const opendapLink = links.find(l =>
    l.href?.toLowerCase().includes('opendap') ||
    l.type?.toLowerCase().includes('opendap')  ||
    l.type === 'USE SERVICE API'
  );

  let url;
  if (opendapLink?.href) {
    url = opendapLink.href.replace(/\.html$/, '');
  } else {
    // Granule title is typically the filename without extension
    const granuleId = entry.title?.replace(/\.nc4$/, '') ?? entry.id;
    if (!granuleId) throw new Error('Cannot derive granule ID from CMR response');
    url = `${OPENDAP_PROVIDER_BASE}/${GRACE_SHORT_NAME}/granules/${granuleId}`;
  }

  graceFoCache.set(cacheKey, url, GRANULE_CACHE_TTL_MS);
  logger.info('graceFoService', 'Resolved latest GRACE-FO granule URL', { url });
  return url;
}

/**
 * Parses an OPeNDAP ASCII response for a single-cell subset.
 * Response format example:
 *   lwe_thickness[1][1][1]
 *   [0][0], [0] -3.2000000476837
 */
function parseOpeNdapAscii(text) {
  const afterSep = text.includes('---') ? text.split(/\-{3,}/)[1] : text;
  const numbers  = afterSep.match(/-?\d+\.?\d*(?:[eE][+-]?\d+)?/g);
  if (!numbers?.length) return null;
  // The last number in the data block is the lwe_thickness value
  const value = parseFloat(numbers[numbers.length - 1]);
  return isNaN(value) ? null : value;
}

/**
 * Fetches a single TWS anomaly value (cm) for the given lat/lon via OPeNDAP ASCII subsetting.
 * Sends the Bearer token from TOKEN env var for Earthdata auth.
 */
async function fetchTwsPoint(lat, lon) {
  const granuleUrl        = await fetchLatestGranuleUrl();
  const { latIdx, lonIdx } = toGridIndices(lat, lon);
  const token             = process.env.TOKEN;

  // Request a single grid cell: time[0:0], lat[i:i], lon[j:j]
  const url = `${granuleUrl}.ascii?lwe_thickness[0:0][${latIdx}:${latIdx}][${lonIdx}:${lonIdx}]`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const r = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  if (r.status === 401) throw new Error('Earthdata token expired or invalid — renew TOKEN in .env');
  if (!r.ok)           throw new Error(`OPeNDAP HTTP ${r.status}`);

  const text   = await r.text();
  const twsCm  = parseOpeNdapAscii(text);
  if (twsCm == null) throw new Error('Failed to parse lwe_thickness from OPeNDAP ASCII response');
  return twsCm;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getTwsAnomaly(lat, lon) {
  const cacheKey = `tws_anomaly_${lat},${lon}`;
  const cached   = graceFoCache.get(cacheKey);
  if (cached) return cached;

  try {
    const twsCm           = await fetchTwsPoint(lat, lon);
    const groundwaterIndex = computeGroundwaterIndex(twsCm);
    const droughtSeverity  = classifyDroughtSeverity(twsCm);

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

export async function getTwsTimeSeries(lat, lon, _startDate, endDate) {
  const end      = endDate || new Date().toISOString().slice(0, 7);
  const cacheKey = `tws_ts_${lat},${lon}_${end}`;
  const cached   = graceFoCache.get(cacheKey);
  if (cached) return cached;

  try {
    const twsCm  = await fetchTwsPoint(lat, lon);
    // Single-granule query — only the latest month is available without multiple CMR round-trips
    const monthly = [{ date: end, tws_cm: twsCm, anomaly: 0 }];
    const result  = { monthly, trend: 'stable' };

    graceFoCache.set(cacheKey, result);
    logger.info('graceFoService', 'TWS time series fetched', { lat, lon, date: end, tws_cm: twsCm });
    return result;
  } catch (err) {
    logger.warn('graceFoService', 'getTwsTimeSeries failed', { error: err.message, lat, lon });
    graceFoCache.set(cacheKey, null);
    return null;
  }
}

export function buildGraceFoNarrative(graceData) {
  if (!graceData) return '';
  const { tws_anomaly_cm, drought_severity } = graceData;
  const severityLabel = drought_severity === 'extreme'  ? 'extremadamente seco'
    : drought_severity === 'severe'   ? 'severamente seco'
    : drought_severity === 'moderate' ? 'moderadamente seco'
    : 'normal';
  return `Almacenamiento de agua terrestre (TWS): ${tws_anomaly_cm.toFixed(1)} cm de anomalía — ${severityLabel} (datos GRACE-FO).`;
}

export async function getGraceFoData(lat, lon) {
  try {
    const [anomaly, ts] = await Promise.allSettled([
      getTwsAnomaly(lat, lon),
      getTwsTimeSeries(lat, lon),
    ]);
    const anomalyVal = anomaly.status === 'fulfilled' ? anomaly.value : null;
    const tsVal      = ts.status     === 'fulfilled' ? ts.value      : null;
    if (!anomalyVal && !tsVal) {
      logger.warn('graceFoService', 'getGraceFoData: both returned null', { lat, lon });
      return null;
    }
    logger.info('graceFoService', 'Consolidated data retrieved', { lat, lon, hasAnomaly: !!anomalyVal, hasTimeSeries: !!tsVal });
    return { anomaly: anomalyVal, timeSeries: tsVal };
  } catch (err) {
    logger.error('graceFoService', 'getGraceFoData unexpected error', { error: err.message, lat, lon });
    return null;
  }
}
