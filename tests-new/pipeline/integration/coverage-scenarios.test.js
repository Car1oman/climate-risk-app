import { describe, it } from "node:test";
import assert from "node:assert";
import { PipelineEngine } from "../../../pipeline/orchestration/engine.js";
import { Stage01Acquisition } from "../../../pipeline/stages/01-acquisition/index.js";
import { Stage02Validation } from "../../../pipeline/stages/02-validation/index.js";
import { Stage03Normalization } from "../../../pipeline/stages/03-normalization/index.js";
import { Stage04Signals } from "../../../pipeline/stages/04-signals/index.js";
import { Stage05Phenomena } from "../../../pipeline/stages/05-phenomena/index.js";
import { Stage06Risk } from "../../../pipeline/stages/06-risk/index.js";
import { Stage07Presentation } from "../../../pipeline/stages/07-presentation/index.js";

function buildEngine() {
  return new PipelineEngine({
    stages: [
      new Stage01Acquisition(),
      new Stage02Validation(),
      new Stage03Normalization(),
      new Stage04Signals(),
      new Stage05Phenomena(),
      new Stage06Risk(),
      new Stage07Presentation(),
    ],
  });
}

describe("Quickstart Scenario 3 — Oceanic coordinates (no coverage)", () => {
  it("should complete pipeline with no phenomena for oceanic point", async () => {
    const engine = buildEngine();
    const result = await engine.run({
      coordinates: { lat: -30, lon: -90 },
      sector: "retail",
      view: "executive",
    });
    assert.ok(result.success);
    assert.ok(result.artifact);
    assert.equal(result.artifact.pipeline_summary.overall, "success");
    assert.ok(result.artifact.final_result.length === 0 || result.artifact.final_result.every(r => r.risk_level === "bajo"));
  });
});

describe("Quickstart Scenario 4 — Partial source failure resilience", () => {
  it("should complete pipeline if some sources fail", async () => {
    const engine = buildEngine();
    const result = await engine.run({
      coordinates: { lat: 40.7128, lon: -74.006 },
      sector: "finance",
      view: "analyst",
    });
    assert.ok(result.success);
    const acq = result.artifact.stages.find(s => s.stage_id === 1);
    assert.ok(acq);
    assert.ok(acq.output?.sources_consulted);
    const failed = acq.output.sources_consulted.filter(s => s.coverage_status === "failed");
    const available = acq.output.sources_consulted.filter(s => s.coverage_status === "available");
    assert.ok(available.length > 0 || failed.length > 0);
  });
});
