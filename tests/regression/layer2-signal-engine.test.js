/**
 * Regression tests — Layer2_SignalEngine
 *
 * Validates IPCC AR6 thresholds, signal detection logic, dominant signal
 * selection, and source_traceability structure.
 *
 * All inputs are deterministic synthetic objects. No DB or network calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignals } from '../../server/layers/Layer2_SignalEngine.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFused({ historical = {}, short_term = {}, mid_term = {}, griData = null,
  meteoData = null, ensoData = null, terrainData = null, scenario = 'ssp585' } = {}) {
  return {
    climateSource: 'climate_cells',
    scenario,
    climateData: { historical, short_term, mid_term },
    griData,
    meteoData,
    ensoData,
    terrainData,
  };
}

function makeGriFlood(baseProb, futureProb) {
  return {
    hazards: [{
      hazard: 'flood',
      baseline:               { score: 'medio', value_decimal: baseProb },
      future_high_emissions:  { score: 'alto',  value_decimal: futureProb },
    }],
  };
}

// ─── IPCC Threshold constants (must mirror Layer2 source) ───────────────────

const THRESHOLDS = {
  EXTREME_HEAT_SHORT:     10,
  EXTREME_HEAT_MID:       20,
  SEVERE_HEAT:             5,
  TROPICAL_NIGHTS_SHORT:  10,
  TROPICAL_NIGHTS_MID:    20,
  DROUGHT_CDD:            15,
  DROUGHT_PR_PCT:        -15,
  EXTREME_RAIN_RX5DAY_PCT: 20,
  EXTREME_RAIN_RX1DAY_MM:  50,
  TEMP_INCREASE_SHORT:   1.5,
  TEMP_INCREASE_MID:     2.5,
  FLOOD_RISK_PROB:       0.35,
};

// ─── IPCC Threshold boundary tests ──────────────────────────────────────────

describe('IPCC thresholds — extreme_heat (hd35)', () => {
  it('generates short_term signal when delta > 10 days', () => {
    const fused = makeFused({ historical: { hd35: 20 }, short_term: { hd35: 35 } });
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_heat' && x.horizon === 'short_term');
    assert.equal(s.length, 1);
    assert.equal(s[0].delta, 15);
    assert.equal(s[0].exceeds_threshold, true);
  });

  it('does NOT generate short_term signal when delta == threshold (not strictly greater)', () => {
    const fused = makeFused({ historical: { hd35: 20 }, short_term: { hd35: 30 } }); // delta=10
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_heat' && x.horizon === 'short_term');
    assert.equal(s.length, 0);
  });

  it('does NOT generate short_term signal when delta < 10 days', () => {
    const fused = makeFused({ historical: { hd35: 20 }, short_term: { hd35: 28 } }); // delta=8
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_heat' && x.horizon === 'short_term');
    assert.equal(s.length, 0);
  });

  it('generates mid_term signal when delta > 20 days', () => {
    const fused = makeFused({ historical: { hd35: 20 }, mid_term: { hd35: 45 } }); // delta=25
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_heat' && x.horizon === 'mid_term');
    assert.equal(s.length, 1);
  });

  it('does NOT generate mid_term signal when delta == 20 (not strictly greater)', () => {
    const fused = makeFused({ historical: { hd35: 20 }, mid_term: { hd35: 40 } }); // delta=20
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_heat' && x.horizon === 'mid_term');
    assert.equal(s.length, 0);
  });
});

describe('IPCC thresholds — severe_heat (hd40)', () => {
  it('generates signal when delta > 5 days (both horizons)', () => {
    const fused = makeFused({
      historical:  { hd40: 2 },
      short_term:  { hd40: 9 },  // delta=7
      mid_term:    { hd40: 18 }, // delta=16
    });
    const { signals } = detectSignals(fused);
    const short = signals.find(x => x.signalType === 'severe_heat' && x.horizon === 'short_term');
    const mid   = signals.find(x => x.signalType === 'severe_heat' && x.horizon === 'mid_term');
    assert.ok(short, 'short_term severe_heat expected');
    assert.ok(mid,   'mid_term severe_heat expected');
    assert.equal(short.delta, 7);
    assert.equal(mid.delta, 16);
  });

  it('does NOT generate signal when delta <= 5 days', () => {
    const fused = makeFused({ historical: { hd40: 2 }, short_term: { hd40: 7 } }); // delta=5
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'severe_heat');
    assert.equal(s.length, 0);
  });
});

describe('IPCC thresholds — tropical_nights (tr)', () => {
  it('generates short_term signal when delta > 10 nights', () => {
    const fused = makeFused({ historical: { tr: 60 }, short_term: { tr: 75 } }); // delta=15
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'tropical_nights' && x.horizon === 'short_term');
    assert.ok(s);
    assert.equal(s.delta, 15);
    assert.equal(s.threshold_reference, `IPCC AR6 WG1 Ch.11.3 / WMO — noches tropicales: +10 días Tmin>20°C`);
  });

  it('does NOT generate short_term signal when delta == 10', () => {
    const fused = makeFused({ historical: { tr: 60 }, short_term: { tr: 70 } }); // delta=10
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'tropical_nights' && x.horizon === 'short_term');
    assert.equal(s.length, 0);
  });

  it('generates mid_term signal when delta > 20 nights', () => {
    const fused = makeFused({ historical: { tr: 60 }, mid_term: { tr: 85 } }); // delta=25
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'tropical_nights' && x.horizon === 'mid_term');
    assert.ok(s);
    assert.equal(s.delta, 25);
  });

  it('does NOT generate mid_term signal when delta == 20', () => {
    const fused = makeFused({ historical: { tr: 60 }, mid_term: { tr: 80 } }); // delta=20
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'tropical_nights' && x.horizon === 'mid_term');
    assert.equal(s.length, 0);
  });
});

describe('IPCC thresholds — drought (CDD)', () => {
  it('generates signal when CDD delta > 15 days', () => {
    const fused = makeFused({ historical: { cdd: 100 }, short_term: { cdd: 120 } }); // delta=20
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'drought' && x.indicator === 'cdd');
    assert.ok(s);
    assert.equal(s.delta, 20);
  });

  it('does NOT generate signal when CDD delta == 15', () => {
    const fused = makeFused({ historical: { cdd: 100 }, short_term: { cdd: 115 } }); // delta=15
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'drought' && x.indicator === 'cdd');
    assert.equal(s.length, 0);
  });

  it('does NOT generate signal when CDD delta < 15', () => {
    const fused = makeFused({ historical: { cdd: 100 }, short_term: { cdd: 112 } }); // delta=12
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'drought' && x.indicator === 'cdd');
    assert.equal(s.length, 0);
  });
});

describe('IPCC thresholds — drought (prpercnt)', () => {
  it('generates signal when prpercnt reduction > 15% (prpercnt < 85)', () => {
    // prpercnt = 80 → pctChange = -20 < -15 → signal
    const fused = makeFused({ short_term: { prpercnt: 80 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'drought' && x.indicator === 'prpercnt');
    assert.ok(s);
    assert.equal(s.delta_pct, -20);
    assert.equal(s.historical, 100);
    assert.equal(s.projected, 80);
  });

  it('does NOT generate signal when prpercnt == 85 (exactly at boundary)', () => {
    // prpercnt = 85 → pctChange = -15. -15 < -15 is FALSE
    const fused = makeFused({ short_term: { prpercnt: 85 } });
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'drought' && x.indicator === 'prpercnt');
    assert.equal(s.length, 0);
  });

  it('does NOT generate signal when prpercnt > 85', () => {
    const fused = makeFused({ short_term: { prpercnt: 90 } }); // pctChange = -10
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'drought' && x.indicator === 'prpercnt');
    assert.equal(s.length, 0);
  });

  it('drought prpercnt signal has null delta (uses delta_pct only)', () => {
    const fused = makeFused({ short_term: { prpercnt: 75 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.indicator === 'prpercnt');
    assert.ok(s);
    assert.equal(s.delta, null);
    assert.ok(s.delta_pct < 0);
  });
});

describe('IPCC thresholds — drought (pr absolute fallback)', () => {
  it('uses pr fallback only when prpercnt is absent', () => {
    // No prpercnt provided → fallback to pr
    const fused = makeFused({
      historical:  { pr: 100 },
      short_term:  { pr: 82 },  // -18% < -15%
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'drought' && x.indicator === 'pr');
    assert.ok(s, 'pr fallback drought signal expected');
  });

  it('does NOT use pr fallback when prpercnt is present', () => {
    const fused = makeFused({
      historical:  { pr: 100 },
      short_term:  { pr: 82, prpercnt: 91 },  // prpercnt present → fallback skipped
    });
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'drought' && x.indicator === 'pr');
    assert.equal(s.length, 0);
  });
});

describe('IPCC thresholds — extreme_rain (rx5day)', () => {
  it('generates signal when rx5day increases > 20%', () => {
    const fused = makeFused({ historical: { rx5day: 50 }, short_term: { rx5day: 62 } }); // +24%
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_rain' && x.indicator === 'rx5day');
    assert.ok(s);
    assert.ok(s.delta_pct > 20);
  });

  it('does NOT generate signal when rx5day increases == 20%', () => {
    const fused = makeFused({ historical: { rx5day: 50 }, short_term: { rx5day: 60 } }); // +20%
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_rain' && x.indicator === 'rx5day');
    assert.equal(s.length, 0);
  });

  it('does NOT generate signal when rx5day increases < 20%', () => {
    const fused = makeFused({ historical: { rx5day: 50 }, short_term: { rx5day: 58 } }); // +16%
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_rain' && x.indicator === 'rx5day');
    assert.equal(s.length, 0);
  });
});

describe('WMO threshold — extreme_rain (rx1day)', () => {
  it('generates signal when rx1day > 50 mm', () => {
    const fused = makeFused({ short_term: { rx1day: 55 } }); // > 50mm
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_rain' && x.indicator === 'rx1day');
    assert.ok(s);
    assert.equal(s.projected, 55);
  });

  it('does NOT generate signal when rx1day == 50 mm', () => {
    const fused = makeFused({ short_term: { rx1day: 50 } });
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_rain' && x.indicator === 'rx1day');
    assert.equal(s.length, 0);
  });

  it('does NOT generate signal when rx1day < 50 mm', () => {
    const fused = makeFused({ short_term: { rx1day: 45 } });
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'extreme_rain' && x.indicator === 'rx1day');
    assert.equal(s.length, 0);
  });
});

describe('Paris Agreement thresholds — temp_increase (tas)', () => {
  it('generates short_term signal when tas delta > 1.5°C', () => {
    const fused = makeFused({ historical: { tas: 20 }, short_term: { tas: 22 } }); // +2.0°C
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'temp_increase' && x.horizon === 'short_term');
    assert.ok(s);
    assert.equal(s.delta, 2.0);
  });

  it('does NOT generate short_term signal when tas delta == 1.5°C', () => {
    const fused = makeFused({ historical: { tas: 20 }, short_term: { tas: 21.5 } }); // +1.5°C
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'temp_increase' && x.horizon === 'short_term');
    assert.equal(s.length, 0);
  });

  it('generates mid_term signal when tas delta > 2.5°C', () => {
    const fused = makeFused({ historical: { tas: 20 }, mid_term: { tas: 23 } }); // +3.0°C
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'temp_increase' && x.horizon === 'mid_term');
    assert.ok(s);
    assert.equal(s.delta, 3.0);
  });

  it('does NOT generate mid_term signal when tas delta == 2.5°C', () => {
    const fused = makeFused({ historical: { tas: 20 }, mid_term: { tas: 22.5 } }); // +2.5°C
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'temp_increase' && x.horizon === 'mid_term');
    assert.equal(s.length, 0);
  });

  it('falls back to meteoData delta when climate_cells has no tas', () => {
    const fused = makeFused({
      historical: {},  // no tas
      short_term: {},  // no tas
      meteoData: { short_term: { delta_temp: 2.0 }, historical: { avg_temp: 19 } },
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'temp_increase');
    assert.ok(s, 'meteo fallback temp signal expected');
    assert.equal(s.delta, 2.0);
  });
});

describe('WRI threshold — flood_risk (GRI)', () => {
  it('generates flood_risk signal when GRI probability > 0.35', () => {
    const fused = makeFused({ griData: makeGriFlood(0.30, 0.45) });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'flood_risk');
    assert.ok(s);
    assert.equal(s.projected, 0.45);
    assert.equal(s.indicator, 'flood_probability');
  });

  it('does NOT generate flood_risk signal when GRI probability == 0.35', () => {
    const fused = makeFused({ griData: makeGriFlood(0.20, 0.35) });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'flood_risk' && x.indicator === 'flood_probability');
    assert.equal(s, undefined);
  });

  it('does NOT generate flood_risk signal when GRI probability < 0.35', () => {
    const fused = makeFused({ griData: makeGriFlood(0.10, 0.25) });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'flood_risk' && x.indicator === 'flood_probability');
    assert.equal(s, undefined);
  });
});

describe('ENSO phase signal', () => {
  it('generates enso_phase signal when phase is El Niño (non-neutral)', () => {
    const fused = makeFused({
      ensoData: { phase: 'El Niño', oni_latest: 1.5 },
    });
    const { signals, enso_phase } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'enso_phase');
    assert.ok(s);
    assert.equal(s.projected, 1.5);
    assert.equal(s.confidence, 'high');
    assert.equal(enso_phase, 'El Niño');
  });

  it('generates enso_phase signal when phase is La Niña', () => {
    const fused = makeFused({
      ensoData: { phase: 'La Niña', oni_latest: -1.2 },
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'enso_phase');
    assert.ok(s);
    assert.equal(s.projected, -1.2);
  });

  it('does NOT generate enso_phase signal when phase is neutral', () => {
    const fused = makeFused({
      ensoData: { phase: 'neutral', oni_latest: 0.1 },
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'enso_phase');
    assert.equal(s, undefined);
  });

  it('does NOT generate enso_phase signal when ensoData is null', () => {
    const fused = makeFused({ ensoData: null });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'enso_phase');
    assert.equal(s, undefined);
  });
});

describe('Terrain signals (landslide, huayco)', () => {
  it('generates landslide_risk signal when exceeds_landslide_threshold is true', () => {
    const fused = makeFused({
      terrainData: {
        exceeds_landslide_threshold: true,
        slope_degrees: 32,
        susceptibility: 'alta',
        terrain_region: 'Andes Norte',
        landslide_score: 0.82,
        huayco_risk: 'bajo',
        elevation_m: 2800,
      },
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'landslide_risk');
    assert.ok(s);
    assert.equal(s.projected, 32);
    assert.equal(s.confidence, 'medium');
  });

  it('generates huayco_risk signal when huayco_risk is "alto"', () => {
    const fused = makeFused({
      terrainData: {
        exceeds_landslide_threshold: false,
        slope_degrees: 25,
        terrain_region: 'Andes Sur',
        landslide_score: 0.70,
        huayco_risk: 'alto',
        elevation_m: 3200,
      },
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'huayco_risk');
    assert.ok(s);
    assert.equal(s.projected, 0.70);
  });

  it('generates huayco_risk signal when huayco_risk is "medio"', () => {
    const fused = makeFused({
      terrainData: {
        exceeds_landslide_threshold: false,
        slope_degrees: 18,
        terrain_region: 'Andes Central',
        landslide_score: 0.55,
        huayco_risk: 'medio',
        elevation_m: 2500,
      },
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'huayco_risk');
    assert.ok(s);
  });

  it('does NOT generate huayco_risk for "bajo" level', () => {
    const fused = makeFused({
      terrainData: {
        exceeds_landslide_threshold: false,
        slope_degrees: 5,
        terrain_region: 'Costa',
        landslide_score: 0.10,
        huayco_risk: 'bajo',
        elevation_m: 100,
      },
    });
    const { signals } = detectSignals(fused);
    const s = signals.filter(x => x.signalType === 'huayco_risk');
    assert.equal(s.length, 0);
  });
});

describe('Dominant signal selection', () => {
  it('selects the signal with the largest absolute delta', () => {
    const fused = makeFused({
      historical:  { hd35: 10, cdd: 50 },
      short_term:  { hd35: 35, cdd: 90 },  // hd35 delta=25, cdd delta=40
    });
    const { dominant_signal } = detectSignals(fused);
    // cdd delta=40 > hd35 delta=25
    assert.equal(dominant_signal, 'drought');
  });

  it('excludes enso_phase, landslide_risk, huayco_risk from dominant signal', () => {
    const fused = makeFused({
      historical:  { hd35: 10 },
      short_term:  { hd35: 25 },  // delta=15 → extreme_heat
      ensoData:    { phase: 'El Niño', oni_latest: 2.5 },  // delta=2.5 — would win if included
      terrainData: {
        exceeds_landslide_threshold: true,
        slope_degrees: 35,
        susceptibility: 'alta',
        terrain_region: 'Andes',
        landslide_score: 99, // enormous but should be excluded
        huayco_risk: 'bajo',
        elevation_m: 3000,
      },
    });
    const { dominant_signal } = detectSignals(fused);
    assert.equal(dominant_signal, 'extreme_heat');
  });

  it('returns first signal type when all deltas are null/0', () => {
    const fused = makeFused({
      short_term: { prpercnt: 80 },  // delta=null, only drought from prpercnt
    });
    const { dominant_signal } = detectSignals(fused);
    assert.equal(dominant_signal, 'drought');
  });

  it('returns null when no signals detected', () => {
    const { dominant_signal } = detectSignals(makeFused());
    assert.equal(dominant_signal, null);
  });
});

describe('Confidence level assignment', () => {
  it('assigns "high" confidence when climateData (climate_cells) is present', () => {
    const fused = makeFused({ historical: { hd35: 10 }, short_term: { hd35: 25 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_heat');
    assert.equal(s.confidence, 'high');
  });

  it('assigns "medium" confidence for GRI-based signals', () => {
    const fused = makeFused({ griData: makeGriFlood(0.20, 0.45) });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'flood_risk');
    assert.equal(s.confidence, 'medium');
  });

  it('ENSO signal always has "high" confidence (NOAA official)', () => {
    const fused = makeFused({ ensoData: { phase: 'El Niño', oni_latest: 1.0 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'enso_phase');
    assert.equal(s.confidence, 'high');
  });

  it('terrain signals have "medium" confidence (SRTM-derived)', () => {
    const fused = makeFused({
      terrainData: {
        exceeds_landslide_threshold: true,
        slope_degrees: 30,
        susceptibility: 'alta',
        terrain_region: 'Andes',
        landslide_score: 0.75,
        huayco_risk: 'bajo',
        elevation_m: 3000,
      },
    });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'landslide_risk');
    assert.equal(s.confidence, 'medium');
  });
});

describe('source_traceability metadata structure', () => {
  it('enriches every signal with source_traceability object', () => {
    const fused = makeFused({ historical: { hd35: 10 }, short_term: { hd35: 25 } });
    const { signals } = detectSignals(fused);
    assert.ok(signals.length > 0);
    for (const s of signals) {
      assert.ok(s.source_traceability, `Signal ${s.signalType} missing source_traceability`);
    }
  });

  it('source_traceability contains all required fields', () => {
    const fused = makeFused({ historical: { hd35: 10 }, short_term: { hd35: 25 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_heat');
    const tr = s.source_traceability;
    const required = [
      'source_origin', 'climate_variable', 'temporal_period', 'temporal_period_label',
      'scenario_ssp', 'threshold_applied', 'transformation_applied', 'confidence_level',
      'responsible_endpoint', 'provenance_badges', 'climate_model_badge',
    ];
    for (const field of required) {
      assert.ok(field in tr, `Missing traceability field: ${field}`);
    }
  });

  it('temporal_period_label is "2020-2039" for short_term', () => {
    const fused = makeFused({ historical: { hd35: 10 }, short_term: { hd35: 25 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_heat' && x.horizon === 'short_term');
    assert.equal(s.source_traceability.temporal_period_label, '2020-2039');
  });

  it('temporal_period_label is "2040-2059" for mid_term', () => {
    const fused = makeFused({ historical: { hd35: 10 }, mid_term: { hd35: 35 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_heat' && x.horizon === 'mid_term');
    assert.equal(s.source_traceability.temporal_period_label, '2040-2059');
  });

  it('scenario_ssp is uppercased from fusedData.scenario', () => {
    const fused = makeFused({ historical: { hd35: 10 }, short_term: { hd35: 25 }, scenario: 'ssp245' });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_heat');
    assert.equal(s.source_traceability.scenario_ssp, 'SSP245');
  });

  it('climate_model_badge is "CMIP6 ensemble" for climate_cells source', () => {
    const fused = makeFused({ historical: { hd35: 10 }, short_term: { hd35: 25 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_heat');
    assert.equal(s.source_traceability.climate_model_badge, 'CMIP6 ensemble');
  });

  it('provenance_badges is an array', () => {
    const fused = makeFused({ historical: { hd35: 10 }, short_term: { hd35: 25 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'extreme_heat');
    assert.ok(Array.isArray(s.source_traceability.provenance_badges));
  });
});

describe('GRI qualitative signals (fallback when no quantitative signal)', () => {
  it('adds GRI drought signal when no quantitative drought exists', () => {
    const griWithDrought = {
      hazards: [{
        hazard: 'drought',
        baseline:              { score: 'alto',  value_decimal: 0.80 },
        future_high_emissions: { score: 'alto',  value_decimal: 0.90 },
      }],
    };
    const fused = makeFused({ griData: griWithDrought });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.signalType === 'drought' && x.indicator === 'gri_drought_probability');
    assert.ok(s, 'GRI qualitative drought signal expected');
    assert.equal(s.confidence, 'medium');
  });

  it('does NOT add GRI drought signal when quantitative drought already exists', () => {
    const griWithDrought = {
      hazards: [{
        hazard: 'drought',
        baseline:              { score: 'alto',  value_decimal: 0.80 },
        future_high_emissions: { score: 'alto',  value_decimal: 0.90 },
      }],
    };
    const fused = makeFused({
      historical: { cdd: 50 },
      short_term: { cdd: 70 },  // quantitative drought exists
      griData: griWithDrought,
    });
    const { signals } = detectSignals(fused);
    const gri = signals.filter(x => x.indicator === 'gri_drought_probability');
    assert.equal(gri.length, 0);
  });
});

describe('deltaPct calculation', () => {
  it('returns correct percentage for rx5day', () => {
    // deltaPct(8.2, 10.2) = (10.2-8.2)/8.2 * 100 = 24.39...%
    const fused = makeFused({ historical: { rx5day: 8.2 }, short_term: { rx5day: 10.2 } });
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.indicator === 'rx5day');
    assert.ok(s, 'rx5day signal expected');
    assert.ok(Math.abs(s.delta_pct - 24.39) < 0.1, `Expected ~24.39%, got ${s.delta_pct}`);
  });

  it('returns null delta_pct when historical is 0', () => {
    // deltaPct(0, 10) → null (historical=0)
    const fused = makeFused({ historical: { rx5day: 0 }, short_term: { rx5day: 70 } }); // pct=null, no trigger
    const { signals } = detectSignals(fused);
    const s = signals.find(x => x.indicator === 'rx5day');
    // delta_pct is null so no signal generated (pct < threshold fails)
    assert.equal(s, undefined);
  });
});

describe('Return structure', () => {
  it('always returns signals array, signals_count, and dominant_signal', () => {
    const result = detectSignals(makeFused());
    assert.ok(Array.isArray(result.signals));
    assert.equal(typeof result.signals_count, 'number');
    assert.ok('dominant_signal' in result);
  });

  it('signals_count matches signals array length', () => {
    const fused = makeFused({
      historical: { hd35: 10, cdd: 50 },
      short_term: { hd35: 25, cdd: 80 },
    });
    const { signals, signals_count } = detectSignals(fused);
    assert.equal(signals_count, signals.length);
  });

  it('includes enso_phase and terrain convenience fields', () => {
    const fused = makeFused({
      ensoData:    { phase: 'El Niño', oni_latest: 1.5 },
      terrainData: {
        exceeds_landslide_threshold: false,
        huayco_risk: 'bajo',
        terrain_region: 'Selva Alta',
        slope_degrees: 5,
        landslide_score: 0.1,
        elevation_m: 800,
      },
    });
    const result = detectSignals(fused);
    assert.equal(result.enso_phase, 'El Niño');
    assert.equal(result.terrain_region, 'Selva Alta');
    assert.equal(result.terrain_slope, 5);
  });
});
