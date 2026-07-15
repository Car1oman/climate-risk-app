import "dotenv/config";
import { v4 as uuid } from "uuid";
import { LocationSchema, SectorEnum } from "../shared/types.js";
import { EvidenceArtifactBuilder } from "../artifact/builder.js";

export class PipelineEngine {
  constructor({ stages = [] } = {}) {
    this.stages = new Map();
    this.artifacts = new Map();
    for (const stage of stages) {
      this.registerStage(stage);
    }
  }

  registerStage(stage) {
    if (!stage.stageId || !stage.execute) {
      throw new Error(`Stage must have stageId and execute()`);
    }
    this.stages.set(stage.stageId, stage);
  }

  async run(input) {
    if (input == null || typeof input !== "object") {
      throw Object.assign(new Error("engine: input must be a non-null object"), { code: "INVALID_INPUT" });
    }
    const { coordinates, sector, view = "executive" } = input;
    const validatedSector = SectorEnum.parse(sector);
    const location = LocationSchema.parse(coordinates);
    const executionId = uuid();
    const startTime = Date.now();
    const builder = new EvidenceArtifactBuilder().init(executionId, location, validatedSector);
    const pipelineState = { location, sector: validatedSector, view, execution_id: executionId };
    const sortedStages = [...this.stages.entries()].sort(([a], [b]) => a - b);

    for (const [id, stage] of sortedStages) {
      const stageStart = Date.now();
      const stageInput = { ...pipelineState };

      try {
        const result = await stage.execute(stageInput);
        const artifact = stage.wrapArtifact(stageInput, result, "success", null, stageStart);
        builder.addStage(artifact);
        if (result && typeof result === "object") {
          Object.assign(pipelineState, result);
        }
      } catch (err) {
        const artifact = stage.wrapArtifact(stageInput, null, "failed", err, stageStart);
        builder.addStage(artifact);
        return { success: false, error: err, artifact: builder.build() };
      }
    }

    builder.setFinalResult(pipelineState.assessments || []);
    const executive = pipelineState.response?.executive_summary || "";
    const analyst = pipelineState.response ? JSON.stringify(pipelineState.response) : "";
    builder.setNarratives(executive, analyst);

    const artifact = builder.build();
    this.artifacts.set(artifact.execution_id, artifact);
    this.artifacts.set(artifact.artifact_id, artifact);
    return { success: true, artifact };
  }

  getTrace(traceId) {
    const artifact = this.artifacts.get(traceId);
    if (!artifact) return null;
    return artifact;
  }
}
