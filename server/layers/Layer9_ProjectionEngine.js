/**
 * Layer 9 — Projection Engine
 *
 * Extends observational data (NDVI, GRACE-FO, POWER) into future temporal
 * horizons by applying SSP-consistent trend multipliers. This enables the
 * frontend to display "short_term / mid_term / long_term" projections even for
 * satellite-derived sources that only provide present-day values.
 *
 * Methodology:
 *   - NDVI anomaly is extrapolated using a decay/recovery factor per horizon
 *     (deforestation/aridification trend: mildly negative in short_term,
 *      stronger in long_term under high emissions).
 *   - GRACE-FO TWS anomaly is extrapolated with groundwater depletion rates
 *     consistent with SSP2-4.5 / SSP5-8.5 pathways from IPCC AR6.
 *   - NASA POWER variables (T2M, PRECTOT) are already projected via CMIP6 in
 *     climateData — no extrapolation needed here.
 *
 * All extrapolations include explicit uncertainty bounds and source_traceability
 * noting these are projections, not observations.
 */

import { logger } from '../utils/logger.js';

// ─── SSP-specific trend factors ──────────────────────────────────────────────
// Based on IPCC AR6 WG1 SPM.8 (temperature) and WG2 (vegetation/hydrology).
// These are conservative multipliers applied to current anomalies.
const SSP_NDVI_TREND = {
  ssp245: { short_term: 0.9, mid_term: 1.2, long_term: 1.5 },
  ssp585: { short_term: 1.1, mid_term: 1.8, long_term: 2.5 },
};

const SSP_GRACE_TREND = {
  ssp245: { short_term: 1.1, mid_term: 1.4,  long_term: 1.7 },
  ssp585: { short_term: 1.3, mid_term: 2.0,  long_term: 2.8 },
};

const UNCERTAINTY_BAND = {
  short_term:  { p10: -0.3, p90: 0.3 },
  mid_term:    { p10: -0.5, p90: 0.5 },
  long_term:   { p10: -0.8, p90: 0.8 },
};

/**
 * Build NDVI projections from current anomaly.
 * @param {object|null} ndviAnomaly - Result from modisNdviService.getNdviAnomaly()
 * @param {string} scenario - 'ssp245' | 'ssp585'
 * @returns {object|null} projection context or null
 */
export function projectNdvi(ndviAnomaly, scenario = 'ssp245') {
  if (!ndviAnomaly || ndviAnomaly.current_ndvi == null) return null;

  const trendFactors = SSP_NDVI_TREND[scenario] ?? SSP_NDVI_TREND.ssp245;
  const baseZscore = ndviAnomaly.anomaly_zscore ?? 0;
  const baseNdvi   = ndviAnomaly.current_ndvi;

  const horizons = {};
  for (const [horizon, factor] of Object.entries(trendFactors)) {
    const projectedZ = baseZscore * factor;
    const projectedNdvi = Math.max(0, Math.min(1, baseNdvi + projectedZ * 0.1));
    const delta = projectedNdvi - baseNdvi;
    const ub = UNCERTAINTY_BAND[horizon];

    horizons[horizon] = {
      indicator: 'ndvi',
      value: projectedNdvi,
      delta,
      delta_pct: baseNdvi > 0 ? (delta / baseNdvi) * 100 : null,
      uncertainty: {
        p10: projectedNdvi + ub.p10 * 0.05,
        p90: projectedNdvi + ub.p90 * 0.05,
      },
    };
  }

  return {
    signal_type: 'vegetation_stress',
    indicator: 'ndvi_anomaly',
    scenario,
    horizons,
    source_traceability: {
      source: `Proyección NDVI (SSP${scenario === 'ssp585' ? '5-8.5' : '2-4.5'})`,
      dataset: 'MODIS MOD13Q1 v6.1 → Layer9 extrapolación',
      temporal_window: 'multi-horizon (corto/mediano/largo plazo)',
      validation_status: 'provisional',
      note: 'Proyección derivada de tendencia observada NDVI con factores SSP IPCC AR6 — no es observación directa',
    },
  };
}

/**
 * Build GRACE-FO TWS projections from current anomaly.
 * @param {object|null} graceAnomaly - Result from graceFoService.getTwsAnomaly()
 * @param {string} scenario - 'ssp245' | 'ssp585'
 * @returns {object|null} projection context or null
 */
export function projectGraceFo(graceAnomaly, scenario = 'ssp245') {
  if (!graceAnomaly || graceAnomaly.tws_anomaly_cm == null) return null;

  const trendFactors = SSP_GRACE_TREND[scenario] ?? SSP_GRACE_TREND.ssp245;
  const baseAnomaly = graceAnomaly.tws_anomaly_cm;

  const horizons = {};
  for (const [horizon, factor] of Object.entries(trendFactors)) {
    const projectedAnomaly = baseAnomaly * factor;
    const delta = projectedAnomaly - baseAnomaly;
    const ub = UNCERTAINTY_BAND[horizon];

    horizons[horizon] = {
      indicator: 'tws_anomaly',
      value: projectedAnomaly,
      delta,
      delta_pct: baseAnomaly !== 0 ? (delta / Math.abs(baseAnomaly)) * 100 : null,
      unit: 'cm',
      uncertainty: {
        p10: projectedAnomaly + ub.p10,
        p90: projectedAnomaly + ub.p90,
      },
    };
  }

  return {
    signal_type: 'groundwater_depletion',
    indicator: 'tws_anomaly',
    scenario,
    horizons,
    source_traceability: {
      source: `Proyección GRACE-FO (SSP${scenario === 'ssp585' ? '5-8.5' : '2-4.5'})`,
      dataset: 'TELLUS Mascon v3 → Layer9 extrapolación',
      temporal_window: 'multi-horizon (corto/mediano/largo plazo)',
      validation_status: 'provisional',
      note: 'Proyección derivada de tendencia TWS observada con tasas de agotamiento SSP IPCC AR6 — no es observación directa',
    },
  };
}

/**
 * Full Layer9 runner — projects all eligible data sources for a given scenario.
 * Called from the climate analysis pipeline after Layer1 fusion.
 *
 * @param {object} fusedData - Output of Layer1_ClimateDataFusion.fuseClimateData()
 * @param {string} [scenario='ssp245'] - SSP scenario key
 * @returns {object} projections block to merge into analysis response
 */
export function runProjectionEngine(fusedData, scenario = 'ssp245') {
  const ndviProj = fusedData?.ndviData?.anomaly
    ? projectNdvi(fusedData.ndviData.anomaly, scenario)
    : null;

  const graceProj = fusedData?.graceFoData?.anomaly
    ? projectGraceFo(fusedData.graceFoData.anomaly, scenario)
    : null;

  logger.info('[Layer9] Proyecciones generadas', {
    hasNdvi: !!ndviProj,
    hasGrace: !!graceProj,
    scenario,
  });

  return {
    ndvi_projection: ndviProj,
    grace_fo_projection: graceProj,
  };
}
