import { v4 as uuid } from "uuid";
import { StageInterface } from "../../shared/stage-interface.js";
import { calculateSourceQuality, calculateSignalStrength } from "./confidence.js";
import { getThresholds, getSignalTaxonomy } from "../../orchestration/config-loader.js";

export class Stage04Signals extends StageInterface {
  constructor() {
    super(4, "Signals");
    this.rulesApplied = [
      "Señales se generan desde variables canónicas usando detectores por tipo",
      "Source Quality: promedio ponderado de 5 componentes con pesos configurables",
      "Signal Strength: calculada por detector específico al tipo de variable (categorical/projection/anomaly — stage-04-signals.md), promedio de los componentes con metodología aplicable; sin línea base o serie pareada disponible, el componente se excluye explícitamente en vez de aproximarse",
      "Ambos componentes de confianza se mantienen separados, nunca se colapsan",
      "H-04: señales con signal_strength < min_signal_strength (thresholds.json signal_activation, OECD/JRC 2008 §5.2) se descartan y se registran en signals_discarded con su strength y razón; señales cuyo signal_strength no fue calculable (sin línea base/serie pareada — H-02) también se descartan, con una razón distinta que NO las trata como 'débiles' (score desconocido ≠ score bajo)",
      "H-07: nombre y tipo de cada señal vienen de un mapeo declarativo (signal-taxonomy.json), una entrada por variable canónica — no de coincidencias de substring en el nombre de la variable",
      "H-09: output incluye stage/status/signals/signals_discarded/source_quality_summary per el contrato de stage-04-signals.md — source_quality_summary agrega TODAS las variables procesadas (incluidas las descartadas por signal_strength), porque la calidad de la fuente es una pregunta distinta de si la señal resultante fue lo bastante fuerte para conservarse",
      "H-14: cada variable canónica llega con exactamente 1 fuente ya seleccionada por Stage 3 (source_decisions[]) — calculateSourceQuality se llama directo, sin envolver en un array de 1 elemento ni promediar; source_quality.score puede ser null (H-01: sin componentes calculables), nunca se fuerza a 0",
      "H-18: TrendDetector (stage-04-signals.md) está definido en el spec pero no implementado — requiere serie temporal multi-observación que ninguna variable actual proporciona. 'trend' eliminado de SignalTypeEnum hasta que se agreguen variables con series históricas multi-fecha (tasks.md T027, pendiente)",
    ];
  }

  execute(input) {
    const { canonical_variables, sector = "default" } = input;
    const thresholds = getThresholds();
    const minSignalStrength = thresholds.signal_activation?.min_signal_strength;
    const signals = [];
    const signalsDiscarded = [];
    // H-09: por fuente (adapter), no por variable — {source_name: [scores]},
    // agregado al final. Solo scores no-null entran (H-01: null significa
    // "no calculable", no "cero"); incluirlo como 0 subestimaría la calidad
    // real de una fuente que simplemente no pudo evaluarse para esa variable.
    const sourceQualityByAdapter = new Map();
    for (const v of canonical_variables) {
      // H-14 (documentacion-v2/stage-04, MEDIO): antes se envolvía esta
      // única fuente en un array de 1 elemento y se "promediaba" — el
      // promedio de 1 valor es el valor mismo, código muerto que sugería
      // soporte multi-fuente que Stage 4 no tiene (cada variable canónica ya
      // llega con UNA fuente seleccionada por Stage 3 — ver
      // source_decisions[] en pipeline/stages/03-normalization/index.js).
      // Llamada directa; si Stage 4 alguna vez necesita combinar varias
      // fuentes por variable, esa es una decisión de diseño nueva (¿media
      // aritmética de mediciones repetidas de la misma dimensión, o algo
      // más elaborado?) — este código no la resolvía, solo aparentaba hacerlo.
      const sourceInput = {
        variable: v.name,
        source_name: v.source,
        spatial_distance_km: v.spatial_info.distance_km,
        resolution_native: v.spatial_info.resolution,
        data_time_range: v.data_time_range,
        response: { [v.name]: v.value },
        // H-11: completitud temporal real calculada en Stage 3
        // (methodology.completeness_ratio — WMO No.100 / GCOS-245)
        methodology_completeness_ratio: v.methodology?.completeness_ratio,
      };
      const sqDetail = calculateSourceQuality(sourceInput, sector);
      const signalStrength = calculateSignalStrength(v, canonical_variables);
      const { name: signalName, type: signalType } = this.classifySignal(v);

      // H-09: solo scores no-null entran al resumen agregado (H-01: null
      // significa "no calculable", no "cero"); incluirlo como 0 subestimaría
      // la calidad real de una fuente que simplemente no pudo evaluarse para
      // esa variable.
      if (sqDetail.score != null) {
        const adapterKey = v.source ?? "unknown_source";
        const bucket = sourceQualityByAdapter.get(adapterKey) || [];
        bucket.push(sqDetail.score);
        sourceQualityByAdapter.set(adapterKey, bucket);
      }

      // H-04: signal_strength.score == null means "not computable" (no
      // detector methodology or paired baseline/sibling data — H-02), which
      // is NOT the same claim as "measured and found weak". Both are
      // discarded (neither should reach Stage 05's activation logic) but
      // with distinct, honestly worded reasons — collapsing them into one
      // "weak" bucket would misrepresent an absence of evidence as evidence
      // of absence.
      if (signalStrength.score == null) {
        signalsDiscarded.push({
          name: signalName,
          strength: null,
          reason: `signal_strength no calculable (detector='${signalStrength.detector}'): ${Object.values(signalStrength.components).map(c => c.reason).find(Boolean) || "sin metodología aplicable para esta variable/fuente"}`,
        });
        continue;
      }
      if (minSignalStrength != null && signalStrength.score < minSignalStrength) {
        signalsDiscarded.push({
          name: signalName,
          strength: signalStrength.score,
          reason: `signal_strength=${signalStrength.score} < min_signal_strength=${minSignalStrength} (OECD/JRC Handbook on Composite Indicators 2008 §5.2, R²≥0.16 — thresholds.json signal_activation.min_signal_strength)`,
        });
        continue;
      }

      const signal = {
        signal_id: uuid(),
        name: signalName,
        type: signalType,
        value: v.value,
        source_variables: [v.name],
        source_quality: {
          score: sqDetail.score,
          components: sqDetail.components || {},
          weights_applied: sqDetail.weights_applied || {},
          total_weight_used: sqDetail.total_weight_used,
          components_excluded: sqDetail.components_excluded,
        },
        signal_strength: signalStrength,
        // H-08: Δ físico crudo (valor_actual - línea base histórica), no el
        // ratio normalizado 0-1 de signal_strength.components — ver
        // confidence.js calculateSignalStrength (AnomalyDetector/
        // ProjectionDetector). null con razón cuando no hay línea base
        // pareada o la variable no tiene un Δ que calcular (categórica/estática).
        anomaly_value: signalStrength.anomaly_value,
        anomaly_value_reason: signalStrength.anomaly_value_reason,
        anomaly_unit: v.unit,
        // Auditoría de transformación de datos, hallazgo P2: se propaga el
        // escenario tal cual lo declaró la variable canónica en Stage 03
        // (ver 03-normalization/index.js) — nunca inferido aquí. null para
        // toda variable sin dimensión de escenario en su fuente (la mayoría
        // hoy; ver signal-metadata.js para por qué eso es correcto, no un
        // hueco).
        scenario: v.scenario ?? null,
        rules_applied: this.rulesApplied,
      };
      signals.push(signal);
    }

    // H-09: overall = media aritmética de todos los scores evaluables
    // (distinto de confidence_combination=geometric_mean, que este proyecto
    // reserva para combinar DIMENSIONES no sustituibles — source_quality con
    // signal_strength, ver Stage05 y thresholds.json signal_activation._refs
    // — no para promediar mediciones repetidas de la MISMA dimensión entre
    // variables, que es lo que se hace aquí).
    const allScores = [...sourceQualityByAdapter.values()].flat();
    const overall = allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10000) / 10000
      : null;
    const bySource = {};
    for (const [adapterKey, scores] of sourceQualityByAdapter.entries()) {
      bySource[adapterKey] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10000) / 10000;
    }

    return {
      stage: "signals",
      status: "success",
      signals,
      signals_discarded: signalsDiscarded,
      source_quality_summary: { overall, by_source: bySource },
    };
  }

  // H-07 (documentacion-v2/stage-04, ALTO): nombre y tipo de señal venían de
  // dos heurísticas separadas — un mapa de 8 entradas con fallback genérico
  // `${varName}_signal`, y una cadena de `varName.includes(...)` que
  // clasificaba por coincidencia de substring en vez de por la naturaleza
  // real del dato ("air_temperature_max" => "projected" solo por contener
  // "_max", sin distinguir observación de proyección; "elevation" =>
  // "categorical" para un campo geofísico continuo). Reemplazadas por una
  // única tabla declarativa (pipeline/config/signal-taxonomy.json) con una
  // entrada por cada clave de CANONICAL_VARIABLES — 43 entradas, no 8 — y
  // una justificación documentada por tipo asignado.
  //
  // Fail-loud, no fallback genérico: toda variable que llega aquí ya pasó
  // por Stage 3, cuyo único origen de nombres es CANONICAL_VARIABLES — si
  // una variable no tiene entrada en signal-taxonomy.json, es un desajuste
  // real entre ambos archivos (bug de mantenimiento, no un dato inesperado
  // de una fuente externa), y debe fallar de forma visible en vez de
  // recibir un nombre/tipo inventado en el momento.
  classifySignal(variable) {
    const taxonomy = getSignalTaxonomy();
    const entry = taxonomy.variables[variable.name];
    if (!entry) {
      throw new Error(
        `Variable canónica '${variable.name}' no tiene entrada en pipeline/config/signal-taxonomy.json — ` +
        `cada clave de CANONICAL_VARIABLES (pipeline/stages/03-normalization/canonical-schema.js) debe tener una entrada correspondiente (H-07).`
      );
    }
    const type = entry.signal_type_overrides_by_source?.[variable.source] ?? entry.signal_type;
    return { name: entry.signal_name, type };
  }
}
