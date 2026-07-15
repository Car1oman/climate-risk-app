import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage05Phenomena } from "../../../pipeline/stages/05-phenomena/index.js";

describe("Stage05 - Phenomena", () => {
  it("should consolidate signals into phenomena", () => {
    const stage = new Stage05Phenomena();
    const result = stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.75 },
          signal_strength: { score: 0.65 },
        },
      ],
    });
    assert.ok(Array.isArray(result.phenomena));
    assert.ok(result.phenomena.length > 0);
    assert.ok(result.phenomena[0].phenomenon_id);
    assert.ok(result.phenomena[0].confidence);
    assert.ok(typeof result.phenomena[0].confidence.combined === "number");
  });

  // H-5.1: sequia/inundacion comparten las mismas señales de precipitación,
  // distinguidas solo por el signo de anomaly_value — sin este filtro, un
  // exceso de lluvia activaría "sequia" con la misma magnitud que un déficit.
  it("activates inundacion (not sequia) on a positive precipitation anomaly", () => {
    const stage = new Stage05Phenomena();
    const result = stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2",
          name: "precipitacion_projection",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
          anomaly_value: 40, // mm por encima de la línea base -> exceso de lluvia
        },
      ],
    });
    const inundacion = result.phenomena.find(p => p.name === "inundacion");
    const sequia = result.phenomena.find(p => p.name === "sequia");
    assert.strictEqual(inundacion.status, "active");
    assert.strictEqual(sequia.status, "not_detected");
  });

  it("activates sequia (not inundacion) on a negative precipitation anomaly", () => {
    const stage = new Stage05Phenomena();
    const result = stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee3",
          name: "precipitacion_projection",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
          anomaly_value: -40, // mm por debajo de la línea base -> déficit
        },
      ],
    });
    const inundacion = result.phenomena.find(p => p.name === "inundacion");
    const sequia = result.phenomena.find(p => p.name === "sequia");
    assert.strictEqual(sequia.status, "active");
    assert.strictEqual(inundacion.status, "not_detected");
  });

  it("activates el_nino only on exact categorical match", () => {
    const stage = new Stage05Phenomena();
    const result = stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee4",
          name: "enso_phase_categorical",
          value: "el_nino",
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const elNino = result.phenomena.find(p => p.name === "el_nino");
    const laNina = result.phenomena.find(p => p.name === "la_nina");
    assert.strictEqual(elNino.status, "active");
    assert.strictEqual(laNina.status, "not_detected");
  });

  // H-5.1: vientos_fuertes/deslizamiento/huayco no tienen ninguna señal viable
  // bajo la arquitectura actual de Stage 04 (ver excluded_phenomena en
  // phenomenon-definitions.json) — no deben aparecer nunca en el output, ni
  // siquiera como "not_detected", porque nunca se intentan.
  it("never emits excluded phenomena (vientos_fuertes, deslizamiento, huayco)", () => {
    const stage = new Stage05Phenomena();
    const result = stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee5",
          name: "wind_anomaly",
          source_quality: { score: 0.9 },
          signal_strength: { score: 0.9 },
        },
      ],
    });
    const names = result.phenomena.map(p => p.name);
    assert.ok(!names.includes("vientos_fuertes"));
    assert.ok(!names.includes("deslizamiento"));
    assert.ok(!names.includes("huayco"));
  });

  it("does not consider a phenomenon whose only matching signal is not in required_signals", () => {
    const stage = new Stage05Phenomena();
    // "temperatura_max_historico" no aparece en ninguna definición activa
    // (es 'static' y nunca sobrevive Stage 04 en producción) — aquí se usa
    // como una señal arbitraria fuera de cualquier required_signals/optional_signals
    // para verificar el gating, no para simular un caso real.
    const result = stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee6",
          name: "temperatura_max_historico",
          source_quality: { score: 0.9 },
          signal_strength: { score: 0.9 },
        },
      ],
    });
    assert.strictEqual(result.phenomena.length, 0);
  });
});
