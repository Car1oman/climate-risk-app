/**
 * H-5.9 + H-5.11: Mapping from signal name to {type, horizon, scenario} for
 * phenomenon inference. Derived from pipeline/config/signal-taxonomy.json
 * (variable → signal_name + signal_type) and signal naming conventions
 * (suffixes _corto, _mediano, _largo encode the horizon band from Stage 3/4).
 *
 * This mapping is static and bounded — signal names are controlled by
 * phenomenon-definitions.json and signal-taxonomy.json, not by external input.
 * It does NOT need to be exhaustive for ALL canonical variables, only for those
 * that appear in phenomenon-definitions.json required_signals/optional_signals.
 *
 * Horizon inference rules (H-5.9):
 * - "anomaly": corto (present observation, no future projection)
 * - "projected" + suffix _corto: corto (near-term projection)
 * - "projected" + suffix _mediano: mediano (medium-term projection)
 * - "projected" + suffix _largo: largo (long-term projection)
 * - "projected" (no suffix): corto (bare alias = corto per horizons.js)
 * - "categorical": null (ENSO is a discrete state, no temporal band)
 * - "static": null (baseline reference, not a temporal signal)
 *
 * Status inference rules:
 * - All signals are "categorical" → "active" (discrete state, now)
 * - Any signal is "anomaly" or "categorical" → "active" (observed/now)
 * - All signals are "projected" → "projected" (future only)
 * - Mix of anomaly/categorical + projected → "active" (current observation
 *   dominates; the projected signals provide additional evidence for future
 *   risk but the phenomenon has present observable basis)
 *
 * Scenario inference rules (H-5.11):
 * - All signals return scenario=null because:
 *   (1) Anomaly signals are present observations — no scenario applies.
 *   (2) Projected signals come from Open-Meteo CMIP6 HighResMIP ensemble,
 *       which is a single high-emissions-like pathway with NO SSP scenario
 *       selection parameter (HALLAZGO-8, authoritative-sources.json).
 *   (3) Categorical signals (ENSO) are discrete states — no scenario applies.
 * - Stage 6 uses fallback "not_scenario_specific" (stage-06-risk.js:36-37),
 *   which is correct and consistent with HALLAZGO-8.
 * - To populate scenario in the future: (a) add a scenario field to
 *   ClimateSignalSchema (types.js), (b) extract SSP labels from data sources
 *   that provide them (e.g. Supabase climate_cells with ensemble-all-sspXXX),
 *   (c) add scenario to this metadata mapping, (d) update inferScenario().
 *   This mapping and function are designed to support that extension without
 *   structural changes.
 */
export const SIGNAL_METADATA = {
  // Anomaly (current observation) — corto, no scenario
  temperatura_actual_anomaly:   { type: "anomaly", horizon: "corto", scenario: null },
  precipitacion_actual_anomaly: { type: "anomaly", horizon: "corto", scenario: null },
  humidity_anomaly:             { type: "anomaly", horizon: "corto", scenario: null },
  wind_anomaly:                 { type: "anomaly", horizon: "corto", scenario: null },
  pressure_anomaly:             { type: "anomaly", horizon: "corto", scenario: null },
  twsa_anomaly:                 { type: "anomaly", horizon: "corto", scenario: null },
  oni_index_anomaly:            { type: "anomaly", horizon: "corto", scenario: null },

  // Temperature projections — HighResMIP ensemble, no SSP scenario (HALLAZGO-8)
  temperatura_max_projection:        { type: "projected", horizon: "corto", scenario: null },
  temperatura_max_projection_corto:  { type: "projected", horizon: "corto", scenario: null },
  temperatura_max_projection_mediano:{ type: "projected", horizon: "mediano", scenario: null },
  temperatura_max_projection_largo:  { type: "projected", horizon: "largo", scenario: null },
  temperatura_min_projection:        { type: "projected", horizon: "corto", scenario: null },
  temperatura_min_projection_corto:  { type: "projected", horizon: "corto", scenario: null },
  temperatura_min_projection_mediano:{ type: "projected", horizon: "mediano", scenario: null },
  temperatura_min_projection_largo:  { type: "projected", horizon: "largo", scenario: null },

  // Precipitation projections — HighResMIP ensemble, no SSP scenario (HALLAZGO-8)
  precipitacion_projection:         { type: "projected", horizon: "corto", scenario: null },
  precipitacion_projection_corto:   { type: "projected", horizon: "corto", scenario: null },
  precipitacion_projection_mediano: { type: "projected", horizon: "mediano", scenario: null },
  precipitacion_projection_largo:   { type: "projected", horizon: "largo", scenario: null },

  // Categorical (ENSO) — no horizon, no scenario
  enso_phase_categorical: { type: "categorical", horizon: null, scenario: null },
};

/**
 * H-5.9: Infer phenomenon horizon from the horizons of its contributing signals.
 *
 * Priority order: largo > mediano > corto (most significant horizon wins).
 * If no signals have a horizon (all categorical/static), returns null.
 *
 * @param {string[]} signalNames - names of signals contributing to the phenomenon
 * @returns {"corto" | "mediano" | "largo" | null}
 */
export function inferHorizon(signalNames) {
  const horizons = signalNames
    .map(name => SIGNAL_METADATA[name]?.horizon)
    .filter(h => h != null);

  if (horizons.length === 0) return null;
  if (horizons.includes("largo")) return "largo";
  if (horizons.includes("mediano")) return "mediano";
  return "corto";
}

/**
 * H-5.9: Infer phenomenon status from the types of its contributing signals.
 *
 * Rules:
 * - Any "categorical" or "anomaly" signal → "active" (observed/now)
 * - All "projected" → "projected" (future only)
 * - No known types → "active" (fallback, preserves current behavior)
 *
 * @param {string[]} signalNames - names of signals contributing to the phenomenon
 * @returns {"active" | "projected"}
 */
export function inferStatus(signalNames) {
  const types = signalNames
    .map(name => SIGNAL_METADATA[name]?.type)
    .filter(t => t != null);

  if (types.length === 0) return "active";
  const hasObserved = types.some(t => t === "anomaly" || t === "categorical");
  if (hasObserved) return "active";
  return "projected";
}

/**
 * H-5.11: Infer phenomenon scenario from the scenarios of its contributing signals.
 *
 * Current implementation returns null for all signals because:
 * - Anomaly signals are present observations — no scenario applies.
 * - Projected signals come from Open-Meteo CMIP6 HighResMIP ensemble, which
 *   is a single high-emissions-like pathway with NO SSP scenario selection
 *   parameter (HALLAZGO-8, authoritative-sources.json).
 * - Categorical signals (ENSO) are discrete states — no scenario applies.
 *
 * Stage 6 uses fallback "not_scenario_specific" (stage-06-risk.js:36-37),
 * which is correct and consistent with HALLAZGO-8.
 *
 * If any signal has a non-null scenario in the future (e.g. from a data source
 * that provides SSP labels), this function will return the first non-null
 * scenario found. If signals have conflicting scenarios, the first one wins
 * (no conflict resolution needed today since all are null).
 *
 * Extension path: add scenario to ClimateSignalSchema (types.js), extract SSP
 * labels from sources that provide them (Supabase climate_cells with
 * ensemble-all-sspXXX), and update SIGNAL_METADATA above.
 *
 * @param {string[]} signalNames - names of signals contributing to the phenomenon
 * @returns {string | null}
 */
export function inferScenario(signalNames) {
  for (const name of signalNames) {
    const scenario = SIGNAL_METADATA[name]?.scenario;
    if (scenario != null) return scenario;
  }
  return null;
}
