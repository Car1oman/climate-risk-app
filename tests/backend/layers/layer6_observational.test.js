import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateNarrative } from '../../../server/layers/Layer6_NarrativeEngine.js';

function makeMinimalSignalOutput() {
  return {
    signals: [{
      signalType: 'extreme_heat', indicator: 'hd35', confidence: 'medium',
      historical: 10, projected: 25, delta: 15, horizon: 'short_term',
    }],
    signals_count: 1,
    dominant_signal: 'extreme_heat',
    enso_phase: null, terrain_region: null, detection_region: 'default',
  };
}

function makeMinimalFused(overrides = {}) {
  return {
    climateData: { historical: {}, short_term: {} },
    griData: null, meteoData: null, ensoData: null,
    terrainData: null, ndviData: null, graceFoData: null, nasaPowerData: null,
    scenario: 'ssp245',
    ...overrides,
  };
}

describe('Layer6 — NDVI narrative integration', () => {
  it('appends NDVI narrative when ndviData has stress anomaly', () => {
    const narrative = generateNarrative({
      fusedData: makeMinimalFused({
        ndviData: { anomaly: { current_ndvi: 0.12, vegetation_health: 'stress', anomaly_zscore: -1.2 } },
      }),
      signalOutput: makeMinimalSignalOutput(),
      businessRiskOutput: { risks: [], overall_exposure: 'bajo', sector_key: 'otros' },
      contextualRisks: { risks: [] },
      adaptationOutput: null,
      sector: 'retail', lat: -12, lon: -77,
    });
    assert.ok(narrative.executive_summary.length > 0);
    assert.ok(narrative.generated_from.ndvi === true);
  });

  it('appends GRACE-FO narrative when graceFoData has anomaly', () => {
    const narrative = generateNarrative({
      fusedData: makeMinimalFused({
        graceFoData: { anomaly: { tws_anomaly_cm: -8, drought_severity: 'moderate' } },
      }),
      signalOutput: makeMinimalSignalOutput(),
      businessRiskOutput: { risks: [], overall_exposure: 'bajo', sector_key: 'otros' },
      contextualRisks: { risks: [] },
      adaptationOutput: null,
      sector: 'retail', lat: -12, lon: -77,
    });
    assert.ok(narrative.executive_summary.length > 0);
    assert.ok(narrative.generated_from.grace_fo === true);
  });

  it('does not crash when ndviData is null', () => {
    const narrative = generateNarrative({
      fusedData: makeMinimalFused({ ndviData: null }),
      signalOutput: makeMinimalSignalOutput(),
      businessRiskOutput: { risks: [], overall_exposure: 'bajo', sector_key: 'otros' },
      contextualRisks: { risks: [] },
      adaptationOutput: null,
      sector: 'retail', lat: -12, lon: -77,
    });
    assert.ok(narrative.executive_summary.length > 0);
    assert.ok(narrative.generated_from.ndvi === false);
  });

  it('does not crash when graceFoData is null', () => {
    const narrative = generateNarrative({
      fusedData: makeMinimalFused({ graceFoData: null }),
      signalOutput: makeMinimalSignalOutput(),
      businessRiskOutput: { risks: [], overall_exposure: 'bajo', sector_key: 'otros' },
      contextualRisks: { risks: [] },
      adaptationOutput: null,
      sector: 'retail', lat: -12, lon: -77,
    });
    assert.ok(narrative.executive_summary.length > 0);
    assert.ok(narrative.generated_from.grace_fo === false);
  });

  it('executive_summary includes NDVI-related text when stress present', () => {
    const narrative = generateNarrative({
      fusedData: makeMinimalFused({
        ndviData: { anomaly: { current_ndvi: 0.12, vegetation_health: 'stress', anomaly_zscore: -1.2 } },
      }),
      signalOutput: makeMinimalSignalOutput(),
      businessRiskOutput: { risks: [], overall_exposure: 'bajo', sector_key: 'otros' },
      contextualRisks: { risks: [] },
      adaptationOutput: null,
      sector: 'retail', lat: -12, lon: -77,
    });
    const s = narrative.executive_summary.toLowerCase();
    assert.ok(s.includes('ndvi') || s.includes('vegetación') || s.includes('vegetacion'));
  });

  it('executive_summary includes GRACE-FO text when depletion present', () => {
    const narrative = generateNarrative({
      fusedData: makeMinimalFused({
        graceFoData: { anomaly: { tws_anomaly_cm: -12, drought_severity: 'severe' } },
      }),
      signalOutput: makeMinimalSignalOutput(),
      businessRiskOutput: { risks: [], overall_exposure: 'bajo', sector_key: 'otros' },
      contextualRisks: { risks: [] },
      adaptationOutput: null,
      sector: 'agro', lat: -12, lon: -77,
    });
    const s = narrative.executive_summary.toLowerCase();
    assert.ok(s.includes('agua') || s.includes('grace') || s.includes('acuífero') || s.includes('acuifero'));
  });
});
