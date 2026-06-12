import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignalsV2 } from '../../../server/layers/Layer2_SignalEngineV2.js';

describe('Layer2 — PRECTOT standalone drought_observacional signal', () => {
  it('generates drought_observacional when PRECTOT < 0.5 mm/day', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null, ndviData: null, graceFoData: null,
      nasaPowerData: { recent: { PRECTOT: { value: 0.3 } } },
    };
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'drought_observacional');
    assert.ok(s, 'drought_observacional signal expected');
    assert.equal(s.indicator, 'prectot');
    assert.equal(s.confidence, 'medium');
    assert.equal(s.horizon, 'short_term');
    assert.ok(s.exceeds_threshold);
  });

  it('does NOT generate drought_observacional when PRECTOT >= 0.5 mm/day', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null, ndviData: null, graceFoData: null,
      nasaPowerData: { recent: { PRECTOT: { value: 0.5 } } },
    };
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'drought_observacional');
    assert.equal(s, undefined, 'should not generate at boundary (>= 0.5)');
  });

  it('does NOT generate drought_observacional when PRECTOT is null', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null, ndviData: null, graceFoData: null,
      nasaPowerData: null,
    };
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'drought_observacional');
    assert.equal(s, undefined, 'should not generate when nasaPowerData is null');
  });

  it('includes source_traceability with correct source', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null, ndviData: null, graceFoData: null,
      nasaPowerData: { recent: { PRECTOT: { value: 0.1 } } },
    };
    const { signals } = detectSignalsV2(fused);
    const s = signals.find(x => x.signalType === 'drought_observacional');
    assert.ok(s.source_traceability);
    assert.ok(s.source_traceability.source);
    assert.match(s.source_traceability.source, /NASA POWER/i);
  });

  it('does not duplicate drought_compounding signal', () => {
    // When PRECTOT is dry but no NDVI/GRACE stress, only standalone should be generated
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null, ndviData: null, graceFoData: null,
      nasaPowerData: { recent: { PRECTOT: { value: 0.1 } } },
    };
    const { signals } = detectSignalsV2(fused);
    const standalone = signals.find(x => x.signalType === 'drought_observacional');
    const compound = signals.find(x => x.signalType === 'drought_compounding');
    assert.ok(standalone, 'standalone signal expected');
    assert.equal(compound, undefined, 'no compound when only 1 source is dry');
  });
});
