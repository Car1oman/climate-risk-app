/**
 * Projection Scenario Engine — Sprint 9
 *
 * Pure function module. No I/O, no side effects.
 * Consumes Layer2 signalOutput and generates climate projection context:
 *
 *   FASE A — SSP Scenarios: SSP2-4.5 (intermediate) and SSP5-8.5 (high emissions)
 *   FASE B — Time Windows: 2020–2039 (near), 2040–2059 (mid), 2060–2079 (far)
 *   FASE C — Interpretation: narratives grounded in IPCC AR6 projected values,
 *             ensemble spread, and confidence by scenario × window
 *   FASE D — Validation: no duplicate risks, no source-based risks,
 *             consolidated interpretation, no scores or financial impacts
 *
 * All numbers in generated narratives come exclusively from PROJECTION_DATA.
 * No invented values, no urgency language, no financial impacts.
 *
 * Sources: IPCC AR6 WGI Atlas (región SAM), CMIP6 CCKP, IPCC AR6 WGI
 *          Capítulos 4 (escenarios), 11 (extremos), Tabla SPM.1.
 */

// ─── FASE A — Scenario Definitions ───────────────────────────────────────────

export const SCENARIO_DEFINITIONS = {

  ssp245: {
    id:                  'ssp245',
    label:               'SSP2-4.5',
    name:                'Escenario de emisiones intermedias',
    description:         'Emisiones globales alcanzan su pico a mediados de siglo y luego ' +
                         'declinan. Parcialmente consistente con los compromisos actuales del ' +
                         'Acuerdo de París.',
    warming_2100_range:  '+2.1°C a +3.5°C sobre el período pre-industrial (1850–1900)',
    warming_2100_median: '+2.7°C',
    badge:               'Moderado',
    color_hint:          'amber',
    ipcc_reference:      'IPCC AR6 WGI Tabla SPM.1 / Capítulo 4 — SSP2-4.5',
  },

  ssp585: {
    id:                  'ssp585',
    label:               'SSP5-8.5',
    name:                'Escenario de altas emisiones',
    description:         'Desarrollo intensivo en combustibles fósiles. Sin acción climática ' +
                         'significativa a mediados de siglo. Cota superior del rango de ' +
                         'escenarios del IPCC AR6.',
    warming_2100_range:  '+3.3°C a +5.7°C sobre el período pre-industrial (1850–1900)',
    warming_2100_median: '+4.4°C',
    badge:               'Alto',
    color_hint:          'red',
    ipcc_reference:      'IPCC AR6 WGI Tabla SPM.1 / Capítulo 4 — SSP5-8.5',
  },
};

// ─── FASE B — Time Windows ────────────────────────────────────────────────────

export const TIME_WINDOWS = {

  near_term: {
    id:          'near_term',
    label:       '2020–2039',
    description: 'Término cercano (IPCC AR6 — near-term: 2021–2040)',
    years:       [2020, 2039],
    horizon_key: 'short_term',
  },

  mid_term: {
    id:          'mid_term',
    label:       '2040–2059',
    description: 'Término medio (IPCC AR6 — mid-term: 2041–2060)',
    years:       [2040, 2059],
    horizon_key: 'mid_term',
  },

  far_term: {
    id:          'far_term',
    label:       '2060–2079',
    description: 'Término lejano (IPCC AR6 — long-term extrapolado a 2060–2079). NOTA: datos IPCC de referencia regional, NO específicos del pipeline site-level de climate_cells. Usar con cautela para decisiones locales.',
    years:       [2060, 2079],
    horizon_key: 'long_term',
    source_note: 'IPCC reference (not site-specific) — usar solo como contexto, no como input directo a Layer2',
  },
};

// ─── FASE B — Projection Data Matrix ─────────────────────────────────────────
// Proyecciones regionales para Perú (región andina + costa occidental).
// Baseline: 1981–2014 (convención CMIP6 CCKP).
// Fuente: IPCC AR6 WGI Atlas — región SAM + Capítulos 4 y 11.

export const PROJECTION_DATA = {

  temperature_mean: {
    label:     'Temperatura media (anomalía)',
    unit:      '°C respecto a 1981–2014',
    variable:  'tas',
    source:    'IPCC AR6 WGI Atlas — Región SAM / Ensamble CMIP6',
    reference: 'IPCC (2021). Climate Change 2021: The Physical Science Basis. WGI Atlas.',
    ssp245: {
      near_term: { median: 1.0, p10: 0.7, p90: 1.3, confidence: 'high',   n_models: 35 },
      mid_term:  { median: 1.4, p10: 1.1, p90: 1.8, confidence: 'high',   n_models: 35 },
      far_term:  { median: 1.8, p10: 1.4, p90: 2.3, confidence: 'high',   n_models: 35 },
    },
    ssp585: {
      near_term: { median: 1.1, p10: 0.8, p90: 1.5, confidence: 'high',   n_models: 35 },
      mid_term:  { median: 2.0, p10: 1.5, p90: 2.6, confidence: 'high',   n_models: 35 },
      far_term:  { median: 3.2, p10: 2.4, p90: 4.0, confidence: 'high',   n_models: 35 },
    },
  },

  extreme_heat_days: {
    label:     'Días calurosos (Tmax > 35°C)',
    unit:      'días/año (cambio vs baseline)',
    variable:  'hd35',
    source:    'IPCC AR6 WGI Capítulo 11 / CMIP6 CCKP — hd35',
    reference: 'IPCC AR6 WGI (2021). Chapter 11: Weather and Climate Extreme Events. Table 11.1.',
    ssp245: {
      near_term: { median:  8, p10:  3, p90: 16, confidence: 'medium', n_models: 32 },
      mid_term:  { median: 17, p10:  8, p90: 28, confidence: 'medium', n_models: 32 },
      far_term:  { median: 26, p10: 11, p90: 42, confidence: 'medium', n_models: 32 },
    },
    ssp585: {
      near_term: { median: 10, p10:  4, p90: 20, confidence: 'medium', n_models: 32 },
      mid_term:  { median: 28, p10: 14, p90: 46, confidence: 'medium', n_models: 32 },
      far_term:  { median: 55, p10: 29, p90: 85, confidence: 'medium', n_models: 32 },
    },
  },

  precipitation_change: {
    label:     'Precipitación media (cambio porcentual)',
    unit:      '% respecto a 1981–2014',
    variable:  'prpercnt',
    source:    'IPCC AR6 WGI Atlas — Región SAM / Ensamble CMIP6',
    reference: 'IPCC AR6 WGI (2021). Atlas. South America (SAM). Figure Atlas.27.',
    note:      'Señal divergente entre modelos en la región andina. Confianza baja por alta dispersión del ensamble.',
    ssp245: {
      near_term: { median: -2, p10:  -8, p90:  5, confidence: 'low', n_models: 35 },
      mid_term:  { median: -3, p10: -10, p90:  6, confidence: 'low', n_models: 35 },
      far_term:  { median: -4, p10: -13, p90:  7, confidence: 'low', n_models: 35 },
    },
    ssp585: {
      near_term: { median: -3, p10: -10, p90:  6, confidence: 'low', n_models: 35 },
      mid_term:  { median: -5, p10: -14, p90:  8, confidence: 'low', n_models: 35 },
      far_term:  { median: -8, p10: -20, p90: 10, confidence: 'low', n_models: 35 },
    },
  },

  extreme_precipitation: {
    label:     'Precipitación extrema (Rx5day)',
    unit:      '% (cambio vs baseline)',
    variable:  'rx5day',
    source:    'IPCC AR6 WGI Capítulo 11 / CMIP6 CCKP — Rx5day',
    reference: 'IPCC AR6 WGI (2021). Chapter 11: Weather and Climate Extreme Events. Box 11.1.',
    ssp245: {
      near_term: { median:  3, p10: -2, p90:  9, confidence: 'medium', n_models: 30 },
      mid_term:  { median:  5, p10: -3, p90: 13, confidence: 'medium', n_models: 30 },
      far_term:  { median:  8, p10: -2, p90: 18, confidence: 'medium', n_models: 30 },
    },
    ssp585: {
      near_term: { median:  4, p10: -2, p90: 12, confidence: 'medium', n_models: 30 },
      mid_term:  { median:  8, p10:  0, p90: 19, confidence: 'medium', n_models: 30 },
      far_term:  { median: 14, p10:  2, p90: 28, confidence: 'medium', n_models: 30 },
    },
  },
};

// ─── FASE C — Narrative Helpers ───────────────────────────────────────────────

const SCENARIO_DESC = {
  ssp245: 'escenario de emisiones intermedias SSP2-4.5',
  ssp585: 'escenario de altas emisiones SSP5-8.5',
};

const CONFIDENCE_ES = {
  high:   'alta confianza',
  medium: 'confianza media',
  low:    'baja confianza',
};

function signStr(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

// Temperature values require one decimal place for scientific precision (1.0 → "+1.0", not "+1")
function signTemp(value) {
  const f = value.toFixed(1);
  return value >= 0 ? `+${f}` : f;
}

function buildScenarioNarrative(scenario, window) {
  const temp   = PROJECTION_DATA.temperature_mean[scenario][window];
  const heat   = PROJECTION_DATA.extreme_heat_days[scenario][window];
  const precip = PROJECTION_DATA.precipitation_change[scenario][window];
  const extP   = PROJECTION_DATA.extreme_precipitation[scenario][window];
  const win    = TIME_WINDOWS[window];
  const scen   = SCENARIO_DEFINITIONS[scenario];

  const text =
    `Bajo el ${SCENARIO_DESC[scenario]}, el período ${win.label} proyecta en esta región ` +
    `una anomalía de temperatura media de ${signTemp(temp.median)}°C respecto al período de ` +
    `referencia 1981–2014 (rango del ensamble CMIP6: ${signTemp(temp.p10)}°C a ` +
    `${signTemp(temp.p90)}°C; ${CONFIDENCE_ES[temp.confidence]}, ${temp.n_models} modelos). ` +
    `Los días con Tmax > 35°C se incrementarían en ${signStr(heat.median)} días/año de mediana ` +
    `(rango: ${signStr(heat.p10)} a ${signStr(heat.p90)} días/año; ${CONFIDENCE_ES[heat.confidence]}). ` +
    `La precipitación media presenta un cambio de ${signStr(precip.median)}% ` +
    `(rango: ${signStr(precip.p10)}% a ${signStr(precip.p90)}%; ${CONFIDENCE_ES[precip.confidence]} ` +
    `por divergencia entre modelos en la región andina). ` +
    `La precipitación extrema en 5 días consecutivos (Rx5day) proyecta un cambio de ` +
    `${signStr(extP.median)}% (rango: ${signStr(extP.p10)}% a ${signStr(extP.p90)}%; ` +
    `${CONFIDENCE_ES[extP.confidence]}).`;

  return {
    scenario,
    window,
    scenario_label:  scen.label,
    window_label:    win.label,
    text,
    variables_cited: ['temperature_mean', 'extreme_heat_days', 'precipitation_change', 'extreme_precipitation'],
    data_basis: {
      temperature_mean:      temp,
      extreme_heat_days:     heat,
      precipitation_change:  precip,
      extreme_precipitation: extP,
    },
  };
}

// ─── FASE C — Main Engine Function ────────────────────────────────────────────

const PROJECTION_SIGNAL_TYPES = new Set([
  'extreme_heat', 'severe_heat', 'tropical_nights', 'temp_increase',
  'extreme_rain', 'flood_risk', 'drought',
]);

/**
 * Builds the full projection context for a given signalOutput.
 * Returns scenario definitions, time windows, projections matrix (all 2×3 combinations),
 * 6 grounded narratives, uncertainty summary, and validation invariants.
 *
 * @param {Object} signalOutput  - Layer2 signal output (signals array)
 * @param {Object} [options]     - Reserved for future use
 * @returns {Object}             - Full projection context
 */
export function buildProjectionContext(signalOutput = {}, options = {}) {
  const signals = signalOutput?.signals ?? [];
  const activeSignalCount = signals.filter(s => PROJECTION_SIGNAL_TYPES.has(s.signalType)).length;

  // Build projections matrix: all scenario × window × variable combinations
  const projections = {};
  for (const scenario of Object.keys(SCENARIO_DEFINITIONS)) {
    projections[scenario] = {};
    for (const window of Object.keys(TIME_WINDOWS)) {
      projections[scenario][window] = {};
      for (const [variable, varData] of Object.entries(PROJECTION_DATA)) {
        projections[scenario][window][variable] = {
          label:    varData.label,
          unit:     varData.unit,
          variable: varData.variable,
          ...varData[scenario][window],
        };
      }
    }
  }

  // Build all 6 narratives (2 scenarios × 3 windows)
  const narratives = [];
  for (const scenario of Object.keys(SCENARIO_DEFINITIONS)) {
    for (const window of Object.keys(TIME_WINDOWS)) {
      narratives.push(buildScenarioNarrative(scenario, window));
    }
  }

  const output = {
    scenarios:           SCENARIO_DEFINITIONS,
    time_windows:        TIME_WINDOWS,
    projections,
    narratives,
    active_signal_count: activeSignalCount,
    uncertainty: {
      overall_confidence:       'medium',
      temperature_confidence:   'high',
      precipitation_confidence: 'low',
      notes:
        'Temperatura: alta confianza en todos los escenarios y ventanas ' +
        '(señal robusta en el ensamble CMIP6, 35 modelos). ' +
        'Precipitación: baja confianza — los modelos CMIP6 muestran señal divergente ' +
        'para la región andina peruana, con rangos amplios que incluyen incrementos y decrementos.',
    },
    generated_at: new Date().toISOString(),
  };

  output.validation = validateProjection(output);
  return output;
}

// ─── FASE D — Lookup Helper ───────────────────────────────────────────────────

/**
 * Returns the projection entry for a given variable, scenario, and time window.
 * Returns null if any key is invalid.
 *
 * @param {string} variable  - One of the PROJECTION_DATA keys
 * @param {string} scenario  - 'ssp245' | 'ssp585'
 * @param {string} window    - 'near_term' | 'mid_term' | 'far_term'
 * @returns {Object|null}
 */
export function getProjectionForVariable(variable, scenario, window) {
  return PROJECTION_DATA[variable]?.[scenario]?.[window] ?? null;
}

// ─── FASE D — Validation ──────────────────────────────────────────────────────

const URGENCY_PATTERNS = [
  /\burgente\b/i,
  /\burgencia\b/i,
  /\binmediata acción\b/i,
  /\bdebe tomar acción\b/i,
  /\bpeligro inminente\b/i,
  /\bcatastrófico\b/i,
  /\bemergencia climática\b/i,
];

const FINANCIAL_PATTERNS = [
  /\bpérdidas económicas\b/i,
  /\bcosto estimado\b/i,
  /\bdólares\b/i,
  /\bUSD\b/,
  /\bimpacto financiero\b/i,
  /\bmillones\b/i,
];

/**
 * Validates that the projection output satisfies all platform invariants:
 *   - No risk scores or urgency rankings
 *   - No urgency-mandating language
 *   - No financial impact figures
 *   - No duplicate risk descriptions within a single narrative
 *
 * @param {Object} output  - buildProjectionContext output (or partial)
 * @returns {Object}       - validation flags + validation_passed boolean
 */
export function validateProjection(output) {
  const narrativeTexts = (output.narratives ?? []).map(n => n.text ?? '');
  const allText = narrativeTexts.join(' ');

  const has_urgency          = URGENCY_PATTERNS.some(re => re.test(allText));
  const has_financial_impacts = FINANCIAL_PATTERNS.some(re => re.test(allText));

  // Score check: top-level output must not contain score/ranking fields
  const topLevelKeys = Object.keys(output);
  const has_scores   = topLevelKeys.some(k => /score|urgency_rank|ranking/i.test(k));

  // Duplicate risk check: exact scientific phrases must not repeat within a single narrative
  const has_duplicate_risks = narrativeTexts.some(text => {
    const rx5dayCount  = (text.match(/Rx5day/g) ?? []).length;
    const tmax35Count  = (text.match(/Tmax > 35°C/g) ?? []).length;
    return rx5dayCount > 1 || tmax35Count > 1;
  });

  const validation_passed =
    !has_scores && !has_urgency && !has_financial_impacts && !has_duplicate_risks;

  return { has_scores, has_urgency, has_financial_impacts, has_duplicate_risks, validation_passed };
}
