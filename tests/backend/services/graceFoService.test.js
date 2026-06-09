import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { downscaleToPoint, loadMasconFile, classifyDroughtSeverity } from '../../../server/services/graceFoDownscale.js';
import { buildGraceFoNarrative } from '../../../server/services/graceFoService.js';

const origFetch = globalThis.fetch;

function mockFetch(status, body) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  });
}

describe('graceFoDownscale', () => {
  describe('downscaleToPoint', () => {
    it('returns null for empty grid', () => {
      assert.equal(downscaleToPoint([], 0, 0), null);
    });

    it('returns null for null grid', () => {
      assert.equal(downscaleToPoint(null, 0, 0), null);
    });

    it('returns nearest cell value', () => {
      const grid = [
        { lat: -10, lon: -80, value: -3 },
        { lat: -12, lon: -77, value: -8 },
        { lat: -14, lon: -75, value: -5 },
      ];
      const val = downscaleToPoint(grid, -12.1, -77.1);
      assert.equal(val, -8);
    });

    it('returns null when point is too far from grid', () => {
      const grid = [{ lat: 0, lon: 0, value: 1 }];
      const val = downscaleToPoint(grid, 45, 45);
      assert.equal(val, null);
    });
  });

  describe('loadMasconFile', () => {
    it('returns null for null input', () => {
      assert.equal(loadMasconFile(null), null);
    });

    it('parses TELLUS format with columns/data', () => {
      const input = {
        columns: ['lat', 'lon', 'tws'],
        data: [[-12, -77, -5], [-13, -78, -3]],
      };
      const result = loadMasconFile(input);
      assert.equal(result.length, 2);
      assert.equal(result[0].value, -5);
    });

    it('parses array format', () => {
      const input = [{ lat: -12, lon: -77, tws: -5 }, { lat: -13, lon: -78, tws: -3 }];
      const result = loadMasconFile(input);
      assert.equal(result.length, 2);
    });

    it('returns null for unrecognised format', () => {
      assert.equal(loadMasconFile({ foo: 'bar' }), null);
    });
  });

  describe('classifyDroughtSeverity', () => {
    it('returns none for anomaly >= -2', () => {
      assert.equal(classifyDroughtSeverity(-1), 'none');
      assert.equal(classifyDroughtSeverity(0), 'none');
    });

    it('returns moderate for anomaly between -2 and -5', () => {
      assert.equal(classifyDroughtSeverity(-3), 'moderate');
    });

    it('returns severe for anomaly between -5 and -10', () => {
      assert.equal(classifyDroughtSeverity(-7), 'severe');
    });

    it('returns extreme for anomaly <= -10', () => {
      assert.equal(classifyDroughtSeverity(-12), 'extreme');
    });
  });
});

describe('graceFoService narrative', () => {
  describe('buildGraceFoNarrative', () => {
    it('returns empty string for null', () => {
      assert.equal(buildGraceFoNarrative(null), '');
    });

    it('returns descriptive string for normal conditions', () => {
      const text = buildGraceFoNarrative({
        tws_anomaly_cm: -1,
        groundwater_index: 'normal',
        drought_severity: 'none',
      });
      assert.ok(text.includes('TWS'));
      assert.ok(text.includes('GRACE-FO'));
    });

    it('returns descriptive string for extreme drought', () => {
      const text = buildGraceFoNarrative({
        tws_anomaly_cm: -15,
        groundwater_index: 'extremo',
        drought_severity: 'extreme',
      });
      assert.ok(text.includes('extremadamente seco'));
    });
  });
});

describe('graceFoService API', () => {
  after(() => { globalThis.fetch = origFetch; });

  it('getTwsAnomaly returns null when API fails', async () => {
    mockFetch(503, {});
    const { getTwsAnomaly } = await import('../../../server/services/graceFoService.js');
    const result = await getTwsAnomaly(-12, -77);
    assert.equal(result, null);
  });

  it('getTwsTimeSeries returns null when API fails', async () => {
    mockFetch(503, {});
    const { getTwsTimeSeries } = await import('../../../server/services/graceFoService.js');
    const result = await getTwsTimeSeries(-12, -77);
    assert.equal(result, null);
  });
});
