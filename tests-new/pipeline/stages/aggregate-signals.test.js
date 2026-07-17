import { describe, it } from "node:test";
import assert from "node:assert";
import { aggregateSignals } from "../../../pipeline/stages/05-phenomena/aggregate-signals.js";

function makeSignal(name, sqScore, ssScore) {
  return {
    name,
    source_quality: { score: sqScore },
    signal_strength: { score: ssScore },
  };
}

describe("aggregateSignals (H-5.4)", () => {
  const roles = { required: ["sig_a", "sig_b"], optional: ["sig_c"] };

  describe("arithmetic_mean", () => {
    it("returns the arithmetic mean of scores", () => {
      const signals = [makeSignal("sig_a", 0.8, 0.6), makeSignal("sig_b", 0.4, 0.2)];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      assert.ok(Math.abs(result.avg - 0.6) < 1e-10, `expected ~0.6, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
      assert.strictEqual(result.method, "arithmetic_mean");
    });

    it("handles a single signal", () => {
      const signals = [makeSignal("sig_a", 0.75, 0.5)];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "signal_strength");
      assert.strictEqual(result.avg, 0.5);
      assert.strictEqual(result.n, 1);
    });

    it("excludes null source_quality from average (H-5.6)", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),
        makeSignal("sig_b", 0.8, 0.4),
      ];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      // H-5.6: null excluded, only sig_b contributes → avg = 0.8 / 1 = 0.8
      assert.strictEqual(result.avg, 0.8);
      assert.strictEqual(result.n, 1); // only 1 signal with known SQ
    });

    it("returns 0 for empty signals", () => {
      const result = aggregateSignals([], roles, "arithmetic_mean", "source_quality");
      assert.strictEqual(result.avg, 0);
      assert.strictEqual(result.n, 0);
    });
  });

  describe("geometric_mean", () => {
    it("returns the geometric mean of scores", () => {
      const signals = [makeSignal("sig_a", 0.8, 0.6), makeSignal("sig_b", 0.4, 0.2)];
      const result = aggregateSignals(signals, roles, "geometric_mean", "source_quality");
      assert.strictEqual(result.avg, Math.sqrt(0.8 * 0.4)); // √0.32 ≈ 0.5657
      assert.strictEqual(result.n, 2);
    });

    it("returns 0 when any score is 0", () => {
      const signals = [makeSignal("sig_a", 0, 0.6), makeSignal("sig_b", 0.8, 0.2)];
      const result = aggregateSignals(signals, roles, "geometric_mean", "source_quality");
      assert.strictEqual(result.avg, 0);
    });

    it("handles a single signal", () => {
      const signals = [makeSignal("sig_a", 0.75, 0.5)];
      const result = aggregateSignals(signals, roles, "geometric_mean", "source_quality");
      assert.strictEqual(result.avg, 0.75);
    });

    it("penalizes imbalance more than arithmetic mean", () => {
      const signals = [makeSignal("sig_a", 0.1, 0.6), makeSignal("sig_b", 0.9, 0.2)];
      const gm = aggregateSignals(signals, roles, "geometric_mean", "source_quality");
      const am = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      assert.ok(gm.avg < am.avg, `geometric_mean(${gm.avg}) should be < arithmetic_mean(${am.avg})`);
    });

    it("returns 0 for empty signals", () => {
      const result = aggregateSignals([], roles, "geometric_mean", "source_quality");
      assert.strictEqual(result.avg, 0);
      assert.strictEqual(result.n, 0);
    });
  });

  describe("required_first", () => {
    it("weights required signals at 1.0 and optional at 0.5", () => {
      const signals = [
        makeSignal("sig_a", 0.8, 0.6),  // required
        makeSignal("sig_c", 0.4, 0.2),  // optional
      ];
      const result = aggregateSignals(signals, roles, "required_first", "source_quality");
      // (1.0 * 0.8 + 0.5 * 0.4) / (1.0 + 0.5) = 1.0 / 1.5 ≈ 0.6667
      const expected = (1.0 * 0.8 + 0.5 * 0.4) / 1.5;
      assert.strictEqual(result.avg, expected);
      assert.strictEqual(result.n, 2);
    });

    it("all required signals weight equally (1.0 each)", () => {
      const signals = [
        makeSignal("sig_a", 0.8, 0.6),
        makeSignal("sig_b", 0.4, 0.2),
      ];
      const result = aggregateSignals(signals, roles, "required_first", "source_quality");
      // Both required: (1.0*0.8 + 1.0*0.4) / 2.0 = 0.6
      assert.ok(Math.abs(result.avg - 0.6) < 1e-10, `expected ~0.6, got ${result.avg}`);
    });

    it("custom weights override defaults", () => {
      const signals = [
        makeSignal("sig_a", 0.8, 0.6),  // required
        makeSignal("sig_c", 0.4, 0.2),  // optional
      ];
      const customWeights = { required_weight: 2.0, optional_weight: 1.0 };
      const result = aggregateSignals(signals, roles, "required_first", "source_quality", customWeights);
      // (2.0 * 0.8 + 1.0 * 0.4) / (2.0 + 1.0) = 2.0 / 3.0 ≈ 0.6667
      const expected = (2.0 * 0.8 + 1.0 * 0.4) / 3.0;
      assert.strictEqual(result.avg, expected);
    });

    it("required signals pull average higher than optional when optional is weak", () => {
      const signals = [
        makeSignal("sig_a", 0.9, 0.6),  // required, high SQ
        makeSignal("sig_c", 0.1, 0.2),  // optional, low SQ
      ];
      const rf = aggregateSignals(signals, roles, "required_first", "source_quality");
      const am = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      // required_first should be closer to 0.9 than arithmetic_mean is
      assert.ok(rf.avg > am.avg, `required_first(${rf.avg}) should be > arithmetic_mean(${am.avg})`);
    });

    it("returns 0 for empty signals", () => {
      const result = aggregateSignals([], roles, "required_first", "source_quality");
      assert.strictEqual(result.avg, 0);
      assert.strictEqual(result.n, 0);
    });
  });

  describe("method comparison with asymmetric input", () => {
    const signals = [makeSignal("sig_a", 0.9, 0.6), makeSignal("sig_c", 0.1, 0.2)];
    const asymmetricRoles = { required: ["sig_a"], optional: ["sig_c"] };

    it("required_first ≥ arithmetic_mean ≥ geometric_mean for this asymmetric pair", () => {
      const rf = aggregateSignals(signals, asymmetricRoles, "required_first", "source_quality");
      const am = aggregateSignals(signals, asymmetricRoles, "arithmetic_mean", "source_quality");
      const gm = aggregateSignals(signals, asymmetricRoles, "geometric_mean", "source_quality");
      assert.ok(rf.avg >= am.avg, `required_first(${rf.avg}) >= arithmetic_mean(${am.avg})`);
      assert.ok(am.avg >= gm.avg, `arithmetic_mean(${am.avg}) >= geometric_mean(${gm.avg})`);
    });
  });

  // H-5.6: source_quality.score=null is excluded from the average, not treated as 0.
  // This follows the same pattern as confidence.js:312-316 which excludes null
  // components from the weighted average of source_quality.
  describe("H-5.6: null source_quality excluded from average", () => {
    it("1 of 2 signals with null SQ → average = known SQ (no distortion)", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),
        makeSignal("sig_b", 0.8, 0.4),
      ];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      assert.strictEqual(result.avg, 0.8); // only sig_b contributes
      assert.strictEqual(result.n, 1);
    });

    it("1 of 3 signals with null SQ → average of remaining 2", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),
        makeSignal("sig_b", 0.8, 0.4),
        makeSignal("sig_c", 0.6, 0.3),
      ];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      assert.ok(Math.abs(result.avg - 0.7) < 1e-10, `expected ~0.7, got ${result.avg}`); // (0.8 + 0.6) / 2
      assert.strictEqual(result.n, 2);
    });

    it("2 of 3 signals with null SQ → average = remaining known SQ", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),
        makeSignal("sig_b", null, 0.4),
        makeSignal("sig_c", 0.6, 0.3),
      ];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      assert.strictEqual(result.avg, 0.6); // only sig_c contributes
      assert.strictEqual(result.n, 1);
    });

    it("all signals with null SQ → avg=0, n=0 (excluded by minConfidence)", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),
        makeSignal("sig_b", null, 0.4),
      ];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "source_quality");
      assert.strictEqual(result.avg, 0);
      assert.strictEqual(result.n, 0);
    });

    it("geometric_mean with null SQ excludes null from product", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),
        makeSignal("sig_b", 0.8, 0.4),
        makeSignal("sig_c", 0.6, 0.3),
      ];
      const result = aggregateSignals(signals, roles, "geometric_mean", "source_quality");
      // geometric mean of [0.8, 0.6] = √(0.48) ≈ 0.6928
      assert.ok(Math.abs(result.avg - Math.sqrt(0.8 * 0.6)) < 1e-10);
      assert.strictEqual(result.n, 2);
    });

    it("required_first with null SQ skips null in weighted average", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),  // required, but SQ unknown
        makeSignal("sig_b", 0.8, 0.4),  // required
        makeSignal("sig_c", 0.6, 0.3),  // optional
      ];
      const result = aggregateSignals(signals, roles, "required_first", "source_quality");
      // sig_a skipped: (1.0*0.8 + 0.5*0.6) / (1.0 + 0.5) = 1.1 / 1.5 ≈ 0.7333
      const expected = (1.0 * 0.8 + 0.5 * 0.6) / 1.5;
      assert.ok(Math.abs(result.avg - expected) < 1e-10, `expected ~${expected}, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });

    it("signal_strength dimension is not affected by null SQ exclusion", () => {
      const signals = [
        makeSignal("sig_a", null, 0.6),
        makeSignal("sig_b", 0.8, 0.4),
      ];
      const result = aggregateSignals(signals, roles, "arithmetic_mean", "signal_strength");
      // signal_strength has no nulls → normal average
      assert.ok(Math.abs(result.avg - 0.5) < 1e-10, `expected ~0.5, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });
  });

  // H-5.19: type_weighted aggregation tests
  describe("type_weighted (H-5.19)", () => {
    const typeRoles = {
      required: ["anomaly_sig", "projected_sig", "categorical_sig"],
      optional: [],
      type_map: {
        anomaly_sig: "anomaly",
        projected_sig: "projected",
        categorical_sig: "categorical",
      },
    };

    it("weights anomaly signals higher than projected signals", () => {
      const signals = [
        makeSignal("anomaly_sig", 0.8, 0.8),     // type=anomaly, weight=1.0
        makeSignal("projected_sig", 0.8, 0.8),    // type=projected, weight=0.5
      ];
      const result = aggregateSignals(signals, typeRoles, "type_weighted", "source_quality");
      // Expected: (1.0*0.8 + 0.5*0.8) / (1.0 + 0.5) = 1.2 / 1.5 = 0.8
      // Both have same SQ but anomaly has higher weight → avg still 0.8
      assert.ok(Math.abs(result.avg - 0.8) < 1e-10, `expected ~0.8, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });

    it("gives more weight to observed evidence when scores differ", () => {
      const signals = [
        makeSignal("anomaly_sig", 0.9, 0.9),     // type=anomaly, weight=1.0
        makeSignal("projected_sig", 0.5, 0.5),    // type=projected, weight=0.5
      ];
      const result = aggregateSignals(signals, typeRoles, "type_weighted", "source_quality");
      // Expected: (1.0*0.9 + 0.5*0.5) / (1.0 + 0.5) = (0.9 + 0.25) / 1.5 = 1.15 / 1.5 ≈ 0.7667
      const expected = (1.0 * 0.9 + 0.5 * 0.5) / 1.5;
      assert.ok(Math.abs(result.avg - expected) < 1e-10, `expected ~${expected}, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });

    it("includes categorical signals with weight 0.8", () => {
      const signals = [
        makeSignal("categorical_sig", 0.7, 0.7),  // type=categorical, weight=0.8
        makeSignal("projected_sig", 0.7, 0.7),     // type=projected, weight=0.5
      ];
      const result = aggregateSignals(signals, typeRoles, "type_weighted", "source_quality");
      // Expected: (0.8*0.7 + 0.5*0.7) / (0.8 + 0.5) = (0.56 + 0.35) / 1.3 = 0.91 / 1.3 = 0.7
      const expected = (0.8 * 0.7 + 0.5 * 0.7) / 1.3;
      assert.ok(Math.abs(result.avg - expected) < 1e-10, `expected ~${expected}, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });

    it("all three signal types weighted correctly", () => {
      const signals = [
        makeSignal("anomaly_sig", 1.0, 1.0),       // type=anomaly, weight=1.0
        makeSignal("categorical_sig", 1.0, 1.0),   // type=categorical, weight=0.8
        makeSignal("projected_sig", 1.0, 1.0),     // type=projected, weight=0.5
      ];
      const result = aggregateSignals(signals, typeRoles, "type_weighted", "source_quality");
      // Expected: (1.0*1.0 + 0.8*1.0 + 0.5*1.0) / (1.0 + 0.8 + 0.5) = 2.3 / 2.3 = 1.0
      const expected = (1.0 + 0.8 + 0.5) / (1.0 + 0.8 + 0.5);
      assert.ok(Math.abs(result.avg - expected) < 1e-10, `expected ~${expected}, got ${result.avg}`);
      assert.strictEqual(result.n, 3);
    });

    it("excludes null SQ from weighted average (H-5.6 compatible)", () => {
      const signals = [
        makeSignal("anomaly_sig", null, 0.8),       // type=anomaly, SQ=null → excluded
        makeSignal("projected_sig", 0.6, 0.6),      // type=projected, weight=0.5
      ];
      const result = aggregateSignals(signals, typeRoles, "type_weighted", "source_quality");
      // anomaly_sig excluded (null SQ), only projected contributes → avg = 0.6
      assert.ok(Math.abs(result.avg - 0.6) < 1e-10, `expected ~0.6, got ${result.avg}`);
      assert.strictEqual(result.n, 1);
    });

    it("uses default weights when type_weights not provided", () => {
      const signals = [
        makeSignal("anomaly_sig", 0.8, 0.8),
        makeSignal("projected_sig", 0.8, 0.8),
      ];
      const rolesNoWeights = { ...typeRoles, type_map: typeRoles.type_map };
      const result = aggregateSignals(signals, rolesNoWeights, "type_weighted", "source_quality");
      // Same scores, same result regardless of weights → 0.8
      assert.ok(Math.abs(result.avg - 0.8) < 1e-10, `expected ~0.8, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });

    it("custom type_weights override defaults", () => {
      const signals = [
        makeSignal("anomaly_sig", 0.8, 0.8),
        makeSignal("projected_sig", 0.8, 0.8),
      ];
      const customWeights = { anomaly: 1.0, categorical: 0.8, projected: 0.9 };
      const result = aggregateSignals(signals, typeRoles, "type_weighted", "source_quality", { type_weights: customWeights });
      // With custom weights: (1.0*0.8 + 0.9*0.8) / (1.0 + 0.9) = 1.52 / 1.9 = 0.8
      // Same scores → same avg regardless of weights
      assert.ok(Math.abs(result.avg - 0.8) < 1e-10, `expected ~0.8, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });

    it("unknown signal type defaults to projected weight (0.5)", () => {
      const signals = [
        makeSignal("anomaly_sig", 0.8, 0.8),
        makeSignal("unknown_sig", 0.8, 0.8),  // not in type_map
      ];
      const result = aggregateSignals(signals, typeRoles, "type_weighted", "source_quality");
      // unknown_sig defaults to projected weight=0.5
      // Expected: (1.0*0.8 + 0.5*0.8) / (1.0 + 0.5) = 1.2 / 1.5 = 0.8
      assert.ok(Math.abs(result.avg - 0.8) < 1e-10, `expected ~0.8, got ${result.avg}`);
      assert.strictEqual(result.n, 2);
    });
  });
});
