/**
 * Deterministic validation scenarios for regression baseline testing.
 *
 * Each scenario contains:
 *  - fusedData: synthetic Layer1 output with realistic CMIP6-derived values
 *  - businessRisks: synthetic Layer3 output (used for Layer4 tests)
 *  - expected: frozen expected outputs (signals, scores, metadata)
 *
 * Values are based on published CMIP6 projections for each location under the
 * specified SSP scenario. They represent plausible mid-range ensemble values,
 * not actual Supabase cell data. Exact numeric agreement with production
 * depends only on these inputs — no external state is consulted.
 *
 * WHY THESE SCENARIOS:
 *  - Lima / Retail / SSP585: coastal heat stress, high-emissions worst case
 *  - Ica / Healthcare / SSP245: desert drought, moderate-emissions
 *  - Cusco / Logistics / SSP585: Andean precipitation shift, terrain signals
 */

// ─── SCENARIO 1: Lima / Retail / SSP585 ─────────────────────────────────────

export const LIMA_RETAIL_SSP585 = {
  label: 'Lima / Retail / SSP585',
  description: 'Lima coastal location under high-emissions scenario. ' +
    'Extreme heat signals expected from significant hd35 and tr deltas. ' +
    'SSP5-8.5 worst-case projection for 2020–2059.',

  fusedData: {
    climateSource: 'climate_cells',
    scenario: 'ssp585',
    location: { city: 'Lima', lat: -12.046, lon: -77.043 },
    climateData: {
      historical: {
        hd35: 18, hd40: 2, tr: 95, cdd: 180, pr: 12.5, prpercnt: null,
        rx5day: 8.2, rx1day: 4.5, tas: 19.2,
      },
      short_term: {
        hd35: 42,      // delta=+24 → extreme_heat short (threshold 10)
        hd40: 10,      // delta=+8  → severe_heat short (threshold 5)
        tr: 118,       // delta=+23 → tropical_nights short (threshold 10)
        cdd: 195,      // delta=+15 — exactly at threshold, NOT > 15 → no drought
        prpercnt: 86,  // -14% — NOT < -15% → no drought
        pr: null, rx5day: 10.2, rx1day: 4.8, tas: 21.1, // +1.9°C → temp_increase short
      },
      mid_term: {
        hd35: 58,      // delta=+40 → extreme_heat mid (threshold 20)
        hd40: 18,      // delta=+16 → severe_heat mid (threshold 5)
        tr: 138,       // delta=+43 → tropical_nights mid (threshold 20)
        cdd: 215,      // delta=+35 → drought cdd mid (threshold 15)
        prpercnt: 76,  // -24% → drought prpercnt mid (threshold -15)
        pr: null, rx5day: 12.5, rx1day: 7.2, tas: 23.9, // +4.7°C → temp_increase mid
      },
    },
    griData: {
      hazards: [{
        hazard: 'flood',
        baseline:              { score: 'medio', value_decimal: 0.40 },
        future_high_emissions: { score: 'alto',  value_decimal: 0.55 },
      }],
    },
    meteoData: null,
    ensoData: null,
    terrainData: null,
  },

  // Synthetic Layer3 output for the dominant extreme_heat signal
  businessRisks: {
    risks: [{
      signal: {
        signalType: 'extreme_heat', indicator: 'hd35', confidence: 'high',
        horizon: 'short_term', projected: 42, historical: 18,
        delta: 24, delta_pct: 133.33,
      },
      exposure_level:   'alto',
      sensitivity_level: 'medio',
      operational_impacts:    ['↑ consumo energético refrigeración', 'Riesgo productos perecederos'],
      financial_impact_range: { min_usd: 85_000, max_usd: 210_000 },
    }],
  },

  expected: {
    // Layer2 outputs
    signals_count:   13,  // 2 extreme_heat + 2 severe_heat + 2 tropical_nights + 2 drought(mid) + 2 extreme_rain + 2 temp_increase + 1 flood_risk
    dominant_signal: 'tropical_nights',  // tr mid delta=43 is largest absolute delta
    enso_phase:      null,
    terrain_region:  null,

    // Signal types that MUST be present
    required_signal_types: [
      'extreme_heat',    // short + mid
      'severe_heat',     // short + mid
      'tropical_nights', // short + mid
      'drought',         // mid only (cdd + prpercnt)
      'extreme_rain',    // short + mid (rx5day)
      'temp_increase',   // short + mid
      'flood_risk',      // GRI > 0.35
    ],

    // Signal types that must NOT be present
    absent_signal_types: ['enso_phase', 'landslide_risk', 'huayco_risk'],

    // Layer4 composite score for extreme_heat short_term retail
    // probability=0.80 (high), intensity=min(1,133.33/60)=1.0
    // exposure=1.0(alto), sensitivity=0.5(medio), horizon=1.0(short)
    // R = 0.80×0.30 + 1.0×0.25 + 1.0×0.25 + 0.5×0.10 + 1.0×0.10 = 0.890
    composite_score: 0.890,
    urgency:         'crítica',

    // Traceability expectations
    traceability: {
      scenario_ssp:          'SSP585',
      climate_model_badge:   'CMIP6 ensemble',
      flood_risk_endpoint:   'GRI Infrastructure Resilience via getGriRiskByLocation()',
    },
  },
};

// ─── SCENARIO 2: Ica / Healthcare / SSP245 ───────────────────────────────────

export const ICA_HEALTHCARE_SSP245 = {
  label: 'Ica / Healthcare / SSP245',
  description: 'Ica desert location under moderate-emissions scenario. ' +
    'Drought and heat signals dominate. SSP2-4.5 moderate projection. ' +
    'Healthcare sector — extreme drought sensitivity for water supply.',

  fusedData: {
    climateSource: 'climate_cells',
    scenario: 'ssp245',
    location: { city: 'Ica', lat: -14.067, lon: -75.728 },
    climateData: {
      historical: {
        hd35: 28, hd40: 5, tr: 48, cdd: 320, pr: 3.5, prpercnt: null,
        rx5day: 4.2, rx1day: 2.8, tas: 21.5,
      },
      short_term: {
        hd35: 38,     // delta=+10 — exactly at threshold, NOT > 10 → no extreme_heat
        hd40: 8,      // delta=+3 — NOT > 5 → no severe_heat
        tr: 62,       // delta=+14 → tropical_nights short (threshold 10)
        cdd: 345,     // delta=+25 → drought cdd short (threshold 15)
        prpercnt: 83, // -17% → drought prpercnt short (threshold -15)
        pr: null, rx5day: 4.8, rx1day: 3.2, tas: 22.8,  // +1.3°C — NOT > 1.5 → no temp_increase
      },
      mid_term: {
        hd35: 46,     // delta=+18 — NOT > 20 → no extreme_heat mid (SSP245 stays below)
        hd40: 11,     // delta=+6 → severe_heat mid (threshold 5)
        tr: 75,       // delta=+27 → tropical_nights mid (threshold 20)
        cdd: 365,     // delta=+45 → drought cdd mid (threshold 15)
        prpercnt: 71, // -29% → drought prpercnt mid (threshold -15)
        pr: null, rx5day: 5.8, rx1day: 4.5, tas: 24.1,  // +2.6°C → temp_increase mid
      },
    },
    griData: {
      hazards: [{
        hazard: 'drought',
        baseline:              { score: 'alto',  value_decimal: 0.85 },
        future_high_emissions: { score: 'alto',  value_decimal: 0.90 },
      }],
    },
    meteoData: null,
    ensoData: null,
    terrainData: null,
  },

  businessRisks: {
    risks: [{
      signal: {
        signalType: 'drought', indicator: 'cdd', confidence: 'high',
        horizon: 'mid_term', projected: 365, historical: 320,
        delta: 45, delta_pct: 14.06,
      },
      exposure_level:    'alto',
      sensitivity_level: 'alto',
      operational_impacts:    ['Riesgo esterilización y limpieza clínica', 'Presión sobre suministro de agua potable'],
      financial_impact_range: { min_usd: 50_000, max_usd: 200_000 },
    }],
  },

  expected: {
    // Layer2 outputs
    signals_count:   9,
    // cdd mid delta=45 is largest absolute delta
    dominant_signal: 'drought',
    enso_phase:      null,
    terrain_region:  null,

    required_signal_types: [
      'tropical_nights', // short + mid
      'drought',         // short (cdd + prpercnt) + mid (cdd + prpercnt)
      'severe_heat',     // mid only
      'extreme_rain',    // mid only (rx5day)
      'temp_increase',   // mid only
    ],

    absent_signal_types: [
      'extreme_heat',   // delta=10 (short) and delta=18 (mid) — both below thresholds
      'flood_risk',     // no flood in griData and no quantitative flood signal
      'enso_phase', 'landslide_risk', 'huayco_risk',
    ],

    // Layer4: drought cdd mid_term healthcare
    // confidence='high' → prob=0.80
    // drought: useValue=|delta|=45, maxRef=45 → intensity=1.0
    // exposure=1.0(alto), sensitivity=1.0(alto), horizon=0.75(mid_term)
    // R = 0.80×0.30 + 1.0×0.25 + 1.0×0.25 + 1.0×0.10 + 0.75×0.10
    // R = 0.240 + 0.250 + 0.250 + 0.100 + 0.075 = 0.915
    composite_score: 0.915,
    urgency:         'crítica',

    traceability: {
      scenario_ssp:        'SSP245',
      climate_model_badge: 'CMIP6 ensemble',
    },
  },
};

// ─── SCENARIO 3: Cusco / Logistics / SSP585 ──────────────────────────────────

export const CUSCO_LOGISTICS_SSP585 = {
  label: 'Cusco / Logistics / SSP585',
  description: 'Cusco Andean highland under high-emissions scenario. ' +
    'Precipitation shift (less annual rainfall, more intense events), ' +
    'temperature increase, active El Niño phase, and high terrain risk. ' +
    'Logistics sector — supply chain interruption from extreme rain.',

  fusedData: {
    climateSource: 'climate_cells',
    scenario: 'ssp585',
    location: { city: 'Cusco', lat: -13.517, lon: -71.978 },
    climateData: {
      historical: {
        hd35: 0, hd40: 0, tr: 2, cdd: 95, pr: 450,
        rx5day: 52.3, rx1day: 32.0, tas: 12.4,
      },
      short_term: {
        hd35: 1,      // delta=+1 → NOT > 10 → no extreme_heat
        hd40: 0,      // no severe_heat
        tr: 5,        // delta=+3 → NOT > 10 → no tropical_nights
        cdd: 128,     // delta=+33 → drought cdd short
        prpercnt: 84, // -16% → drought prpercnt short
        pr: null,
        rx5day: 65.5, // delta_pct=+25.2% → extreme_rain short
        rx1day: 40.2, // < 50mm → no rx1day signal
        tas: 14.2,    // +1.8°C → temp_increase short
      },
      mid_term: {
        hd35: 3,      // delta=+3 → NOT > 20 → no extreme_heat mid
        hd40: 0,      // no severe_heat
        tr: 9,        // delta=+7 → NOT > 20 → no tropical_nights mid
        cdd: 165,     // delta=+70 → drought cdd mid
        prpercnt: 71, // -29% → drought prpercnt mid
        pr: null,
        rx5day: 82.4, // delta_pct=+57.6% → extreme_rain mid
        rx1day: 55.8, // > 50mm → extreme_rain mid (rx1day)
        tas: 16.3,    // +3.9°C → temp_increase mid
      },
    },
    griData: { hazards: [] },
    meteoData: null,
    ensoData: { phase: 'El Niño', oni_latest: 1.8 },
    terrainData: {
      exceeds_landslide_threshold: true,
      slope_degrees: 28.5,
      susceptibility: 'alta',
      terrain_region: 'Andes Sur',
      landslide_score: 0.78,
      huayco_risk: 'alto',
      elevation_m: 3400,
    },
  },

  businessRisks: {
    risks: [{
      signal: {
        signalType: 'drought', indicator: 'cdd', confidence: 'high',
        horizon: 'mid_term', projected: 165, historical: 95,
        delta: 70, delta_pct: 73.68,
      },
      exposure_level:    'alto',
      sensitivity_level: 'alto',
      operational_impacts:    ['Interrupción logística', 'Restricción hídrica operativa'],
      financial_impact_range: { min_usd: 30_000, max_usd: 100_000 },
    }],
  },

  expected: {
    // Layer2: 12 total signals
    // (4 drought: short cdd, short prpercnt, mid cdd, mid prpercnt)
    // (3 extreme_rain: short rx5day, mid rx5day, mid rx1day)
    // (2 temp_increase: short, mid)
    // + enso_phase + landslide_risk + huayco_risk
    signals_count:   12,
    dominant_signal: 'drought',   // cdd mid delta=70 is largest among scorable signals
    enso_phase:      'El Niño',
    terrain_region:  'Andes Sur',

    required_signal_types: [
      'drought',       // short (cdd + prpercnt) + mid (cdd + prpercnt)
      'extreme_rain',  // short (rx5day) + mid (rx5day) + mid (rx1day)
      'temp_increase', // short + mid
      'enso_phase',
      'landslide_risk',
      'huayco_risk',
    ],

    absent_signal_types: [
      'extreme_heat',   // Cusco altitude keeps hd35 deltas tiny
      'severe_heat',
      'tropical_nights', // too cold at altitude
      'flood_risk',      // griData has empty hazards
    ],

    // Layer4: drought cdd mid_term logistics
    // confidence='high' → prob=0.80
    // drought: delta=70, delta_pct=73.68 → useValue=|delta|=70 (drought uses absolute)
    //          maxRef=45 → intensity=min(1, 70/45)=1.0 (capped)
    // exposure=1.0(alto), sensitivity=1.0(alto), horizon=0.75(mid_term)
    // R = 0.80×0.30 + 1.0×0.25 + 1.0×0.25 + 1.0×0.10 + 0.75×0.10
    // R = 0.240 + 0.250 + 0.250 + 0.100 + 0.075 = 0.915
    composite_score: 0.915,
    urgency:         'crítica',

    traceability: {
      scenario_ssp:          'SSP585',
      climate_model_badge:   'CMIP6 ensemble',
      enso_source_origin:    'NOAA CPC',
      terrain_source_origin: 'SRTM terrain + INGEMMET/SENAMHI thresholds',
    },
  },
};

export const ALL_SCENARIOS = [LIMA_RETAIL_SSP585, ICA_HEALTHCARE_SSP245, CUSCO_LOGISTICS_SSP585];
