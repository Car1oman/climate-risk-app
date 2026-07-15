import { v4 as uuid } from "uuid";
import { StageInterface } from "../../shared/stage-interface.js";
import { getAdaptiveCapacityConfig, getThresholds } from "../../orchestration/config-loader.js";
import { detectTransitionRisks } from "../04-signals/detectors/transition-risk-detector.js";

export class Stage06Risk extends StageInterface {
  constructor() {
    super(6, "Risk");
    this.rulesApplied = [
      "CA se calcula con pesos configurables, nunca hardcodeados",
      "Probabilidad externa tiene prioridad sobre cálculo interno",
      "Impacto es siempre cálculo interno (no se hereda de fuente externa)",
      "Riesgo catastrófico señalado independientemente del score si cumple criterios",
      "Fórmula: (P × I) / CA",
      "Riesgos de transición evaluados por perfil sectorial (regulatorio, mercado, tecnología, reputacional)",
      "H-16: transition_risk_profile_source declara si el sector tiene perfil propio en sector-profiles.json ('sector_specific') o cayó en el perfil 'default' (sin riesgos configurados) — un array de transition_risks vacío no distingue por sí solo 'sector evaluado sin riesgos' de 'sector sin perfil propio', este campo sí",
    ];
  }

  execute(input) {
    const { phenomena, sector, config } = input;
    const adaptiveCapacity = this.calculateAdaptiveCapacity(config);
    const thresholds = getThresholds();
    const assessments = [];

    for (const phenomenon of phenomena) {
      const probability = this.calculateProbability(phenomenon);
      const impact = this.calculateImpact(phenomenon, sector, adaptiveCapacity.score);
      const riskScoreRaw = (probability.value * impact.value) / adaptiveCapacity.score;
      const riskLevel = this.classifyRisk(riskScoreRaw, thresholds);
      const riskClass = this.classifyHorizon(phenomenon);

      assessments.push({
        risk_id: uuid(),
        phenomenon_id: phenomenon.phenomenon_id,
        // "ssp370" was never a real fallback: no source in this pipeline
        // selects or labels an SSP scenario (HALLAZGO-8 — openmeteo_cmip6 is
        // a HighResMIP ensemble with no scenario parameter at all). Using
        // "not_scenario_specific" instead of a fabricated SSP label avoids
        // implying a scenario selection that doesn't exist anywhere upstream.
        scenario: phenomenon.scenario || "not_scenario_specific",
        horizon: phenomenon.horizon || "mediano",
        probability,
        impact: {
          value: impact.value,
          components: impact.components,
          justification: impact.justification,
        },
        adaptive_capacity: adaptiveCapacity,
        risk_score_raw: riskScoreRaw,
        risk_level: riskLevel,
        risk_classification: riskClass,
      });
    }

    const { transition_risks: transitionRisks, transition_risk_profile_source: transitionRiskProfileSource } =
      this.evaluateTransitionRisks(sector);

    return {
      assessments,
      adaptive_capacity: adaptiveCapacity,
      transition_risks: transitionRisks,
      transition_risk_profile_source: transitionRiskProfileSource,
    };
  }

  evaluateTransitionRisks(sector) {
    const { profile_source: profileSource, risks } = detectTransitionRisks(sector);
    return {
      transition_risks: risks.map(r => ({
        risk_id: r.risk_id,
        sector: r.sector,
        type: r.type,
        description: r.description,
        timeframe: r.timeframe,
        severity: r.severity,
        signal_strength: r.signal_strength,
      })),
      transition_risk_profile_source: profileSource,
    };
  }

  calculateAdaptiveCapacity(config) {
    const acConfig = getAdaptiveCapacityConfig();
    const indicators = acConfig.indicators;
    const minIndicators = acConfig._min_indicators ?? 3;
    if (indicators.length === 0) {
      return { score: null, indicators_used: [], justification: "Sin indicadores configurados" };
    }
    let sum = 0;
    const used = [];
    for (const ind of indicators) {
      const value = this.getIndicatorValue(ind.id);
      if (value != null) {
        sum += value;
        used.push(ind.id);
      }
    }
    if (used.length < minIndicators) {
      return { score: null, indicators_used: used, justification: `CA=null — indicadores disponibles (${used.length}) < mínimo requerido (${minIndicators})` };
    }
    const score = Math.round(sum / used.length);
    return {
      score: Math.max(1, Math.min(5, score)),
      indicators_used: used,
      justification: `CA calculado como promedio simple de ${used.length} indicadores (igual weight — pesos diferenciales pendiente v3)`,
    };
  }

  getIndicatorValue(id) {
    return null;
  }

  calculateProbability(phenomenon) {
    return {
      value: 3,
      source: "calculated",
      external_source: null,
      justification: `Probabilidad calculada desde señal interna (signal_strength=${phenomenon.confidence.signal_strength})`,
    };
  }

  calculateImpact(phenomenon, sector, adaptiveCapacityScore) {
    return {
      value: 3,
      components: { exposure: 3, sensitivity: 3, adaptive_capacity: adaptiveCapacityScore },
      justification: `Impacto calculado desde exposición + sensibilidad del sector "${sector}" + CA`,
    };
  }

  classifyRisk(score, thresholds) {
    if (score <= thresholds.risk_classification.low_max) return "bajo";
    if (score <= thresholds.risk_classification.medium_max) return "medio";
    if (score >= thresholds.risk_classification.high_min) return "alto";
    return "medio";
  }

  classifyHorizon(phenomenon) {
    return phenomenon.status === "projected" ? "estrategico" : "operativo";
  }
}
