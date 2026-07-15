export class StageError extends Error {
  constructor(stage, code, message, detail = {}) {
    super(message);
    this.name = "StageError";
    this.stage = stage;
    this.code = code;
    this.detail = detail;
  }

  toJSON() {
    return {
      stage: this.stage,
      code: this.code,
      message: this.message,
      detail: this.detail,
    };
  }
}

export class AcquisitionError extends StageError {
  constructor(source, code, message, detail = {}) {
    super("acquisition", code, `[${source}] ${message}`, { source, ...detail });
    this.name = "AcquisitionError";
    this.source = source;
  }
}

export class ValidationError extends StageError {
  constructor(source, code, message, detail = {}) {
    super("validation", code, `[${source}] ${message}`, { source, ...detail });
    this.name = "ValidationError";
    this.source = source;
  }
}

export class NormalizationError extends StageError {
  constructor(code, message, detail = {}) {
    super("normalization", code, message, detail);
    this.name = "NormalizationError";
  }
}

export class SignalError extends StageError {
  constructor(code, message, detail = {}) {
    super("signals", code, message, detail);
    this.name = "SignalError";
  }
}

export class RiskError extends StageError {
  constructor(code, message, detail = {}) {
    super("risk", code, message, detail);
    this.name = "RiskError";
  }
}

export class PresentationError extends StageError {
  constructor(code, message, detail = {}) {
    super("presentation", code, message, detail);
    this.name = "PresentationError";
  }
}

export class ConfigError extends StageError {
  constructor(configKey, message) {
    super("config", "CONFIG_ERROR", message, { configKey });
    this.name = "ConfigError";
  }
}

export function errorToStageStatus(error) {
  if (error instanceof StageError) return error.stage;
  return "unknown";
}
