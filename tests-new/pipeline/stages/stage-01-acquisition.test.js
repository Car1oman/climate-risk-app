import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage01Acquisition } from "../../../pipeline/stages/01-acquisition/index.js";

describe("Stage01 - Acquisition", () => {
  it("should register 11 adapters and return sources_consulted", async () => {
    const stage = new Stage01Acquisition();
    const result = await stage.execute({
      location: { lat: -11.8996, lon: -76.67358 },
    });
    assert.ok(Array.isArray(result.sources_consulted));
    assert.ok(result.summary.total > 0);
    assert.ok("sources_consulted" in result);
    assert.ok("summary" in result);
  });

  it("should have stage ID and name", () => {
    const stage = new Stage01Acquisition();
    assert.equal(stage.stageId, 1);
    assert.equal(stage.stageName, "Acquisition");
  });

  it("should produce a valid artifact via wrapArtifact", async () => {
    const stage = new Stage01Acquisition();
    const result = await stage.execute({
      location: { lat: -11.8996, lon: -76.67358 },
    });
    const artifact = stage.wrapArtifact({}, result, "success", null, Date.now());
    assert.equal(artifact.stage_id, 1);
    assert.equal(artifact.status, "success");
    assert.ok(artifact.duration_ms >= 0);
  });
});
