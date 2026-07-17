import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage05Phenomena } from "../../../pipeline/stages/05-phenomena/index.js";
import { PhenomenonNameEnum, ClimatePhenomenonSchema } from "../../../pipeline/shared/types.js";

describe("Stage05 - Phenomena", () => {
  it("should consolidate signals into phenomena", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
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
  //
  // Corrección (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, hallazgo
  // encontrado al correr la suite tras el plan de remediación): estos 2 tests
  // esperaban status:"active", pero la única señal usada aquí
  // ("precipitacion_projection") es type:"projected" en SIGNAL_METADATA
  // (signal-metadata.js) — inferStatus() (H-5.9) correctamente infiere
  // status:"projected" cuando NINGUNA señal contribuyente es de tipo
  // "anomaly"/"categorical" (observada). El test quedó desactualizado desde
  // antes de que H-5.9 introdujera la inferencia de status por tipo de señal;
  // "active" aquí habría sido incorrecto (una proyección CMIP6 futura no es
  // una observación presente). El comportamiento real (verificado en
  // signal-metadata.js:106-115) es correcto — se corrige la expectativa del
  // test, no la implementación.
  it("activates inundacion (not sequia) on a positive precipitation anomaly", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
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
    assert.strictEqual(inundacion.status, "projected");
    assert.strictEqual(sequia.status, "not_detected");
  });

  it("activates sequia (not inundacion) on a negative precipitation anomaly", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
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
    assert.strictEqual(sequia.status, "projected");
    assert.strictEqual(inundacion.status, "not_detected");
  });

  it("activates el_nino only on exact categorical match", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
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
  it("never emits excluded phenomena (vientos_fuertes, deslizamiento, huayco)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
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

  it("does not consider a phenomenon whose only matching signal is not in required_signals", async () => {
    const stage = new Stage05Phenomena();
    // "temperatura_max_historico" no aparece en ninguna definición activa
    // (es 'static' y nunca sobrevive Stage 04 en producción) — aquí se usa
    // como una señal arbitraria fuera de cualquier required_signals/optional_signals
    // para verificar el gating, no para simular un caso real.
    const result = await stage.execute({
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

  // H-5.3: confidence_combination reads from thresholds.json, not hardcoded
  it("uses geometric_mean by default (from thresholds.json config)", async () => {
    const stage = new Stage05Phenomena();
    const sq = 0.75, ss = 0.65;
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1",
          name: "temperatura_actual_anomaly",
          source_quality: { score: sq },
          signal_strength: { score: ss },
        },
      ],
    });
    const expected = Math.sqrt(sq * ss);
    assert.strictEqual(result.phenomena[0].confidence.combined, expected);
  });

  it("rulesApplied includes H-5.3 resolution", async () => {
    const stage = new Stage05Phenomena();
    const h53 = stage.rulesApplied.find(r => r.includes("H-5.3"));
    assert.ok(h53, "rulesApplied should include H-5.3");
    assert.ok(h53.includes("confidence_combination"), "H-5.3 rule should mention confidence_combination");
    assert.ok(h53.includes("thresholds.json"), "H-5.3 rule should reference thresholds.json");
  });

  it("rulesApplied includes H-5.4 resolution", async () => {
    const stage = new Stage05Phenomena();
    const h54 = stage.rulesApplied.find(r => r.includes("H-5.4"));
    assert.ok(h54, "rulesApplied should include H-5.4");
    assert.ok(h54.includes("signal_aggregation"), "H-5.4 rule should mention signal_aggregation");
    assert.ok(h54.includes("arithmetic_mean"), "H-5.4 rule should mention arithmetic_mean as default");
    assert.ok(h54.includes("required_first"), "H-5.4 rule should mention required_first");
  });

  it("rulesApplied includes H-5.5 penalization documentation", async () => {
    const stage = new Stage05Phenomena();
    const h55 = stage.rulesApplied.find(r => r.includes("H-5.5"));
    assert.ok(h55, "rulesApplied should include H-5.5");
    assert.ok(h55.includes("penalización"), "H-5.5 rule should mention penalización");
    assert.ok(h55.includes("no sustituibles"), "H-5.5 rule should reference non-substitutability");
  });

  it("rulesApplied includes H-5.6 null SQ exclusion documentation", async () => {
    const stage = new Stage05Phenomena();
    const h56 = stage.rulesApplied.find(r => r.includes("H-5.6"));
    assert.ok(h56, "rulesApplied should include H-5.6");
    assert.ok(h56.includes("null"), "H-5.6 rule should mention null");
    assert.ok(h56.includes("excluye"), "H-5.6 rule should mention exclusion");
    assert.ok(h56.includes("confidence.js"), "H-5.6 rule should reference confidence.js precedent");
  });

  it("rulesApplied includes H-5.7 phenomenon activation threshold documentation", async () => {
    const stage = new Stage05Phenomena();
    const h57 = stage.rulesApplied.find(r => r.includes("H-5.7"));
    assert.ok(h57, "rulesApplied should include H-5.7");
    assert.ok(h57.includes("min_phenomenon_activation"), "H-5.7 rule should mention min_phenomenon_activation");
    assert.ok(h57.includes("min_signal_strength"), "H-5.7 rule should reference min_signal_strength as distinct");
    assert.ok(h57.includes("compatibilidad"), "H-5.7 rule should mention backward compatibility");
  });

  // H-5.7: min_phenomenon_activation defaults to min_signal_strength (0.40).
  // A signal with SS >= 0.40 activates the phenomenon — same behavior as before,
  // but now the threshold is configurable separately.
  it("numeric phenomenon activates when signal_strength >= min_phenomenon_activation (default 0.40)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee7",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.45 }, // >= 0.40 (min_phenomenon_activation default)
          anomaly_value: 2.5,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.status, "active");
  });

  it("numeric phenomenon does not activate when signal_strength < min_phenomenon_activation", async () => {
    const stage = new Stage05Phenomena();
    // SS=0.35 < 0.40 (min_phenomenon_activation default) — should not activate
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee8",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.35 },
          anomaly_value: 2.5,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    // Phenomenon is emitted (SQ passes minConfidence) but status = not_detected
    // because SS < min_phenomenon_activation
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.status, "not_detected");
  });

  // H-5.8: categorical activation uses exact comparison (s.value === matchValue).
  // allowedValues validates that s.value is a known value before comparing.
  // Case-mismatched values ("El_Nino") must NOT activate even if allowedValues
  // includes the lowercase version — exact comparison is intentional to avoid
  // masking upstream bugs.
  it("rulesApplied includes H-5.8 exact comparison documentation", async () => {
    const stage = new Stage05Phenomena();
    const h58 = stage.rulesApplied.find(r => r.includes("H-5.8"));
    assert.ok(h58, "rulesApplied should include H-5.8");
    assert.ok(h58.includes("exacta"), "H-5.8 rule should mention exact comparison");
    assert.ok(h58.includes("allowedValues"), "H-5.8 rule should mention allowedValues");
    assert.ok(h58.includes("enso-classification.js"), "H-5.8 rule should reference enso-classification.js");
  });

  it("case-mismatched categorical value does NOT activate phenomenon (H-5.8)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee9",
          name: "enso_phase_categorical",
          value: "El_Nino", // case-mismatch: should be "el_nino"
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const elNino = result.phenomena.find(p => p.name === "el_nino");
    assert.ok(elNino, "el_nino should be present");
    assert.strictEqual(elNino.status, "not_detected"); // not activated due to case mismatch
  });

  it("exact match activates categorical phenomenon (H-5.8)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeA",
          name: "enso_phase_categorical",
          value: "el_nino", // exact match
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const elNino = result.phenomena.find(p => p.name === "el_nino");
    assert.ok(elNino, "el_nino should be present");
    assert.strictEqual(elNino.status, "active");
  });

  it("unknown categorical value does NOT activate phenomenon even without allowedValues (H-5.8)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeB",
          name: "enso_phase_categorical",
          value: "elnino", // no hyphen, no match
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const elNino = result.phenomena.find(p => p.name === "el_nino");
    assert.ok(elNino, "el_nino should be present");
    assert.strictEqual(elNino.status, "not_detected");
  });

  // H-5.9: status and horizon are inferred from contributing signal types,
  // not hardcoded. status="projected" only when ALL signals are projected.
  // horizon inferred from signal name suffixes (_corto/_mediano/_largo).
  it("rulesApplied includes H-5.9 horizon inference documentation", async () => {
    const stage = new Stage05Phenomena();
    const h59 = stage.rulesApplied.find(r => r.includes("H-5.9"));
    assert.ok(h59, "rulesApplied should include H-5.9");
    assert.ok(h59.includes("infieren"), "H-5.9 rule should mention inference (infieren)");
    assert.ok(h59.includes("signal-metadata.js"), "H-5.9 rule should reference signal-metadata.js");
    assert.ok(h59.includes("projected"), "H-5.9 rule should mention projected status");
  });

  it("categorical phenomenon (ENSO) gets status=active, horizon=null (H-5.9)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeC",
          name: "enso_phase_categorical",
          value: "el_nino",
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const elNino = result.phenomena.find(p => p.name === "el_nino");
    assert.strictEqual(elNino.status, "active");
    assert.strictEqual(elNino.horizon, null); // categorical = no temporal band
  });

  it("anomaly-only phenomenon gets status=active, horizon=corto (H-5.9)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeD",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
          anomaly_value: 2.5,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.status, "active");
    assert.strictEqual(olaDeCalor.horizon, "corto");
  });

  it("projected-only phenomenon gets status=projected with correct horizon (H-5.9)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeE",
          name: "temperatura_max_projection_mediano",
          source_quality: { score: 0.7 },
          signal_strength: { score: 0.5 },
          anomaly_value: 3.0,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.status, "projected");
    assert.strictEqual(olaDeCalor.horizon, "mediano");
  });

  it("mixed anomaly+projected phenomenon gets status=active, horizon=largo (H-5.9)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeF",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
          anomaly_value: 2.5,
        },
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeG",
          name: "temperatura_max_projection_largo",
          source_quality: { score: 0.7 },
          signal_strength: { score: 0.5 },
          anomaly_value: 3.0,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.status, "active"); // anomaly present → active
    assert.strictEqual(olaDeCalor.horizon, "largo"); // largo wins over corto
  });

  it("not_detected phenomenon still gets horizon=null (H-5.9)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeH",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.35 }, // below min_phenomenon_activation
          anomaly_value: 2.5,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.status, "not_detected");
    assert.strictEqual(olaDeCalor.horizon, null); // not detected = no horizon
  });

  // H-5.10: phenomena_not_detected provides negative evidence for every
  // phenomenon that wasn't activated, with specific reason and quantitative evidence.
  it("rulesApplied includes H-5.10 negative evidence documentation", async () => {
    const stage = new Stage05Phenomena();
    const h510 = stage.rulesApplied.find(r => r.includes("H-5.10"));
    assert.ok(h510, "rulesApplied should include H-5.10");
    assert.ok(h510.includes("phenomena_not_detected"), "H-5.10 rule should mention phenomena_not_detected");
    assert.ok(h510.includes("evidence"), "H-5.10 rule should mention evidence");
  });

  it("returns phenomena_not_detected array in output (H-5.10)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({ signals: [] });
    assert.ok(Array.isArray(result.phenomena_not_detected), "phenomena_not_detected should be an array");
  });

  it("records phenomena with no matching signals in phenomena_not_detected (H-5.10)", async () => {
    const stage = new Stage05Phenomena();
    // Send a signal that doesn't match any phenomenon's required_signals
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeI",
          name: "elevation_baseline",
          source_quality: { score: 0.9 },
          signal_strength: { score: 0.5 },
        },
      ],
    });
    // elevation_baseline is not in any required_signals → all phenomena skipped
    assert.ok(result.phenomena_not_detected.length > 0, "should have phenomena_not_detected entries");
    const entry = result.phenomena_not_detected[0];
    assert.ok(entry.name, "should have name");
    assert.ok(entry.reason.includes("Sin señales"), "reason should mention no signals");
    assert.ok(entry.evidence.includes("Señales requeridas esperadas"), "evidence should list expected signals");
  });

  it("records SQ below threshold in phenomena_not_detected (H-5.10)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeJ",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.15 }, // below min_source_quality (0.30)
          signal_strength: { score: 0.6 },
        },
      ],
    });
    const notDetected = result.phenomena_not_detected.find(n => n.name === "ola_de_calor");
    assert.ok(notDetected, "ola_de_calor should be in phenomena_not_detected");
    assert.ok(notDetected.reason.includes("Calidad de fuente insuficiente"), "reason should mention SQ");
    assert.ok(notDetected.evidence.includes("SQ="), "evidence should include SQ values");
    assert.ok(notDetected.evidence.includes("0.15"), "evidence should include actual SQ value");
  });

  it("records activation failure in phenomena_not_detected (H-5.10)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeK",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.35 }, // below min_phenomenon_activation (0.40)
          anomaly_value: 2.5,
        },
      ],
    });
    const notDetected = result.phenomena_not_detected.find(n => n.name === "ola_de_calor");
    assert.ok(notDetected, "ola_de_calor should be in phenomena_not_detected");
    assert.ok(notDetected.reason.includes("sin evidencia de activación"), "reason should mention activation failure");
    assert.ok(notDetected.evidence.includes("SS="), "evidence should include SS values");
  });

  it("records categorical mismatch in phenomena_not_detected (H-5.10)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeL",
          name: "enso_phase_categorical",
          value: "neutral", // not el_nino or la_nina
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const notDetected = result.phenomena_not_detected.find(n => n.name === "el_nino");
    assert.ok(notDetected, "el_nino should be in phenomena_not_detected");
    assert.ok(notDetected.reason.includes("sin evidencia de activación"), "reason should mention activation failure");
    assert.ok(notDetected.evidence.includes("matchValue"), "evidence should mention matchValue comparison");
    assert.ok(notDetected.evidence.includes("neutral"), "evidence should include actual signal value");
  });

  it("detected phenomena still appear in phenomena (not in phenomena_not_detected) (H-5.10)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeM",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
          anomaly_value: 2.5,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be in phenomena");
    assert.strictEqual(olaDeCalor.status, "active");
    const notDetected = result.phenomena_not_detected.find(n => n.name === "ola_de_calor");
    assert.ok(!notDetected, "ola_de_calor should NOT be in phenomena_not_detected when active");
  });

  // H-5.11: scenario is inferred from signal metadata, not hardcoded to null.
  // Today all signals have scenario=null (HighResMIP, no SSP — HALLAZGO-8).
  it("rulesApplied includes H-5.11 scenario inference documentation", async () => {
    const stage = new Stage05Phenomena();
    const h511 = stage.rulesApplied.find(r => r.includes("H-5.11"));
    assert.ok(h511, "rulesApplied should include H-5.11");
    assert.ok(h511.includes("scenario"), "H-5.11 rule should mention scenario");
    assert.ok(h511.includes("HALLAZGO-8"), "H-5.11 rule should reference HALLAZGO-8");
  });

  it("phenomenon scenario is null for anomaly signals (H-5.11)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeN",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
          anomaly_value: 2.5,
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.scenario, null, "scenario should be null for anomaly signals (HighResMIP)");
  });

  it("phenomenon scenario is null for projected signals (H-5.11)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeO",
          name: "temperatura_max_projection_mediano",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
        },
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present");
    assert.strictEqual(olaDeCalor.scenario, null, "scenario should be null for projected signals (HighResMIP)");
  });

  it("phenomenon scenario is null for categorical signals (H-5.11)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeP",
          name: "enso_phase_categorical",
          value: "el_nino",
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const elNino = result.phenomena.find(p => p.name === "el_nino");
    assert.ok(elNino, "el_nino should be present");
    assert.strictEqual(elNino.scenario, null, "scenario should be null for categorical signals");
  });

  it("not_detected phenomenon has scenario=null (H-5.11)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeQ",
          name: "enso_phase_categorical",
          value: "neutral",
          source_quality: { score: 0.9 },
          signal_strength: { score: 1.0 },
        },
      ],
    });
    const elNino = result.phenomena.find(p => p.name === "el_nino");
    assert.ok(elNino, "el_nino should be present");
    assert.strictEqual(elNino.status, "not_detected");
    assert.strictEqual(elNino.scenario, null, "scenario should be null for not_detected phenomena");
  });

  // H-5.12: defensive input validation — malformed signals are excluded
  it("rulesApplied includes H-5.12 input validation documentation", async () => {
    const stage = new Stage05Phenomena();
    const h512 = stage.rulesApplied.find(r => r.includes("H-5.12"));
    assert.ok(h512, "rulesApplied should include H-5.12");
    assert.ok(h512.includes("validación defensiva"), "H-5.12 rule should mention validation");
  });

  it("returns empty result when signals is not an array (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({ signals: undefined });
    assert.deepStrictEqual(result.phenomena, []);
    assert.deepStrictEqual(result.phenomena_not_detected, []);
  });

  it("returns empty result when input has no signals field (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({});
    assert.deepStrictEqual(result.phenomena, []);
    assert.deepStrictEqual(result.phenomena_not_detected, []);
  });

  it("returns empty result when signals is null (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({ signals: null });
    assert.deepStrictEqual(result.phenomena, []);
    assert.deepStrictEqual(result.phenomena_not_detected, []);
  });

  it("filters out signals missing name field (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        { source_quality: { score: 0.8 }, signal_strength: { score: 0.6 } }, // missing name
      ],
    });
    assert.deepStrictEqual(result.phenomena, []);
    const malformed = result.phenomena_not_detected.filter(n => n.name === "señal_malformada");
    assert.ok(malformed.length > 0, "should have malformed signal entries");
    assert.ok(malformed[0].evidence.includes("name"), "evidence should mention missing name");
  });

  it("filters out signals missing source_quality (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        { name: "temperatura_actual_anomaly", signal_strength: { score: 0.6 } }, // missing source_quality
      ],
    });
    assert.deepStrictEqual(result.phenomena, []);
    const malformed = result.phenomena_not_detected.filter(n => n.name === "señal_malformada");
    assert.ok(malformed.length > 0, "should have malformed signal entries");
    assert.ok(malformed[0].evidence.includes("source_quality"), "evidence should mention missing source_quality");
  });

  it("filters out signals missing signal_strength (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        { name: "temperatura_actual_anomaly", source_quality: { score: 0.8 } }, // missing signal_strength
      ],
    });
    assert.deepStrictEqual(result.phenomena, []);
    const malformed = result.phenomena_not_detected.filter(n => n.name === "señal_malformada");
    assert.ok(malformed.length > 0, "should have malformed signal entries");
    assert.ok(malformed[0].evidence.includes("signal_strength"), "evidence should mention missing signal_strength");
  });

  it("filters out non-object signals (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: ["not_an_object", 42, null],
    });
    assert.deepStrictEqual(result.phenomena, []);
    const malformed = result.phenomena_not_detected.filter(n => n.name === "señal_malformada");
    assert.strictEqual(malformed.length, 3, "should have 3 malformed signal entries");
  });

  it("processes valid signals even when mixed with malformed ones (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        { source_quality: { score: 0.8 }, signal_strength: { score: 0.6 } }, // missing name → malformed
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeR",
          name: "temperatura_actual_anomaly",
          source_quality: { score: 0.8 },
          signal_strength: { score: 0.6 },
          anomaly_value: 2.5,
        }, // valid
      ],
    });
    const olaDeCalor = result.phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(olaDeCalor, "ola_de_calor should be present from valid signal");
    const malformed = result.phenomena_not_detected.filter(n => n.name === "señal_malformada");
    assert.ok(malformed.length > 0, "should have malformed signal entry for the invalid one");
  });

  it("accepts signals with source_quality.score = null (H-5.6 compatible) (H-5.12)", async () => {
    const stage = new Stage05Phenomena();
    const result = await stage.execute({
      signals: [
        {
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeS",
          name: "temperatura_actual_anomaly",
          source_quality: { score: null },
          signal_strength: { score: 0.6 },
          anomaly_value: 2.5,
        },
      ],
    });
    // SQ=null should not cause validation error — it's a valid state per H-5.6
    const malformed = result.phenomena_not_detected.filter(n => n.name === "señal_malformada");
    assert.strictEqual(malformed.length, 0, "null SQ should not be flagged as malformed");
  });

  // H-5.18: PhenomenonNameEnum validation
  describe("H-5.18: PhenomenonNameEnum — validación de nombres de fenómeno", () => {
    it("accepts all 9 valid phenomenon names", async () => {
      const validNames = [
        "ola_de_calor", "ola_de_frio", "sequia", "inundacion",
        "el_nino", "la_nina", "vientos_fuertes", "deslizamiento", "huayco",
      ];
      for (const name of validNames) {
        const result = PhenomenonNameEnum.safeParse(name);
        assert.ok(result.success, `PhenomenonNameEnum should accept "${name}"`);
      }
    });

    it("rejects invalid phenomenon names (typos)", async () => {
      const invalidNames = [
        "ola_de_calr",      // typo: missing 'o'
        "sequía",           // wrong: accent
        "inundaciones",     // wrong: plural
        "el_niño",          // wrong: accent
        "tornado",          // unknown phenomenon
        "",                 // empty string
        "OLA_DE_CALOR",     // wrong: uppercase
      ];
      for (const name of invalidNames) {
        const result = PhenomenonNameEnum.safeParse(name);
        assert.ok(!result.success, `PhenomenonNameEnum should reject "${name}"`);
      }
    });

    it("ClimatePhenomenonSchema validates name via PhenomenonNameEnum", async () => {
      const base = {
        phenomenon_id: "12345678-1234-4234-8234-123456789abc",
        name: "ola_de_calor",
        status: "active",
        confidence: { source_quality: 0.8, signal_strength: 0.7, combined: 0.748 },
        contributing_signals: [],
      };
      assert.ok(ClimatePhenomenonSchema.safeParse(base).success, "valid phenomenon should pass");

      const invalid = { ...base, name: "ola_de_calr" };
      assert.ok(!ClimatePhenomenonSchema.safeParse(invalid).success, "typo in name should fail");
    });

    it("rulesApplied documents H-5.18", async () => {
      const stage = new Stage05Phenomena();
      const rulesApplied = stage.rulesApplied || [];
      const h518 = rulesApplied.find(r => r.includes("H-5.18"));
      assert.ok(h518, "rulesApplied should document H-5.18 PhenomenonNameEnum");
    });
  });
});

