export class StageInterface {
  constructor(stageId, stageName) {
    this.stageId = stageId;
    this.stageName = stageName;
    this.rulesApplied = [];
  }

  async execute(input) {
    throw new Error(`Stage ${this.stageName} must implement execute()`);
  }

  wrapArtifact(input, output, status, error = null, startTime) {
    const duration = Date.now() - startTime;
    return {
      stage_id: this.stageId,
      stage_name: this.stageName,
      input: this.sanitizeInput(input),
      output: this.sanitizeOutput(output),
      rules_applied: [...this.rulesApplied],
      duration_ms: duration,
      status,
      error: error ? { code: error.code, message: error.message, detail: error.detail } : null,
    };
  }

  sanitizeInput(input) {
    if (!input) return {};
    if (input.response) {
      return { ...input, response: "[raw_response]" };
    }
    return input;
  }

  sanitizeOutput(output) {
    if (!output) return {};
    return output;
  }
}
