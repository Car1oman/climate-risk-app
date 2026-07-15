import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage03Normalization } from "../../../pipeline/stages/03-normalization/index.js";

// Authority gate: a primary source with completeness >= 0.80 must be
// selected directly (gated=true), UNLESS a complementary source dominates it
// on both completeness AND proximity simultaneously — in that case the gate
// must not fire and the pre-existing equal-weight score comparison decides.
// See documentacion-v2 audit finding 3.1: rulesApplied previously described
// a gate that did not exist in code; this locks in the corrected behavior.

function makeStage(decorrelationLengthKm) {
  const stage = new Stage03Normalization();
  stage._decorrelationConfig = {
    variables: { elevation: { decorrelation_length_km: decorrelationLengthKm } },
  };
  return stage;
}

function validation(sourceName, completenessPct) {
  return { source: sourceName, summary: { completeness_pct: completenessPct } };
}

describe("Stage03Normalization — authority gate (_scoreSources / _applyAuthorityGate)", () => {
  it("gates directly to primary when completeness >= 0.80 and no complementary dominates", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "primary_src", authority_level: "primary", spatial_distance_km: 5 },
      { source_name: "comp_src", authority_level: "complementary", spatial_distance_km: 5 },
    ];
    const validationMap = new Map([
      ["primary_src", validation("primary_src", 0.85)],
      ["comp_src", validation("comp_src", 0.70)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");

    assert.strictEqual(scored[0].source.source_name, "primary_src");
    assert.strictEqual(scored[0].gated, true);
    assert.ok(scored[0].gate_reason.includes("authority_gate"));
  });

  it("does not gate when a complementary source dominates on both completeness and proximity", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "primary_src", authority_level: "primary", spatial_distance_km: 50 },
      { source_name: "comp_src", authority_level: "complementary", spatial_distance_km: 1 },
    ];
    const validationMap = new Map([
      ["primary_src", validation("primary_src", 0.82)],
      ["comp_src", validation("comp_src", 0.95)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");
    const primaryEntry = scored.find(s => s.source.source_name === "primary_src");

    assert.strictEqual(primaryEntry.gated, undefined);
    assert.ok(primaryEntry.gate_skipped_reason.includes("dominated by complementary source comp_src"));
    // Dominating complementary must win the fallback score comparison.
    assert.strictEqual(scored[0].source.source_name, "comp_src");
  });

  it("does not gate when primary completeness is below the 0.80 threshold", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "primary_src", authority_level: "primary", spatial_distance_km: 5 },
      { source_name: "comp_src", authority_level: "complementary", spatial_distance_km: 5 },
    ];
    const validationMap = new Map([
      ["primary_src", validation("primary_src", 0.5)],
      ["comp_src", validation("comp_src", 0.6)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");
    const primaryEntry = scored.find(s => s.source.source_name === "primary_src");

    assert.strictEqual(primaryEntry.gated, undefined);
    assert.ok(primaryEntry.gate_skipped_reason.includes("authority_gate_threshold=0.8"));
  });
});

describe("Stage03Normalization — adaptive completeness threshold (finding 3.2)", () => {
  it("reads its floor/ceiling anchors from validation-profiles.json completeness.thresholds.climate, not hardcoded literals", () => {
    const stage = new Stage03Normalization();
    // Deliberately different from the real config's 0.50/0.80 so a match
    // here can only be explained by actually reading these fields, not by
    // coincidentally reproducing hardcoded numbers.
    stage._validationProfiles = { completeness: { thresholds: { climate: { degraded: 0.40, acceptable: 0.90 } } } };

    assert.strictEqual(stage._computeAdaptiveThreshold(0), 0.40);
    assert.strictEqual(stage._computeAdaptiveThreshold(20), 0.90);
    assert.strictEqual(stage._computeAdaptiveThreshold(null), 0.90);
    // count=10 -> halfway between the two anchors: 0.40 + 0.5*(0.90-0.40)
    assert.ok(Math.abs(stage._computeAdaptiveThreshold(10) - 0.65) < 1e-9);
  });

  it("falls back to the documented 0.50/0.80 defaults when validation profiles are unavailable", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null;

    assert.strictEqual(stage._computeAdaptiveThreshold(0), 0.50);
    assert.strictEqual(stage._computeAdaptiveThreshold(20), 0.80);
  });

  it("cites the adaptive-threshold reference (not the flat WMO monthly one) when the window is below 20 points", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = { completeness: { thresholds: { climate: { degraded: 0.50, acceptable: 0.80 } } } };

    const threshold = stage._computeAdaptiveThreshold(10);
    const methodology = stage._buildMethodology(
      "precipitation_sum", 0.7, "completeness_weighted_sum",
      { expectedCount: 10, threshold_used: threshold }
    );

    assert.strictEqual(methodology.completeness_threshold, Math.round(threshold * 100) / 100);
    assert.ok(methodology.completeness_threshold_reference.includes("GCOS-245"));
    // Distinguishing signal is the adaptive-specific language (interpolation,
    // short window), not the absence of the monthly WMO citation — the
    // unified reference builder explains the 80% ceiling's WMO origin in
    // both branches, which is more transparent, not a regression.
    assert.ok(methodology.completeness_threshold_reference.includes("Umbral adaptativo"));
    assert.ok(methodology.completeness_threshold_reference.includes("interpolación lineal"));
    assert.ok(methodology.assumptions.some(a => a.includes("Umbral de completitud adaptado a ventana corta")));
  });

  it("cites the flat WMO monthly reference (not the adaptive one) when the window is >= 20 points", () => {
    const stage = new Stage03Normalization();

    const methodology = stage._buildMethodology(
      "precipitation_sum", 0.9, "completeness_weighted_sum",
      { expectedCount: 30, threshold_used: 0.80 }
    );

    assert.ok(methodology.completeness_threshold_reference.includes("Monthly climate data should have"));
    assert.ok(!(methodology.assumptions || []).some(a => a.includes("Umbral de completitud adaptado a ventana corta")));
  });
});

describe("Stage03Normalization — symmetric equal-weight formula (no hidden asymmetry outside the gate)", () => {
  it("scores primary and complementary with the identical (completeness+proximity)/2 formula", () => {
    const stage = makeStage(100);
    // Below gate threshold so the explicit gate never fires — this isolates
    // the fallback formula itself.
    const sources = [
      { source_name: "primary_src", authority_level: "primary", spatial_distance_km: 20 },
      { source_name: "comp_src", authority_level: "complementary", spatial_distance_km: 20 },
    ];
    const validationMap = new Map([
      ["primary_src", validation("primary_src", 0.6)],
      ["comp_src", validation("comp_src", 0.6)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");
    const primaryEntry = scored.find(s => s.source.source_name === "primary_src");
    const compEntry = scored.find(s => s.source.source_name === "comp_src");

    // Identical completeness and distance must yield an identical score
    // regardless of authority_level — proving there is no formula-level
    // asymmetry left once the gate is out of the picture.
    assert.strictEqual(primaryEntry.score, compEntry.score);
    assert.strictEqual(primaryEntry.score, Math.round(((0.6 + Math.exp(-20 / 100)) / 2) * 10000) / 10000);
  });

  it("lets a non-dominating complementary source outscore and win over a sub-threshold primary", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "primary_src", authority_level: "primary", spatial_distance_km: 40 },
      { source_name: "comp_src", authority_level: "complementary", spatial_distance_km: 2 },
    ];
    // Both sources are below the 0.80 gate threshold, so the gate never
    // enters the picture — comp_src wins purely on the shared formula
    // rewarding its better completeness and proximity, not on any
    // authority-based tilt (the old asymmetric formula would have given
    // primary an advantage even here).
    const validationMap = new Map([
      ["primary_src", validation("primary_src", 0.5)],
      ["comp_src", validation("comp_src", 0.55)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");

    assert.strictEqual(scored[0].source.source_name, "comp_src");
    assert.strictEqual(scored[0].gated, undefined);
  });
});

describe("Stage03Normalization — resolution as a real weighted dimension (finding 4.1)", () => {
  it("promotes resolution to an active third criterion when it discriminates, separating scores directly (not via tiebreak)", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "coarse_src", authority_level: "complementary", spatial_distance_km: 10, resolution_native: "10 km" },
      { source_name: "fine_src", authority_level: "complementary", spatial_distance_km: 10, resolution_native: "1 km" },
    ];
    // Identical completeness and distance -> identical completeness/proximity
    // for both; only resolution_native differs. Pre-4.1 this was a score tie
    // resolved by an ordinal tiebreak; now resolution is a real third
    // dimension in the average, so the finer source wins on SCORE directly.
    const validationMap = new Map([
      ["coarse_src", validation("coarse_src", 0.7)],
      ["fine_src", validation("fine_src", 0.7)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");
    const fine = scored.find(s => s.source.source_name === "fine_src");
    const coarse = scored.find(s => s.source.source_name === "coarse_src");

    assert.notStrictEqual(fine.score, coarse.score);
    assert.strictEqual(fine.components.resolution_score, 1);
    assert.strictEqual(coarse.components.resolution_score, 0);
    assert.strictEqual(scored[0].source.source_name, "fine_src");
  });

  it("does not activate resolution as a dimension when fewer than 2 sources report a discriminating resolution", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "only_one_reports", authority_level: "complementary", spatial_distance_km: 10, resolution_native: "10 km" },
      { source_name: "no_resolution_data", authority_level: "complementary", spatial_distance_km: 10 },
    ];
    const validationMap = new Map([
      ["only_one_reports", validation("only_one_reports", 0.7)],
      ["no_resolution_data", validation("no_resolution_data", 0.7)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");

    // Falls back cleanly to the 2-dimension (completeness, proximity)
    // average — resolution_score stays null for everyone this decision.
    assert.strictEqual(scored[0].score, scored[1].score);
    assert.strictEqual(scored[0].components.resolution_score, null);
    assert.strictEqual(scored[1].components.resolution_score, null);
  });

  it("falls back to authority_level then source_name when resolution is unavailable on both sides", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "z_complementary", authority_level: "complementary", spatial_distance_km: 10 },
      { source_name: "a_complementary", authority_level: "complementary", spatial_distance_km: 10 },
    ];
    const validationMap = new Map([
      ["z_complementary", validation("z_complementary", 0.7)],
      ["a_complementary", validation("a_complementary", 0.7)],
    ]);

    const scored = stage._scoreSources(sources, validationMap, "elevation");

    // No resolution data, same authority_level -> alphabetical source_name.
    assert.strictEqual(scored[0].source.source_name, "a_complementary");
  });
});

describe("Stage03Normalization — missingness randomness test (finding 3.3, _testMissingnessRandomness)", () => {
  it("detects a clustered (non-random) missing-value pattern — the wet-season-gap failure mode", () => {
    const stage = new Stage03Normalization();
    // 15 valid then 15 missing: one long block of each -> only 2 runs
    // against an expected 16, the extreme case of temporal clustering.
    const values = [...Array(15).fill(5), ...Array(15).fill(null)];
    const result = stage._testMissingnessRandomness(values, v => v != null);

    assert.strictEqual(result.tested, true);
    assert.strictEqual(result.runs, 2);
    assert.strictEqual(result.expected_runs, 16);
    assert.ok(Math.abs(result.z - -5.204) < 0.01, `z=${result.z}`);
    assert.ok(result.p_value < 0.001);
    assert.strictEqual(result.pattern, "clustered");
  });

  it("detects an alternating (non-random) missing-value pattern as a distinct case from clustering", () => {
    const stage = new Stage03Normalization();
    const values = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 5 : null));
    const result = stage._testMissingnessRandomness(values, v => v != null);

    assert.strictEqual(result.tested, true);
    assert.strictEqual(result.runs, 30);
    assert.strictEqual(result.expected_runs, 16);
    assert.ok(Math.abs(result.z - 5.204) < 0.01, `z=${result.z}`);
    assert.strictEqual(result.pattern, "alternating");
  });

  it("declines to test when the sample is too small for the normal approximation", () => {
    const stage = new Stage03Normalization();
    const result = stage._testMissingnessRandomness([5, null], v => v != null);

    assert.strictEqual(result.tested, false);
    assert.ok(result.reason.includes("insufficient_n"));
  });
});

describe("Stage03Normalization — MCAR test wired into aggregation + methodology output (finding 3.3)", () => {
  it("attaches a rejected (clustered) mcar_test to the completeness-corrected sum, and says so in assumptions", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null; // use documented 0.50/0.80 defaults

    const values = [...Array(15).fill(10), ...Array(15).fill(null)];
    const agg = stage._aggregateCompletenessAware(values, null, 30, "precipitation_sum", "nasa_power");

    assert.strictEqual(agg.correction_applied, true);
    assert.ok(agg.mcar_test);
    assert.strictEqual(agg.mcar_test.pattern, "clustered");

    const methodology = stage._buildMethodology("precipitation_sum", agg.completenessRatio, "completeness_weighted_sum", agg);

    assert.strictEqual(methodology.mcar_test.pattern, "clustered");
    assert.ok(methodology.assumptions.some(a => a.includes("RECHAZA aleatoriedad")));
    assert.ok(methodology.references.some(r => r.includes("Wald")));
  });

  it("reports mcar_test even for the mean method, which never applies a correction", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null;

    const values = [...Array(15).fill(20), ...Array(15).fill(null)];
    const agg = stage._aggregateCompletenessAware(values, null, 30, "air_temperature_max", "openmeteo_cmip6");

    assert.strictEqual(agg.correction_applied, false);
    assert.ok(agg.mcar_test);
    assert.strictEqual(agg.mcar_test.pattern, "clustered");

    const methodology = stage._buildMethodology("air_temperature_max", agg.completenessRatio, "completeness_weighted_mean", agg);
    assert.ok(methodology.assumptions.some(a => a.includes("RECHAZA aleatoriedad")));
  });

  it("reports the untested/insufficient-n case honestly instead of silently assuming MCAR without saying so", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null;

    // Small window, still triggers the adaptive-threshold correction branch,
    // but too small (N=3) for the runs test's normal approximation.
    const values = [10, null, null];
    const agg = stage._aggregateCompletenessAware(values, null, 3, "precipitation_sum", "nasa_power");

    assert.ok(agg.mcar_test);
    assert.strictEqual(agg.mcar_test.tested, false);

    const methodology = stage._buildMethodology("precipitation_sum", agg.completenessRatio, "completeness_weighted_sum", agg);
    assert.ok(methodology.assumptions.some(a => a.includes("no verificable estadísticamente")));
  });
});

describe("Stage03Normalization — CMIP6 ensemble weighting comparison surfaced per variable (finding 3.5)", () => {
  it("quantifies the delta between the active (resolution_inverse) and alt (equal) ensemble means", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null;

    const source = {
      source_name: "openmeteo_cmip6",
      authority_level: "primary",
      request: { timestamp: "2000-01-01T00:00:00Z" },
      response: {
        daily: {
          time: ["2000-01-01", "2000-01-02", "2000-01-03"],
          // Active (resolution_inverse) series, as if already computed by
          // the adapter's injectEnsembleMeans.
          temperature_2m_max: [10, 10, 10],
          // Alt scheme series the adapter now also computes and preserves.
          temperature_2m_max_ensemble_alt_equal: [12, 12, 12],
        },
      },
    };

    const extracted = stage._extractVariablesFromSource(source, null, null);
    const historico = extracted.find(v => v.name === "air_temperature_max_historico");

    assert.ok(historico, "expected an air_temperature_max_historico variable to be extracted");
    assert.strictEqual(historico.value, 10);
    assert.ok(historico.methodology.ensemble_weighting_comparison);
    const cmp = historico.methodology.ensemble_weighting_comparison.find(c => c.scheme === "equal");
    assert.ok(cmp);
    assert.strictEqual(cmp.value, 12);
    assert.strictEqual(cmp.delta_abs, 2);
    assert.strictEqual(cmp.delta_pct, 20);
    assert.ok(historico.methodology.assumptions.some(a => a.includes("esquema alternativo 'equal'")));
    assert.ok(historico.methodology.references.some(r => r.includes("Knutti")));
  });

  it("omits the comparison entirely when the adapter provides no alt-scheme series (e.g. older cached response)", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null;

    const source = {
      source_name: "openmeteo_cmip6",
      authority_level: "primary",
      request: { timestamp: "2000-01-01T00:00:00Z" },
      response: {
        daily: {
          time: ["2000-01-01", "2000-01-02", "2000-01-03"],
          temperature_2m_max: [10, 10, 10],
        },
      },
    };

    const extracted = stage._extractVariablesFromSource(source, null, null);
    const historico = extracted.find(v => v.name === "air_temperature_max_historico");

    assert.ok(historico);
    assert.strictEqual(historico.methodology.ensemble_weighting_comparison, undefined);
  });
});

describe("Stage03Normalization — _buildSourceDecisions honesty of rationale/reasons", () => {
  it("labels discarded sources with authority_gate_override, not score-comparison reasons, when gated", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "primary_src", authority_level: "primary", spatial_distance_km: 5 },
      { source_name: "comp_src", authority_level: "complementary", spatial_distance_km: 5 },
    ];
    const validationMap = new Map([
      ["primary_src", validation("primary_src", 0.85)],
      ["comp_src", validation("comp_src", 0.70)],
    ]);
    const coverageMap = new Map();

    const scored = stage._scoreSources(sources, validationMap, "elevation");
    const [decision] = stage._buildSourceDecisions("elevation", sources, scored, validationMap, coverageMap);

    assert.strictEqual(decision.gated, true);
    assert.ok(decision.selection_rationale.includes("authority_gate"));
    assert.ok(decision.discarded_sources[0].reasons[0].startsWith("authority_gate_override"));
  });

  it("keeps score-comparison reasons and gated=false when primary wins below the gate threshold", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "primary_src", authority_level: "primary", spatial_distance_km: 5 },
      { source_name: "comp_src", authority_level: "complementary", spatial_distance_km: 5 },
    ];
    // Same distance -> equal proximity for both; primary completeness (0.79)
    // stays just under the 0.80 gate threshold but still outscores the
    // complementary source's equal-weight average (0.3+proximity)/2.
    const validationMap = new Map([
      ["primary_src", validation("primary_src", 0.79)],
      ["comp_src", validation("comp_src", 0.3)],
    ]);
    const coverageMap = new Map();

    const scored = stage._scoreSources(sources, validationMap, "elevation");
    const [decision] = stage._buildSourceDecisions("elevation", sources, scored, validationMap, coverageMap);

    assert.strictEqual(decision.selected_source, "primary_src");
    assert.strictEqual(decision.gated, false);
    assert.ok(decision.selection_rationale.includes("not by authority gate"));
    assert.ok(!decision.discarded_sources.some(d => d.reasons[0].startsWith("authority_gate_override")));
  });
});

describe("Stage03Normalization — _computeSensitivity: vertex proof, not a sampled sweep (finding 4.1 CRÍTICO)", () => {
  function entry(name, completeness, proximity, resolutionScore = null) {
    return {
      source: { source_name: name, authority_level: "complementary" },
      score: 0,
      components: { completeness, proximity, resolution_m: null, resolution_score: resolutionScore },
    };
  }

  it("reports not applicable for a single candidate (nothing to compare)", () => {
    const stage = new Stage03Normalization();
    const result = stage._computeSensitivity([entry("only_src", 0.9, 0.9)]);
    assert.strictEqual(result.applicable, false);
    assert.ok(result.reason.includes("single_candidate"));
  });

  it("proves winner_stable=true when one source has the highest value at every 2D vertex (dominance)", () => {
    const stage = new Stage03Normalization();
    const scored = [
      entry("dominant", 0.9, 0.9),
      entry("dominated", 0.5, 0.5),
    ];
    const result = stage._computeSensitivity(scored);

    assert.strictEqual(result.applicable, true);
    assert.deepStrictEqual(result.dimensions_used, ["completeness", "proximity"]);
    assert.strictEqual(result.winner_stable, true);
    assert.ok(result.vertices.every(v => v.winner === "dominant"));
    assert.ok(result.interpretation.includes("CUALQUIER ponderación"));
  });

  it("proves winner_stable=false when different sources win on completeness vs proximity", () => {
    const stage = new Stage03Normalization();
    const scored = [
      entry("completeness_winner", 0.95, 0.40),
      entry("proximity_winner", 0.40, 0.95),
    ];
    const result = stage._computeSensitivity(scored);

    assert.strictEqual(result.winner_stable, false);
    const byDimension = Object.fromEntries(result.vertices.map(v => [v.dimension, v.winner]));
    assert.strictEqual(byDimension.completeness, "completeness_winner");
    assert.strictEqual(byDimension.proximity, "proximity_winner");
    assert.ok(result.interpretation.includes("SÍ depende de la ponderación"));
  });

  it("extends the proof to 3 vertices (completeness, proximity, resolution_score) when resolution is active", () => {
    const stage = new Stage03Normalization();
    const scored = [
      entry("res_winner", 0.5, 0.5, 0.9),
      entry("other", 0.9, 0.9, 0.1),
    ];
    const result = stage._computeSensitivity(scored);

    assert.deepStrictEqual(result.dimensions_used, ["completeness", "proximity", "resolution_score"]);
    assert.strictEqual(result.winner_stable, false);
    const byDimension = Object.fromEntries(result.vertices.map(v => [v.dimension, v.winner]));
    assert.strictEqual(byDimension.resolution_score, "res_winner");
    assert.strictEqual(byDimension.completeness, "other");
  });

  it("is wired into _buildSourceDecisions output as decision.sensitivity", () => {
    const stage = makeStage(100);
    const sources = [
      { source_name: "a", authority_level: "complementary", spatial_distance_km: 5 },
      { source_name: "b", authority_level: "complementary", spatial_distance_km: 200 },
    ];
    const validationMap = new Map([
      ["a", validation("a", 0.95)],
      ["b", validation("b", 0.40)],
    ]);
    const scored = stage._scoreSources(sources, validationMap, "elevation");
    const [decision] = stage._buildSourceDecisions("elevation", sources, scored, validationMap, new Map());

    assert.ok(decision.sensitivity);
    assert.strictEqual(decision.sensitivity.applicable, true);
    assert.strictEqual(typeof decision.sensitivity.winner_stable, "boolean");
  });
});

describe("Stage03Normalization — fill-value fallback honesty (finding 4.2)", () => {
  it("reports is_registered=true and this source's own sentinel list for a registered source", () => {
    const stage = new Stage03Normalization();
    const { values, is_registered } = stage._getSourceFillValues("nasa_power");

    assert.strictEqual(is_registered, true);
    assert.ok(values.has(-999));
    assert.ok(values.has(-9999));
    assert.ok(values.has(-99999));
    assert.ok(values.has(null));
  });

  it("reports is_registered=false and falls back to GLOBAL_FILL_VALUES for an unregistered source", () => {
    const stage = new Stage03Normalization();
    const { values, is_registered } = stage._getSourceFillValues("some_future_source_not_yet_registered");

    assert.strictEqual(is_registered, false);
    // GLOBAL_FILL_VALUES must be the union of every sentinel already seen
    // across registered sources (-999, -9999 nasa_power/others; -32768 SRTM
    // void; -99999 nasa_power) — pre-4.2 this fallback was missing -32768
    // and -99999, so an unregistered source using either would have slipped
    // through as "valid" data.
    assert.ok(values.has(-999));
    assert.ok(values.has(-9999));
    assert.ok(values.has(-32768));
    assert.ok(values.has(-99999));
    assert.ok(values.has(null));
  });

  it("filters -32768 and -99999 correctly even for an unregistered source (the gap 4.2 closes)", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null;

    const result = stage._aggregateCompletenessAware(
      [10, 20, -32768, -99999, 30],
      null, 5,
      "precipitation_sum",
      "some_future_source_not_yet_registered"
    );

    assert.strictEqual(result.validCount, 3);
    assert.strictEqual(result.fill_values_source_registered, false);
  });

  it("flags fill_values_source_registered=true for an already-registered source", () => {
    const stage = new Stage03Normalization();
    stage._validationProfiles = null;

    const result = stage._aggregateCompletenessAware(
      [10, 20, -999, 30],
      null, 4,
      "precipitation_sum",
      "nasa_power"
    );

    assert.strictEqual(result.fill_values_source_registered, true);
  });

  it("adds an explicit warning to methodology.assumptions only when the fallback was used", () => {
    const stage = new Stage03Normalization();

    const unregistered = stage._buildMethodology(
      "precipitation_sum", 0.9, "completeness_weighted_sum",
      { expectedCount: 30, threshold_used: 0.80, fill_values_source_registered: false }
    );
    assert.ok(unregistered.assumptions.some(a => a.includes("ADVERTENCIA") && a.includes("SOURCE_FILL_VALUES")));
    assert.strictEqual(unregistered.fill_values_source_registered, false);

    const registered = stage._buildMethodology(
      "precipitation_sum", 0.9, "completeness_weighted_sum",
      { expectedCount: 30, threshold_used: 0.80, fill_values_source_registered: true }
    );
    assert.ok(!(registered.assumptions || []).some(a => a.includes("ADVERTENCIA")));
    assert.strictEqual(registered.fill_values_source_registered, true);
  });
});
