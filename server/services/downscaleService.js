/**
 * Downscaling Service — Delta Method with Elevation Correction
 *
 * Converts CMIP6 25km climate projections with elevation adjustment (point correction).
 *   1. Delta method: preserve the climate change signal (future − historical)
 *   2. Elevation correction: apply standard lapse rates based on actual
 *      location elevation vs CMIP6 grid cell elevation
 *
 * Standard lapse rates:
 *   - Temperature: −6.5 °C / km  (ISA standard atmosphere)
 *   - Precipitation: +8% / 100m  (orographic enhancement, simplified)
 *   - Extreme heat days: lapse-adjusted through temperature correction
 *
 * Sources: IPCC AR6 WG1 Ch.10 (downscaling), Maraun & Widmann (2018)
 *          "Statistical Downscaling and Bias Correction for Climate Research"
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMP_LAPSE_RATE = -0.0065;
const OROGRAPHIC_THRESHOLD = 500;

function precipElevationFactor(elevDeltaM) {
  const gainM = Math.max(0, elevDeltaM);
  // Orographic enhancement: +4% per 100m up to 1500m (peak)
  // Then gradual reduction: -2% per 100m above 1500m (rain shadow)
  if (gainM <= 1500) {
    return 1 + (gainM / 100) * 0.04;
  }
  const above = gainM - 1500;
  return Math.max(0.6, 1 + 0.6 - (above / 100) * 0.02);
}

// ─── Variable classifications ─────────────────────────────────────────────────

const TEMP_VARS = ['tas', 'tasmax', 'txx'];
const PRECIP_VARS = ['pr', 'prpercnt'];
const HEAT_DAY_VARS = ['hd30', 'hd35', 'hd40'];

function classifyVariable(varName) {
  if (TEMP_VARS.includes(varName)) return 'temperature';
  if (PRECIP_VARS.includes(varName)) return 'precipitation';
  if (HEAT_DAY_VARS.includes(varName)) return 'heat_days';
  return 'other';
}

// ─── Extract numeric value (handles {median, p10, p90} or raw number) ────────

function extractValue(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v?.median != null) return v.median;
  return null;
}

// ─── Downscaling a single variable ────────────────────────────────────────────

function downscaleVariable(varName, historical, projected, cellElevM, siteElevM) {
  const category = classifyVariable(varName);
  const elevDeltaM = siteElevM - cellElevM;

  switch (category) {
    case 'temperature': {
      const cmip6Anomaly = projected - historical;
      const elevCorrection = elevDeltaM * TEMP_LAPSE_RATE;
      return {
        downscaled: historical + cmip6Anomaly + elevCorrection,
        original: projected,
        anomaly: cmip6Anomaly,
        elevation_correction_c: elevCorrection,
        method: 'delta_lapse_rate',
      };
    }

    case 'precipitation': {
      const ratio = historical > 0 ? projected / historical : 1;
      const elevFactor = precipElevationFactor(elevDeltaM);
      return {
        downscaled: historical * ratio * elevFactor,
        original: projected,
        anomaly_pct: (ratio - 1) * 100,
        elevation_correction_pct: (elevFactor - 1) * 100,
        method: 'delta_multiplicative_orographic',
      };
    }

    case 'heat_days': {
      const cmip6Anomaly = projected - historical;
      const elevCorrection = elevDeltaM * TEMP_LAPSE_RATE;
      return {
        downscaled: Math.max(0, historical + cmip6Anomaly + elevCorrection),
        original: projected,
        anomaly: cmip6Anomaly,
        elevation_correction_days: elevCorrection,
        method: 'delta_lapse_rate_heatdays',
      };
    }

    default: {
      const cmip6Anomaly = projected - historical;
      const elevCorrection = elevDeltaM * TEMP_LAPSE_RATE * 0.3;
      return {
        downscaled: historical + cmip6Anomaly + elevCorrection,
        original: projected,
        anomaly: cmip6Anomaly,
        elevation_correction: elevCorrection,
        method: 'delta_dampened_elevation',
      };
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Downscale CMIP6 climate data with elevation point adjustment.
 *
 * @param {object} climateData - Normalized CMIP6 data
 *   Shape: { historical: { varName: number|{median,...} },
 *            short_term: {...}, mid_term: {...}, long_term: {...} }
 * @param {number|null} siteElevationM - Actual location elevation (SRTM 30m)
 * @param {number|null} cellElevationM - CMIP6 grid cell elevation
 * @returns {object|null} Downscaled climate data with metadata, or null if not applicable
 */
export function downscaleClimateData(climateData, siteElevationM, cellElevationM) {
  if (!climateData?.historical) return null;
  if (siteElevationM == null || cellElevationM == null) return null;

  const allVars = new Set();
  for (const period of ['historical', 'short_term', 'mid_term', 'long_term']) {
    if (climateData[period]) {
      Object.keys(climateData[period]).forEach(v => allVars.add(v));
    }
  }

  const downscaled = {};
  const variableMetadata = {};

  for (const varName of allVars) {
    const historical = extractValue(climateData.historical?.[varName]);
    if (historical == null) continue;

    const perHorizon = {};
    for (const period of ['short_term', 'mid_term', 'long_term']) {
      const projected = extractValue(climateData[period]?.[varName]);
      if (projected == null) {
        perHorizon[period] = null;
        continue;
      }

      const result = downscaleVariable(varName, historical, projected, cellElevationM, siteElevationM);
      perHorizon[period] = result.downscaled;
      variableMetadata[varName] = {
        method: result.method,
        elevation_correction: result.elevation_correction_c ?? result.elevation_correction_pct ?? result.elevation_correction_days ?? null,
      };
    }

    downscaled[varName] = {
      historical,
      ...perHorizon,
    };
  }

  return {
    downscaled_data: downscaled,
    downscale_metadata: {
      applied: true,
      method: 'delta_elevation_correction',
      cell_elevation_m: cellElevationM,
      site_elevation_m: siteElevationM,
      elevation_delta_m: siteElevationM - cellElevationM,
      variable_count: Object.keys(variableMetadata).length,
      baseline: 'CMIP6_25km_elevation_adjusted',
    },
  };
}

/**
 * Compute effective spatial resolution after downscaling.
 */
export function getEffectiveResolution(downscaleResult) {
  return downscaleResult?.downscale_metadata?.applied
    ? '25km_elevation_adjusted'
    : '25km_raw';
}
