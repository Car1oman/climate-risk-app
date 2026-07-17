import { v4 as uuid } from "uuid";
import { StageInterface } from "../shared/stage-interface.js";
import {
  LocationSchema,
  EvidenceArtifactSchema,
} from "../shared/types.js";

// @deprecated (G8, documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, MEDIA):
// esta clase NUNCA se instancia en ningún punto de producción del
// repositorio (verificado por grep exhaustivo de "new PipelineOrchestrator"
// — cero resultados). El orquestador real, usado por server/climate-v2.js
// (mountV2 → /api/v2/climate-risk), es PipelineEngine
// (pipeline/orchestration/engine.js). Ya lo confirmó explícitamente el
// propio código de Stage 07 (07-presentation/index.js, comentarios H-7.8/
// H-7.9) al tener que verificar por grep cuál de los dos archivos era "el
// motor real" antes de documentar su comportamiento.
//
// Esta clase difiere de PipelineEngine de forma no trivial — no es una
// copia idéntica: usa una fusión de estado distinta (namespacing
// `stage_0N_output` del stage inmediatamente anterior, además del aplanado
// plano), exige `stage instanceof StageInterface` al registrar, y
// reconstruye su propio `buildEvidenceArtifact()` en vez de reusar
// EvidenceArtifactBuilder (pipeline/artifact/builder.js). Si esta clase se
// reactiva alguna vez sin auditar esas diferencias, el pipeline resultante
// se comportaría de forma sutilmente distinta al camino de producción
// verificado — no reactivar sin revisar primero engine.js como referencia
// y decidir explícitamente cuál de las dos implementaciones es la correcta
// antes de mantener ambas.
export class PipelineOrchestrator {
  constructor({ stages = [], config = {} } = {}) {
    this.stages = new Map();
    this.config = config;
    for (const stage of stages) {
      this.registerStage(stage);
    }
  }

  registerStage(stage) {
    if (!(stage instanceof StageInterface)) {
      throw new Error(`Stage must extend StageInterface`);
    }
    this.stages.set(stage.stageId, stage);
  }

  async run(input) {
    const {
      coordinates,
      sector = "retail",
    } = input;

    const location = LocationSchema.parse(coordinates);
    const executionId = uuid();
    const startTime = Date.now();

    const stageArtifacts = [];
    let pipelineState = { location, sector };
    const sortedStages = [...this.stages.entries()].sort(([a], [b]) => a - b);

    for (const [id, stage] of sortedStages) {
      const stageStart = Date.now();
      try {
        const stageInput = { ...pipelineState };
        if (stageArtifacts.length > 0) {
          const prev = stageArtifacts[stageArtifacts.length - 1];
          stageInput[`stage_${String(prev.stage_id).padStart(2, "0")}_output`] = prev.output;
        }
        const result = await stage.execute(stageInput);
        const artifact = stage.wrapArtifact(stageInput, result, "success", null, stageStart);
        stageArtifacts.push(artifact);
        pipelineState = { ...pipelineState, ...result };
      } catch (err) {
        const artifact = stage.wrapArtifact(pipelineState, null, "failed", err, stageStart);
        stageArtifacts.push(artifact);
        const overall = this.buildEvidenceArtifact(
          executionId, location, sector, stageArtifacts, startTime
        );
        return { success: false, error: err, artifact: overall };
      }
    }

    const artifact = this.buildEvidenceArtifact(
      executionId, location, sector, stageArtifacts, startTime
    );
    return { success: true, artifact };
  }

  buildEvidenceArtifact(executionId, location, sector, stageArtifacts, startTime) {
    const passed = stageArtifacts.filter(a => a.status === "success").length;
    const partial = stageArtifacts.filter(a => a.status === "partial").length;
    const failed = stageArtifacts.filter(a => a.status === "failed").length;

    const overall =
      failed > 0 ? "failed" :
      partial > 0 ? "partial" :
      "success";

    const artifact = {
      artifact_id: uuid(),
      execution_id: executionId,
      version: "2.0",
      created_at: new Date().toISOString(),
      pipeline_summary: {
        total_stages: stageArtifacts.length,
        passed,
        partial,
        failed,
        overall,
      },
      stages: stageArtifacts,
      final_result: [],
      narratives: { executive: "", analyst: "" },
      rules_applied: [],
    };

    return artifact;
  }
}
