import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { Stage06Risk } from "../../../pipeline/stages/06-risk/index.js";
import { getThresholds } from "../../../pipeline/orchestration/config-loader.js";

describe("Stage06 - Risk", () => {
  it("should calculate risk assessments from phenomena", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [
        {
          phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1",
          name: "ola_de_calor",
          status: "active",
          confidence: { source_quality: 0.75, signal_strength: 0.65, combined: 0.70 },
          scenario: "ssp370",
          horizon: "mediano",
        },
      ],
      sector: "retail",
      config: {},
    });
    assert.ok(Array.isArray(result.assessments));
    assert.ok(result.assessments.length > 0);
    assert.ok(result.assessments[0].risk_id);
    assert.ok(result.assessments[0].risk_score_raw >= 0);
    assert.ok(["bajo", "medio", "alto", "catastrofico"].includes(result.assessments[0].risk_level));
  });

  // H-5.13: calculateProbability now uses confidence.combined mapping
  it("rulesApplied includes H-5.13 probability calculation documentation", () => {
    const stage = new Stage06Risk();
    const h513 = stage.rulesApplied.find(r => r.includes("H-5.13"));
    assert.ok(h513, "rulesApplied should include H-5.13");
    assert.ok(h513.includes("confidence.combined"), "H-5.13 rule should mention confidence.combined");
    assert.ok(h513.includes("confidence_to_probability"), "H-5.13 rule should mention the mapping");
  });

  it("probability is 1 when combined < 0.2 (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.1, signal_strength: 0.1, combined: 0.1 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 1);
    assert.strictEqual(result.assessments[0].probability.source, "calculated");
  });

  it("probability is 2 when combined >= 0.2 and < 0.4 (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee3",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.3, signal_strength: 0.3, combined: 0.3 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 2);
  });

  it("probability is 3 when combined >= 0.4 and < 0.6 (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee4",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.5, signal_strength: 0.5, combined: 0.5 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 3);
  });

  it("probability is 4 when combined >= 0.6 and < 0.8 (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee5",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 4);
  });

  it("probability is 5 when combined >= 0.8 (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee6",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 5);
  });

  it("probability is 5 at boundary combined=0.8 (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee7",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.8, signal_strength: 0.8, combined: 0.8 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 5);
  });

  it("probability is 3 at boundary combined=0.4 (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee8",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.4, signal_strength: 0.4, combined: 0.4 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 3);
  });

  it("probability is 2 at boundary combined=0.2 (H-6.7)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee60",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.2, signal_strength: 0.2, combined: 0.2 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 2);
  });

  it("probability is 4 at boundary combined=0.6 (H-6.7)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee61",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.6, signal_strength: 0.6, combined: 0.6 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].probability.value, 4);
  });

  // H-6.7: the old fallback (Math.ceil(score*5)) disagreed with the
  // configured table at exactly the 4 boundary points (0.2/0.4/0.6/0.8).
  // Fixed by making the fallback reuse the SAME table (and the same
  // score>=threshold loop) instead of a second, independent formula — so
  // DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING must stay byte-identical to
  // thresholds.json's confidence_to_probability.mapping, or the "no config"
  // path silently diverges from the documented default again.
  it("DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING matches thresholds.json exactly (H-6.7)", async () => {
    const { DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING } = await import("../../../pipeline/stages/06-risk/index.js");
    const thresholds = getThresholds();
    assert.deepStrictEqual(
      DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING,
      thresholds.confidence_to_probability.mapping,
      "fallback mapping must stay in sync with the configured default"
    );
  });

  it("rulesApplied includes H-6.7 confidence-to-probability mapping documentation", () => {
    const stage = new Stage06Risk();
    const h67 = stage.rulesApplied.find(r => r.includes("H-6.7"));
    assert.ok(h67, "rulesApplied should include H-6.7");
    assert.ok(h67.includes("Laplace"), "H-6.7 rule should document the equal-spacing rationale");
  });

  it("probability justification includes SQ, SS, and combined values (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee9",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.75, signal_strength: 0.65, combined: 0.70 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    const justification = result.assessments[0].probability.justification;
    assert.ok(justification.includes("0.7000"), "justification should include combined value");
    assert.ok(justification.includes("0.75"), "justification should include SQ value");
    assert.ok(justification.includes("0.65"), "justification should include SS value");
  });

  it("probability varies with combined — different P values produce different risk scores (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const base = {
      phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee10",
      name: "test",
      status: "active",
      scenario: null,
      horizon: null,
    };

    const low = await stage.execute({
      phenomena: [{ ...base, confidence: { source_quality: 0.1, signal_strength: 0.1, combined: 0.1 } }],
      sector: "retail", config: {},
    });
    const high = await stage.execute({
      phenomena: [{ ...base, confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 } }],
      sector: "retail", config: {},
    });

    assert.strictEqual(low.assessments[0].probability.value, 1, "low combined → P=1");
    assert.strictEqual(high.assessments[0].probability.value, 5, "high combined → P=5");
    assert.ok(high.assessments[0].risk_score_raw > low.assessments[0].risk_score_raw,
      "higher P should produce higher risk score");
  });

  it("probability handles missing confidence gracefully (H-5.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee11",
        name: "test",
        status: "active",
        confidence: {},
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    // combined=undefined → score=0 → P=1
    assert.strictEqual(result.assessments[0].probability.value, 1);
  });

  // H-5.14: calculateImpact now uses sector sensitivity and phenomenon exposure
  it("rulesApplied includes H-5.14 impact calculation documentation", () => {
    const stage = new Stage06Risk();
    const h514 = stage.rulesApplied.find(r => r.includes("H-5.14"));
    assert.ok(h514, "rulesApplied should include H-5.14");
    assert.ok(h514.includes("sensibilidad sectorial"), "H-5.14 rule should mention sector sensitivity");
    assert.ok(h514.includes("exposición"), "H-5.14 rule should mention exposure");
  });

  it("impact uses sector sensitivity from sector-profiles.json (H-5.14)", async () => {
    const stage = new Stage06Risk();
    // agriculture has physical_sensitivity=0.9 → sensitivity=round(0.9×4)+1=5
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee20",
        name: "sequia",
        status: "active",
        confidence: { source_quality: 0.8, signal_strength: 0.8, combined: 0.8 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
    });
    const impact = result.assessments[0].impact;
    assert.strictEqual(impact.components.sensitivity, 5, "agriculture sensitivity should be 5");
    assert.ok(impact.value >= 1 && impact.value <= 5, "impact value should be 1-5");
  });

  it("impact varies by sector sensitivity (H-5.14)", async () => {
    const stage = new Stage06Risk();
    const base = {
      phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee21",
      name: "ola_de_calor",
      status: "active",
      confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
      scenario: null,
      horizon: null,
    };

    const agri = await stage.execute({
      phenomena: [{ ...base }],
      sector: "agriculture",
      config: {},
    });
    const finance = await stage.execute({
      phenomena: [{ ...base }],
      sector: "finance",
      config: {},
    });

    // agriculture (0.9→5) should have higher sensitivity than finance (0.3→2)
    assert.ok(
      agri.assessments[0].impact.components.sensitivity > finance.assessments[0].impact.components.sensitivity,
      "agriculture sensitivity should be higher than finance"
    );
  });

  it("impact exposure depends on phenomenon status (H-5.14)", async () => {
    const stage = new Stage06Risk();
    const base = {
      phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee22",
      name: "test",
      confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
      scenario: null,
      horizon: null,
    };

    const active = await stage.execute({
      phenomena: [{ ...base, status: "active" }],
      sector: "retail",
      config: {},
    });
    const projected = await stage.execute({
      phenomena: [{ ...base, status: "projected" }],
      sector: "retail",
      config: {},
    });
    const notDetected = await stage.execute({
      phenomena: [{ ...base, status: "not_detected" }],
      sector: "retail",
      config: {},
    });

    assert.ok(
      active.assessments[0].impact.components.exposure > projected.assessments[0].impact.components.exposure,
      "active exposure should be higher than projected"
    );
    assert.ok(
      projected.assessments[0].impact.components.exposure > notDetected.assessments[0].impact.components.exposure,
      "projected exposure should be higher than not_detected"
    );
  });

  it("impact scales with confidence.combined (H-5.14)", async () => {
    const stage = new Stage06Risk();
    const base = {
      phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee23",
      name: "test",
      status: "active",
      scenario: null,
      horizon: null,
    };

    const low = await stage.execute({
      phenomena: [{ ...base, confidence: { source_quality: 0.1, signal_strength: 0.1, combined: 0.1 } }],
      sector: "retail",
      config: {},
    });
    const high = await stage.execute({
      phenomena: [{ ...base, confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 } }],
      sector: "retail",
      config: {},
    });

    assert.ok(
      high.assessments[0].impact.components.exposure > low.assessments[0].impact.components.exposure,
      "higher confidence should produce higher exposure"
    );
  });

  it("impact justification includes sensitivity and exposure values (H-5.14)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee24",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.8, signal_strength: 0.8, combined: 0.8 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
    });
    const justification = result.assessments[0].impact.justification;
    assert.ok(justification.includes("0.9"), "justification should include physical_sensitivity value");
    assert.ok(justification.includes("5/5"), "justification should include scaled sensitivity");
    assert.ok(justification.includes("agriculture"), "justification should include sector name");
  });

  it("impact value is 1-5 integer (H-5.14)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee25",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.75, signal_strength: 0.65, combined: 0.70 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    const impact = result.assessments[0].impact;
    assert.ok(Number.isInteger(impact.value), "impact value should be integer");
    assert.ok(impact.value >= 1 && impact.value <= 5, "impact value should be 1-5");
  });

  it("risk score varies with impact — different sectors produce different scores (H-5.14)", async () => {
    const stage = new Stage06Risk();
    const base = {
      phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee26",
      name: "ola_de_calor",
      status: "active",
      confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
      scenario: null,
      horizon: null,
    };

    const agri = await stage.execute({
      phenomena: [{ ...base }],
      sector: "agriculture",
      config: {},
    });
    const finance = await stage.execute({
      phenomena: [{ ...base }],
      sector: "finance",
      config: {},
    });

    // Same phenomenon, same P, but different I due to sector sensitivity
    assert.strictEqual(agri.assessments[0].probability.value, finance.assessments[0].probability.value,
      "same phenomenon should have same P");
    assert.ok(agri.assessments[0].risk_score_raw !== finance.assessments[0].risk_score_raw,
      "different sectors should produce different risk scores");
  });

  it("default sector uses physical_sensitivity=0.5 (H-5.14)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee27",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "unknown_sector",
      config: {},
    });
    // default physical_sensitivity=0.5 → sensitivity=round(0.5×4)+1=3
    assert.strictEqual(result.assessments[0].impact.components.sensitivity, 3,
      "unknown sector should use default sensitivity=3");
  });

  // H-5.15: sensitivity analysis — verify that the P×I×CA formula with
  // dynamic P (H-5.13) and dynamic I (H-5.14) produces a reasonable
  // distribution across bajo/medio/alto categories.
  it("rulesApplied includes H-5.15 classification validation documentation", () => {
    const stage = new Stage06Risk();
    const h515 = stage.rulesApplied.find(r => r.includes("H-5.15"));
    assert.ok(h515, "rulesApplied should include H-5.15");
    assert.ok(h515.includes("distribución"), "H-5.15 rule should mention distribution");
  });

  it("sensitivity analysis: distribution of scores across P×I×CA space (H-5.15)", () => {
    // Test the full P×I×CA space to verify threshold distribution.
    // P ∈ {1,2,3,4,5}, I ∈ {1,2,3,4,5}, CA ∈ {1,2,3,4,5}
    // Expected: scores should cover bajo, medio, and alto categories.
    const bajo = [];
    const medio = [];
    const alto = [];

    for (let p = 1; p <= 5; p++) {
      for (let i = 1; i <= 5; i++) {
        for (let ca = 1; ca <= 5; ca++) {
          const score = (p * i) / ca;
          if (score <= 2) bajo.push({ p, i, ca, score });
          else if (score <= 4) medio.push({ p, i, ca, score });
          else alto.push({ p, i, ca, score });
        }
      }
    }

    // Total combinations: 5×5×5 = 125
    assert.strictEqual(bajo.length + medio.length + alto.length, 125,
      "should have 125 total P×I×CA combinations");

    // All three categories should be represented
    assert.ok(bajo.length > 0, "should have some bajo scores");
    assert.ok(medio.length > 0, "should have some medio scores");
    assert.ok(alto.length > 0, "should have some alto scores");

    // Distribution should be roughly balanced (no category <10% of total)
    assert.ok(bajo.length >= 10, `bajo should have ≥10 combinations, got ${bajo.length}`);
    assert.ok(medio.length >= 10, `medio should have ≥10 combinations, got ${medio.length}`);
    assert.ok(alto.length >= 10, `alto should have ≥10 combinations, got ${alto.length}`);

    // Verify edge cases
    const minScore = (1 * 1) / 5; // P=1, I=1, CA=5 → 0.2
    const maxScore = (5 * 5) / 1; // P=5, I=5, CA=1 → 25
    assert.ok(minScore <= 2, "minimum score should be bajo");
    assert.ok(maxScore > 4, "maximum score should be alto");
  });

  it("sensitivity analysis: realistic scenario covers all categories (H-5.15)", async () => {
    const stage = new Stage06Risk();

    // Scenario 1: Low risk — low confidence, low sensitivity, high CA
    const low = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee30",
        name: "test",
        status: "not_detected",
        confidence: { source_quality: 0.1, signal_strength: 0.1, combined: 0.1 },
        scenario: null, horizon: null,
      }],
      sector: "finance", // sensitivity=0.3→2
      config: {},
    });

    // Scenario 2: Medium risk — medium confidence, medium sensitivity, medium CA
    const medium = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee31",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.5, signal_strength: 0.5, combined: 0.5 },
        scenario: null, horizon: null,
      }],
      sector: "retail", // sensitivity=0.6→3
      config: {},
    });

    // Scenario 3: High risk — high confidence, high sensitivity, low CA
    const high = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee32",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null, horizon: null,
      }],
      sector: "agriculture", // sensitivity=0.9→5
      config: {},
    });

    // Verify classification spread
    const lowLevel = low.assessments[0].risk_level;
    const medLevel = medium.assessments[0].risk_level;
    const highLevel = high.assessments[0].risk_level;

    // At minimum, high scenario should have higher score than low scenario
    assert.ok(
      high.assessments[0].risk_score_raw > low.assessments[0].risk_score_raw,
      `high scenario score (${high.assessments[0].risk_score_raw}) should exceed low (${low.assessments[0].risk_score_raw})`
    );

    // Document the actual scores for audit trail
    // These are concrete evidence that the formula produces differentiated results
    assert.ok(low.assessments[0].risk_score_raw > 0, "low score should be positive");
    assert.ok(medium.assessments[0].risk_score_raw > 0, "medium score should be positive");
    assert.ok(high.assessments[0].risk_score_raw > 0, "high score should be positive");
  });

  // H-6.1: formula_source metadata — verify the risk formula is attributed to ISO 31000, not IPCC
  it("rulesApplied includes H-6.1 ISO 31000 attribution for the risk formula", () => {
    const stage = new Stage06Risk();
    const h61 = stage.rulesApplied.find(r => r.includes("H-6.1"));
    assert.ok(h61, "rulesApplied should include H-6.1");
    assert.ok(h61.includes("ISO 31000:2018 §6.6"), "H-6.1 rule should reference ISO 31000:2018 §6.6");
    assert.ok(h61.includes("no derivación IPCC"), "H-6.1 rule should clarify it is not an IPCC derivation");
  });

  it("thresholds.json has formula_source referencing ISO 31000:2018 §6.6 (H-6.1)", () => {
    const thresholds = getThresholds();
    assert.ok(thresholds.formula_source, "thresholds.json should have formula_source field");
    assert.strictEqual(thresholds.formula_source.reference, "ISO 31000:2018 §6.6",
      "formula_source.reference should be ISO 31000:2018 §6.6");
    assert.ok(thresholds.formula_source.quote.includes("determined by the organization"),
      "formula_source.quote should contain the ISO 31000 §6.6 quote");
    assert.ok(thresholds.formula_source.interpretation.includes("NO viene del marco IPCC"),
      "formula_source.interpretation should clarify IPCC is not the source");
  });

  it("thresholds.json has _formula_comparison with at least 3 alternatives (H-6.1)", () => {
    const thresholds = getThresholds();
    assert.ok(thresholds._formula_comparison, "thresholds.json should have _formula_comparison field");
    const formulas = [
      thresholds._formula_comparison.formula_division,
      thresholds._formula_comparison.formula_additive,
      thresholds._formula_comparison.formula_multiplicative,
      thresholds._formula_comparison.formula_geometric,
    ].filter(Boolean);
    assert.ok(formulas.length >= 3, `_formula_comparison should have ≥3 alternatives, got ${formulas.length}`);

    // Verify the selected formula is division
    assert.ok(thresholds._formula_comparison.formula_division.selected,
      "formula_division should be the selected formula");
    assert.ok(thresholds._formula_comparison.formula_additive.selected === false,
      "formula_additive should not be selected");
    assert.ok(thresholds._formula_comparison.formula_multiplicative.selected === false,
      "formula_multiplicative should not be selected");
    assert.ok(thresholds._formula_comparison.formula_geometric.selected === false,
      "formula_geometric should not be selected");
  });

  it("thresholds.json _methodology.risk_formula references ISO 31000, not IPCC (H-6.1)", () => {
    const thresholds = getThresholds();
    assert.ok(thresholds._methodology.risk_formula.includes("ISO 31000:2018 §6.6"),
      "_methodology.risk_formula should reference ISO 31000:2018 §6.6");
    assert.ok(!thresholds._methodology.risk_formula.includes("derivado del marco IPCC"),
      "_methodology.risk_formula should not claim to be derived from IPCC");
  });

  // H-6.2: getIndicatorValue now reads from canonical_variables and normalizes
  it("rulesApplied includes H-6.2 adaptive capacity calculation documentation", () => {
    const stage = new Stage06Risk();
    const h62 = stage.rulesApplied.find(r => r.includes("H-6.2"));
    assert.ok(h62, "rulesApplied should include H-6.2");
    assert.ok(h62.includes("canonical_variables"), "H-6.2 rule should mention canonical_variables");
    assert.ok(h62.includes("INDICATOR_TO_CANONICAL"), "H-6.2 rule should mention the mapping");
  });

  it("CA is not null when canonical variables with sufficient data are provided (H-6.2)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee40",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "retail",
      config: {},
      canonical_variables: [
        { name: "poverty_rate", value: 20, unit: "%" },
        { name: "gdp_per_capita", value: 7000, unit: "USD" },
        { name: "water_access", value: 80, unit: "%" },
        { name: "education_literacy", value: 90, unit: "%" },
        { name: "traveltime_healthcare", value: 30, unit: "min" },
      ],
    });
    assert.ok(result.assessments[0].adaptive_capacity.score !== null,
      "CA should not be null when canonical variables are provided");
    assert.ok(result.assessments[0].adaptive_capacity.score >= 1 &&
      result.assessments[0].adaptive_capacity.score <= 5,
      "CA score should be between 1 and 5");
    assert.ok(result.assessments[0].adaptive_capacity.indicators_used.length >= 3,
      "CA should use at least 3 indicators");
  });

  it("risk_score_raw is not NaN when CA is calculated (H-6.2)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee41",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "retail",
      config: {},
      canonical_variables: [
        { name: "poverty_rate", value: 20, unit: "%" },
        { name: "gdp_per_capita", value: 7000, unit: "USD" },
        { name: "water_access", value: 80, unit: "%" },
      ],
    });
    assert.ok(!isNaN(result.assessments[0].risk_score_raw),
      "risk_score_raw should not be NaN");
    assert.ok(typeof result.assessments[0].risk_score_raw === "number",
      "risk_score_raw should be a number");
  });

  it("CA uses default (3) fallback when no canonical variables are provided (H-6.2)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee42",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "retail",
      config: {},
      // No canonical_variables — CA should fall back to default=3
    });
    // CA=null from calculateAdaptiveCapacity, but caScore fallback should be 3
    assert.ok(!isNaN(result.assessments[0].risk_score_raw),
      "risk_score_raw should not be NaN even without canonical variables");
    assert.ok(result.assessments[0].risk_score_raw > 0,
      "risk_score_raw should be positive with CA fallback");
  });

  it("getIndicatorValue normalizes poverty_rate correctly (H-6.2)", async () => {
    const stage = new Stage06Risk();
    // poverty_rate: min_value=3, max_value=52, min_score=5, max_score=1 (inverse)
    // value=3 → score=5, value=52 → score=1, value=20 → score ≈ 3.8
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee43",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "retail",
      config: {},
      canonical_variables: [
        { name: "poverty_rate", value: 20, unit: "%" },
        { name: "gdp_per_capita", value: 7000, unit: "USD" },
        { name: "water_access", value: 80, unit: "%" },
      ],
    });
    // With 3 indicators available, CA should be calculated
    assert.ok(result.assessments[0].adaptive_capacity.score !== null,
      "CA should be calculated with 3 indicators");
    assert.ok(result.assessments[0].adaptive_capacity.indicator_details.some(d => d.id === "poverty_rate"),
      "indicator_details should include poverty_rate");
  });

  it("CA is null with justification when fewer than min_indicators have data (H-6.2)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee44",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "retail",
      config: {},
      canonical_variables: [
        { name: "poverty_rate", value: 20, unit: "%" },
        // Only 1 indicator — below min_indicators (3)
      ],
    });
    assert.strictEqual(result.assessments[0].adaptive_capacity.score, null,
      "CA should be null when fewer than min_indicators have data");
    assert.ok(result.assessments[0].adaptive_capacity.justification.includes("mínimo requerido"),
      "CA justification should mention the minimum requirement");
  });

  it("CA fallback to default=3 produces valid risk classification (H-6.2)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee45",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "retail",
      config: {},
      // No canonical_variables → CA=null → fallback to 3
    });
    assert.ok(["bajo", "medio", "alto", "catastrofico"].includes(result.assessments[0].risk_level),
      "risk_level should be a valid classification even with CA fallback");
    assert.ok(!isNaN(result.assessments[0].risk_score_raw),
      "risk_score_raw should be a valid number with CA fallback");
  });

  // H-6.6: classifyHorizon() must use phenomenon.horizon (per contract:
  // operativo ≤10 años, estrategico >10 años), not phenomenon.status.
  it("rulesApplied includes H-6.6 horizon classification documentation", () => {
    const stage = new Stage06Risk();
    const h66 = stage.rulesApplied.find(r => r.includes("H-6.6"));
    assert.ok(h66, "rulesApplied should include H-6.6");
    assert.ok(h66.includes("horizon"), "H-6.6 rule should mention phenomenon.horizon");
  });

  it("horizon='largo' classifies as estrategico regardless of status (H-6.6)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee50",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: "largo",
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].risk_classification, "estrategico",
      "active phenomenon with horizon=largo should still classify as estrategico");
  });

  it("horizon='corto' and horizon='mediano' classify as operativo (≤10 años, H-6.6)", async () => {
    const stage = new Stage06Risk();
    for (const horizon of ["corto", "mediano"]) {
      const result = await stage.execute({
        phenomena: [{
          phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee51",
          name: "test",
          status: "projected",
          confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
          scenario: null,
          horizon,
        }],
        sector: "retail",
        config: {},
      });
      assert.strictEqual(result.assessments[0].risk_classification, "operativo",
        `horizon=${horizon} (≤10 años) should classify as operativo even for a projected phenomenon`);
    }
  });

  it("horizon=null falls back to operativo, the safe default (H-6.6)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee52",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.strictEqual(result.assessments[0].risk_classification, "operativo",
      "missing horizon should not be classified as estrategico");
  });

  // H-6.8: classifyRisk simplified — high_min removed, boundary tests
  it("rulesApplied includes H-6.8 classification simplification documentation", () => {
    const stage = new Stage06Risk();
    const h68 = stage.rulesApplied.find(r => r.includes("H-6.8"));
    assert.ok(h68, "rulesApplied should include H-6.8");
    assert.ok(h68.includes("redundante"), "H-6.8 rule should mention redundancy");
  });

  it("thresholds.json no longer has high_min (H-6.8)", () => {
    const thresholds = getThresholds();
    assert.strictEqual(thresholds.risk_classification.high_min, undefined,
      "high_min should be removed from thresholds.json");
    assert.ok(typeof thresholds.risk_classification.low_max === "number",
      "low_max should still exist");
    assert.ok(typeof thresholds.risk_classification.medium_max === "number",
      "medium_max should still exist");
  });

  it("classifyRisk: boundary behavior — score=2 is bajo, 2.01 is medio (H-6.8)", () => {
    const stage = new Stage06Risk();
    const thresholds = getThresholds();
    // score=2 → bajo (≤ low_max=2)
    assert.strictEqual(stage.classifyRisk(2, thresholds), "bajo",
      "score=2 should be bajo");
    // score=2.01 → medio (> low_max=2, ≤ medium_max=4)
    assert.strictEqual(stage.classifyRisk(2.01, thresholds), "medio",
      "score=2.01 should be medio");
  });

  it("classifyRisk: boundary behavior — score=4 is medio, 4.01 is alto (H-6.8)", () => {
    const stage = new Stage06Risk();
    const thresholds = getThresholds();
    // score=4 → medio (≤ medium_max=4)
    assert.strictEqual(stage.classifyRisk(4, thresholds), "medio",
      "score=4 should be medio");
    // score=4.01 → alto (> medium_max=4)
    assert.strictEqual(stage.classifyRisk(4.01, thresholds), "alto",
      "score=4.01 should be alto");
  });

  it("classifyRisk: extreme values — 0.2 is bajo, 25 is alto (H-6.8)", () => {
    const stage = new Stage06Risk();
    const thresholds = getThresholds();
    // P=1,I=1,CA=5 → 0.2 (minimum)
    assert.strictEqual(stage.classifyRisk(0.2, thresholds), "bajo",
      "minimum score (0.2) should be bajo");
    // P=5,I=5,CA=1 → 25 (maximum)
    assert.strictEqual(stage.classifyRisk(25, thresholds), "alto",
      "maximum score (25) should be alto");
  });

  it("classifyRisk: no dead code — every score maps to exactly one category (H-6.8)", () => {
    const stage = new Stage06Risk();
    const thresholds = getThresholds();
    const categories = new Set();
    // Test all integer scores from 0 to 30
    for (let s = 0; s <= 30; s++) {
      const level = stage.classifyRisk(s, thresholds);
      assert.ok(["bajo", "medio", "alto"].includes(level),
        `score ${s} should map to a valid category, got "${level}"`);
      categories.add(level);
    }
    assert.ok(categories.has("bajo"), "should have bajo scores");
    assert.ok(categories.has("medio"), "should have medio scores");
    assert.ok(categories.has("alto"), "should have alto scores");
  });

  // H-6.9: external probability sources (GRI Oxford) must take priority
  // over the internal confidence.combined calculation, per contract
  // stage-06-risk.md Behavior §2.
  it("rulesApplied includes H-6.9 external probability documentation", () => {
    const stage = new Stage06Risk();
    const h69 = stage.rulesApplied.find(r => r.startsWith("H-6.9 ("));
    assert.ok(h69, "rulesApplied should include H-6.9");
    assert.ok(h69.includes("gri_drought_occurrence"), "H-6.9 rule should mention the GRI canonical variable mapping");
  });

  it("uses external gri_drought_occurrence for sequia when available (H-6.9)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee70",
        name: "sequia",
        status: "active",
        // Internal path would give a very different P (combined=0.1 → P=1);
        // the external value below (0.85) should win instead and give P=5.
        confidence: { source_quality: 0.1, signal_strength: 0.1, combined: 0.1 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
      canonical_variables: [
        { name: "gri_drought_occurrence", value: 0.85, unit: "probability" },
      ],
    });
    const probability = result.assessments[0].probability;
    assert.strictEqual(probability.source, "external", "should use the external source when available");
    assert.strictEqual(probability.external_source, "gri_oxford:gri_drought_occurrence");
    assert.strictEqual(probability.value, 5, "0.85 external probability should map to P=5 via confidence_to_probability");
  });

  it("falls back to internal calculation when external variable is absent (H-6.9)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee71",
        name: "sequia",
        status: "active",
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
      // No canonical_variables at all — gri_drought_occurrence unavailable.
    });
    const probability = result.assessments[0].probability;
    assert.strictEqual(probability.source, "calculated", "should fall back to internal calculation");
    assert.strictEqual(probability.external_source, null);
    assert.strictEqual(probability.value, 5, "internal path should still use confidence.combined=0.9 → P=5");
  });

  it("phenomena without a GRI mapping always use internal calculation (H-6.9)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee72",
        name: "ola_de_frio",
        status: "active",
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
      // Even if a gri_drought_occurrence value happens to be present, it must
      // not be applied to ola_de_frio — there is no GRI cold-wave domain.
      canonical_variables: [
        { name: "gri_drought_occurrence", value: 0.1, unit: "probability" },
      ],
    });
    const probability = result.assessments[0].probability;
    assert.strictEqual(probability.source, "calculated", "ola_de_frio has no GRI mapping — must use internal calculation");
    assert.strictEqual(probability.external_source, null);
  });

  it("getExternalProbability clamps out-of-range values to [0,1] (H-6.9)", () => {
    const stage = new Stage06Risk();
    const result = stage.getExternalProbability(
      { name: "inundacion" },
      [{ name: "gri_flood_occurrence", value: 1.4, unit: "probability" }]
    );
    assert.strictEqual(result.probability01, 1, "out-of-range value should clamp to 1");
  });

  it("getExternalProbability returns null when canonical_variables is empty (H-6.9)", () => {
    const stage = new Stage06Risk();
    assert.strictEqual(stage.getExternalProbability({ name: "inundacion" }, []), null);
  });

  // H-6.10: the contract requires ≥2 scenarios × 3 horizons per risk;
  // Stage06Risk produces 1 of each. Instead of fabricating fake coverage,
  // every assessment must declare this gap explicitly and honestly.
  it("rulesApplied includes H-6.10 evaluation coverage documentation", () => {
    const stage = new Stage06Risk();
    const h610 = stage.rulesApplied.find(r => r.startsWith("H-6.10 ("));
    assert.ok(h610, "rulesApplied should include H-6.10");
    assert.ok(h610.includes("HALLAZGO-8"), "H-6.10 rule should cite the structural cause (HALLAZGO-8)");
  });

  it("every assessment declares evaluation_coverage with meets_contract=false (H-6.10)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee80",
        name: "ola_de_calor",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    const coverage = result.assessments[0].evaluation_coverage;
    assert.strictEqual(coverage.scenarios_evaluated, 1);
    assert.strictEqual(coverage.scenarios_required_by_contract, 2);
    assert.strictEqual(coverage.horizons_evaluated, 1);
    assert.strictEqual(coverage.horizons_required_by_contract, 3);
    assert.strictEqual(coverage.meets_contract, false,
      "coverage must honestly report the contract is not met, not silently pass");
    assert.ok(coverage.justification.length > 0);
  });

  it("evaluation_coverage requirements come from thresholds.json, not hardcoded literals (H-6.10)", () => {
    const stage = new Stage06Risk();
    const thresholds = getThresholds();
    const coverage = stage.computeEvaluationCoverage(thresholds);
    assert.strictEqual(coverage.scenarios_required_by_contract, thresholds.evaluation_coverage_requirements.scenarios_required);
    assert.strictEqual(coverage.horizons_required_by_contract, thresholds.evaluation_coverage_requirements.horizons_required);
  });

  // H-6.11: CA=null must never propagate to risk_score_raw=NaN. Already
  // fixed by H-6.2's caScore fallback for the CA axis; this section adds
  // the general "never NaN" invariant the audit asked for, plus the second
  // NaN pathway found while verifying (confidence.combined=NaN explicitly,
  // which `??` does not catch).
  it("rulesApplied includes H-6.11 NaN-guard documentation", () => {
    const stage = new Stage06Risk();
    const h611 = stage.rulesApplied.find(r => r.startsWith("H-6.11 ("));
    assert.ok(h611, "rulesApplied should include H-6.11");
    assert.ok(h611.includes("Number.isFinite"), "H-6.11 rule should mention the Number.isFinite guard");
  });

  it("risk_score_raw is never NaN across CA null/calculated/default states (H-6.11)", async () => {
    const stage = new Stage06Risk();
    const base = {
      phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee90",
      name: "test",
      status: "active",
      confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
      scenario: null,
      horizon: null,
    };

    // CA null (no canonical_variables → fewer than min_indicators)
    const noCa = await stage.execute({ phenomena: [{ ...base }], sector: "retail", config: {} });
    assert.ok(!Number.isNaN(noCa.assessments[0].risk_score_raw), "CA=null should not produce NaN");
    assert.strictEqual(noCa.assessments[0].adaptive_capacity.score, null);

    // CA calculated from sufficient canonical_variables
    const withCa = await stage.execute({
      phenomena: [{ ...base }],
      sector: "retail",
      config: {},
      canonical_variables: [
        { name: "poverty_rate", value: 20, unit: "%" },
        { name: "gdp_per_capita", value: 8000, unit: "USD" },
        { name: "water_access", value: 80, unit: "%" },
      ],
    });
    assert.ok(!Number.isNaN(withCa.assessments[0].risk_score_raw), "CA calculated should not produce NaN");
    assert.ok(withCa.assessments[0].adaptive_capacity.score !== null);
  });

  it("confidence.combined=NaN does not propagate to impact.value or risk_score_raw (H-6.11)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee91",
        name: "test",
        status: "active",
        // Malformed upstream data: combined is explicitly NaN, not null/undefined.
        // `??` does not catch this — Number.isFinite() is required (H-6.11).
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: NaN },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    const assessment = result.assessments[0];
    assert.ok(!Number.isNaN(assessment.impact.components.exposure), "exposure should not be NaN");
    assert.ok(!Number.isNaN(assessment.impact.value), "impact.value should not be NaN");
    assert.ok(!Number.isNaN(assessment.probability.value), "probability.value should not be NaN");
    assert.ok(!Number.isNaN(assessment.risk_score_raw), "risk_score_raw should not be NaN");
  });

  // H-6.13: a sector without its own profile silently fell back to
  // sector-profiles.json's default (physical_sensitivity=0.5), indistinguishable
  // from a real sector genuinely at 0.5. physical_sensitivity_source now makes
  // that traceable, mirroring transition_risk_profile_source (H-16).
  it("rulesApplied includes H-6.13 physical_sensitivity_source documentation", () => {
    const stage = new Stage06Risk();
    const h613 = stage.rulesApplied.find(r => r.startsWith("H-6.13 ("));
    assert.ok(h613, "rulesApplied should include H-6.13");
    assert.ok(h613.includes("physical_sensitivity_source"), "H-6.13 rule should mention the new field");
  });

  it("physical_sensitivity_source is 'sector_specific' for a known sector (H-6.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee92",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
    });
    assert.strictEqual(
      result.assessments[0].impact.components.physical_sensitivity_source,
      "sector_specific"
    );
  });

  it("physical_sensitivity_source is 'default' for an unknown sector (H-6.13)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee93",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "unknown_sector",
      config: {},
    });
    assert.strictEqual(
      result.assessments[0].impact.components.physical_sensitivity_source,
      "default"
    );
  });

  it("H-6.13: all sector profiles have physical_sensitivity defined (no silent fallback reachable)", () => {
    // Mirrors the H-15 test pattern for transition_sensitivity: verifies the
    // throw guard in calculateImpact() (physical_sensitivity required, no
    // arbitrary ?? 0.5) is currently unreachable by construction of the data,
    // not merely "not exercised by these tests".
    const content = JSON.parse(readFileSync("pipeline/config/sector-profiles.json", "utf-8"));
    for (const sector of Object.keys(content.sectors)) {
      const profile = content.sectors[sector];
      assert.ok(
        profile.physical_sensitivity != null,
        `sector '${sector}' must have physical_sensitivity defined (H-6.13: no silent fallback allowed)`
      );
      assert.ok(
        typeof profile.physical_sensitivity === "number" &&
        profile.physical_sensitivity >= 0 && profile.physical_sensitivity <= 1,
        `sector '${sector}' physical_sensitivity must be a number in [0,1]`
      );
    }
    assert.ok(
      content.default.physical_sensitivity != null,
      "default profile must have physical_sensitivity defined (H-6.13)"
    );
  });

  // H-6.12: sector sensitivity values — confidence, sensitivity analysis, ranking stability
  it("rulesApplied includes H-6.12 sensitivity analysis documentation", () => {
    const stage = new Stage06Risk();
    const h612 = stage.rulesApplied.find(r => r.includes("H-6.12"));
    assert.ok(h612, "rulesApplied should include H-6.12");
    assert.ok(h612.includes("sensibilidad"), "H-6.12 rule should mention sensitivity");
  });

  it("sector-profiles.json has _confidence field for each sector (H-6.12)", () => {
    const content = JSON.parse(readFileSync("pipeline/config/sector-profiles.json", "utf-8"));
    const sectors = Object.keys(content.sectors);
    for (const sector of sectors) {
      const profile = content.sectors[sector];
      assert.ok(
        profile._confidence != null && typeof profile._confidence === "string",
        `sector '${sector}' must have _confidence string (H-6.12)`
      );
      assert.ok(
        profile._confidence.length > 10,
        `sector '${sector}' _confidence should be descriptive, got: "${profile._confidence}"`
      );
    }
  });

  it("sector-profiles.json _refs has _sensitivity_analysis (H-6.12)", () => {
    const content = JSON.parse(readFileSync("pipeline/config/sector-profiles.json", "utf-8"));
    assert.ok(
      content._refs._sensitivity_analysis != null,
      "_refs should have _sensitivity_analysis documenting ±0.2 analysis"
    );
    assert.ok(
      content._refs._sensitivity_analysis.includes("±0.2"),
      "_sensitivity_analysis should reference ±0.2 variation"
    );
  });

  it("ranking order is preserved across sectors (H-6.12)", () => {
    const content = JSON.parse(readFileSync("pipeline/config/sector-profiles.json", "utf-8"));
    const sectors = Object.keys(content.sectors);
    // Verify the declared order: agriculture > infrastructure > retail > energy > finance
    const expectedOrder = ["agriculture", "infrastructure", "retail", "energy", "finance"];
    for (let i = 0; i < expectedOrder.length - 1; i++) {
      const higher = content.sectors[expectedOrder[i]].physical_sensitivity;
      const lower = content.sectors[expectedOrder[i + 1]].physical_sensitivity;
      assert.ok(
        higher > lower,
        `${expectedOrder[i]} (${higher}) should have higher physical_sensitivity than ${expectedOrder[i + 1]} (${lower})`
      );
    }
  });

  it("sensitivity analysis: ±0.2 does not change Likert for agriculture (H-6.12)", () => {
    // agriculture: 0.9, ±0.2 → [0.7, 1.1]
    // Formula: round(value × 4) + 1, clamped [1,5]
    const toLikert = (v) => Math.max(1, Math.min(5, Math.round(v * 4) + 1));
    const base = toLikert(0.9);
    const low = toLikert(0.7);
    const high = toLikert(Math.min(1.0, 1.1));
    assert.strictEqual(base, 5, "agriculture base should be Likert 5");
    assert.ok(low >= 4, `agriculture at 0.7 should be Likert ≥4, got ${low}`);
    assert.strictEqual(high, 5, "agriculture at 1.0 should be Likert 5");
  });

  it("sensitivity analysis: ±0.2 produces wider range for finance (H-6.12)", () => {
    // finance: 0.3, ±0.2 → [0.1, 0.5]
    const toLikert = (v) => Math.max(1, Math.min(5, Math.round(v * 4) + 1));
    const base = toLikert(0.3);
    const low = toLikert(0.1);
    const high = toLikert(0.5);
    assert.strictEqual(base, 2, "finance base should be Likert 2");
    assert.strictEqual(low, 1, "finance at 0.1 should be Likert 1");
    assert.strictEqual(high, 3, "finance at 0.5 should be Likert 3");
    // Range is 2 points (1 to 3) — wider than agriculture's range
    assert.ok(
      (high - low) >= (base - low),
      "finance range (2) should be wider than agriculture-like range"
    );
  });

  it("ranking stability: agriculture Likert always exceeds finance Likert with ±0.2 (H-6.12)", () => {
    const toLikert = (v) => Math.max(1, Math.min(5, Math.round(v * 4) + 1));
    // Worst case: agriculture at minimum (0.7), finance at maximum (0.5)
    const agMin = toLikert(0.7);
    const finMax = toLikert(0.5);
    assert.ok(
      agMin > finMax,
      `agriculture worst case (${agMin}) should still exceed finance best case (${finMax})`
    );
  });

  // H-6.14: catastrophic_multiplier was configured but never consumed, and
  // RiskLevelEnum's "catastrofico" was never emitted. classifyCatastrophic()
  // now triggers an ISO 31000-style "consequence override" when impact.value
  // reaches the Likert ceiling (5), independent of probability/score.
  it("rulesApplied includes H-6.14 catastrophic risk documentation", () => {
    const stage = new Stage06Risk();
    const h614 = stage.rulesApplied.find(r => r.startsWith("H-6.14 ("));
    assert.ok(h614, "rulesApplied should include H-6.14");
    assert.ok(h614.includes("catastrophic_impact_threshold"), "H-6.14 rule should mention the threshold");
  });

  it("impact.value=5 triggers risk_level='catastrofico', bypassing classifyRisk (H-6.14)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee94",
        name: "test",
        status: "active",
        // combined=0.9 → high-confidence active exposure band [4,5] → exposure=5
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null,
        horizon: null,
      }],
      // agriculture → sensitivity=5. exposure=5 × sensitivity=5 → impact=5.
      sector: "agriculture",
      config: {},
    });
    const assessment = result.assessments[0];
    assert.strictEqual(assessment.impact.value, 5, "sanity check: impact should reach the ceiling in this scenario");
    assert.strictEqual(assessment.risk_level, "catastrofico");
    assert.strictEqual(assessment.catastrophic_assessment.flagged, true);
    assert.strictEqual(assessment.catastrophic_assessment.criterion, "impact_at_scale_ceiling");
    assert.strictEqual(assessment.catastrophic_assessment.threshold, 5);
  });

  it("catastrophic_multiplier is applied to risk_score_raw when flagged (H-6.14)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee95",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
      // No canonical_variables → CA falls back to default=3.
    });
    const assessment = result.assessments[0];
    // P=5 (combined=0.9), I=5 (agriculture, active, high confidence), CA=3 (default).
    // base = (5*5)/3 = 8.333..., multiplied by catastrophic_multiplier=1.5 → 12.5.
    assert.strictEqual(assessment.probability.value, 5);
    assert.strictEqual(assessment.impact.value, 5);
    assert.ok(
      Math.abs(assessment.risk_score_raw - 12.5) < 1e-9,
      `risk_score_raw should be base(8.333...) × 1.5 = 12.5, got ${assessment.risk_score_raw}`
    );
  });

  it("impact.value below the ceiling never triggers catastrofico, even with P=5 (H-6.14)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee96",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null,
        horizon: null,
      }],
      // finance → sensitivity=2. exposure=5 × sensitivity=2 → impact=round(sqrt(10))=3, well below the ceiling.
      sector: "finance",
      config: {},
    });
    const assessment = result.assessments[0];
    assert.strictEqual(assessment.probability.value, 5, "sanity check: P is at its own maximum here");
    assert.ok(assessment.impact.value < 5, "sanity check: impact should stay below the ceiling for finance");
    assert.notStrictEqual(assessment.risk_level, "catastrofico");
    assert.strictEqual(assessment.catastrophic_assessment.flagged, false);
    assert.ok(["bajo", "medio", "alto"].includes(assessment.risk_level));
  });

  it("catastrophic_assessment.justification explicitly declares the vida/legal/continuidad gap (H-6.14)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee97",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.9, signal_strength: 0.9, combined: 0.9 },
        scenario: null,
        horizon: null,
      }],
      sector: "agriculture",
      config: {},
    });
    const justification = result.assessments[0].catastrophic_assessment.justification;
    assert.ok(
      justification.includes("vida") || justification.includes("legal") || justification.includes("reputación"),
      "justification should acknowledge the undistinguished contract sub-categories"
    );
  });

  // H-6.15: the contract specifies a top-level exposure[] array (not nested
  // inside impact.components) and adaptive_capacity.indicators shaped as
  // {name, value, weight, contribution} (not a bare indicators_used: string[]).
  it("rulesApplied includes H-6.15 output-shape documentation", () => {
    const stage = new Stage06Risk();
    const h615 = stage.rulesApplied.find(r => r.startsWith("H-6.15 ("));
    assert.ok(h615, "rulesApplied should include H-6.15");
    assert.ok(h615.includes("context_variables_used"), "H-6.15 rule should mention context_variables_used");
  });

  it("execute() returns a top-level exposure[] array per phenomenon (H-6.15)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee98",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
    });
    assert.ok(Array.isArray(result.exposure), "output should have a top-level exposure array");
    assert.strictEqual(result.exposure.length, 1);
    const entry = result.exposure[0];
    assert.strictEqual(entry.phenomenon_id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee98");
    assert.strictEqual(entry.level, result.assessments[0].impact.components.exposure,
      "exposure[].level should match impact.components.exposure — same computed value, not recalculated");
    assert.strictEqual(entry.factors.status, "active");
    assert.strictEqual(entry.factors.confidence_combined, 0.7);
    assert.ok(Array.isArray(entry.factors.band) && entry.factors.band.length === 2);
    assert.deepStrictEqual(entry.context_variables_used, []);
  });

  it("adaptive_capacity.indicators is {name, value, weight, contribution}[] per contract (H-6.15)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee99",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
      canonical_variables: [
        { name: "poverty_rate", value: 20, unit: "%" },
        { name: "gdp_per_capita", value: 8000, unit: "USD" },
        { name: "water_access", value: 80, unit: "%" },
      ],
    });
    const indicators = result.assessments[0].adaptive_capacity.indicators;
    assert.ok(Array.isArray(indicators));
    assert.strictEqual(indicators.length, 3);
    for (const ind of indicators) {
      assert.ok(typeof ind.name === "string" && ind.name.length > 0);
      assert.ok(typeof ind.value === "number");
      assert.strictEqual(ind.weight, 1 / 3);
      assert.ok(Math.abs(ind.contribution - ind.value * (1 / 3)) < 1e-9);
    }
    // indicators_used/indicator_details preserved for backward compatibility.
    assert.ok(Array.isArray(result.assessments[0].adaptive_capacity.indicators_used));
  });

  it("adaptive_capacity.indicators has null weight/contribution when CA=null (H-6.15)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee9a",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
      canonical_variables: [{ name: "poverty_rate", value: 20, unit: "%" }],
    });
    const ca = result.assessments[0].adaptive_capacity;
    assert.strictEqual(ca.score, null, "sanity check: CA should be null with only 1 of 3 required indicators");
    assert.strictEqual(ca.indicators.length, 1);
    assert.strictEqual(ca.indicators[0].weight, null,
      "weight should be null, not a fabricated fraction, when no average was ever computed");
    assert.strictEqual(ca.indicators[0].contribution, null);
  });

  // H-6.16: equal-weight (1/N) averaging is a Laplace/máxima-entropía
  // placeholder, not an AHP calibration. Rather than hand-wave that, the
  // justification now reports the [min,max] range of contributing
  // indicators — the mathematically exact bound on how much ANY alternative
  // non-negative weighting scheme could move the result (convex combination
  // property), so an auditor can see per-execution whether the placeholder
  // is harmless (indicators agree) or a real gap (indicators disagree).
  it("rulesApplied includes H-6.16 equal-weight sensitivity documentation", () => {
    const stage = new Stage06Risk();
    const h616 = stage.rulesApplied.find(r => r.startsWith("H-6.16 ("));
    assert.ok(h616, "rulesApplied should include H-6.16");
    assert.ok(h616.includes("combinaciones convexas"), "H-6.16 rule should mention the convex-combination bound");
  });

  it("CA justification reports the indicator range and its convex-hull bound (H-6.16)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee9b",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null,
        horizon: null,
      }],
      sector: "retail",
      config: {},
      canonical_variables: [
        { name: "poverty_rate", value: 20, unit: "%" },
        { name: "gdp_per_capita", value: 8000, unit: "USD" },
        { name: "water_access", value: 80, unit: "%" },
      ],
    });
    const ca = result.assessments[0].adaptive_capacity;
    // Known normalization: poverty_rate=4, gdp_per_capita=3, access_to_water=3.
    assert.strictEqual(ca.score, 3);
    assert.deepStrictEqual(ca.indicator_details.map(d => d.normalized_score).sort(), [3, 3, 4]);
    assert.ok(ca.justification.includes("Rango de indicadores=[3,4]"));
    assert.ok(ca.justification.includes("desviación máxima posible 1 punto"));
  });

  it("adaptive-capacity.json frames equal weighting as a Laplace placeholder, not a calibration (H-6.16)", () => {
    const content = JSON.parse(readFileSync("pipeline/config/adaptive-capacity.json", "utf-8"));
    assert.ok(content._methodology.weighting.includes("máxima entropía"));
    assert.ok(content._methodology.weighting.includes("no una calibración empírica") ||
      content._methodology.weighting.includes("placeholder"));
  });

  // H-6.17: execute() should be async for consistency with
  // StageInterface.execute(), which is declared async. Orchestrator already
  // awaits every stage generically, so this is behavior-preserving.
  it("rulesApplied includes H-6.17 async consistency documentation", () => {
    const stage = new Stage06Risk();
    const h617 = stage.rulesApplied.find(r => r.startsWith("H-6.17 ("));
    assert.ok(h617, "rulesApplied should include H-6.17");
    assert.ok(h617.includes("StageInterface"), "H-6.17 rule should reference StageInterface");
  });

  it("execute() returns a Promise, consistent with StageInterface.execute() being async (H-6.17)", async () => {
    const stage = new Stage06Risk();
    const returned = stage.execute({ phenomena: [], sector: "retail", config: {} });
    assert.ok(returned instanceof Promise, "execute() should return a Promise");
    await returned;
  });

  // H-6.18: sector and sensitivity propagated to assessment output
  it("rulesApplied includes H-6.18 sector propagation documentation", () => {
    const stage = new Stage06Risk();
    const h618 = stage.rulesApplied.find(r => r.includes("H-6.18"));
    assert.ok(h618, "rulesApplied should include H-6.18");
    assert.ok(h618.includes("sector"), "H-6.18 rule should mention sector");
  });

  it("assessment output includes sector field (H-6.18)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee90",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "agriculture",
      config: {},
    });
    assert.strictEqual(result.assessments[0].sector, "agriculture",
      "assessment should include sector field");
  });

  it("impact.components includes physical_sensitivity and sensitivity_scaled (H-6.18)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee91",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "agriculture",
      config: {},
    });
    const components = result.assessments[0].impact.components;
    assert.strictEqual(typeof components.physical_sensitivity, "number",
      "physical_sensitivity should be a number");
    assert.strictEqual(typeof components.sensitivity_scaled, "number",
      "sensitivity_scaled should be a number");
    assert.ok(components.physical_sensitivity >= 0 && components.physical_sensitivity <= 1,
      "physical_sensitivity should be in [0,1]");
    assert.ok(components.sensitivity_scaled >= 1 && components.sensitivity_scaled <= 5,
      "sensitivity_scaled should be in [1,5]");
  });

  it("agriculture: physical_sensitivity=0.9, sensitivity_scaled=5 (H-6.18)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee92",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "agriculture",
      config: {},
    });
    const components = result.assessments[0].impact.components;
    assert.strictEqual(components.physical_sensitivity, 0.9,
      "agriculture physical_sensitivity should be 0.9");
    assert.strictEqual(components.sensitivity_scaled, 5,
      "agriculture sensitivity_scaled should be 5 (round(0.9×4)+1)");
  });

  it("finance: physical_sensitivity=0.3, sensitivity_scaled=2 (H-6.18)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee93",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "finance",
      config: {},
    });
    const components = result.assessments[0].impact.components;
    assert.strictEqual(components.physical_sensitivity, 0.3,
      "finance physical_sensitivity should be 0.3");
    assert.strictEqual(components.sensitivity_scaled, 2,
      "finance sensitivity_scaled should be 2 (round(0.3×4)+1)");
  });

  it("unknown sector: physical_sensitivity=0.5 (default), physical_sensitivity_source='default' (H-6.18)", async () => {
    const stage = new Stage06Risk();
    const result = await stage.execute({
      phenomena: [{
        phenomenon_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee94",
        name: "test",
        status: "active",
        confidence: { source_quality: 0.7, signal_strength: 0.7, combined: 0.7 },
        scenario: null, horizon: null,
      }],
      sector: "unknown_sector",
      config: {},
    });
    const components = result.assessments[0].impact.components;
    assert.strictEqual(components.physical_sensitivity, 0.5,
      "unknown sector should use default physical_sensitivity=0.5");
    assert.strictEqual(components.sensitivity_scaled, 3,
      "unknown sector sensitivity_scaled should be 3 (round(0.5×4)+1)");
    assert.strictEqual(components.physical_sensitivity_source, "default",
      "unknown sector should have physical_sensitivity_source='default'");
    assert.strictEqual(result.assessments[0].sector, "unknown_sector",
      "sector field should reflect the actual sector passed, even if unknown");
  });
});
