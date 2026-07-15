import { v4 as uuid } from "uuid";
import { StageInterface } from "../../shared/stage-interface.js";
import { getPhenomenonDefinitions, getThresholds } from "../../orchestration/config-loader.js";

export class Stage05Phenomena extends StageInterface {
  constructor() {
    super(5, "Phenomena");
    this.rulesApplied = [
      "H-5.1 (documentacion-v2/stage-05, ALTO): fenómenos y sus señales contribuyentes vienen de pipeline/config/phenomenon-definitions.json (una entrada por fenómeno, con scientific_reference y notes por inclusión/exclusión) — no de un mapa hardcodeado sin justificación. Forma según contrato stage-05-phenomena.md (config.phenomenon_definitions).",
      "Un fenómeno se considera solo si al menos una señal de su required_signals está presente en la entrada (contrato stage-05-phenomena.md Rule 1); optional_signals reforzarían la confianza combinada sin activar el fenómeno por sí solas, pero ninguna definición activa usa optional_signals hoy (ver phenomenon-definitions.json _methodology.required_vs_optional)",
      "Confianza combinada: media geométrica de source_quality y signal_strength promediados sobre las señales contribuyentes (required+optional)",
      "Un fenómeno requiere confianza de fuente (source_quality) promedio >= min_confidence de su definición, o el piso global thresholds.json signal_activation.min_source_quality si la definición no fija uno propio",
      "Fenómenos categóricos (el_nino/la_nina) se activan por coincidencia exacta de valor (matchValue); fenómenos numéricos direccionales (ola_de_calor/ola_de_frio, sequia/inundacion) se activan por signal_strength.score >= min_signal_strength Y signo de anomaly_value consistente con la dirección física declarada en 'sign' (H-5.1: sin este filtro, un exceso y un déficit de la misma variable activarían el mismo fenómeno)",
    ];
  }

  execute(input) {
    const { signals } = input;
    const { phenomena: definitions } = getPhenomenonDefinitions();
    const globalMinSourceQuality = getThresholds().signal_activation.min_source_quality;
    const minSignalStrength = getThresholds().signal_activation.min_signal_strength;
    const phenomena = [];

    for (const entry of definitions) {
      const candidateNames = [...entry.required_signals, ...entry.optional_signals];
      const matchingSignals = signals.filter(s => candidateNames.includes(s.name));
      if (matchingSignals.length === 0) continue;

      // Contrato stage-05-phenomena.md Rule 1: al menos una señal REQUERIDA
      // (no solo opcional) debe estar presente para considerar el fenómeno.
      const hasRequiredSignal = matchingSignals.some(s => entry.required_signals.includes(s.name));
      if (!hasRequiredSignal) continue;

      // source_quality.score can be null (every Source Quality component
      // excluded for this signal — H-01 fix, confidence.js calculateSourceQuality)
      // rather than a fabricated number; treated as 0 here, explicitly.
      const avgSQ = matchingSignals.reduce((a, s) => a + (s.source_quality.score ?? 0), 0) / matchingSignals.length;
      // signal_strength.score is never null here: Stage 04 (H-04) already
      // discards any signal whose strength wasn't computable before it
      // reaches signals[] — treating "not computable" as 0 in this average
      // would misrepresent an absence of evidence as measured weakness.
      const avgSS = matchingSignals.reduce((a, s) => a + s.signal_strength.score, 0) / matchingSignals.length;

      const minConfidence = entry.min_confidence ?? globalMinSourceQuality;
      if (avgSQ < minConfidence) continue;

      const combined = Math.sqrt(avgSQ * avgSS);

      // H-5.1: activación categórica (matchValue) vs. numérica direccional
      // (sign) vs. numérica sin dirección declarada (fallback, hoy sin uso —
      // toda definición activa en phenomenon-definitions.json fija matchValue
      // o sign explícitamente).
      let active;
      if (entry.matchValue != null) {
        active = matchingSignals.some(s => s.value === entry.matchValue);
      } else if (entry.sign != null) {
        active = matchingSignals.some(s =>
          s.signal_strength.score >= minSignalStrength &&
          s.anomaly_value != null &&
          (entry.sign === "positive" ? s.anomaly_value > 0 : s.anomaly_value < 0)
        );
      } else {
        active = matchingSignals.some(s => s.signal_strength.score >= minSignalStrength);
      }

      phenomena.push({
        phenomenon_id: uuid(),
        name: entry.name,
        status: active ? "active" : "not_detected",
        confidence: {
          source_quality: avgSQ,
          signal_strength: avgSS,
          combined,
        },
        contributing_signals: matchingSignals.map(s => s.signal_id),
        scenario: null,
        horizon: null,
      });
    }

    return { phenomena };
  }
}
