import { describe, it } from "node:test";
import assert from "node:assert";
import {
  injectEnsembleMeans,
  CMIP6_ENSEMBLE_MODELS,
  ENSEMBLE_WEIGHTING_SCHEMES,
  ACTIVE_ENSEMBLE_WEIGHTING_SCHEME,
} from "../../../pipeline/stages/01-acquisition/adapters/openmeteo.js";

// Finding 3.5: resolution-inverse ensemble weighting was previously the only
// scheme actually computed — equal-weighting was cited in a comment as "the
// literature default" but never run, so there was no number an auditor could
// check that claim against. injectEnsembleMeans now computes every scheme in
// ENSEMBLE_WEIGHTING_SCHEMES, not just the active one.

function makeDaily(valuesByModel) {
  const daily = {};
  for (const [model, arr] of Object.entries(valuesByModel)) {
    daily[`temperature_2m_max_${model}`] = arr;
  }
  return daily;
}

describe("openmeteo.js — ensemble weighting schemes (finding 3.5)", () => {
  it("computes both resolution_inverse (active) and equal-weight (alt) means, and they differ when resolutions differ", () => {
    // Two models with very different resolutions and very different values,
    // so resolution-inverse and equal-weight must disagree measurably.
    const daily = makeDaily({
      MRI_AGCM3_2_S: [10, 10, 10],  // 20km resolution -> highest weight under resolution_inverse
      MPI_ESM1_2_XR: [20, 20, 20],  // 51km resolution -> lowest weight under resolution_inverse
    });
    injectEnsembleMeans(daily);

    const active = daily.temperature_2m_max;
    const altEqual = daily.temperature_2m_max_ensemble_alt_equal;

    assert.ok(Array.isArray(active));
    assert.ok(Array.isArray(altEqual));
    // Equal weight -> straight average of 10 and 20 -> 15.
    assert.ok(Math.abs(altEqual[0] - 15) < 1e-9);
    // Resolution-inverse favors the finer (20km) model, so the active mean
    // must be closer to 10 than the equal-weight mean is.
    assert.ok(active[0] < altEqual[0]);
    assert.notStrictEqual(active[0], altEqual[0]);
  });

  it("gives every model equal weight under the 'equal' scheme regardless of resolution", () => {
    const weights = Object.values(ENSEMBLE_WEIGHTING_SCHEMES.equal);
    const expected = 1 / CMIP6_ENSEMBLE_MODELS.length;
    for (const w of weights) {
      assert.ok(Math.abs(w - expected) < 1e-12);
    }
  });

  it("weights resolution_inverse inversely proportional to each model's native resolution, normalized to sum to 1", () => {
    const weights = ENSEMBLE_WEIGHTING_SCHEMES.resolution_inverse;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    // MRI_AGCM3_2_S (20km, finest) must outweigh MPI_ESM1_2_XR (51km, coarsest).
    assert.ok(weights.MRI_AGCM3_2_S > weights.MPI_ESM1_2_XR);
  });

  it("re-normalizes across only the models with valid data at a given timestep for both schemes", () => {
    const daily = makeDaily({
      MRI_AGCM3_2_S: [10, null],
      MPI_ESM1_2_XR: [20, 30],
    });
    injectEnsembleMeans(daily);

    // Second timestep: MRI missing -> both schemes must fall back to MPI's
    // lone value (30), not be dragged toward 0 by a phantom zero weight.
    assert.strictEqual(daily.temperature_2m_max[1], 30);
    assert.strictEqual(daily.temperature_2m_max_ensemble_alt_equal[1], 30);
  });

  it("documents resolution_inverse as the active scheme actually wired into the canonical key", () => {
    assert.strictEqual(ACTIVE_ENSEMBLE_WEIGHTING_SCHEME, "resolution_inverse");
    assert.ok("equal" in ENSEMBLE_WEIGHTING_SCHEMES);
  });
});
