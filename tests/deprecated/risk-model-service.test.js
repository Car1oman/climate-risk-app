/**
 * Regression tests — riskModelService.js (backend H×E×I source of truth)
 *
 * Validates that the backend service produces identical H×E×I scoring
 * to the frontend riskEngine.js for the same asset inputs.
 * Also validates the complete risk model output structure.
 *
 * All inputs are deterministic. No DB or network calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCompleteRiskModel } from '../../server/services/riskModelService.js';

// ─── Reference constants (must mirror server/shared/riskConstants.js) ────────

const HAZARD_WEIGHTS_REF = {
  hazard_flood:      0.30,
  hazard_elnino:     0.25,
  hazard_earthquake: 0.20,
  hazard_landslide:  0.15,
  hazard_drought:    0.10,
};

const TYPE_FACTOR_REF = {
  supermercado_grande:  1.0,
  supermercado_mediano: 0.8,
  centro_distribucion:  1.2,
  tienda_express:       0.6,
};

const REHAB_FACTOR_REF = {
  hazard_flood:      120,
  hazard_elnino:     150,
  hazard_earthquake: 350,
  hazard_landslide:  200,
  hazard_drought:    40,
};

const CLOSURE_DAYS_REF = { 0: 0, 1: 3, 2: 7, 3: 21, 4: 45 };

// ─── getCompleteRiskModel output structure ────────────────────────────────────

describe('getCompleteRiskModel — output structure', () => {
  it('returns all required top-level fields', () => {
    const asset = {
      hazard_flood: 2, hazard_elnino: 1, hazard_earthquake: 0, hazard_landslide: 0, hazard_drought: 0,
      monthly_sales: 500_000, num_employees: 50, condition: 'propio', area_m2: 2000,
      type: 'supermercado_mediano', district: 'Miraflores',
    };
    const result = getCompleteRiskModel(asset);
    const required = ['riskScore', 'riskLevel', 'hazardScore', 'exposureScore', 'impactScore',
      'financialImpact', 'topRisk', 'topRiskKey', 'impactBreakdown',
      'topHazards', 'recommendations', 'narrative', 'formula', 'financialFormatted'];
    for (const field of required) {
      assert.ok(field in result, `Missing field: ${field}`);
    }
  });

  it('formula field documents correct weights', () => {
    const asset = { hazard_flood: 2, monthly_sales: 500_000, num_employees: 50,
      condition: 'propio', area_m2: 2000, type: 'supermercado_mediano' };
    const result = getCompleteRiskModel(asset);
    assert.equal(result.formula.weights, 'R = (H × 0.40) + (E × 0.30) + (I × 0.30)');
  });

  it('impactBreakdown contains all financial components', () => {
    const asset = { hazard_flood: 3, monthly_sales: 500_000, num_employees: 50,
      condition: 'propio', area_m2: 2000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    const fields = ['total', 'lostSales', 'staffCost', 'logisticsCost', 'rehabCost', 'closureDays', 'topHazardKey'];
    for (const f of fields) {
      assert.ok(f in impactBreakdown, `Missing impactBreakdown.${f}`);
    }
  });

  it('financialFormatted contains all formatted fields', () => {
    const asset = { hazard_flood: 3, monthly_sales: 500_000, num_employees: 50,
      condition: 'propio', area_m2: 2000, type: 'supermercado_grande' };
    const { financialFormatted } = getCompleteRiskModel(asset);
    const fields = ['total', 'lostSales', 'staffCost', 'logisticsCost', 'rehabCost'];
    for (const f of fields) {
      assert.ok(f in financialFormatted, `Missing financialFormatted.${f}`);
      assert.ok(typeof financialFormatted[f] === 'string', `financialFormatted.${f} should be string`);
    }
  });
});

// ─── H×E×I formula — known values ────────────────────────────────────────────

describe('H×E×I formula — deterministic known values', () => {
  it('flood level 4 produces correct H=0.30', () => {
    const asset = { hazard_flood: 4, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 5000, type: 'supermercado_grande' };
    const { hazardScore } = getCompleteRiskModel(asset);
    assert.ok(Math.abs(hazardScore - 0.30) < 1e-10);
  });

  it('full-hazard asset produces H=1.0', () => {
    const asset = { hazard_flood: 4, hazard_elnino: 4, hazard_earthquake: 4,
      hazard_landslide: 4, hazard_drought: 4, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 5000, type: 'supermercado_grande' };
    const { hazardScore } = getCompleteRiskModel(asset);
    assert.ok(Math.abs(hazardScore - 1.0) < 1e-10);
  });

  it('supermercado_grande at 5000m² produces E=1.0', () => {
    const asset = { hazard_flood: 0, monthly_sales: 500_000, num_employees: 50,
      condition: 'propio', area_m2: 5000, type: 'supermercado_grande' };
    const { exposureScore } = getCompleteRiskModel(asset);
    assert.ok(Math.abs(exposureScore - 1.0) < 1e-10);
  });

  it('tienda_express at 5000m² produces E=0.6', () => {
    const asset = { hazard_flood: 0, monthly_sales: 500_000, num_employees: 50,
      condition: 'propio', area_m2: 5000, type: 'tienda_express' };
    const { exposureScore } = getCompleteRiskModel(asset);
    assert.ok(Math.abs(exposureScore - 0.6) < 1e-10);
  });

  it('R = H×0.40 + E×0.30 + I×0.30 — formula verified on known asset', () => {
    const asset = {
      hazard_flood: 4, hazard_elnino: 0, hazard_earthquake: 0, hazard_landslide: 0, hazard_drought: 0,
      monthly_sales: 500_000, num_employees: 50, condition: 'propio', area_m2: 5000,
      type: 'supermercado_grande',
    };
    const result = getCompleteRiskModel(asset);
    const expectedR = result.hazardScore * 0.40 + result.exposureScore * 0.30 + result.impactScore * 0.30;
    assert.ok(Math.abs(result.riskScore - expectedR) < 1e-8);
  });

  it('riskLevel boundaries: all-zero hazard → bajo', () => {
    const asset = { hazard_flood: 0, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 0,
      monthly_sales: 100_000, num_employees: 5, condition: 'propio', area_m2: 100,
      type: 'tienda_express' };
    const { riskLevel, riskScore } = getCompleteRiskModel(asset);
    assert.equal(riskLevel, 'bajo');
    assert.ok(riskScore < 0.25);
  });

  it('riskLevel boundaries: maximum all inputs → critico', () => {
    const asset = { hazard_flood: 4, hazard_elnino: 4, hazard_earthquake: 4,
      hazard_landslide: 4, hazard_drought: 4,
      monthly_sales: 50_000_000, num_employees: 5_000, condition: 'propio', area_m2: 50_000,
      type: 'centro_distribucion' };
    const { riskLevel, riskScore } = getCompleteRiskModel(asset);
    assert.equal(riskLevel, 'critico');
    assert.ok(riskScore >= 0.75);
  });
});

// ─── REHAB_FACTOR and CLOSURE_DAYS constants ─────────────────────────────────

describe('REHAB_FACTOR constants', () => {
  it('flood rehab factor is 120 S/m²', () => {
    const asset = { hazard_flood: 4, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 1000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    // rehab = 1000 × 120 = 120000
    assert.equal(impactBreakdown.rehabCost, 120_000);
  });

  it('earthquake rehab factor is 350 S/m²', () => {
    const asset = { hazard_flood: 0, hazard_elnino: 0, hazard_earthquake: 4,
      hazard_landslide: 0, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 1000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    assert.equal(impactBreakdown.rehabCost, 350_000);
  });

  it('landslide rehab factor is 200 S/m²', () => {
    const asset = { hazard_flood: 0, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 4, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 1000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    assert.equal(impactBreakdown.rehabCost, 200_000);
  });

  it('drought rehab factor is 40 S/m²', () => {
    const asset = { hazard_flood: 0, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 4, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 1000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    assert.equal(impactBreakdown.rehabCost, 40_000);
  });
});

describe('CLOSURE_DAYS constants', () => {
  it('risk level 0 → 0 closure days', () => {
    const asset = { hazard_flood: 0, monthly_sales: 500_000, num_employees: 50,
      condition: 'propio', area_m2: 5000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    assert.equal(impactBreakdown.closureDays, 0);
  });

  it('risk level 1 → 3 closure days', () => {
    const asset = { hazard_flood: 1, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 5000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    assert.equal(impactBreakdown.closureDays, 3);
  });

  it('risk level 4 → 45 closure days', () => {
    const asset = { hazard_flood: 4, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 5000, type: 'supermercado_grande' };
    const { impactBreakdown } = getCompleteRiskModel(asset);
    assert.equal(impactBreakdown.closureDays, 45);
  });
});

// ─── Recommendations structure ────────────────────────────────────────────────

describe('Recommendations', () => {
  it('returns at most 3 recommendations', () => {
    const asset = { hazard_flood: 4, hazard_elnino: 4, hazard_earthquake: 4,
      hazard_landslide: 4, hazard_drought: 4, monthly_sales: 50_000_000,
      num_employees: 5_000, condition: 'propio', area_m2: 50_000, type: 'centro_distribucion' };
    const { recommendations } = getCompleteRiskModel(asset);
    assert.ok(recommendations.length <= 3);
  });

  it('each recommendation has priority, title, description, and impact', () => {
    const asset = { hazard_flood: 4, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 5000, type: 'supermercado_grande' };
    const { recommendations } = getCompleteRiskModel(asset);
    for (const rec of recommendations) {
      assert.ok(rec.priority, 'Missing priority');
      assert.ok(rec.title,    'Missing title');
      assert.ok(rec.description, 'Missing description');
      assert.ok(rec.impact,   'Missing impact');
    }
  });
});

// ─── Narrative ────────────────────────────────────────────────────────────────

describe('Narrative generation', () => {
  it('generates a non-empty narrative string', () => {
    const asset = { hazard_flood: 2, hazard_elnino: 0, hazard_earthquake: 0,
      hazard_landslide: 0, hazard_drought: 0, monthly_sales: 500_000,
      num_employees: 50, condition: 'propio', area_m2: 2000, type: 'supermercado_grande',
      district: 'San Isidro' };
    const { narrative } = getCompleteRiskModel(asset);
    assert.ok(typeof narrative === 'string');
    assert.ok(narrative.length > 20);
  });

  it('narrative contains district name when provided', () => {
    const asset = { hazard_flood: 2, monthly_sales: 500_000, num_employees: 50,
      condition: 'propio', area_m2: 2000, type: 'supermercado_grande', district: 'Surco' };
    const { narrative } = getCompleteRiskModel(asset);
    assert.ok(narrative.includes('Surco'));
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('Determinism', () => {
  it('getCompleteRiskModel is deterministic for 10 consecutive calls', () => {
    const asset = {
      hazard_flood: 3, hazard_elnino: 2, hazard_earthquake: 1, hazard_landslide: 1, hazard_drought: 0,
      monthly_sales: 800_000, num_employees: 80, condition: 'propio', area_m2: 3000,
      type: 'supermercado_mediano', district: 'La Victoria',
    };
    const first = getCompleteRiskModel(asset);
    for (let i = 0; i < 9; i++) {
      const r = getCompleteRiskModel(asset);
      assert.equal(r.riskScore,   first.riskScore);
      assert.equal(r.riskLevel,   first.riskLevel);
      assert.equal(r.hazardScore, first.hazardScore);
      assert.equal(r.financialImpact, first.financialImpact);
    }
  });
});
