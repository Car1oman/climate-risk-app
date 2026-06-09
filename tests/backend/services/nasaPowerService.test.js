import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getRecentPowerData, getClimatologyData, getNasaPowerData, buildPowerNarrative } from '../../../server/services/nasaPowerService.js';

// Save original fetch
const origFetch = globalThis.fetch;

function mockFetch(status, body) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 503 ? 'Service Unavailable' : 'OK',
    json: async () => body,
  });
}

describe('nasaPowerService', () => {
  after(() => { globalThis.fetch = origFetch; });

  describe('getRecentPowerData', () => {
    it('returns null when HTTP 503', async () => {
      mockFetch(503, {});
      const result = await getRecentPowerData(-12, -77, ['T2M', 'PRECTOT']);
      assert.equal(result, null);
    });

    it('returns parsed data on success', async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const mockResp = { properties: { parameter: { T2M: { [today]: 25.5 }, PRECTOT: { [today]: 0 } } } };
      mockFetch(200, mockResp);
      const result = await getRecentPowerData(-12, -77, ['T2M', 'PRECTOT']);
      assert.notEqual(result, null);
      assert.equal(typeof result.T2M.value, 'number');
    });

    it('handles invalid response structure', async () => {
      mockFetch(200, { properties: {} });
      const result = await getRecentPowerData(-12, -77, ['T2M']);
      assert.equal(result, null);
    });

    it('returns cached result on repeated call', async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const mockResp = { properties: { parameter: { T2M: { [today]: 25.5 } } } };
      mockFetch(200, mockResp);
      const first = await getRecentPowerData(0, 0, ['T2M']);
      // Second call with same params should hit cache
      const second = await getRecentPowerData(0, 0, ['T2M']);
      assert.deepEqual(first, second);
    });

    it('caches null on failure', async () => {
      mockFetch(503, {});
      await getRecentPowerData(10, 10, ['T2M']);
      // Should return null from cache on second call (no fetch thrown)
      const second = await getRecentPowerData(10, 10, ['T2M']);
      assert.equal(second, null);
    });
  });

  describe('getClimatologyData', () => {
    it('returns null on HTTP error', async () => {
      mockFetch(503, {});
      const result = await getClimatologyData(-12, -77, ['T2M']);
      assert.equal(result, null);
    });

    it('returns 12 monthly values on success', async () => {
      const monthly = {};
      for (let i = 1; i <= 12; i++) monthly[i.toString()] = 20 + i;
      mockFetch(200, { properties: { parameter: { T2M: monthly } } });
      // Use unique coords to avoid cache collision from previous test
      const result = await getClimatologyData(99, 99, ['T2M']);
      assert.notEqual(result, null);
      assert.equal(result.T2M.monthly.length, 12);
    });
  });

  describe('buildPowerNarrative', () => {
    it('returns empty string for null data', () => {
      assert.equal(buildPowerNarrative(null), '');
    });

    it('returns empty string for empty data', () => {
      assert.equal(buildPowerNarrative({}), '');
    });

    it('includes temperature sentence', () => {
      const data = { T2M: { value: 28 } };
      const text = buildPowerNarrative(data);
      assert.ok(text.includes('Temperatura'));
      assert.ok(text.includes('NASA POWER'));
    });

    it('includes precipitation sentence', () => {
      const data = { PRECTOT: { value: 3.5 } };
      const text = buildPowerNarrative(data);
      assert.ok(text.includes('Precipitación'));
      assert.ok(text.includes('NASA POWER'));
    });

    it('includes wind sentence', () => {
      const data = { WS2M: { value: 6.2 } };
      const text = buildPowerNarrative(data);
      assert.ok(text.includes('Viento'));
    });

    it('includes solar radiation sentence', () => {
      const data = { ALLSKY_SFC_SW_DWN: { value: 5.0 } };
      const text = buildPowerNarrative(data);
      assert.ok(text.includes('Radiación solar'));
    });

    it('combines multiple parameters', () => {
      const data = { T2M: { value: 28 }, PRECTOT: { value: 0.5 }, WS2M: { value: 3 } };
      const text = buildPowerNarrative(data);
      const sentences = text.split('.').filter(Boolean);
      assert.ok(sentences.length >= 2);
    });
  });

  describe('getNasaPowerData', () => {
    it('returns null when both sub-calls fail', async () => {
      mockFetch(503, {});
      const result = await getNasaPowerData(-12, -77);
      assert.equal(result, null);
    });

    it('returns partial result when one succeeds', async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const recentResp = { properties: { parameter: { T2M: { [today]: 25 } } } };
      let callCount = 0;
      globalThis.fetch = async () => {
        callCount++;
        const ok = callCount === 1; // first call (recent) succeeds, second (climatology) fails
        return { ok, status: ok ? 200 : 503, statusText: ok ? 'OK' : 'Service Unavailable', json: async () => ok ? recentResp : {} };
      };
      const result = await getNasaPowerData(-12, -77);
      assert.notEqual(result, null);
      assert.notEqual(result.recent, null);
      assert.equal(result.climatology, null);
    });
  });
});
