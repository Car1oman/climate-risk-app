import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitGev,
  computeReturnLevels,
  computeAAL,
  generateExceedanceCurve,
} from '../../../server/scientific/extremeValueAnalysis.js';

describe('extremeValueAnalysis — GEV fitting', () => {
  it('fits GEV to ensemble data and returns valid params', () => {
    const values = [15, 18, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45];
    const params = fitGev(values);
    assert.ok(params, 'should return params');
    assert.ok(Number.isFinite(params.location), 'location should be finite');
    assert.ok(Number.isFinite(params.scale), 'scale should be finite');
    assert.ok(Number.isFinite(params.shape), 'shape should be finite');
    assert.ok(params.scale > 0, 'scale should be positive');
  });

  it('returns null for fewer than 10 values', () => {
    assert.equal(fitGev([1, 2, 3]), null);
  });

  it('returns null for empty array', () => {
    assert.equal(fitGev([]), null);
  });

  it('filters out non-finite values', () => {
    const values = [15, 18, null, 22, 25, undefined, 28, 30, 32, 35, 38, 40];
    const params = fitGev(values);
    assert.ok(params, 'should handle mixed valid/invalid');
  });
});

describe('extremeValueAnalysis — return levels', () => {
  const values = [10, 12, 15, 18, 20, 22, 25, 28, 30, 33, 35, 38];

  it('computes return levels for all standard periods', () => {
    const result = computeReturnLevels(values);
    assert.ok(result, 'should return result');
    assert.ok(result.return_levels['2'] != null, 'RP2');
    assert.ok(result.return_levels['10'] != null, 'RP10');
    assert.ok(result.return_levels['50'] != null, 'RP50');
    assert.ok(result.return_levels['100'] != null, 'RP100');
    assert.ok(result.return_levels['500'] != null, 'RP500');
  });

  it('return levels increase with return period', () => {
    const result = computeReturnLevels(values);
    const rl = result.return_levels;
    assert.ok(rl['2'] < rl['10'], 'RP2 < RP10');
    assert.ok(rl['10'] < rl['50'], 'RP10 < RP50');
    assert.ok(rl['50'] < rl['100'], 'RP50 < RP100');
    assert.ok(rl['100'] < rl['500'], 'RP100 < RP500');
  });

  it('includes confidence intervals', () => {
    const result = computeReturnLevels(values);
    assert.ok(result.confidence_intervals, 'should have CI');
    assert.ok(result.confidence_intervals['10'].p50 != null, 'CI should have P50');
  });
});

describe('extremeValueAnalysis — AAL', () => {
  const values = [10, 12, 15, 18, 20, 22, 25, 28, 30, 33, 35, 38];

  it('computes positive AAL with default loss function', () => {
    const result = computeAAL(values);
    assert.ok(result, 'should return result');
    assert.ok(result.aal_usd > 0, 'AAL should be positive');
    assert.ok(Number.isInteger(result.aal_usd), 'AAL should be integer');
  });

  it('computes AAL with custom loss function (intensity × 1000)', () => {
    const result = computeAAL(values, v => v * 1000);
    assert.ok(result, 'should return result');
    assert.ok(result.aal_usd > 0, 'AAL should be positive');
  });

  it('AAL with custom multiplier is proportional to default', () => {
    const defaultResult = computeAAL(values);
    const scaledResult = computeAAL(values, v => v * 100);
    assert.ok(scaledResult.aal_usd > defaultResult.aal_usd, 'scaled AAL should be larger');
  });

  it('return_levels match between computeReturnLevels and computeAAL', () => {
    const rpResult = computeReturnLevels(values);
    const aalResult = computeAAL(values);
    assert.equal(
      aalResult.return_levels['100'],
      rpResult.return_levels['100'],
    );
  });
});

describe('extremeValueAnalysis — exceedance curve', () => {
  it('generates requested number of points', () => {
    const values = [10, 12, 15, 18, 20, 22, 25, 28, 30, 33, 35, 38];
    const params = fitGev(values);
    const curve = generateExceedanceCurve(params, 20);
    assert.equal(curve.length, 20);
    assert.ok(curve[0].loss > 0);
    assert.ok(curve[0].p_exceed >= 0);
  });

  it('exceedance probability decreases as loss increases', () => {
    const values = [10, 12, 15, 18, 20, 22, 25, 28, 30, 33, 35, 38];
    const params = fitGev(values);
    const curve = generateExceedanceCurve(params, 10);
    for (let i = 1; i < curve.length; i++) {
      assert.ok(curve[i].p_exceed <= curve[i - 1].p_exceed,
        `p_exceed should not increase at index ${i}`);
    }
  });
});
