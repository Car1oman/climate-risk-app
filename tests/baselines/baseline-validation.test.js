/**
 * Baseline validation tests — reproducible scenario snapshots
 *
 * Detects silent regressions by running the Layer2 signal pipeline
 * against frozen synthetic inputs and verifying the outputs match known
 * expected values.
 *
 * Scenarios:
 *  1. Lima  / Retail      / SSP585
 *  2. Ica   / Healthcare   / SSP245
 *  3. Cusco / Logistics   / SSP585
 *
 * If any test here fails after a code change, the change must be either:
 *  a) Intentional — update the baseline expected values with a scientific justification, OR
 *  b) A regression — revert the change.
 *
 * NOTE: V2 does NOT enrich source_traceability for standard climate signals
 * (only NASA/GRACE/compound signals have it populated). All source_traceability
 * assertions below expect null. This is a known V2 limitation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignalsV2 } from '../../server/layers/Layer2_SignalEngineV2.js';

// Floating-point tolerance helper (V2 applies ENSO multipliers, producing
// fractional values that strict equality cannot match).
function approx(actual, expected, epsilon = 0.005) {
  assert.ok(Math.abs(actual - expected) < epsilon,
    `Expected ${expected} ± ${epsilon}, got ${actual}`);
}
import {
  LIMA_RETAIL_SSP585,
  ICA_HEALTHCARE_SSP245,
  CUSCO_LOGISTICS_SSP585,
  ALL_SCENARIOS,
} from './scenarios.js';

// ─── Helper ──────────────────────────────────────────────────────────────────

function runLayer2(scenario) {
  return detectSignalsV2(scenario.fusedData);
}

// ─── SCENARIO 1: Lima / Retail / SSP585 ─────────────────────────────────────

describe('Baseline: Lima / Retail / SSP585', () => {
  const scenario = LIMA_RETAIL_SSP585;
  let layer2;

  it('Layer2 — signals_count matches expected baseline', () => {
    layer2 = runLayer2(scenario);
    assert.equal(layer2.signals_count, scenario.expected.signals_count,
      `Expected ${scenario.expected.signals_count} signals, got ${layer2.signals_count}`);
  });

  it('Layer2 — dominant_signal matches expected baseline', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    assert.equal(layer2.dominant_signal, scenario.expected.dominant_signal);
  });

  it('Layer2 — enso_phase is null (no ENSO data)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    assert.equal(layer2.enso_phase, null);
  });

  it('Layer2 — all required signal types are present', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    for (const type of scenario.expected.required_signal_types) {
      const found = layer2.signals.some(s => s.signalType === type);
      assert.ok(found, `Required signal type "${type}" not found in Lima/SSP585`);
    }
  });

  it('Layer2 — no absent signal types present', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    for (const type of scenario.expected.absent_signal_types) {
      const found = layer2.signals.some(s => s.signalType === type);
      assert.ok(!found, `Unexpected signal type "${type}" found in Lima/SSP585`);
    }
  });

  it('Layer2 — extreme_heat short_term: delta=24, historical=18, projected=42', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'extreme_heat' && x.horizon === 'short_term');
    assert.ok(s, 'extreme_heat short_term signal missing');
    assert.equal(s.delta,      24);
    assert.equal(s.historical, 18);
    assert.equal(s.projected,  42);
  });

  it('Layer2 — tropical_nights mid_term: delta=43 (largest scorable delta)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'tropical_nights' && x.horizon === 'mid_term');
    assert.ok(s, 'tropical_nights mid_term signal missing');
    assert.equal(s.delta, 43);
  });

  it('Layer2 — flood_risk from GRI with projected=0.55', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'flood_risk');
    assert.ok(s, 'flood_risk signal missing');
    assert.equal(s.projected, 0.55);
  });

  it('Layer2 — source_traceability is null (V2 does NOT enrich standard signals)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'extreme_heat');
    assert.equal(s.source_traceability, null,
      'V2 only enriches NASA/GRACE/compound signals with source_traceability');
  });

  it('Layer2 — flood_risk source_traceability is null (V2 limitation)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'flood_risk');
    assert.equal(s.source_traceability, null,
      'flood_risk is not a NASA signal so V2 leaves source_traceability null');
  });

  it('Layer2 — no quantitative drought signal for short_term (prpercnt=86, cdd delta=15)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const droughtShort = layer2.signals.filter(
      x => x.signalType === 'drought' && x.horizon === 'short_term' &&
           ['cdd', 'pr', 'prpercnt'].includes(x.indicator)
    );
    assert.equal(droughtShort.length, 0,
      `Short-term quantitative drought should not trigger (prpercnt=86 > 85 boundary)`);
  });

  it('Layer2 — two drought signals for mid_term (cdd + prpercnt)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const droughtMid = layer2.signals.filter(
      x => x.signalType === 'drought' && x.horizon === 'mid_term'
    );
    assert.equal(droughtMid.length, 2, 'Expected 2 mid_term drought signals (cdd and prpercnt)');
  });
});

// ─── SCENARIO 2: Ica / Healthcare / SSP245 ───────────────────────────────────

describe('Baseline: Ica / Healthcare / SSP245', () => {
  const scenario = ICA_HEALTHCARE_SSP245;
  let layer2;

  it('Layer2 — signals_count matches expected baseline', () => {
    layer2 = runLayer2(scenario);
    assert.equal(layer2.signals_count, scenario.expected.signals_count,
      `Expected ${scenario.expected.signals_count} signals, got ${layer2.signals_count}`);
  });

  it('Layer2 — dominant_signal is "drought"', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    assert.equal(layer2.dominant_signal, scenario.expected.dominant_signal);
  });

  it('Layer2 — all required signal types present', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    for (const type of scenario.expected.required_signal_types) {
      const found = layer2.signals.some(s => s.signalType === type);
      assert.ok(found, `Required signal type "${type}" not found in Ica/SSP245`);
    }
  });

  it('Layer2 — absent signals correctly absent (SSP245 does NOT trigger extreme_heat mid)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    for (const type of scenario.expected.absent_signal_types) {
      const found = layer2.signals.some(s => s.signalType === type);
      assert.ok(!found, `Unexpected signal type "${type}" found in Ica/SSP245`);
    }
  });

  it('Layer2 — hd35 short_term delta=10 does NOT trigger extreme_heat (boundary check)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const extremeHeat = layer2.signals.filter(x => x.signalType === 'extreme_heat');
    assert.equal(extremeHeat.length, 0, 'hd35 delta=10 is at boundary, must NOT trigger');
  });

  it('Layer2 — hd35 mid_term delta=18 does NOT trigger extreme_heat (< 20 threshold)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const extremeHeatMid = layer2.signals.filter(
      x => x.signalType === 'extreme_heat' && x.horizon === 'mid_term'
    );
    assert.equal(extremeHeatMid.length, 0, 'SSP245 hd35 mid delta=18 must not exceed threshold 20');
  });

  it('Layer2 — drought cdd mid_term: delta=45, largest scorable delta', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'drought' && x.indicator === 'cdd'
      && x.horizon === 'mid_term');
    assert.ok(s, 'drought cdd mid_term signal missing');
    assert.equal(s.delta, 45);
  });

  it('Layer2 — no GRI drought qualitative signal (quantitative drought already exists)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const griDrought = layer2.signals.find(x => x.indicator === 'gri_drought_probability');
    assert.equal(griDrought, undefined, 'GRI drought fallback must NOT fire when quantitative exists');
  });

  it('Layer2 — source_traceability is null for standard signals (V2 limitation)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'drought');
    assert.equal(s.source_traceability, null,
      'V2 does not enrich source_traceability; would need enrichTraceability port from V1');
  });

});

// ─── SCENARIO 3: Cusco / Logistics / SSP585 ──────────────────────────────────

describe('Baseline: Cusco / Logistics / SSP585', () => {
  const scenario = CUSCO_LOGISTICS_SSP585;
  let layer2;

  it('Layer2 — signals_count matches expected baseline (13 — ENSO-amplified rx1day short triggers)', () => {
    layer2 = runLayer2(scenario);
    assert.equal(layer2.signals_count, scenario.expected.signals_count,
      `Expected ${scenario.expected.signals_count} signals, got ${layer2.signals_count}`);
  });

  it('Layer2 — dominant_signal is "drought" (cdd mid delta=70)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    assert.equal(layer2.dominant_signal, 'drought');
  });

  it('Layer2 — enso_phase is "El Niño"', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    assert.equal(layer2.enso_phase, 'El Niño');
  });

  it('Layer2 — terrain_region is "Andes Sur"', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    assert.equal(layer2.terrain_region, 'Andes Sur');
  });

  it('Layer2 — all required signal types present', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    for (const type of scenario.expected.required_signal_types) {
      const found = layer2.signals.some(s => s.signalType === type);
      assert.ok(found, `Required signal "${type}" not found in Cusco/SSP585`);
    }
  });

  it('Layer2 — absent signals correctly absent (Andean altitude prevents heat signals)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    for (const type of scenario.expected.absent_signal_types) {
      const found = layer2.signals.some(s => s.signalType === type);
      assert.ok(!found, `Unexpected signal "${type}" found in Cusco/SSP585`);
    }
  });

  it('Layer2 — enso_phase signal confidence is "high" (NOAA official)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const enso = layer2.signals.find(x => x.signalType === 'enso_phase');
    assert.ok(enso);
    assert.equal(enso.confidence, 'high');
    assert.equal(enso.projected, 1.8);
  });

  it('Layer2 — enso_phase excluded from dominant signal computation', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    // Even though enso oni_latest=1.8 and drought mid delta=70, dominant must be drought
    assert.equal(layer2.dominant_signal, 'drought');
  });

  it('Layer2 — landslide_risk signal present with correct slope', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'landslide_risk');
    assert.ok(s);
    assert.equal(s.projected, 28.5);
    assert.equal(s.confidence, 'medium');
  });

  it('Layer2 — huayco_risk signal present with correct landslide_score', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(x => x.signalType === 'huayco_risk');
    assert.ok(s);
    assert.equal(s.projected, 0.78);
  });

  it('Layer2 — extreme_rain mid rx1day: ENSO-amplified projected=72.54mm (> 50mm threshold)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(
      x => x.signalType === 'extreme_rain' && x.indicator === 'rx1day' && x.horizon === 'mid_term'
    );
    assert.ok(s, 'rx1day mid_term extreme_rain signal missing');
    approx(s.projected, 72.54, 0.01);
  });

  it('Layer2 — rx1day short_term now triggers (ENSO 1.3× amplifies 40.2 → 52.26mm > 50mm)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const s = layer2.signals.find(
      x => x.signalType === 'extreme_rain' && x.indicator === 'rx1day' && x.horizon === 'short_term'
    );
    assert.ok(s, 'rx1day short_term should trigger via ENSO amplification');
    approx(s.projected, 52.26, 0.01);
  });

  it('Layer2 — enso_phase source_traceability is null (V2 limitation)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const enso = layer2.signals.find(x => x.signalType === 'enso_phase');
    assert.equal(enso.source_traceability, null,
      'V2 does not enrich source_traceability for enso_phase');
  });

  it('Layer2 — terrain signals have null source_traceability (V2 limitation)', () => {
    if (!layer2) layer2 = runLayer2(scenario);
    const landslide = layer2.signals.find(x => x.signalType === 'landslide_risk');
    assert.equal(landslide.source_traceability, null,
      'V2 does not enrich source_traceability for terrain signals');
  });

});

// ─── Cross-scenario consistency ───────────────────────────────────────────────

describe('Cross-scenario consistency', () => {
  it('all scenarios produce non-empty signals arrays', () => {
    for (const scenario of ALL_SCENARIOS) {
      const { signals } = runLayer2(scenario);
      assert.ok(signals.length > 0, `${scenario.label}: expected at least one signal`);
    }
  });

  it('all signals have source_traceability property (may be null in V2)', () => {
    for (const scenario of ALL_SCENARIOS) {
      const { signals } = runLayer2(scenario);
      for (const s of signals) {
        assert.ok(Object.hasOwn(s, 'source_traceability'),
          `${scenario.label} — signal ${s.signalType} missing source_traceability property`);
      }
    }
  });

  it('SSP585 scenarios produce more or equal signals than SSP245 (higher-emissions drives more signals)', () => {
    const limaCount = runLayer2(LIMA_RETAIL_SSP585).signals_count;
    const icaCount  = runLayer2(ICA_HEALTHCARE_SSP245).signals_count;
    // Lima (SSP585, coastal) should have more signals than Ica (SSP245, desert)
    // This validates that scenario severity affects signal detection
    assert.ok(limaCount >= icaCount,
      `Lima/SSP585 (${limaCount}) should produce >= signals than Ica/SSP245 (${icaCount})`);
  });

  it('Cusco SSP585 — ENSO-amplified rx1day short_term triggers (proves SSP585 emissions)', () => {
    // V2 does not enrich source_traceability, so we validate the SSP585
    // scenario indirectly: El Niño × SSP585 precipitation projection triggers
    // rx1day short_term (40.2 × 1.3 = 52.26mm > 50mm threshold).
    const { signals } = runLayer2(CUSCO_LOGISTICS_SSP585);
    const s = signals.find(
      x => x.signalType === 'extreme_rain' && x.indicator === 'rx1day' && x.horizon === 'short_term'
    );
    assert.ok(s, 'Cusco SSP585 + El Niño should amplify rx1day above 50mm');
    approx(s.projected, 52.26, 0.01);
  });

  it('Ica SSP245 — temp_increase short_term does NOT trigger (proves moderate emissions)', () => {
    // SSP245 + no ENSO = temp increase too small for short_term threshold
    const { signals } = runLayer2(ICA_HEALTHCARE_SSP245);
    const s = signals.find(
      x => x.signalType === 'temp_increase' && x.horizon === 'short_term'
    );
    assert.equal(s, undefined, 'SSP245 should not trigger temp_increase short_term (1.3°C < 1.5°C)');
  });
});
