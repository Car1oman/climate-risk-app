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

describe("Integration — Ricardo Palma Pipeline", () => {
  it("should run end-to-end and produce complete evidence artifact with all 7 stages", async () => {
    const engine = new PipelineEngine({
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
    const result = await engine.run({
      coordinates: { lat: -11.8996, lon: -76.67358 },
      sector: "retail",
      view: "executive",
    });
    assert.ok(result.success);
    assert.ok(result.artifact);
    assert.equal(result.artifact.version, "2.0");
    assert.equal(result.artifact.pipeline_summary.total_stages, 7);
    assert.ok(result.artifact.stages.every(s => s.status !== "failed"));
    assert.ok(Array.isArray(result.artifact.final_result));
  });
});
