import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignalsV2 } from '../../../server/layers/Layer2_SignalEngineV2.js';

describe('Layer2 — NASA signal generation', () => {
  it('generates vegetation_stress on low NDVI', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: { terrain_region: 'costa' },
      ndviData: { anomaly: { current_ndvi: 0.12, vegetation_health: 'stress', anomaly_zscore: -1.2 } },
      graceFoData: null,
    };
    const result = detectSignalsV2(fused);
    const vs = result.signals.find(s => s.signalType === 'vegetation_stress');
    assert.ok(vs);
    assert.equal(vs.confidence, 'medium');
    assert.equal(vs.region, 'costa');
    assert.ok(vs.source_traceability);
  });

  it('generates severe_vegetation_stress on very low NDVI', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null,
      ndviData: { anomaly: { current_ndvi: 0.05, vegetation_health: 'severe_stress', anomaly_zscore: -3.0 } },
      graceFoData: null,
    };
    const result = detectSignalsV2(fused);
    const svs = result.signals.find(s => s.signalType === 'severe_vegetation_stress');
    assert.ok(svs);
    assert.equal(svs.indicator, 'ndvi_anomaly');
  });

  it('generates groundwater_depletion on low TWS anomaly', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null,
      ndviData: null,
      graceFoData: { anomaly: { tws_anomaly_cm: -8, groundwater_index: 'severe', drought_severity: 'severe' } },
    };
    const result = detectSignalsV2(fused);
    const gw = result.signals.find(s => s.signalType === 'groundwater_depletion');
    assert.ok(gw);
    assert.equal(gw.projected, -8);
  });

  it('does NOT generate groundwater_depletion when TWS > -5', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null,
      ndviData: null,
      graceFoData: { anomaly: { tws_anomaly_cm: -2, groundwater_index: 'normal', drought_severity: 'none' } },
    };
    const result = detectSignalsV2(fused);
    const gw = result.signals.find(s => s.signalType === 'groundwater_depletion');
    assert.equal(gw, undefined);
  });

  it('generates drought_compounding when 2/3 sources agree (NDVI + GRACE)', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: { terrain_region: 'costa' },
      ndviData: { anomaly: { current_ndvi: 0.12, vegetation_health: 'stress', anomaly_zscore: -1.2 } },
      graceFoData: { anomaly: { tws_anomaly_cm: -8, groundwater_index: 'severe', drought_severity: 'severe' } },
      nasaPowerData: null,
    };
    const result = detectSignalsV2(fused);
    const dc = result.signals.find(s => s.signalType === 'drought_compounding');
    assert.ok(dc, 'drought_compounding should be generated when NDVI + GRACE agree');
    assert.equal(dc.projected, 2);
    assert.equal(dc.confidence, 'medium');
    assert.equal(dc.compound_severity, 'moderate');
  });

  it('generates drought_compounding with severe severity when 3/3 sources agree', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: { terrain_region: 'sierra' },
      ndviData: { anomaly: { current_ndvi: 0.08, vegetation_health: 'severe_stress', anomaly_zscore: -3.0 } },
      graceFoData: { anomaly: { tws_anomaly_cm: -12, groundwater_index: 'extreme', drought_severity: 'extreme' } },
      nasaPowerData: { recent: { PRECTOT: { value: 0.2 } } },
    };
    const result = detectSignalsV2(fused);
    const dc = result.signals.find(s => s.signalType === 'drought_compounding');
    assert.ok(dc, 'drought_compounding should be generated when 3/3 sources agree');
    assert.equal(dc.projected, 3);
    assert.equal(dc.confidence, 'high');
    assert.equal(dc.compound_severity, 'severe');
  });

  it('does NOT generate drought_compounding when only 1 source is stressed', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: { terrain_region: 'costa' },
      ndviData: { anomaly: { current_ndvi: 0.12, vegetation_health: 'stress', anomaly_zscore: -1.2 } },
      graceFoData: { anomaly: { tws_anomaly_cm: -1, groundwater_index: 'normal', drought_severity: 'none' } },
      nasaPowerData: { recent: { PRECTOT: { value: 5.0 } } },
    };
    const result = detectSignalsV2(fused);
    const dc = result.signals.find(s => s.signalType === 'drought_compounding');
    assert.equal(dc, undefined, 'drought_compounding should NOT be generated with only 1 source');
  });

  it('includes source_traceability in all NASA signals', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: { terrain_region: 'selva' },
      ndviData: { anomaly: { current_ndvi: 0.1, vegetation_health: 'severe_stress', anomaly_zscore: -2.5 } },
      graceFoData: { anomaly: { tws_anomaly_cm: -10, groundwater_index: 'extreme', drought_severity: 'extreme' } },
      nasaPowerData: { recent: { PRECTOT: { value: 0.1 } } },
    };
    const result = detectSignalsV2(fused);
    for (const sig of result.signals) {
      assert.ok(sig.source_traceability, `Signal ${sig.signalType} missing source_traceability`);
      assert.ok(sig.source_traceability.source, `Signal ${sig.signalType} missing source_traceability.source`);
    }
  });

  it('does not throw when ndviData is malformed', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null,
      ndviData: { anomaly: null },
      graceFoData: null,
    };
    const result = detectSignalsV2(fused);
    assert.ok(result);
    assert.ok(Array.isArray(result.signals));
  });

  it('does not throw when graceFoData is malformed', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null,
      ndviData: null,
      graceFoData: { anomaly: null },
    };
    const result = detectSignalsV2(fused);
    assert.ok(result);
  });
});
