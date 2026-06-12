/**
 * Extreme Value Analysis — GEV Return Periods & AAL
 *
 * Pure function module. No I/O, no side effects.
 *
 * Implements:
 *   - L-moments parameter estimation for GEV distribution
 *   - Return levels for standard periods (2, 10, 50, 100, 500 years)
 *   - Exceedance probability curve
 *   - AAL (Annual Average Loss) via numerical integration
 *
 * Sources:
 *   Hosking, J.R.M. (1990) — L-moments
 *   IPCC AR6 WG1 — Extreme value analysis methods
 */

// ─── Gamma function (Lanczos approximation) ───────────────────────────────
const GAMMA_P = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

function gamma(z) {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < GAMMA_P.length; i++) {
    x += GAMMA_P[i] / (z + i + 1);
  }
  const t = z + GAMMA_P.length - 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ─── Utility ──────────────────────────────────────────────────────────────

function sortAscending(arr) {
  return [...arr].sort((a, b) => a - b);
}

function isValidNumber(v) {
  return v != null && Number.isFinite(v);
}

// ─── L-moments ────────────────────────────────────────────────────────────

function sampleLmoments(sorted) {
  const n = sorted.length;
  if (n < 4) return null;

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
  for (let j = 0; j < n; j++) {
    const xj = sorted[j];
    const p1 = j / (n - 1);
    const p2 = (j - 1) / (n - 2);
    const p3 = (j - 2) / (n - 3);
    b0 += xj;
    b1 += p1 * xj;
    b2 += p1 * p2 * xj;
    b3 += p1 * p2 * p3 * xj;
  }
  b0 /= n;
  b1 /= n;
  b2 /= n;
  b3 /= n;

  const l1 = b0;
  const l2 = 2 * b1 - b0;
  const l3 = 6 * b2 - 6 * b1 + b0;
  const l4 = 20 * b3 - 30 * b2 + 12 * b1 - b0;

  if (l2 <= 1e-10) return null;

  return { l1, l2, l3, l4, t3: l3 / l2, t4: l4 / l2 };
}

// ─── GEV shape parameter (ξ) estimation from L-skewness ──────────────────

// τ₃ = 2(1 - 3⁻ξ) / (1 - 2⁻ξ) - 3
function gevShapeFromT3(t3) {
  const MAX_ITER = 100;
  const TOL = 1e-10;
  let lo = -0.5, hi = 0.5;

  function tau3(xi) {
    const p2 = Math.pow(2, -xi);
    const p3 = Math.pow(3, -xi);
    return 2 * (1 - p3) / (1 - p2) - 3;
  }

  const t3Lo = tau3(lo);
  const t3Hi = tau3(hi);

  if (t3 <= t3Lo) return lo;
  if (t3 >= t3Hi) return hi;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = tau3(mid) - t3;
    if (Math.abs(fMid) < TOL) return mid;
    if (fMid > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── GEV parameter estimation (L-moments) ────────────────────────────────

function fitGevLmoments(sorted) {
  const lm = sampleLmoments(sorted);
  if (!lm) return null;

  const xi = gevShapeFromT3(lm.t3);
  const g1 = gamma(1 + xi);

  if (!isValidNumber(g1) || g1 <= 0) return null;

  const scale = (lm.l2 * xi) / ((1 - Math.pow(2, -xi)) * g1);
  if (!isValidNumber(scale) || scale <= 0) return null;

  const location = lm.l1 - scale * (1 - g1) / xi;

  return { location, scale, shape: xi, lmoment_t3: lm.t3, lmoment_t4: lm.t4 };
}

// ─── Return level computation ─────────────────────────────────────────────

function gevReturnLevel(returnPeriod, params) {
  const { location, scale, shape } = params;
  const p = 1 - 1 / returnPeriod;

  if (Math.abs(shape) < 1e-10) {
    return location - scale * Math.log(-Math.log(p));
  }
  return location - (scale / shape) * (1 - Math.pow(-Math.log(p), -shape));
}

// ─── Bootstrap confidence intervals ───────────────────────────────────────

function bootstrapCI(sorted, nBootstrap = 500) {
  const n = sorted.length;
  const rps = [2, 10, 50, 100, 500];
  const allLevels = [];

  for (let b = 0; b < nBootstrap; b++) {
    const sample = [];
    for (let i = 0; i < n; i++) {
      sample.push(sorted[Math.floor(Math.random() * n)]);
    }
    const sortedSample = sortAscending(sample);
    const params = fitGevLmoments(sortedSample);
    if (!params) continue;
    allLevels.push(rps.map(rp => gevReturnLevel(rp, params)));
  }

  if (allLevels.length < 100) return null;

  const result = {};
  for (let i = 0; i < rps.length; i++) {
    const vals = allLevels.map(row => row[i]).sort((a, b) => a - b);
    result[String(rps[i])] = {
      p50: vals[Math.floor(vals.length * 0.50)],
      p10: vals[Math.floor(vals.length * 0.10)],
      p90: vals[Math.floor(vals.length * 0.90)],
    };
  }
  return result;
}

// ─── AAL computation (internal, from GEV params) ──────────────────────────

function computeAALFromGEV(params, lossFn, nSteps = 200) {
  const { location, scale, shape } = params;
  const minLoss = Math.max(0, gevReturnLevel(2, params));
  const maxLoss = gevReturnLevel(1000, params);

  if (!isValidNumber(minLoss) || !isValidNumber(maxLoss) || maxLoss <= minLoss) return null;

  const step = (maxLoss - minLoss) / nSteps;
  let aal = 0;

  function exceedProb(x) {
    if (Math.abs(shape) < 1e-10) {
      return 1 - Math.exp(-Math.exp(-(x - location) / scale));
    }
    const y = 1 + shape * (x - location) / scale;
    if (y <= 0) return shape < 0 ? 0 : 1;
    return 1 - Math.exp(-Math.pow(y, -1 / shape));
  }

  for (let i = 0; i < nSteps; i++) {
    const loss = minLoss + i * step;
    const dp = exceedProb(loss) - exceedProb(loss + step);
    if (dp > 0) aal += lossFn(loss) * dp;
  }
  return aal;
}

// ─── AAL up to a given return period (for CI computation) ─────────────────

function computeAALUpToRP(params, lossFn, returnPeriod) {
  const { location, scale, shape } = params;
  const maxVal = gevReturnLevel(returnPeriod, params);
  if (!isValidNumber(maxVal)) return 0;

  const nSteps = 200;
  const step = maxVal / nSteps;
  let aal = 0;

  function exceedProb(x) {
    if (Math.abs(shape) < 1e-10) {
      return 1 - Math.exp(-Math.exp(-(x - location) / scale));
    }
    const y = 1 + shape * (x - location) / scale;
    if (y <= 0) return shape < 0 ? 0 : 1;
    return 1 - Math.exp(-Math.pow(y, -1 / shape));
  }

  for (let i = 0; i < nSteps; i++) {
    const loss = i * step;
    const dp = exceedProb(loss) - exceedProb(loss + step);
    if (dp > 0) aal += lossFn(loss) * dp;
  }
  return aal;
}

// ─── Default loss function ────────────────────────────────────────────────

function defaultLossFn(intensity) {
  return intensity;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fit GEV distribution to ensemble values using L-moments.
 * @param {number[]} values - CMIP6 ensemble values for a single variable
 * @returns {object|null} { location, scale, shape, lmoment_t3, lmoment_t4 }
 */
export function fitGev(values) {
  const cleaned = values.filter(v => isValidNumber(v));
  if (cleaned.length < 10) return null;
  return fitGevLmoments(sortAscending(cleaned));
}

/**
 * Compute return levels for standard periods.
 * @param {number[]} values - Ensemble values
 * @returns {object|null} { return_levels, gev_params, confidence_intervals }
 */
export function computeReturnLevels(values) {
  const params = fitGev(values);
  if (!params) return null;

  const rps = [2, 10, 50, 100, 500];
  const levels = {};
  for (const rp of rps) {
    levels[String(rp)] = gevReturnLevel(rp, params);
  }

  const ci = bootstrapCI(sortAscending(values.filter(v => isValidNumber(v))));

  return {
    gev_params: params,
    return_levels: levels,
    confidence_intervals: ci,
  };
}

/**
 * Compute Annual Average Loss from ensemble values.
 * @param {number[]} values - Ensemble values for the hazard
 * @param {Function} lossFn - Function mapping intensity → USD loss
 * @returns {object|null} { aal_usd, return_periods, exceedance_points, gev_params }
 */
export function computeAAL(values, lossFn = defaultLossFn) {
  const rpResult = computeReturnLevels(values);
  if (!rpResult) return null;

  const aalUsd = computeAALFromGEV(rpResult.gev_params, lossFn);
  if (aalUsd == null) return null;

  return {
    aal_usd: Math.round(aalUsd),
    aal_usd_ci: rpResult.confidence_intervals
      ? {
          p10: Math.round(computeAALUpToRP(rpResult.gev_params, lossFn, 50)),
          p90: Math.round(computeAALUpToRP(rpResult.gev_params, lossFn, 500)),
        }
      : null,
    return_levels: rpResult.return_levels,
    confidence_intervals: rpResult.confidence_intervals,
    gev_params: rpResult.gev_params,
  };
}

/**
 * Generate exceedance probability curve points.
 * @param {object} gevParams - { location, scale, shape }
 * @param {number} nPoints - Number of points on the curve
 * @returns {Array<{ loss: number, p_exceed: number }>}
 */
export function generateExceedanceCurve(gevParams, nPoints = 50) {
  const maxRp = gevReturnLevel(1000, gevParams);
  if (!isValidNumber(maxRp)) return [];

  const points = [];
  for (let i = 1; i <= nPoints; i++) {
    const loss = (maxRp / nPoints) * i;
    let pExceed;
    if (Math.abs(gevParams.shape) < 1e-10) {
      pExceed = 1 - Math.exp(-Math.exp(-(loss - gevParams.location) / gevParams.scale));
    } else {
      const y = 1 + gevParams.shape * (loss - gevParams.location) / gevParams.scale;
      pExceed = y > 0
        ? 1 - Math.exp(-Math.pow(y, -1 / gevParams.shape))
        : (gevParams.shape < 0 ? 0 : 1);
    }
    points.push({ loss: Math.round(loss * 100) / 100, p_exceed: Math.round(pExceed * 10000) / 10000 });
  }
  return points;
}
