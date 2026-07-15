import { describe, it } from "node:test";
import assert from "node:assert";
import express from "express";
import { PipelineEngine } from "../../pipeline/orchestration/engine.js";
import { createClimateRouter } from "../../server-new/routes/climate-v2.js";
import { Stage01Acquisition } from "../../pipeline/stages/01-acquisition/index.js";
import { Stage02Validation } from "../../pipeline/stages/02-validation/index.js";
import { Stage03Normalization } from "../../pipeline/stages/03-normalization/index.js";
import { Stage04Signals } from "../../pipeline/stages/04-signals/index.js";
import { Stage05Phenomena } from "../../pipeline/stages/05-phenomena/index.js";
import { Stage06Risk } from "../../pipeline/stages/06-risk/index.js";
import { Stage07Presentation } from "../../pipeline/stages/07-presentation/index.js";

describe("API — POST /api/v2/climate-risk", () => {
  it("should respond with risk assessment for valid coordinates", async () => {
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
    const app = express();
    app.use(express.json());
    app.use("/api/v2", createClimateRouter(engine));
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://localhost:${port}/api/v2/climate-risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: -11.8996, lon: -76.67358, sector: "retail" }),
      });
      const body = await res.json();
      assert.ok(body.success);
      assert.ok(body.artifact_id);
      assert.ok(body.summary);
    } finally {
      server.close();
    }
  });

  it("should serve trace endpoint with stored artifact", async () => {
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
    const app = express();
    app.use(express.json());
    app.use("/api/v2", createClimateRouter(engine));
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://localhost:${port}/api/v2/climate-risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: -11.8996, lon: -76.67358 }),
      });
      const body = await res.json();
      const traceRes = await fetch(`http://localhost:${port}/api/v2/climate-risk/${body.artifact_id}/trace`);
      assert.equal(traceRes.status, 200);
      const trace = await traceRes.json();
      assert.ok(trace.trace_id);
      assert.equal(trace.pipeline_summary.total_stages, 7);
    } finally {
      server.close();
    }
  });

  it("should reject requests without coordinates", async () => {
    const engine = new PipelineEngine();
    const app = express();
    app.use(express.json());
    app.use("/api/v2", createClimateRouter(engine));
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://localhost:${port}/api/v2/climate-risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: "retail" }),
      });
      assert.equal(res.status, 400);
    } finally {
      server.close();
    }
  });
});
