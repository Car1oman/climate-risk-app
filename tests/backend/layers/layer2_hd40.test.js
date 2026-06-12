import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignalsV2 } from '../../../server/layers/Layer2_SignalEngineV2.js';

function makeFused({ historical = {}, short_term = {}, mid_term = {},
  terrainData = null, griData = null, ensoData = null } = {}) {
  return {
    climateData: { historical, short_term, mid_term },
    griData, meteoData: null, ensoData,
    terrainData, ndviData: null, graceFoData: null, nasaPowerData: null,
  };
}

// ─── SEVERE HEAT (hd40) ──────────────────────────────────────────────────────

describe('severe_heat (hd40) — V2 Signal Engine', () => {
  it('generates short_term severe_heat when delta exceeds costa threshold (5)', () => {
    const fused = makeFused({
      historical: { hd40: 2 },
      short_term: { hd40: 9 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'severe_heat' && x.horizon === 'short_term');
    assert.ok(s, 'short_term severe_heat expected');
    assert.equal(s.delta, 7);
    assert.equal(s.indicator, 'hd40');
    assert.equal(s.region, 'costa');
  });

  it('generates mid_term severe_heat when delta exceeds threshold', () => {
    const fused = makeFused({
      historical: { hd40: 2 },
      mid_term: { hd40: 18 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'severe_heat' && x.horizon === 'mid_term');
    assert.ok(s, 'mid_term severe_heat expected');
    assert.equal(s.delta, 16);
  });

  it('does NOT generate severe_heat when delta <= threshold (default=3)', () => {
    const fused = makeFused({
      historical: { hd40: 2 },
      short_term: { hd40: 5 },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.filter(x => x.signalType === 'severe_heat');
    assert.equal(s.length, 0);
  });

  it('does NOT generate severe_heat for sierra region (threshold=null)', () => {
    const fused = makeFused({
      historical: { hd40: 2 },
      short_term: { hd40: 9 },
      terrainData: { terrain_region: 'sierra' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.filter(x => x.signalType === 'severe_heat');
    assert.equal(s.length, 0);
  });

  it('does NOT generate severe_heat when hd40 is missing from data', () => {
    const fused = makeFused({
      historical: { hd35: 10 },
      short_term: { hd35: 20 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.filter(x => x.signalType === 'severe_heat');
    assert.equal(s.length, 0);
  });

  it('severe_heat has correct threshold_reference', () => {
    const fused = makeFused({
      historical: { hd40: 2 },
      short_term: { hd40: 9 },
      terrainData: { terrain_region: 'selva' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'severe_heat');
    assert.ok(s);
    assert.ok(s.threshold_reference.includes('hd40'));
    assert.ok(s.threshold_reference.includes('40°C'));
  });
});

// ─── MODERATE HEAT (hd30) ────────────────────────────────────────────────────

describe('moderate_heat (hd30) — V2 Signal Engine', () => {
  it('generates moderate_heat when hd30 delta exceeds threshold and no higher-priority heat exists', () => {
    const fused = makeFused({
      historical: { hd30: 50 },
      short_term: { hd30: 75 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'moderate_heat' && x.horizon === 'short_term');
    assert.ok(s, 'moderate_heat expected');
    assert.equal(s.delta, 25);
    assert.equal(s.indicator, 'hd30');
  });

  it('does NOT generate moderate_heat when severe_heat exists for same horizon', () => {
    const fused = makeFused({
      historical: { hd30: 50, hd40: 2 },
      short_term: { hd30: 75, hd40: 9 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const severeHeat = signals.filter(x => x.signalType === 'severe_heat' && x.horizon === 'short_term');
    const moderateHeat = signals.filter(x => x.signalType === 'moderate_heat' && x.horizon === 'short_term');
    assert.ok(severeHeat.length > 0, 'severe_heat should be present');
    assert.equal(moderateHeat.length, 0, 'moderate_heat should be suppressed by severe_heat');
  });

  it('does NOT generate moderate_heat when extreme_heat exists for same horizon', () => {
    const fused = makeFused({
      historical: { hd30: 50, hd35: 10 },
      short_term: { hd30: 75, hd35: 35 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const extremeHeat = signals.filter(x => x.signalType === 'extreme_heat' && x.horizon === 'short_term');
    const moderateHeat = signals.filter(x => x.signalType === 'moderate_heat' && x.horizon === 'short_term');
    assert.ok(extremeHeat.length > 0, 'extreme_heat should be present');
    assert.equal(moderateHeat.length, 0, 'moderate_heat should be suppressed by extreme_heat');
  });

  it('allows moderate_heat in short_term when heat signals exist only in mid_term', () => {
    const fused = makeFused({
      historical: { hd30: 50, hd35: 10 },
      short_term: { hd30: 75 },
      mid_term: { hd35: 35 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const moderateHeat = signals.filter(x => x.signalType === 'moderate_heat' && x.horizon === 'short_term');
    assert.ok(moderateHeat.length > 0, 'moderate_heat short_term should be allowed');
  });

  it('generates moderate_heat for selva with proper threshold (25)', () => {
    const fused = makeFused({
      historical: { hd30: 50 },
      short_term: { hd30: 80 },
      terrainData: { terrain_region: 'selva' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'moderate_heat' && x.horizon === 'short_term');
    assert.ok(s, 'moderate_heat expected for selva');
    assert.equal(s.delta, 30);
  });
});

// ─── EXTREME RAIN FREQUENCY (r20mm) ──────────────────────────────────────────

describe('extreme_rain_frequency (r20mm) — V2 Signal Engine', () => {
  it('generates extreme_rain_frequency when r20mm delta exceeds threshold (costa: 5)', () => {
    const fused = makeFused({
      historical: { r20mm: 10 },
      short_term: { r20mm: 18 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'extreme_rain_frequency');
    assert.ok(s, 'extreme_rain_frequency expected');
    assert.equal(s.delta, 8);
    assert.equal(s.indicator, 'r20mm');
  });

  it('does NOT generate extreme_rain_frequency when delta <= threshold', () => {
    const fused = makeFused({
      historical: { r20mm: 10 },
      short_term: { r20mm: 14 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.filter(x => x.signalType === 'extreme_rain_frequency');
    assert.equal(s.length, 0);
  });

  it('does NOT duplicate with extreme_rain (r50mm/rx5day) — different signalType', () => {
    const fused = makeFused({
      historical: { r20mm: 10, r50mm: 5, rx5day: 50 },
      short_term: { r20mm: 18, r50mm: 12, rx5day: 62 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const rf = signals.filter(x => x.signalType === 'extreme_rain_frequency');
    const er = signals.filter(x => x.signalType === 'extreme_rain');
    assert.ok(rf.length > 0, 'extreme_rain_frequency should be present');
    assert.ok(er.length > 0, 'extreme_rain should be present');
    // Both can coexist - they measure different things
  });

  it('generates extreme_rain_frequency for sierra (threshold: 3)', () => {
    const fused = makeFused({
      historical: { r20mm: 5 },
      short_term: { r20mm: 10 },
      terrainData: { terrain_region: 'sierra' },
    });
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'extreme_rain_frequency');
    assert.ok(s, 'extreme_rain_frequency expected for sierra');
    assert.equal(s.delta, 5);
  });
});

// ─── HEAT SIGNAL PRIORITY CHAIN ──────────────────────────────────────────────

describe('Heat signal priority chain — deduplication', () => {
  it('priority order: severe_heat > extreme_heat > moderate_heat', () => {
    const fused = makeFused({
      historical: { hd40: 2, hd35: 10, hd30: 50 },
      short_term: { hd40: 9, hd35: 28, hd30: 75 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const shortTermHeat = signals.filter(s =>
      ['severe_heat', 'extreme_heat', 'moderate_heat'].includes(s.signalType)
      && s.horizon === 'short_term'
    );
    const types = shortTermHeat.map(s => s.signalType);
    // severe_heat should be present, moderate_heat should NOT (suppressed)
    assert.ok(types.includes('severe_heat'), 'severe_heat should be in short_term');
    assert.ok(types.includes('extreme_heat'), 'extreme_heat should be in short_term');
    assert.ok(!types.includes('moderate_heat'), 'moderate_heat should be suppressed');
  });

  it('moderate_heat appears only when no severe_heat or extreme_heat for same horizon', () => {
    const fused = makeFused({
      historical: { hd30: 50 },
      short_term: { hd30: 75 },
      terrainData: { terrain_region: 'costa' },
    });
    const { signals } = detectSignalsV2(fused);
    const shortTermHeat = signals.filter(s =>
      ['severe_heat', 'extreme_heat', 'moderate_heat'].includes(s.signalType)
      && s.horizon === 'short_term'
    );
    const types = shortTermHeat.map(s => s.signalType);
    assert.ok(types.includes('moderate_heat'), 'moderate_heat should appear when no higher heat');
    assert.ok(!types.includes('severe_heat'), 'severe_heat should be absent (no hd40 data)');
  });
});
