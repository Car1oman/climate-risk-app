import { describe, it } from "node:test";
import assert from "node:assert";
import { SIGNAL_METADATA, inferHorizon, inferStatus, inferScenario } from "../../../pipeline/stages/05-phenomena/signal-metadata.js";

describe("SIGNAL_METADATA (H-5.9)", () => {
  it("anomaly signals have horizon corto", () => {
    assert.strictEqual(SIGNAL_METADATA.temperatura_actual_anomaly.type, "anomaly");
    assert.strictEqual(SIGNAL_METADATA.temperatura_actual_anomaly.horizon, "corto");
    assert.strictEqual(SIGNAL_METADATA.precipitacion_actual_anomaly.type, "anomaly");
    assert.strictEqual(SIGNAL_METADATA.precipitacion_actual_anomaly.horizon, "corto");
  });

  it("projected signals have correct horizons by suffix", () => {
    assert.strictEqual(SIGNAL_METADATA.temperatura_max_projection.horizon, "corto");
    assert.strictEqual(SIGNAL_METADATA.temperatura_max_projection_corto.horizon, "corto");
    assert.strictEqual(SIGNAL_METADATA.temperatura_max_projection_mediano.horizon, "mediano");
    assert.strictEqual(SIGNAL_METADATA.temperatura_max_projection_largo.horizon, "largo");
  });

  it("categorical signal has null horizon", () => {
    assert.strictEqual(SIGNAL_METADATA.enso_phase_categorical.type, "categorical");
    assert.strictEqual(SIGNAL_METADATA.enso_phase_categorical.horizon, null);
  });

  it("all known signals have type and horizon defined", () => {
    for (const [name, meta] of Object.entries(SIGNAL_METADATA)) {
      assert.ok(meta.type, `${name} should have a type`);
      assert.ok(["anomaly", "projected", "categorical", "static"].includes(meta.type),
        `${name} type should be valid, got ${meta.type}`);
    }
  });
});

describe("inferHorizon (H-5.9)", () => {
  it("returns corto for anomaly-only signals", () => {
    assert.strictEqual(inferHorizon(["temperatura_actual_anomaly"]), "corto");
  });

  it("returns largo when any signal is largo", () => {
    assert.strictEqual(
      inferHorizon(["temperatura_max_projection_corto", "temperatura_max_projection_largo"]),
      "largo"
    );
  });

  it("returns mediano when mediano present but no largo", () => {
    assert.strictEqual(
      inferHorizon(["temperatura_max_projection_corto", "temperatura_max_projection_mediano"]),
      "mediano"
    );
  });

  it("returns null for categorical-only signals", () => {
    assert.strictEqual(inferHorizon(["enso_phase_categorical"]), null);
  });

  it("returns corto for mixed corto+mediano (corto wins by priority)", () => {
    assert.strictEqual(
      inferHorizon(["temperatura_actual_anomaly", "temperatura_max_projection_mediano"]),
      "mediano"
    );
  });

  it("returns null for unknown signals", () => {
    assert.strictEqual(inferHorizon(["unknown_signal"]), null);
  });

  it("returns null for empty array", () => {
    assert.strictEqual(inferHorizon([]), null);
  });

  it("returns largo when largo dominates over corto", () => {
    assert.strictEqual(
      inferHorizon([
        "temperatura_actual_anomaly",
        "temperatura_max_projection_corto",
        "temperatura_max_projection_largo",
      ]),
      "largo"
    );
  });
});

describe("inferStatus (H-5.9)", () => {
  it("returns active for anomaly signals", () => {
    assert.strictEqual(inferStatus(["temperatura_actual_anomaly"]), "active");
  });

  it("returns active for categorical signals", () => {
    assert.strictEqual(inferStatus(["enso_phase_categorical"]), "active");
  });

  it("returns projected for all-projected signals", () => {
    assert.strictEqual(
      inferStatus(["temperatura_max_projection_corto", "temperatura_max_projection_mediano"]),
      "projected"
    );
  });

  it("returns active for mixed anomaly + projected signals", () => {
    assert.strictEqual(
      inferStatus(["temperatura_actual_anomaly", "temperatura_max_projection_largo"]),
      "active"
    );
  });

  it("returns active for mixed categorical + projected signals", () => {
    assert.strictEqual(
      inferStatus(["enso_phase_categorical", "temperatura_max_projection_mediano"]),
      "active"
    );
  });

  it("returns active for unknown signals (fallback)", () => {
    assert.strictEqual(inferStatus(["unknown_signal"]), "active");
  });

  it("returns active for empty array (fallback)", () => {
    assert.strictEqual(inferStatus([]), "active");
  });
});

describe("SIGNAL_METADATA scenario field (H-5.11)", () => {
  it("anomaly signals have scenario=null (present observations, no scenario)", () => {
    assert.strictEqual(SIGNAL_METADATA.temperatura_actual_anomaly.scenario, null);
    assert.strictEqual(SIGNAL_METADATA.precipitacion_actual_anomaly.scenario, null);
    assert.strictEqual(SIGNAL_METADATA.humidity_anomaly.scenario, null);
  });

  it("projected signals have scenario=null (HighResMIP, no SSP — HALLAZGO-8)", () => {
    assert.strictEqual(SIGNAL_METADATA.temperatura_max_projection.scenario, null);
    assert.strictEqual(SIGNAL_METADATA.temperatura_max_projection_mediano.scenario, null);
    assert.strictEqual(SIGNAL_METADATA.precipitacion_projection_largo.scenario, null);
  });

  it("categorical signals have scenario=null (discrete state, no scenario)", () => {
    assert.strictEqual(SIGNAL_METADATA.enso_phase_categorical.scenario, null);
  });

  it("all known signals have scenario field defined", () => {
    for (const [name, meta] of Object.entries(SIGNAL_METADATA)) {
      assert.ok("scenario" in meta, `${name} should have a scenario field`);
    }
  });
});

describe("inferScenario (H-5.11)", () => {
  it("returns null for anomaly signals (present observations)", () => {
    assert.strictEqual(inferScenario(["temperatura_actual_anomaly"]), null);
  });

  it("returns null for projected signals (HighResMIP, no SSP)", () => {
    assert.strictEqual(
      inferScenario(["temperatura_max_projection_mediano"]),
      null
    );
  });

  it("returns null for categorical signals (discrete state)", () => {
    assert.strictEqual(inferScenario(["enso_phase_categorical"]), null);
  });

  it("returns null for mixed signal types (all null scenarios)", () => {
    assert.strictEqual(
      inferScenario(["temperatura_actual_anomaly", "temperatura_max_projection_largo"]),
      null
    );
  });

  it("returns null for unknown signals", () => {
    assert.strictEqual(inferScenario(["unknown_signal"]), null);
  });

  it("returns null for empty array", () => {
    assert.strictEqual(inferScenario([]), null);
  });
});
