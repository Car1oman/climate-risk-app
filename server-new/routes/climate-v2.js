import { Router } from "express";
import { ZodError } from "zod";
import { PipelineEngine } from "../../pipeline/orchestration/engine.js";

export function createClimateRouter(engine) {
  const router = Router();

  router.post("/climate-risk", async (req, res) => {
    try {
      const { lat, lon, sector = "retail", view = "executive" } = req.body;

      if (lat == null || lon == null) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "lat and lon are required",
        });
      }

      const result = await engine.run({
        coordinates: { lat: Number(lat), lon: Number(lon) },
        sector,
        view,
      });

      if (!result.success) {
        return res.status(500).json({
          error: "PIPELINE_ERROR",
          message: result.error?.message || "Pipeline execution failed",
          artifact: result.artifact,
        });
      }

      return res.json({
        success: true,
        view,
        location: { lat: Number(lat), lon: Number(lon) },
        artifact_id: result.artifact.artifact_id,
        execution_id: result.artifact.execution_id,
        summary: result.artifact.pipeline_summary,
        data: result.artifact,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: err.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "),
        });
      }
      console.error("[climate-v2] Unhandled error:", err);
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  router.get("/climate-risk/:traceId/trace", (req, res) => {
    const { traceId } = req.params;
    const artifact = engine.getTrace(traceId);
    if (!artifact) {
      return res.status(404).json({ error: "TRACE_NOT_FOUND", message: `No artifact found for trace: ${traceId}` });
    }
    const traceDetail = {
      trace_id: traceId,
      execution_id: artifact.execution_id,
      created_at: artifact.created_at,
      pipeline_summary: artifact.pipeline_summary,
      stages: artifact.stages.map(s => ({
        stage_id: s.stage_id,
        stage_name: s.stage_name,
        status: s.status,
        duration_ms: s.duration_ms,
        rules_applied: s.rules_applied,
        error: s.error,
        output_summary: s.output ? Object.keys(s.output).slice(0, 5) : [],
      })),
      final_result: artifact.final_result,
    };
    return res.json(traceDetail);
  });

  router.get("/climate-risk/health", (req, res) => {
    res.json({ status: "ok", version: "2.0", stages_registered: engine.stages.size });
  });

  return router;
}
