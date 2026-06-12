import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downscaleClimateData, getEffectiveResolution } from '../../../server/services/downscaleService.js';

function makeClimateData(overrides = {}) {
  return {
    historical: {
      tas: 20,
      tasmax: 26,
      pr: 100,
      hd35: 30,
      tr: 60,
      ...overrides.historical,
    },
    short_term: {
      tas: 22,
      tasmax: 28.5,
      pr: 95,
      hd35: 50,
      tr: 75,
      ...overrides.short_term,
    },
    mid_term: {
      tas: 24,
      tasmax: 31,
      pr: 90,
      hd35: 70,
      tr: 85,
      ...overrides.mid_term,
    },
    long_term: {
      tas: 26,
      tasmax: 33,
      pr: 85,
      hd35: 90,
      tr: 95,
      ...overrides.long_term,
    },
  };
}

describe('downscaleService — basic', () => {
  it('returns null when climateData is null', () => {
    const result = downscaleClimateData(null, 500, 200);
    assert.equal(result, null);
  });

  it('returns null when elevations are null', () => {
    const result = downscaleClimateData(makeClimateData(), null, null);
    assert.equal(result, null);
  });

  it('returns null when historical is missing', () => {
    const result = downscaleClimateData({ short_term: { tas: 22 } }, 500, 200);
    assert.equal(result, null);
  });
});

describe('downscaleService — temperature downscaling', () => {
  it('cools temperature when site is higher than cell', () => {
    // Cell at 200m, site at 1000m → +800m → -5.2°C
    const data = makeClimateData();
    const result = downscaleClimateData(data, 1000, 200);
    const ds = result.downscaled_data;
    // Short-term tas: 22 (projected) - 5.2 (lapse) = 16.8
    assert.ok(ds.tas.short_term < data.short_term.tas, 'should be cooler at higher elevation');
    assert.ok(ds.tas.short_term < 20, 'high elevation Andean site should be cool');
  });

  it('warms temperature when site is lower than cell', () => {
    // Cell at 500m, site at sea level 0m → -500m → +3.25°C
    const data = makeClimateData();
    const result = downscaleClimateData(data, 0, 500);
    const ds = result.downscaled_data;
    assert.ok(ds.tas.short_term > data.short_term.tas, 'should be warmer at lower elevation');
  });

  it('preserves CMIP6 anomaly when elevations are equal', () => {
    const data = makeClimateData();
    const result = downscaleClimateData(data, 200, 200);
    const ds = result.downscaled_data;
    // No elevation correction → anomaly = 2.0
    assert.equal(ds.tas.short_term, 22, 'no correction at equal elevation');
  });
});

describe('downscaleService — precipitation downscaling', () => {
  it('increases precipitation at higher elevation (orographic)', () => {
    // Cell at 200m, site at 1200m → +1000m → +80%
    const data = makeClimateData();
    const result = downscaleClimateData(data, 1200, 200);
    const ds = result.downscaled_data;
    // pr short_term: 95 * 1.8 = 171
    assert.ok(ds.pr.short_term > data.short_term.pr, 'more precip at higher elevation');
  });

  it('reduces precipitation enhancement above 1500m (rain shadow)', () => {
    // Cell at 200m, site at 3500m → +3300m → peak at 1500m then decline
    const data = makeClimateData();
    const resultPeak = downscaleClimateData(data, 1700, 200);  // peak +1500m
    const resultHigh = downscaleClimateData(data, 3500, 200);  // above peak
    const dsPeak = resultPeak.downscaled_data;
    const dsHigh = resultHigh.downscaled_data;
    // Above 1500m, orographic enhancement diminishes
    assert.ok(dsHigh.pr.short_term <= dsPeak.pr.short_term, 'rain shadow reduces precip above peak');
  });
});

describe('downscaleService — heat days', () => {
  it('reduces heat days at higher elevation', () => {
    const data = makeClimateData();
    const result = downscaleClimateData(data, 3000, 500);
    const ds = result.downscaled_data;
    assert.ok(ds.hd35.short_term < data.short_term.hd35, 'fewer heat days in Andes');
  });

  it('never produces negative heat days', () => {
    const data = makeClimateData({ short_term: { hd35: 2 } });
    const result = downscaleClimateData(data, 4000, 0);
    const ds = result.downscaled_data;
    assert.ok(ds.hd35.short_term >= 0, 'heat days should not be negative');
  });
});

describe('downscaleService — metadata', () => {
  it('includes applied=true when downscaling occurs', () => {
    const result = downscaleClimateData(makeClimateData(), 500, 200);
    assert.ok(result.downscale_metadata.applied);
    assert.equal(result.downscale_metadata.method, 'delta_elevation_correction');
    assert.equal(result.downscale_metadata.site_elevation_m, 500);
    assert.equal(result.downscale_metadata.cell_elevation_m, 200);
  });

  it('getEffectiveResolution returns correct string', () => {
    const applied = downscaleClimateData(makeClimateData(), 500, 200);
    assert.equal(getEffectiveResolution(applied), '25km_elevation_adjusted');
    assert.equal(getEffectiveResolution(null), '25km_raw');
  });
});

describe('downscaleService — complex terrain scenarios', () => {
  it('Lima coastal plain: cell and site at similar low elevation', () => {
    // Lima: ~12.0°S, 77.0°W, ~150m elevation
    // CMIP6 cell likely similar elevation at coast
    const data = makeClimateData({ historical: { tas: 22, pr: 10 } });
    const result = downscaleClimateData(data, 150, 100);
    const ds = result.downscaled_data;
    // Minimal change: +50m × -0.0065 = -0.325°C
    const expectedDelta = 50 * -0.0065;
    const actualDelta = ds.tas.short_term - data.short_term.tas;
    assert.ok(Math.abs(actualDelta - expectedDelta) < 0.1, 'minimal temperature correction at coast');
    // Precip ratio (downscaled/original) should be close to 1 at similar elevation
    const precipRatio = ds.pr.short_term / data.short_term.pr;
    assert.ok(Math.abs(precipRatio - 1) < 0.05, 'minimal precip change at similar elevation');
  });

  it('Cusco Andean valley: large elevation correction', () => {
    // Cusco: ~13.5°S, 71.9°W, ~3400m elevation
    // CMIP6 cell at ~2500m (valley average)
    const data = makeClimateData({ historical: { tas: 18, pr: 80 } });
    const result = downscaleClimateData(data, 3400, 2500);
    const ds = result.downscaled_data;
    // +900m × -0.0065 = -5.85°C elevation correction
    const expectedTemp = data.short_term.tas + (18 - data.historical.tas) + (900 * -0.0065);
    assert.ok(ds.tas.short_term < data.short_term.tas - 3, 'significantly colder in Andes');
    // Precip enhanced by orographic effect
    assert.ok(ds.pr.short_term > data.short_term.pr, 'more precip on windward slope');
  });
});
