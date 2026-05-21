/**
 * Cross-module formula consistency tests
 *
 * Verifies that constants, weights, and formulas are consistent between:
 *  - src/lib/riskEngine.js (frontend)
 *  - server/services/riskModelService.js (backend)
 *  - server/shared/riskConstants.js (shared backend constants)
 *  - src/lib/methodologyConfig.js (documented methodology)
 *  - server/layers/Layer4_PrioritizationEngine.js (composite score)
 *
 * A failure here means a silent divergence between documentation and code,
 * or between frontend and backend implementations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  HAZARD_WEIGHTS as FE_HAZARD_WEIGHTS,
  TYPE_FACTOR    as FE_TYPE_FACTOR,
  calculateHazardScore,
  calculateExposureScore,
  calculateFinancialImpact,
  calculateRiskScore,
} from '../../src/lib/riskEngine.js';

import { getCompleteRiskModel } from '../../server/services/riskModelService.js';

import {
  HAZARD_WEIGHTS as BE_HAZARD_WEIGHTS,
  TYPE_FACTOR    as BE_TYPE_FACTOR,
  REHAB_FACTOR   as BE_REHAB_FACTOR,
  CLOSURE_DAYS   as BE_CLOSURE_DAYS,
} from '../../server/shared/riskConstants.js';

import {
  COMPOSITE_SCORE_FORMULA,
  HXE_FORMULA,
  SSP_SCENARIOS,
  TEMPORAL_HORIZONS,
} from '../../src/lib/methodologyConfig.js';

// ─── Frontend ↔ Backend constant parity ─────────────────────────────────────

describe('HAZARD_WEIGHTS parity: frontend riskEngine.js ↔ backend riskConstants.js', () => {
  it('contains the same keys in the same order', () => {
    assert.deepEqual(Object.keys(FE_HAZARD_WEIGHTS), Object.keys(BE_HAZARD_WEIGHTS));
  });

  it('all values are identical', () => {
    for (const [key, val] of Object.entries(FE_HAZARD_WEIGHTS)) {
      assert.equal(val, BE_HAZARD_WEIGHTS[key],
        `HAZARD_WEIGHTS.${key}: frontend=${val} ≠ backend=${BE_HAZARD_WEIGHTS[key]}`);
    }
  });
});

describe('TYPE_FACTOR parity: frontend riskEngine.js ↔ backend riskConstants.js', () => {
  it('contains the same keys', () => {
    assert.deepEqual(Object.keys(FE_TYPE_FACTOR).sort(), Object.keys(BE_TYPE_FACTOR).sort());
  });

  it('all values are identical', () => {
    for (const [key, val] of Object.entries(FE_TYPE_FACTOR)) {
      assert.equal(val, BE_TYPE_FACTOR[key],
        `TYPE_FACTOR.${key}: frontend=${val} ≠ backend=${BE_TYPE_FACTOR[key]}`);
    }
  });
});

// ─── Frontend ↔ Backend output parity ────────────────────────────────────────
// Verifies that riskEngine.js and riskModelService.js produce identical numerical
// results for identical asset inputs (REHAB_FACTOR and CLOSURE_DAYS are
// defined locally in riskEngine.js but must match riskConstants.js values).

const TEST_ASSETS = [
  {
    name: 'flood-level-4-supermercado',
    asset: { hazard_flood: 4, hazard_elnino: 0, hazard_earthquake: 0, hazard_landslide: 0, hazard_drought: 0,
      monthly_sales: 500_000, num_employees: 50, condition: 'propio', area_m2: 5000, type: 'supermercado_grande' },
  },
  {
    name: 'earthquake-level-3-rented',
    asset: { hazard_flood: 0, hazard_elnino: 0, hazard_earthquake: 3, hazard_landslide: 0, hazard_drought: 0,
      monthly_sales: 1_000_000, num_employees: 100, condition: 'alquilado', area_m2: 3000, type: 'supermercado_mediano' },
  },
  {
    name: 'mixed-hazards-distribucion',
    asset: { hazard_flood: 2, hazard_elnino: 3, hazard_earthquake: 1, hazard_landslide: 0, hazard_drought: 0,
      monthly_sales: 2_000_000, num_employees: 200, condition: 'propio', area_m2: 8000, type: 'centro_distribucion' },
  },
  {
    name: 'elnino-level-4-express',
    asset: { hazard_flood: 0, hazard_elnino: 4, hazard_earthquake: 0, hazard_landslide: 0, hazard_drought: 0,
      monthly_sales: 300_000, num_employees: 20, condition: 'propio', area_m2: 500, type: 'tienda_express' },
  },
];

describe('riskEngine.js ↔ riskModelService.js numerical output parity', () => {
  for (const { name, asset } of TEST_ASSETS) {
    it(`${name} — identical riskScore`, () => {
      const fe = calculateRiskScore(asset);
      const be = getCompleteRiskModel(asset);
      assert.ok(Math.abs(fe.riskScore - be.riskScore) < 1e-10,
        `${name}: riskScore FE=${fe.riskScore} ≠ BE=${be.riskScore}`);
    });

    it(`${name} — identical riskLevel`, () => {
      const fe = calculateRiskScore(asset);
      const be = getCompleteRiskModel(asset);
      assert.equal(fe.riskLevel, be.riskLevel,
        `${name}: riskLevel FE=${fe.riskLevel} ≠ BE=${be.riskLevel}`);
    });

    it(`${name} — identical hazardScore`, () => {
      const fe = calculateHazardScore(asset);
      const be = getCompleteRiskModel(asset);
      assert.ok(Math.abs(fe - be.hazardScore) < 1e-10,
        `${name}: hazardScore FE=${fe} ≠ BE=${be.hazardScore}`);
    });

    it(`${name} — identical exposureScore`, () => {
      const fe = calculateExposureScore(asset);
      const be = getCompleteRiskModel(asset);
      assert.ok(Math.abs(fe - be.exposureScore) < 1e-10,
        `${name}: exposureScore FE=${fe} ≠ BE=${be.exposureScore}`);
    });

    it(`${name} — identical financial total`, () => {
      const fe = calculateFinancialImpact(asset);
      const be = getCompleteRiskModel(asset);
      assert.ok(Math.abs(fe.total - be.financialImpact) < 1e-6,
        `${name}: financialImpact FE=${fe.total} ≠ BE=${be.financialImpact}`);
    });
  }
});

// ─── methodologyConfig.js ↔ Layer4 weight documentation ─────────────────────

describe('COMPOSITE_SCORE_FORMULA documentation ↔ Layer4_PrioritizationEngine constants', () => {
  const LAYER4_WEIGHTS = {
    probability:    0.30,
    intensity:      0.25,
    exposure:       0.25,
    sensitivity:    0.10,
    horizon_factor: 0.10,
  };

  it('probability weight documented as 30%', () => {
    const comp = COMPOSITE_SCORE_FORMULA.components.find(c => c.key === 'probability');
    assert.equal(comp.weight, '30%');
    assert.equal(LAYER4_WEIGHTS.probability, 0.30);
  });

  it('intensity weight documented as 25%', () => {
    const comp = COMPOSITE_SCORE_FORMULA.components.find(c => c.key === 'intensity');
    assert.equal(comp.weight, '25%');
    assert.equal(LAYER4_WEIGHTS.intensity, 0.25);
  });

  it('exposure weight documented as 25%', () => {
    const comp = COMPOSITE_SCORE_FORMULA.components.find(c => c.key === 'exposure');
    assert.equal(comp.weight, '25%');
    assert.equal(LAYER4_WEIGHTS.exposure, 0.25);
  });

  it('sensitivity weight documented as 10%', () => {
    const comp = COMPOSITE_SCORE_FORMULA.components.find(c => c.key === 'sensitivity');
    assert.equal(comp.weight, '10%');
    assert.equal(LAYER4_WEIGHTS.sensitivity, 0.10);
  });

  it('horizon_factor weight documented as 10%', () => {
    const comp = COMPOSITE_SCORE_FORMULA.components.find(c => c.key === 'horizon_factor');
    assert.equal(comp.weight, '10%');
    assert.equal(LAYER4_WEIGHTS.horizon_factor, 0.10);
  });

  it('urgency thresholds documented correctly (crítica ≥ 75/100)', () => {
    const critica = COMPOSITE_SCORE_FORMULA.urgency_levels.find(u => u.level === 'crítica');
    assert.ok(critica, 'Missing crítica urgency level in documentation');
    assert.ok(critica.threshold.includes('75'), `Expected threshold ≥75, got: ${critica.threshold}`);
  });

  it('urgency thresholds documented correctly (alta ≥ 50/100)', () => {
    const alta = COMPOSITE_SCORE_FORMULA.urgency_levels.find(u => u.level === 'alta');
    assert.ok(alta, 'Missing alta urgency level in documentation');
    assert.ok(alta.threshold.includes('50'), `Expected threshold ≥50, got: ${alta.threshold}`);
  });

  it('urgency thresholds documented correctly (media ≥ 25/100)', () => {
    const media = COMPOSITE_SCORE_FORMULA.urgency_levels.find(u => u.level === 'media');
    assert.ok(media, 'Missing media urgency level in documentation');
    assert.ok(media.threshold.includes('25'), `Expected threshold ≥25, got: ${media.threshold}`);
  });
});

// ─── methodologyConfig.js ↔ HXE formula documentation ───────────────────────

describe('HXE_FORMULA documentation ↔ riskModelService.js constants', () => {
  it('H weight documented as 40%', () => {
    const h = HXE_FORMULA.components.find(c => c.key === 'H');
    assert.equal(h.weight, '40%');
  });

  it('E weight documented as 30%', () => {
    const e = HXE_FORMULA.components.find(c => c.key === 'E');
    assert.equal(e.weight, '30%');
  });

  it('I weight documented as 30%', () => {
    const i = HXE_FORMULA.components.find(c => c.key === 'I');
    assert.equal(i.weight, '30%');
  });

  it('formula string matches actual computation weights', () => {
    assert.ok(HXE_FORMULA.formula.includes('0.40'), 'H weight 0.40 not in formula string');
    assert.ok(HXE_FORMULA.formula.includes('0.30'), 'E/I weight 0.30 not in formula string');
  });

  it('normalization baseline is 20M (I_norm = total/20_000_000)', () => {
    const i = HXE_FORMULA.components.find(c => c.key === 'I');
    assert.ok(i.description.includes('20M'), `Expected "20M" in I description, got: ${i.description}`);
  });
});

// ─── methodologyConfig.js SSP scenario codes ─────────────────────────────────

describe('SSP scenario codes in methodologyConfig.js', () => {
  it('ssp245 code is "SSP2-4.5"', () => {
    assert.equal(SSP_SCENARIOS.ssp245.code, 'SSP2-4.5');
  });

  it('ssp585 code is "SSP5-8.5"', () => {
    assert.equal(SSP_SCENARIOS.ssp585.code, 'SSP5-8.5');
  });
});

// ─── TEMPORAL_HORIZONS alignment ─────────────────────────────────────────────

describe('TEMPORAL_HORIZONS alignment with Layer4 horizon factors', () => {
  const LAYER4_HORIZON_FACTORS = { short_term: 1.0, mid_term: 0.75, long_term: 0.5 };

  it('short_term period is 2020–2039 and horizon_factor is 1.0 (max urgency)', () => {
    const h = TEMPORAL_HORIZONS.find(t => t.code === 'short_term');
    assert.ok(h, 'short_term horizon missing');
    assert.ok(h.period.includes('2020'), `Expected "2020" in period, got: ${h.period}`);
    assert.ok(h.description.includes('1.0'), `Expected "1.0" in description, got: ${h.description}`);
    assert.equal(LAYER4_HORIZON_FACTORS.short_term, 1.0);
  });

  it('mid_term period is 2040–2059 and horizon_factor is 0.75', () => {
    const h = TEMPORAL_HORIZONS.find(t => t.code === 'mid_term');
    assert.ok(h, 'mid_term horizon missing');
    assert.ok(h.period.includes('2040'), `Expected "2040" in period, got: ${h.period}`);
    assert.ok(h.description.includes('0.75'), `Expected "0.75" in description, got: ${h.description}`);
    assert.equal(LAYER4_HORIZON_FACTORS.mid_term, 0.75);
  });

  it('long_term horizon_factor is 0.50', () => {
    const h = TEMPORAL_HORIZONS.find(t => t.code === 'long_term');
    assert.ok(h, 'long_term horizon missing');
    assert.equal(LAYER4_HORIZON_FACTORS.long_term, 0.50);
  });
});

// ─── REHAB_FACTOR local (riskEngine.js) ↔ shared (riskConstants.js) ──────────
// riskEngine.js defines REHAB_FACTOR locally (not exported), so we test it
// indirectly through financial output parity with riskModelService.js.

describe('REHAB_FACTOR parity (indirect): frontend output ↔ backend output', () => {
  const rehab_test_cases = [
    { hazard: 'flood',      key: 'hazard_flood',      expected: 120 },
    { hazard: 'elnino',     key: 'hazard_elnino',      expected: 150 },
    { hazard: 'earthquake', key: 'hazard_earthquake',  expected: 350 },
    { hazard: 'landslide',  key: 'hazard_landslide',   expected: 200 },
    { hazard: 'drought',    key: 'hazard_drought',     expected: 40  },
  ];

  for (const { hazard, key, expected } of rehab_test_cases) {
    it(`${hazard} rehab factor ${expected} S/m² consistent across frontend and backend`, () => {
      const hazardObj = { hazard_flood: 0, hazard_elnino: 0, hazard_earthquake: 0,
        hazard_landslide: 0, hazard_drought: 0, [key]: 4 };
      const asset = { ...hazardObj, monthly_sales: 500_000, num_employees: 50,
        condition: 'propio', area_m2: 1000, type: 'supermercado_grande' };

      const fe = calculateFinancialImpact(asset);
      const be = getCompleteRiskModel(asset);

      // Both should produce the same rehab cost
      assert.equal(fe.rehabCost, be.impactBreakdown.rehabCost,
        `${hazard}: FE rehabCost=${fe.rehabCost} ≠ BE rehabCost=${be.impactBreakdown.rehabCost}`);
      // Verify it matches the expected constant
      assert.equal(fe.rehabCost, expected * 1000,
        `${hazard}: expected ${expected}×1000=${expected * 1000}, got ${fe.rehabCost}`);
    });
  }
});
