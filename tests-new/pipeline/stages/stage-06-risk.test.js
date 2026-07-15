import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage06Risk } from "../../../pipeline/stages/06-risk/index.js";

describe("Stage06 - Risk", () => {
  it("should calculate risk assessments from phenomena", () => {
    const stage = new Stage06Risk();
    const result = stage.execute({
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
});
