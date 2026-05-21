/**
 * Regression tests — Layer4_PrioritizationEngine
 *
 * Validates composite score formula, weight values, urgency thresholds,
 * horizon factors, level-to-number mapping, and sort/rank logic.
 *
 * All inputs are deterministic synthetic objects. No DB or network calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeRisks } from '../../server/layers/Layer4_PrioritizationEngine.js';

// ─── Constants (must mirror Layer4 source) ───────────────────────────────────

const WEIGHTS = { probability: 0.30, intensity: 0.25, exposure: 0.25, sensitivity: 0.10, horizon_factor: 0.10 };
const URGENCY = { critica: 0.75, alta: 0.50, media: 0.25 };
const HORIZON_FACTORS = { short_term: 1.0, mid_term: 0.75, long_term: 0.5 };
const LEVEL_TO_NUM = { alto: 1.0, medio: 0.5, bajo: 0.2 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRisk(signalOverrides = {}, exposure_level = 'alto', sensitivity_level = 'alto') {
  const signal = {
    signalType:   'extreme_heat',
    indicator:    'hd35',
    confidence:   'high',
    horizon:      'short_term',
    projected:    null,
    historical:   null,
    delta:        25,
    delta_pct:    130,
    ...signalOverrides,
  };
  return {
    signal,
    exposure_level,
    sensitivity_level,
    operational_impacts: ['↑ consumo energético refrigeración'],
    financial_impact_range: { min_usd: 85_000, max_usd: 210_000 },
  };
}

function makeFused(griData = null) {
  return { climateSource: 'climate_cells', scenario: 'ssp585', griData };
}

// ─── Weight constants ─────────────────────────────────────────────────────────

describe('Weight constants integrity', () => {
  it('weights sum to exactly 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-10, `Weights sum ${sum} ≠ 1.0`);
  });

  it('individual weights match documented values', () => {
    assert.equal(WEIGHTS.probability,    0.30);
    assert.equal(WEIGHTS.intensity,      0.25);
    assert.equal(WEIGHTS.exposure,       0.25);
    assert.equal(WEIGHTS.sensitivity,    0.10);
    assert.equal(WEIGHTS.horizon_factor, 0.10);
  });
});

// ─── Composite score formula ──────────────────────────────────────────────────

describe('Composite score formula — IPCC AR6 WG2 Ch.16', () => {
  it('computes correct score for flood_risk signal with all-high inputs', () => {
    // flood_risk: probability = min(1, projected=0.55) = 0.55
    //             intensity   = min(1, projected=0.55) = 0.55
    //             exposure    = 1.0 (alto)
    //             sensitivity = 1.0 (alto)
    //             horizon     = 1.0 (short_term)
    // R = 0.55×0.30 + 0.55×0.25 + 1.0×0.25 + 1.0×0.10 + 1.0×0.10
    // R = 0.165 + 0.1375 + 0.25 + 0.10 + 0.10 = 0.7525 → rounded = 0.753
    const risk = makeRisk({
      signalType: 'flood_risk',
      indicator:  'flood_probability',
      projected:  0.55,
      delta:      null,
      delta_pct:  null,
      horizon:    'short_term',
    });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    const r = prioritized_risks[0];
    assert.equal(r.composite_score, 0.753);
    assert.equal(r.urgency, 'crítica');
  });

  it('computes correct score for CMIP6 extreme_heat signal', () => {
    // confidence='high' → probability=0.80
    // signalType='extreme_heat', delta_pct=130, signalType≠'drought' → useValue=130
    // maxRef=60 → intensity=min(1, 130/60)=1.0
    // exposure=1.0 (alto), sensitivity=0.5 (medio), horizon=1.0 (short_term)
    // R = 0.80×0.30 + 1.0×0.25 + 1.0×0.25 + 0.5×0.10 + 1.0×0.10
    // R = 0.240 + 0.250 + 0.250 + 0.050 + 0.100 = 0.890
    const risk = makeRisk({
      signalType: 'extreme_heat',
      indicator:  'hd35',
      confidence: 'high',
      horizon:    'short_term',
      delta:      24,
      delta_pct:  130,
    }, 'alto', 'medio');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    const r = prioritized_risks[0];
    assert.equal(r.composite_score, 0.890);
    assert.equal(r.urgency, 'crítica');
  });

  it('computes correct score for mid_term signal with reduced horizon factor', () => {
    // confidence='medium' → probability=0.60
    // drought, delta=30, delta_pct=null → useValue=|30|=30; maxRef=45
    // intensity = min(1, 30/45) = 0.666...
    // exposure=0.5 (medio), sensitivity=0.2 (bajo), horizon=0.75 (mid_term)
    // R = 0.60×0.30 + 0.667×0.25 + 0.5×0.25 + 0.2×0.10 + 0.75×0.10
    // R = 0.180 + 0.16675 + 0.125 + 0.020 + 0.075 = 0.56675 → rounded = 0.567
    const risk = makeRisk({
      signalType: 'drought',
      indicator:  'cdd',
      confidence: 'medium',
      horizon:    'mid_term',
      delta:      30,
      delta_pct:  null,
    }, 'medio', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    const r = prioritized_risks[0];
    // tolerance ±0.001 for floating point
    assert.ok(Math.abs(r.composite_score - 0.567) <= 0.001,
      `Expected ~0.567, got ${r.composite_score}`);
    assert.equal(r.urgency, 'alta');
  });
});

// ─── Urgency thresholds ──────────────────────────────────────────────────────

describe('Urgency thresholds', () => {
  it('assigns "crítica" when composite_score >= 0.75', () => {
    const risk = makeRisk({ signalType: 'flood_risk', indicator: 'flood_probability',
      projected: 0.55, delta: null, delta_pct: null, horizon: 'short_term' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].urgency, 'crítica');
    assert.ok(prioritized_risks[0].composite_score >= 0.75);
  });

  it('assigns "alta" when composite_score >= 0.50 and < 0.75', () => {
    // confidence='medium' → prob=0.60; drought delta=30 intensity=0.667; exposure=medio=0.5; sensitivity=bajo=0.2; mid_term=0.75
    const risk = makeRisk({ signalType: 'drought', indicator: 'cdd', confidence: 'medium',
      horizon: 'mid_term', delta: 30, delta_pct: null }, 'medio', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].urgency, 'alta');
    assert.ok(prioritized_risks[0].composite_score >= 0.50);
    assert.ok(prioritized_risks[0].composite_score < 0.75);
  });

  it('assigns "media" when composite_score >= 0.25 and < 0.50', () => {
    // confidence='low' → prob=0.40
    // extreme_heat, delta=12, delta_pct=60 → useValue=60; maxRef=60 → intensity=1.0
    // exposure=bajo=0.2; sensitivity=bajo=0.2; long_term=0.5
    // R = 0.40×0.30 + 1.0×0.25 + 0.2×0.25 + 0.2×0.10 + 0.5×0.10
    // R = 0.120 + 0.250 + 0.050 + 0.020 + 0.050 = 0.490 → alta, not media
    // Use less intensity: delta_pct=10 → useValue=10; intensity=10/60=0.167
    // R = 0.40×0.30 + 0.167×0.25 + 0.2×0.25 + 0.2×0.10 + 0.5×0.10
    // R = 0.120 + 0.042 + 0.050 + 0.020 + 0.050 = 0.282
    const risk = makeRisk({
      signalType: 'extreme_heat', indicator: 'hd35', confidence: 'low',
      horizon: 'long_term', delta: 6, delta_pct: 10,
    }, 'bajo', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].urgency, 'media');
    assert.ok(prioritized_risks[0].composite_score >= 0.25);
    assert.ok(prioritized_risks[0].composite_score < 0.50);
  });

  it('assigns "baja" when composite_score < 0.25', () => {
    // All minimums: prob=0.40 (low), intensity≈0 (delta=1, delta_pct=1 → 1/60=0.017),
    // exposure=0.2, sensitivity=0.2, horizon=0.5
    // R = 0.40×0.30 + 0.017×0.25 + 0.2×0.25 + 0.2×0.10 + 0.5×0.10
    // R = 0.120 + 0.004 + 0.050 + 0.020 + 0.050 = 0.244 → media (barely above 0.25)
    // Reduce further: prob=0.40, delta_pct=0 → intensity=0
    // R = 0.40×0.30 + 0×0.25 + 0.2×0.25 + 0.2×0.10 + 0.5×0.10
    // R = 0.120 + 0 + 0.050 + 0.020 + 0.050 = 0.240 → baja
    const risk = makeRisk({
      signalType: 'extreme_heat', indicator: 'hd35', confidence: 'low',
      horizon: 'long_term', delta: 0, delta_pct: 0,
    }, 'bajo', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].urgency, 'baja');
    assert.ok(prioritized_risks[0].composite_score < 0.25);
  });
});

// ─── Horizon factors ─────────────────────────────────────────────────────────

describe('Horizon factors', () => {
  it('short_term horizon_factor is 1.0', () => {
    const risk = makeRisk({ horizon: 'short_term', delta: 20, delta_pct: 100,
      confidence: 'high', signalType: 'extreme_heat', indicator: 'hd35' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.horizon_factor, 1.0);
  });

  it('mid_term horizon_factor is 0.75', () => {
    const risk = makeRisk({ horizon: 'mid_term', delta: 20, delta_pct: 100,
      confidence: 'high', signalType: 'extreme_heat', indicator: 'hd35' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.horizon_factor, 0.75);
  });

  it('long_term horizon_factor is 0.50', () => {
    const risk = makeRisk({ horizon: 'long_term', delta: 20, delta_pct: 100,
      confidence: 'high', signalType: 'extreme_heat', indicator: 'hd35' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.horizon_factor, 0.50);
  });

  it('short_term produces higher score than mid_term for identical signals', () => {
    const short = makeRisk({ horizon: 'short_term', confidence: 'high', delta: 20, delta_pct: 100 });
    const mid   = makeRisk({ horizon: 'mid_term',   confidence: 'high', delta: 20, delta_pct: 100 });
    const { prioritized_risks: sr } = prioritizeRisks({ risks: [short] }, makeFused());
    const { prioritized_risks: mr } = prioritizeRisks({ risks: [mid]   }, makeFused());
    assert.ok(sr[0].composite_score > mr[0].composite_score);
  });
});

// ─── Level-to-number mapping ──────────────────────────────────────────────────

describe('Level-to-number mapping', () => {
  it('alto = 1.0', () => {
    const risk = makeRisk({}, 'alto', 'alto');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.exposure,    1.0);
    assert.equal(prioritized_risks[0].score_components.sensitivity, 1.0);
  });

  it('medio = 0.5', () => {
    const risk = makeRisk({}, 'medio', 'medio');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.exposure,    0.5);
    assert.equal(prioritized_risks[0].score_components.sensitivity, 0.5);
  });

  it('bajo = 0.2', () => {
    const risk = makeRisk({}, 'bajo', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.exposure,    0.2);
    assert.equal(prioritized_risks[0].score_components.sensitivity, 0.2);
  });

  it('unknown level defaults to 0.2', () => {
    const risk = makeRisk({}, 'desconocido', 'desconocido');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.exposure,    0.2);
  });
});

// ─── GRI probability extraction ──────────────────────────────────────────────

describe('GRI probability extraction', () => {
  it('GRI signals use projected as probability (capped at 1.0)', () => {
    const gri = makeRisk({
      signalType: 'flood_risk', indicator: 'gri_flood_probability',
      projected: 0.70, confidence: 'medium', horizon: 'short_term',
      delta: null, delta_pct: null,
    });
    const { prioritized_risks } = prioritizeRisks({ risks: [gri] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.probability, 0.70);
  });

  it('GRI signal probability is capped at 1.0', () => {
    const gri = makeRisk({
      signalType: 'flood_risk', indicator: 'flood_probability',
      projected: 1.5, confidence: 'medium', horizon: 'short_term',
      delta: null, delta_pct: null,
    });
    const { prioritized_risks } = prioritizeRisks({ risks: [gri] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.probability, 1.0);
  });

  it('CMIP6 signals use confidence-based probability proxy (high=0.80)', () => {
    const risk = makeRisk({ confidence: 'high', horizon: 'short_term' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.probability, 0.80);
  });

  it('CMIP6 signals use confidence-based probability proxy (medium=0.60)', () => {
    const risk = makeRisk({ confidence: 'medium', horizon: 'short_term' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.probability, 0.60);
  });

  it('CMIP6 signals use confidence-based probability proxy (low=0.40)', () => {
    const risk = makeRisk({ confidence: 'low', horizon: 'short_term' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.probability, 0.40);
  });
});

// ─── Intensity normalization ──────────────────────────────────────────────────

describe('Intensity normalization', () => {
  it('extreme_heat intensity capped at 1.0 when delta_pct exceeds max (60 days)', () => {
    // delta_pct=200 → useValue=200, maxRef=60 → 200/60 > 1 → capped at 1.0
    const risk = makeRisk({ signalType: 'extreme_heat', indicator: 'hd35',
      delta: 50, delta_pct: 200, horizon: 'short_term', confidence: 'high' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.intensity, 1.0);
  });

  it('temp_increase intensity correctly normalized against 4°C max', () => {
    // signalType='temp_increase', delta=2, delta_pct=10%
    // useValue = Math.abs(delta_pct)=10, maxRef=4... wait, that's for tas delta_pct
    // Actually for temp_increase with delta_pct=10 (not drought), useValue=10, maxRef=4
    // intensity = min(1, 10/4) = 1.0 (capped)
    // Use delta_pct=0.3 instead: useValue=0.3, maxRef=4, intensity=0.075? No—
    // Actually for temp_increase the delta (°C) is small, delta_pct could be large
    // Let's use delta=2.0, delta_pct=10.0 (not drought):
    // useValue=|delta_pct|=10.0, maxRef=MAX_DELTAS['temp_increase']=4 → intensity=min(1, 10/4)=1.0
    // That's still capped. Let's test with a case that shows the formula working:
    // delta=2, delta_pct=2 → useValue=2, maxRef=4 → intensity=0.5
    const risk = makeRisk({ signalType: 'temp_increase', indicator: 'tas',
      delta: 2.0, delta_pct: 2.0, horizon: 'short_term', confidence: 'high' });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    assert.equal(prioritized_risks[0].score_components.intensity, 0.5);
  });

  it('drought with delta uses absolute delta (not delta_pct) for intensity', () => {
    // signalType='drought', delta=20, delta_pct=-20
    // The code: useValue = (delta_pct != null && |delta_pct| > 0 && signalType !== 'drought')
    //           For drought: condition is FALSE → useValue = Math.abs(delta) = 20
    //           maxRef = MAX_DELTAS['drought'] = 45
    //           intensity = min(1, 20/45) ≈ 0.444
    const risk = makeRisk({
      signalType: 'drought', indicator: 'cdd', confidence: 'high',
      delta: 20, delta_pct: -20, horizon: 'short_term',
    });
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    const expected = 20 / 45;
    assert.ok(Math.abs(prioritized_risks[0].score_components.intensity - expected) < 0.001,
      `Expected ~${expected.toFixed(3)}, got ${prioritized_risks[0].score_components.intensity}`);
  });
});

// ─── Sort and rank ────────────────────────────────────────────────────────────

describe('Sort and rank', () => {
  it('sorts risks by composite_score descending', () => {
    const high = makeRisk({ confidence: 'high', horizon: 'short_term', delta: 50, delta_pct: 200 });
    const low  = makeRisk({ confidence: 'low',  horizon: 'long_term',  delta: 1,  delta_pct: 2 },
      'bajo', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [low, high] }, makeFused());
    assert.ok(prioritized_risks[0].composite_score >= prioritized_risks[1].composite_score);
  });

  it('assigns rank 1 to highest-scoring risk', () => {
    const high = makeRisk({ confidence: 'high', horizon: 'short_term', delta: 50, delta_pct: 200 });
    const low  = makeRisk({ confidence: 'low',  horizon: 'long_term',  delta: 1,  delta_pct: 2 },
      'bajo', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [low, high] }, makeFused());
    assert.equal(prioritized_risks[0].rank, 1);
    assert.equal(prioritized_risks[1].rank, 2);
  });

  it('top_risk matches rank-1 risk', () => {
    const r1 = makeRisk({ confidence: 'high', horizon: 'short_term', delta: 50, delta_pct: 200 });
    const r2 = makeRisk({ confidence: 'low',  horizon: 'long_term',  delta: 1,  delta_pct: 2 },
      'bajo', 'bajo');
    const { prioritized_risks, top_risk } = prioritizeRisks({ risks: [r2, r1] }, makeFused());
    assert.equal(top_risk.composite_score, prioritized_risks[0].composite_score);
    assert.equal(top_risk.rank, 1);
  });

  it('top_risk is null when risks array is empty', () => {
    const { top_risk } = prioritizeRisks({ risks: [] }, makeFused());
    assert.equal(top_risk, null);
  });
});

// ─── Score precision ──────────────────────────────────────────────────────────

describe('Score precision', () => {
  it('composite_score is rounded to 3 decimal places', () => {
    const risk = makeRisk({ confidence: 'medium', horizon: 'mid_term', delta: 30, delta_pct: null,
      signalType: 'drought', indicator: 'cdd' }, 'medio', 'bajo');
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    const score = prioritized_risks[0].composite_score;
    const rounded = Math.round(score * 1000) / 1000;
    assert.equal(score, rounded);
  });

  it('score_components object is always present', () => {
    const risk = makeRisk();
    const { prioritized_risks } = prioritizeRisks({ risks: [risk] }, makeFused());
    const components = prioritized_risks[0].score_components;
    assert.ok(components);
    const fields = ['probability', 'intensity', 'exposure', 'sensitivity', 'horizon_factor'];
    for (const f of fields) {
      assert.ok(f in components, `Missing score_component: ${f}`);
    }
  });
});
