import { v4 as uuid } from "uuid";

export class EvidenceArtifactBuilder {
  constructor() {
    this.version = "2.0";
    this.reset();
  }

  reset() {
    this._executionId = null;
    this._stages = [];
    this._finalResult = [];
    this._narratives = { executive: "", analyst: "" };
    this._rulesApplied = new Set();
    this._location = null;
    this._sector = null;
    return this;
  }

  init(executionId, location, sector) {
    this._executionId = executionId;
    this._location = location;
    this._sector = sector;
    return this;
  }

  addStage(artifact) {
    this._stages.push(artifact);
    for (const rule of (artifact.rules_applied || [])) {
      this._rulesApplied.add(rule);
    }
    return this;
  }

  setFinalResult(assessments) {
    this._finalResult = assessments;
    return this;
  }

  setNarratives(executive, analyst = "") {
    this._narratives = { executive, analyst };
    return this;
  }

  build() {
    const passed = this._stages.filter(s => s.status === "success").length;
    const partial = this._stages.filter(s => s.status === "partial").length;
    const failed = this._stages.filter(s => s.status === "failed").length;

    const overall =
      failed > 0 ? "failed" :
      partial > 0 ? "partial" :
      "success";

    return {
      artifact_id: uuid(),
      execution_id: this._executionId,
      version: this.version,
      created_at: new Date().toISOString(),
      pipeline_summary: {
        total_stages: this._stages.length,
        passed,
        partial,
        failed,
        overall,
      },
      stages: [...this._stages],
      final_result: [...this._finalResult],
      narratives: { ...this._narratives },
      rules_applied: [...this._rulesApplied],
    };
  }
}
