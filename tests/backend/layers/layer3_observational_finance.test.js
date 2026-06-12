import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the engine to test financial range resolution
import { assessBusinessRisk } from '../../../server/layers/Layer3_BusinessRiskEngine.js';

function makeSignal(signalType, overrides = {}) {
  return {
    signalType,
    indicator: 'ndvi_anomaly', confidence: 'medium', horizon: 'short_term',
    historical: null, projected: -1.2, delta: -1.2, source_traceability: null,
    region: 'default',
    ...overrides,
  };
}

function makeSignalOutput(signals) {
  return {
    signals,
    signals_count: signals.length,
    dominant_signal: signals[0]?.signalType ?? null,
    enso_phase: null, terrain_region: null, detection_region: 'default',
  };
}

describe('Layer3 — Financial ranges for satellite signals', () => {
  it('vegetation_stress has non-zero financial range for retail', async () => {
    const result = await assessBusinessRisk(
      makeSignalOutput([makeSignal('vegetation_stress')]),
      { sector: 'retail', asset_type: 'tienda' },
    );
    const risk = result.risks.find(r => r.signal?.signalType === 'vegetation_stress');
    assert.ok(risk, 'vegetation_stress risk should exist');
    assert.ok(risk.financial_impact_range?.min_usd > 0);
    assert.ok(risk.financial_impact_range?.max_usd > 0);
  });

  it('severe_vegetation_stress has non-zero financial range for agro', async () => {
    const result = await assessBusinessRisk(
      makeSignalOutput([makeSignal('severe_vegetation_stress')]),
      { sector: 'agro', asset_type: 'almacen' },
    );
    const risk = result.risks.find(r => r.signal?.signalType === 'severe_vegetation_stress');
    assert.ok(risk, 'severe_vegetation_stress risk should exist');
    assert.ok(risk.financial_impact_range?.min_usd > 0);
    assert.ok(risk.financial_impact_range?.max_usd > 0);
  });

  it('groundwater_depletion has non-zero financial range for retail', async () => {
    const result = await assessBusinessRisk(
      makeSignalOutput([makeSignal('groundwater_depletion')]),
      { sector: 'retail', asset_type: 'tienda' },
    );
    const risk = result.risks.find(r => r.signal?.signalType === 'groundwater_depletion');
    assert.ok(risk, 'groundwater_depletion risk should exist');
    assert.ok(risk.financial_impact_range?.min_usd > 0);
    assert.ok(risk.financial_impact_range?.max_usd > 0);
  });

  it('severe_vegetation_stress has higher range than vegetation_stress for same sector', async () => {
    const vegResult = await assessBusinessRisk(
      makeSignalOutput([makeSignal('vegetation_stress')]),
      { sector: 'agro', asset_type: 'almacen' },
    );
    const sevResult = await assessBusinessRisk(
      makeSignalOutput([makeSignal('severe_vegetation_stress')]),
      { sector: 'agro', asset_type: 'almacen' },
    );
    const veg = vegResult.risks.find(r => r.signal?.signalType === 'vegetation_stress');
    const sev = sevResult.risks.find(r => r.signal?.signalType === 'severe_vegetation_stress');
    assert.ok(veg && sev, 'both risks should exist');
    assert.ok(sev.financial_impact_range.min_usd > veg.financial_impact_range.min_usd);
  });

  it('unknown sector falls back to otros range', async () => {
    const result = await assessBusinessRisk(
      makeSignalOutput([makeSignal('groundwater_depletion')]),
      { sector: 'mineria', asset_type: 'almacen' },
    );
    const risk = result.risks.find(r => r.signal?.signalType === 'groundwater_depletion');
    assert.ok(risk, 'groundwater_depletion risk should exist');
    assert.ok(risk.financial_impact_range?.min_usd > 0);
  });
});
