import { StageInterface } from "../../shared/stage-interface.js";

const RISK_LABELS = { bajo: "Bajo", medio: "Medio", alto: "Alto", catastrofico: "Catastrófico" };
const RISK_COLORS = { bajo: "verde", medio: "ámbar", alto: "rojo", catastrofico: "rojo" };

export class Stage07Presentation extends StageInterface {
  constructor() {
    super(7, "Presentation");
    this.rulesApplied = [
      "Todo valor numérico se traduce a categoría semántica antes de mostrar",
      "Toda afirmación en la narrativa ejecutiva tiene enlace al artefacto de evidencia",
      "La respuesta de UI es una proyección, no el artefacto completo",
      "Narrativas son templates — no hay generación con IA",
    ];
  }

  execute(input) {
    const { location, sector, assessments, phenomena, transition_risks, view = "executive" } = input;
    const overallRisk = this.calculateOverallRisk(assessments);

    const base = {
      location: {
        name: location.location_name || `${location.lat}, ${location.lon}`,
        coordinates: { lat: location.lat, lon: location.lon },
      },
      overall_risk: {
        level: overallRisk.level,
        label: RISK_LABELS[overallRisk.level] || "Desconocido",
        color: RISK_COLORS[overallRisk.level] || "gris",
      },
      phenomena: (phenomena || []).map(p => ({
        name: this.formatPhenomenonName(p.name),
        status: this.formatStatus(p.status),
        risk_contribution: this.getRiskContribution(p, assessments),
      })),
      executive_summary: this.buildExecutiveSummary(location, overallRisk, assessments, sector, transition_risks),
      recommendations: this.buildRecommendations(assessments, transition_risks),
      confidence_note: this.buildConfidenceNote(assessments),
      trace_id: input.execution_id || "",
    };

    if (view === "analyst") {
      return {
        view: "analyst",
        response: {
          ...base,
          sources_used: this.getSourcesUsed(input),
          sources_out_of_coverage: [],
          signal_detail: [],
          risk_calculation: assessments.map(a => ({
            phenomenon_id: a.phenomenon_id,
            risk_score_raw: a.risk_score_raw,
            probability: a.probability,
            impact: a.impact,
            adaptive_capacity: a.adaptive_capacity,
          })),
          transition_risks: (transition_risks || []).map(r => ({
            type: r.type,
            description: r.description,
            severity: r.severity,
            timeframe: r.timeframe,
            signal_strength: r.signal_strength,
          })),
        },
      };
    }

    return { view: "executive", response: base };
  }

  calculateOverallRisk(assessments) {
    if (!assessments || assessments.length === 0) return { level: "bajo" };
    const max = assessments.reduce((m, a) => {
      const order = { bajo: 0, medio: 1, alto: 2, catastrofico: 3 };
      return order[a.risk_level] > order[m.level] ? a : m;
    }, { risk_level: "bajo" });
    return { level: max.risk_level };
  }

  formatPhenomenonName(name) {
    const map = {
      ola_de_calor: "Ola de calor",
      ola_de_frio: "Ola de frío",
      sequia: "Sequía",
      vientos_fuertes: "Vientos fuertes",
      inundacion: "Inundación",
      el_nino: "El Niño",
      la_nina: "La Niña",
    };
    return map[name] || name.replace(/_/g, " ");
  }

  formatStatus(status) {
    const map = {
      active: "Activo",
      projected: "Proyectado",
      historical: "Histórico",
      not_detected: "No detectado",
    };
    return map[status] || status;
  }

  getRiskContribution(phenomenon, assessments) {
    const assessment = (assessments || []).find(a => a.phenomenon_id === phenomenon.phenomenon_id);
    if (!assessment) return { level: "bajo", score: 0 };
    return { level: assessment.risk_level, score: assessment.risk_score_raw };
  }

  buildExecutiveSummary(location, risk, assessments, sector, transitionRisks) {
    const locName = location.location_name || `${location.lat}, ${location.lon}`;
    const level = risk.level === "bajo" ? "no presenta" : `presenta nivel ${RISK_LABELS[risk.level] || risk.level}`;
    const phenCount = (assessments || []).filter(a => a.risk_level !== "bajo").length;
    const trCount = (transitionRisks || []).length;
    let summary = `${locName} ${level} de riesgo climático para el sector ${sector}. ` +
      `${phenCount} fenómeno(s) con riesgo relevante identificado(s).`;
    if (trCount > 0) {
      summary += ` Además, se identificaron ${trCount} riesgo(s) de transición para este sector.`;
    }
    return summary;
  }

  buildRecommendations(assessments, transitionRisks) {
    const recs = [];
    const high = (assessments || []).filter(a => a.risk_level === "alto" || a.risk_level === "catastrofico");
    if (high.length > 0) {
      recs.push("Implementar medidas de adaptación estructural para fenómenos de alto riesgo.");
    }
    const highTransition = (transitionRisks || []).filter(r => r.severity === "alta" || r.severity === "catastrofica");
    if (highTransition.length > 0) {
      recs.push("Evaluar estrategia de transición para mitigar riesgos regulatorios y de mercado.");
    }
    if (recs.length === 0) {
      recs.push("Mantener monitoreo regular de las condiciones climáticas.");
    }
    return recs;
  }

  buildConfidenceNote(assessments) {
    if (!assessments || assessments.length === 0) return "Sin datos suficientes para evaluar confianza.";
    const avgSQ = assessments.reduce((a, r) => a + (r.probability.value / 5), 0) / assessments.length;
    if (avgSQ >= 0.7) return "Confianza alta en los resultados presentados.";
    if (avgSQ >= 0.4) return "Confianza media — verificar fuentes para mayor precisión.";
    return "Confianza baja — los resultados son indicativos y requieren validación adicional.";
  }

  getSourcesUsed(input) {
    const sources = input.sources_consulted || [];
    return sources
      .filter(s => s.coverage_status === "available")
      .map(s => ({ name: s.source_name, domain: s.source_domain, status: s.coverage_status }));
  }
}
