import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage07Presentation } from "../../../pipeline/stages/07-presentation/index.js";

describe("Stage07 - Presentation", () => {
  it("should produce executive view without technical details", () => {
    const stage = new Stage07Presentation();
    const result = stage.execute({
      location: { lat: -11.8996, lon: -76.67358, location_name: "Ricardo Palma" },
      sector: "retail",
      phenomena: [{ phenomenon_id: "id-1", name: "ola_de_calor", status: "active" }],
      assessments: [
        {
          phenomenon_id: "id-1",
          risk_level: "alto",
          risk_score_raw: 3.5,
          probability: { value: 3, source: "calculated" },
          impact: { value: 3, components: { exposure: 3, sensitivity: 3, adaptive_capacity: 3 } },
          adaptive_capacity: { score: 3, indicators_used: [] },
        },
      ],
      view: "executive",
    });
    assert.equal(result.view, "executive");
    assert.ok(result.response.executive_summary);
    assert.ok(result.response.recommendations.length > 0);
    assert.ok(result.response.overall_risk);
    assert.ok(!result.response.sources_used);
  });

  it("should extend executive with analyst details", () => {
    const stage = new Stage07Presentation();
    const result = stage.execute({
      location: { lat: -11.8996, lon: -76.67358 },
      sector: "retail",
      phenomena: [],
      assessments: [],
      view: "analyst",
    });
    assert.equal(result.view, "analyst");
    assert.ok(result.response.sources_used);
    assert.ok(result.response.risk_calculation);
  });
});
