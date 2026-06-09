import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignalsV2 } from '../../../server/layers/Layer2_SignalEngineV2.js';
import { generateNarrative } from '../../../server/layers/Layer6_NarrativeEngine.js';

describe('Degradation — NASA source failures', () => {
  it('Layer2 does not throw when NASA data is null', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: null, ndviData: null, graceFoData: null,
    };
    const result = detectSignalsV2(fused);
    assert.ok(result);
    assert.ok(Array.isArray(result.signals));
  });

  it('Layer2 handles partial NASA data (NDVI null, GRACE present)', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: { terrain_region: 'costa' },
      ndviData: null,
      graceFoData: { anomaly: { tws_anomaly_cm: -8, drought_severity: 'severe' } },
    };
    const result = detectSignalsV2(fused);
    assert.ok(result);
    const gw = result.signals.find(s => s.signalType === 'groundwater_depletion');
    assert.ok(gw);
  });

  it('Layer2 handles partial NASA data (NDVI present, GRACE null)', () => {
    const fused = {
      climateData: null, griData: null, meteoData: null, ensoData: null,
      terrainData: { terrain_region: 'costa' },
      ndviData: { anomaly: { current_ndvi: 0.1, vegetation_health: 'severe_stress', anomaly_zscore: -2.5 } },
      graceFoData: null,
    };
    const result = detectSignalsV2(fused);
    const vs = result.signals.find(s => s.signalType === 'severe_vegetation_stress');
    assert.ok(vs);
  });

  it('Layer6 does not throw when NASA narratives are absent', () => {
    const fusedData = {
      ensoData: null,
      terrainData: null,
      nasaPowerData: null,
    };
    const result = generateNarrative({
      fusedData,
      signalOutput: { signals: [] },
      businessRiskOutput: null,
      contextualRisks: null,
      adaptationOutput: null,
      sector: 'test',
      lat: -12,
      lon: -77,
    });
    assert.ok(result);
    assert.equal(typeof result.executive_summary, 'string');
    assert.equal(typeof result.key_metrics, 'object');
  });
});
