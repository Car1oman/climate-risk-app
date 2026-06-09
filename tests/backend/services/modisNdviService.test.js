import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { calcNdviAnomaly, classifyVegetationHealth } from '../../../server/services/modisNdviUtils.js';
import { buildNdviNarrative } from '../../../server/services/modisNdviService.js';

const origFetch = globalThis.fetch;

function mockFetch(status, body) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  });
}

describe('modisNdviUtils', () => {
  describe('calcNdviAnomaly', () => {
    it('calculates anomaly correctly', () => {
      const { anomaly } = calcNdviAnomaly(0.3, 0.5);
      assert.equal(anomaly, -0.2);
    });

    it('calculates z-score when stdDev provided', () => {
      const { zScore } = calcNdviAnomaly(0.3, 0.5, 0.1);
      assert.equal(zScore, -2);
    });

    it('returns null z-score when stdDev is 0', () => {
      const { zScore } = calcNdviAnomaly(0.3, 0.5, 0);
      assert.equal(zScore, null);
    });

    it('returns null z-score when stdDev is null', () => {
      const { zScore } = calcNdviAnomaly(0.3, 0.5, null);
      assert.equal(zScore, null);
    });
  });

  describe('classifyVegetationHealth', () => {
    it('classifies severe_stress when anomaly < -0.4', () => {
      assert.equal(classifyVegetationHealth(0.3, -0.5), 'severe_stress');
    });

    it('classifies stress when anomaly < -0.2', () => {
      assert.equal(classifyVegetationHealth(0.3, -0.3), 'stress');
    });

    it('classifies stress when ndvi < 0.15', () => {
      assert.equal(classifyVegetationHealth(0.1, 0), 'stress');
    });

    it('classifies good when ndvi >= 0.15 and anomaly >= -0.2', () => {
      assert.equal(classifyVegetationHealth(0.6, -0.1), 'good');
    });

    it('classifies stress when anomaly just below -0.2', () => {
      assert.equal(classifyVegetationHealth(0.4, -0.21), 'stress');
    });

    it('classifies severe_stress when anomaly just below -0.4', () => {
      assert.equal(classifyVegetationHealth(0.4, -0.41), 'severe_stress');
    });
  });
});

describe('modisNdviService', () => {
  describe('buildNdviNarrative', () => {
    it('returns empty string for null', () => {
      assert.equal(buildNdviNarrative(null), '');
    });

    it('returns descriptive string for stress data', () => {
      const text = buildNdviNarrative({
        current_ndvi: 0.25,
        vegetation_health: 'stress',
        long_term_mean: 0.45,
      });
      assert.ok(text.includes('NDVI'));
      assert.ok(text.includes('estrés'));
    });

    it('returns descriptive string for good health', () => {
      const text = buildNdviNarrative({
        current_ndvi: 0.65,
        vegetation_health: 'good',
        long_term_mean: 0.60,
      });
      assert.ok(text.includes('NDVI'));
      assert.ok(text.includes('saludable'));
    });

    it('returns descriptive string for severe stress', () => {
      const text = buildNdviNarrative({
        current_ndvi: 0.1,
        vegetation_health: 'severe_stress',
        long_term_mean: 0.4,
      });
      assert.ok(text.includes('NDVI'));
      assert.ok(text.includes('estrés severo'));
    });
  });
});

describe('modisNdviService API', () => {
  after(() => { globalThis.fetch = origFetch; });

  it('getRecentNdvi returns null when API fails', async () => {
    mockFetch(503, {});
    const { getRecentNdvi } = await import('../../../server/services/modisNdviService.js');
    const result = await getRecentNdvi(-12, -77);
    assert.equal(result, null);
  });

  it('getNdviAnomaly returns null when API fails', async () => {
    mockFetch(503, {});
    const { getNdviAnomaly } = await import('../../../server/services/modisNdviService.js');
    const result = await getNdviAnomaly(-12, -77);
    assert.equal(result, null);
  });
});
