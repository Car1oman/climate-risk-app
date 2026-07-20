import "dotenv/config";
import { v4 as uuid } from "uuid";
import { LocationSchema, SectorEnum, ScenarioEnum } from "../shared/types.js";
import { EvidenceArtifactBuilder } from "../artifact/builder.js";
import { saveArtifact, loadArtifact } from "../artifact/persistence.js";

// G6 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, MEDIA-ALTA): el cache en
// memoria sigue existiendo como fast-path (evita I/O de disco en el caso común
// de consultar la traza de una ejecución reciente), pero ya no es la única
// copia — cada artefacto también se persiste a disco (pipeline/artifact/
// persistence.js) antes de que este Map crezca. Acotado a un tamaño máximo
// para no crecer sin límite mientras el proceso vive (el hallazgo original:
// "this.artifacts nunca se purga, fuga de memoria de crecimiento no acotado").
// Al superar el máximo, se evictan las entradas más antiguas (Map preserva
// orden de inserción en JS) — siguen recuperables desde disco vía getTrace().
const MAX_IN_MEMORY_ARTIFACTS = 200;

export class PipelineEngine {
  constructor({ stages = [] } = {}) {
    this.stages = new Map();
    this.artifacts = new Map();
    for (const stage of stages) {
      this.registerStage(stage);
    }
  }

  _cacheArtifact(artifact) {
    this.artifacts.set(artifact.execution_id, artifact);
    this.artifacts.set(artifact.artifact_id, artifact);
    // Cada artifact ocupa 2 entradas (execution_id + artifact_id) — evictar de
    // a 2 mantiene el límite efectivo en MAX_IN_MEMORY_ARTIFACTS ejecuciones,
    // no MAX_IN_MEMORY_ARTIFACTS/2.
    while (this.artifacts.size > MAX_IN_MEMORY_ARTIFACTS * 2) {
      const oldestKey = this.artifacts.keys().next().value;
      this.artifacts.delete(oldestKey);
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
    const { coordinates, sector, view = "executive", scenario = "ssp245" } = input;
    const validatedSector = SectorEnum.parse(sector);
    const validatedScenario = ScenarioEnum.parse(scenario);
    const location = LocationSchema.parse(coordinates);
    const executionId = uuid();
    const startTime = Date.now();
    const builder = new EvidenceArtifactBuilder().init(executionId, location, validatedSector);
    const pipelineState = { location, sector: validatedSector, scenario: validatedScenario, view, execution_id: executionId };
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
        const failedArtifact = builder.build();
        // G6: antes, un fallo de pipeline NUNCA quedaba en this.artifacts —
        // /trace/:traceId no podía resolverlo ni siquiera mientras el proceso
        // seguía vivo. Ahora se cachea y persiste igual que una ejecución
        // exitosa (la evidencia de POR QUÉ falló es tan auditable como la de
        // un resultado correcto). Persistencia a disco es best-effort: si
        // falla (disco lleno, permisos), no debe ocultar el error real del
        // pipeline al caller HTTP.
        this._cacheArtifact(failedArtifact);
        await saveArtifact(failedArtifact).catch(e =>
          console.warn(`[engine] failed to persist artifact ${failedArtifact.execution_id} to disk:`, e.message)
        );
        return { success: false, error: err, artifact: failedArtifact };
      }
    }

    builder.setFinalResult(pipelineState.assessments || []);
    const executive = pipelineState.response?.executive_summary || "";
    const analyst = pipelineState.response ? JSON.stringify(pipelineState.response) : "";
    builder.setNarratives(executive, analyst);

    const artifact = builder.build();
    this._cacheArtifact(artifact);
    // G6 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, MEDIA-ALTA): antes,
    // el artefacto de evidencia solo vivía en este Map — se perdía por
    // completo en cada reinicio de proceso (deploy, crash), y el trace_id que
    // Stage 07 cita en la narrativa ejecutiva ("evidencia completa en
    // trace_id=...") dejaba de ser resoluble. Persistencia best-effort: un
    // fallo de disco no debe romper la respuesta HTTP de una ejecución que sí
    // completó correctamente — se loguea y se continúa, la ejecución sigue
    // disponible desde el cache en memoria para el trace inmediato.
    await saveArtifact(artifact).catch(e =>
      console.warn(`[engine] failed to persist artifact ${artifact.execution_id} to disk:`, e.message)
    );
    return { success: true, artifact };
  }

  // G6: fast-path desde memoria (cubre el caso común: consultar la traza de
  // una ejecución reciente sin I/O de disco); si no está (evictada del Map
  // acotado, o de una ejecución de un proceso anterior al reinicio actual),
  // cae a disco vía pipeline/artifact/persistence.js antes de reportar 404.
  async getTrace(traceId) {
    const cached = this.artifacts.get(traceId);
    if (cached) return cached;
    return loadArtifact(traceId);
  }
}
