// Auditoría de transformación de datos (hallazgo P2) + auditoría de brecha
// funcional (D1 §2-3) + plan de implementación: verifica que el escenario
// climático (ssp245/ssp585) se propaga correctamente y sin mezclarse desde
// Stage 03 (extracción) hasta Stage 07 (respuesta de presentación), usando
// como fixture los datos crudos REALES documentados en
// documentacion-v2/DATOS-CRUDOS.md para la coordenada -18.5, -80.75
// (supabase_climate_cells, climate_cells id=4).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Stage03Normalization } from "../../../pipeline/stages/03-normalization/index.js";
import { Stage04Signals } from "../../../pipeline/stages/04-signals/index.js";
import { Stage05Phenomena } from "../../../pipeline/stages/05-phenomena/index.js";
import { Stage07Presentation } from "../../../pipeline/stages/07-presentation/index.js";

// Recorte fiel del payload real de climate_cells para (-18.5, -80.75) —
// documentacion-v2/DATOS-CRUDOS.md línea 4 — solo tasmax/pr (los 2 índices
// que este cambio extrae por escenario) para mantener el fixture legible;
// los valores numéricos son los publicados por la fuente, no inventados.
const RAW_CLIMATE_CELL = {
  historical: {
    tasmax: { p10: 19.152, p90: 19.443, median: 19.274 },
    pr: { p10: 115.171, p90: 121.511, median: 118.746 },
  },
  "ensemble-all-ssp245_2020-2039": {
    tasmax: { p10: 19.549, p90: 20.094, median: 19.743 },
    pr: { p10: 113.03, p90: 123.288, median: 119.378 },
  },
  "ensemble-all-ssp245_2040-2059": {
    tasmax: { p10: 19.789, p90: 20.569, median: 20.109 },
    pr: { p10: 112.872, p90: 125.869, median: 119.311 },
  },
  "ensemble-all-ssp585_2020-2039": {
    tasmax: { p10: 19.478, p90: 20.157, median: 19.82 },
    pr: { p10: 115.434, p90: 124.514, median: 120.003 },
  },
  "ensemble-all-ssp585_2040-2059": {
    tasmax: { p10: 20.048, p90: 20.927, median: 20.398 },
    pr: { p10: 112.433, p90: 126.09, median: 120.335 },
  },
};

function buildSupabaseSource() {
  return {
    source_name: "supabase_climate_cells",
    source_domain: "precomputed_grid",
    authority_level: "primary",
    request: { endpoint: "supabase climate_cells", params: { lat: -18.5, lon: -80.75 }, timestamp: new Date().toISOString() },
    response: RAW_CLIMATE_CELL,
    status_code: 200,
    duration_ms: 10,
    coverage_status: "available",
    spatial_distance_km: 0,
    resolution_native: "0.25° (~28km)",
  };
}

async function runStage3(scenario) {
  const stage3 = new Stage03Normalization();
  return stage3.execute({
    location: { lat: -18.5, lon: -80.75 },
    scenario,
    sources_consulted: [buildSupabaseSource()],
    validated_sources: [],
    coverage_decisions: [],
  });
}

describe("Auditoría de transformación de datos P2 — Stage 03: extracción por escenario", () => {
  test("extrae cc_tasmax_corto/mediano y cc_pr_corto/mediano con los valores de ssp245 cuando se solicita ssp245", async () => {
    const { canonical_variables } = await runStage3("ssp245");
    const byName = Object.fromEntries(canonical_variables.map(v => [v.name, v]));

    assert.equal(byName.cc_tasmax_corto.value, 19.743);
    assert.equal(byName.cc_tasmax_corto.scenario, "ssp245");
    assert.equal(byName.cc_tasmax_mediano.value, 20.109);
    assert.equal(byName.cc_pr_corto.value, 119.378);
    assert.equal(byName.cc_pr_mediano.value, 119.311);
    // La línea base histórica no depende de escenario.
    assert.equal(byName.cc_tasmax_historico.value, 19.274);
    assert.equal(byName.cc_tasmax_historico.scenario, null);
  });

  test("extrae los mismos índices con los valores de ssp585 (distintos) cuando se solicita ssp585 — no se mezclan", async () => {
    const { canonical_variables } = await runStage3("ssp585");
    const byName = Object.fromEntries(canonical_variables.map(v => [v.name, v]));

    assert.equal(byName.cc_tasmax_corto.value, 19.82);
    assert.equal(byName.cc_tasmax_corto.scenario, "ssp585");
    assert.equal(byName.cc_tasmax_mediano.value, 20.398);
    assert.equal(byName.cc_pr_corto.value, 120.003);
    assert.equal(byName.cc_pr_mediano.value, 120.335);
    // La línea base histórica es idéntica en ambos escenarios (no depende de scenario).
    assert.equal(byName.cc_tasmax_historico.value, 19.274);
  });

  test("no fabrica una banda 'largo' — climate_cells no publica ensemble 2060-2079", async () => {
    const { canonical_variables } = await runStage3("ssp245");
    const names = canonical_variables.map(v => v.name);
    assert.ok(!names.includes("cc_tasmax_largo"));
    assert.ok(!names.includes("cc_pr_largo"));
  });

  test("expone p10/p90 (uncertainty_range) junto a la mediana, sin descartarlos", async () => {
    const { canonical_variables } = await runStage3("ssp245");
    const byName = Object.fromEntries(canonical_variables.map(v => [v.name, v]));
    assert.deepEqual(byName.cc_tasmax_corto.uncertainty_range, { p10: 19.549, p90: 20.094 });
    assert.deepEqual(byName.cc_tasmax.uncertainty_range, { p10: 19.152, p90: 19.443 });
  });

  test("scenario default es ssp245 cuando no se especifica", async () => {
    const stage3 = new Stage03Normalization();
    const { canonical_variables } = await stage3.execute({
      location: { lat: -18.5, lon: -80.75 },
      sources_consulted: [buildSupabaseSource()],
      validated_sources: [],
      coverage_decisions: [],
    });
    const byName = Object.fromEntries(canonical_variables.map(v => [v.name, v]));
    assert.equal(byName.cc_tasmax_corto.value, 19.743); // valor ssp245
  });
});

describe("Auditoría de transformación de datos P2 — Stage 04: enrutamiento por detector", () => {
  test("cc_tasmax_corto/mediano se enrutan por ProjectionDetector (no baseline_or_static) y producen signal_strength no-nulo", async () => {
    const { canonical_variables } = await runStage3("ssp245");
    const stage4 = new Stage04Signals();
    const { signals, signals_discarded } = await stage4.execute({ canonical_variables, sector: "retail" });

    const tasmaxCortoSignal = signals.find(s => s.source_variables.includes("cc_tasmax_corto"));
    assert.ok(tasmaxCortoSignal, "cc_tasmax_corto debería producir una señal activa, no descartarse");
    assert.equal(tasmaxCortoSignal.signal_strength.detector, "projection");
    assert.equal(tasmaxCortoSignal.scenario, "ssp245");
    assert.equal(tasmaxCortoSignal.name, "temperatura_max_projection_corto");

    // La variable bare cc_tasmax sigue siendo baseline_or_static, sin cambio de comportamiento.
    const discardedNames = signals_discarded.map(s => s.name);
    const bareTasmaxDiscarded = discardedNames.includes("cc_tasmax_baseline");
    assert.ok(bareTasmaxDiscarded, "cc_tasmax (bare) debe seguir descartándose como línea base — comportamiento preexistente sin cambios");
  });

  test("ssp585 produce una señal con scenario='ssp585' y un anomaly_value distinto al de ssp245 (misma línea base, distinto Δ)", async () => {
    const stage4 = new Stage04Signals();

    const { canonical_variables: cv245 } = await runStage3("ssp245");
    const { signals: signals245 } = await stage4.execute({ canonical_variables: cv245, sector: "retail" });
    const sig245 = signals245.find(s => s.source_variables.includes("cc_tasmax_corto"));

    const { canonical_variables: cv585 } = await runStage3("ssp585");
    const { signals: signals585 } = await stage4.execute({ canonical_variables: cv585, sector: "retail" });
    const sig585 = signals585.find(s => s.source_variables.includes("cc_tasmax_corto"));

    assert.equal(sig245.scenario, "ssp245");
    assert.equal(sig585.scenario, "ssp585");
    assert.notEqual(sig245.anomaly_value, sig585.anomaly_value);
    // Δ ssp245 = 19.743 - 19.274 = 0.469; Δ ssp585 = 19.82 - 19.274 = 0.546
    assert.equal(sig245.anomaly_value, 0.469);
    assert.equal(sig585.anomaly_value, 0.546);
  });
});

describe("Auditoría de transformación de datos P2 — Stage 05→07: escenario y horizonte llegan a la respuesta", () => {
  async function runChain(scenario) {
    const { canonical_variables } = await runStage3(scenario);
    const stage4 = new Stage04Signals();
    const { signals } = await stage4.execute({ canonical_variables, sector: "retail" });
    const stage5 = new Stage05Phenomena();
    const { phenomena, phenomena_not_detected } = await stage5.execute({ signals });
    return { phenomena, phenomena_not_detected, canonical_variables };
  }

  test("ola_de_calor hereda el escenario real de su señal contribuyente cc_tasmax_corto (no queda en 'not_scenario_specific')", async () => {
    const { phenomena } = await runChain("ssp585");
    const heatWave = phenomena.find(p => p.name === "ola_de_calor");
    assert.ok(heatWave, "ola_de_calor debería activarse con evidencia de temperatura máxima proyectada");
    assert.equal(heatWave.scenario, "ssp585");
    // inferHorizon() (signal-metadata.js, sin cambios en este trabajo) usa
    // prioridad largo > mediano > corto — cc_tasmax_corto Y cc_tasmax_mediano
    // contribuyen ambas al mismo fenómeno, así que "mediano" gana.
    assert.equal(heatWave.horizon, "mediano");
  });

  test("Stage 07 proyecta horizon/scenario/scenario_label en cada tarjeta de fenómeno — antes se descartaban", async () => {
    const { phenomena, phenomena_not_detected } = await runChain("ssp245");
    const stage7 = new Stage07Presentation();
    const { response } = await stage7.execute({
      location: { lat: -18.5, lon: -80.75, location_name: "Océano frente a Arequipa (-18.5, -80.75)" },
      sector: "retail",
      scenario: "ssp245",
      assessments: [],
      phenomena,
      phenomena_not_detected: phenomena_not_detected,
      transition_risks: [],
      view: "executive",
    });

    assert.equal(response.scenario_requested, "ssp245");
    assert.equal(response.scenario_requested_label, "Emisiones moderadas");

    const heatWaveCard = response.phenomena.find(p => p.name === "Ola de calor");
    if (heatWaveCard) {
      assert.equal(heatWaveCard.scenario, "ssp245");
      assert.equal(heatWaveCard.scenario_label, "Emisiones moderadas");
      assert.ok(heatWaveCard.horizon_label, "debe traer una etiqueta de horizonte legible");
    }

    // phenomena_not_detected ahora se proyecta (D1 §1) — antes esta clave no existía en la respuesta.
    assert.ok(Array.isArray(response.phenomena_not_detected));
  });
});
