// @ts-nocheck
const RISK_LEVELS = {
  bajo:       { label: "Exposición baja",     color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  medio:      { label: "Exposición moderada", color: "bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300"  },
  alto:       { label: "Alta exposición",     color: "bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300"    },
  "sin data": { label: "Sin datos",           color: "bg-muted text-muted-foreground" },
};

export function getRiskLevelConfig(level) {
  return RISK_LEVELS[(level || "").toLowerCase()] || RISK_LEVELS["sin data"];
}

// ── 1. Climate state — 2-3 bullets derived from Open-Meteo text ───────────────
// Never asserts a specific hazard type. Only describes what the data shows.
export function buildClimateStateSummary(climateTrends) {
  const narrative = Array.isArray(climateTrends?.narrative) ? climateTrends.narrative : [];
  if (narrative.length === 0) return [];

  const text = narrative.flatMap(t => t.messages || []).join(" ").toLowerCase();
  const bullets = [];

  if (/aument.*temp|temp.*aument|increment.*temp|calentamiento|noches cál|más cáli/.test(text)) {
    bullets.push("Temperatura en tendencia de aumento progresivo");
  } else if (/temperatura.*establ|sin cambio.*temp|temp.*sin var/.test(text)) {
    bullets.push("Temperatura relativamente estable en el período evaluado");
  } else if (text.includes("temperatura") || text.includes("°c")) {
    bullets.push("Datos de temperatura disponibles para esta zona");
  }

  if (/lluvia.*intens|precipitación.*extrem|mayor.*lluvia|aument.*precipit/.test(text)) {
    bullets.push("Posible incremento en intensidad de lluvias");
  } else if (/lluvia.*dismin|precipitación.*menor|condicion.*seca|sequía|reducción.*lluvia/.test(text)) {
    bullets.push("Tendencia hacia condiciones más secas o menor precipitación");
  } else if (text.includes("precipitación") || text.includes("lluvia")) {
    bullets.push("Variabilidad en patrones de precipitación registrada");
  }

  if (bullets.length < 3 && /variabilidad|eventos.*extrem|mayor amplitud/.test(text)) {
    bullets.push("Mayor variabilidad climática proyectada a futuro");
  }

  return bullets;
}

// ── 2. Attention signals — probabilistic, derived from trends + territory ──────
// Does NOT repeat GRI per-hazard data (that's HazardNarrativePanel's job).
// Does NOT assert "Sequía" or "Inundación" as facts from keyword matching.
export function buildAttentionSignals(climateTrends, territorialCtx) {
  const signals = [];
  const climText = Array.isArray(climateTrends?.narrative)
    ? climateTrends.narrative.flatMap(t => t.messages || []).join(" ").toLowerCase()
    : "";
  const terrNarrative = Array.isArray(territorialCtx?.narrative) ? territorialCtx.narrative : [];

  if (/calor|noches cál|temperatura.*aument|increment.*temp/.test(climText)) {
    signals.push("Tendencia de incremento térmico en proyecciones climáticas");
  }

  if (/lluvia.*intens|precipitación.*extrem|mayor.*lluvia/.test(climText)) {
    signals.push("Condiciones compatibles con eventos de lluvia intensa");
  } else if (/variabilidad.*precipit|cambio.*lluvia|precipitación.*variab/.test(climText)) {
    signals.push("Variabilidad en patrones de precipitación registrada");
  }

  if (terrNarrative.some(t => /vulnerab|pobreza|desigual/.test(t.toLowerCase()))) {
    signals.push("Indicadores de vulnerabilidad socioeconómica en el territorio");
  }

  return signals;
}

// ── 3. Operational impacts — always framed as possible, never as fact ─────────
// Uses real GRI scores to ground inferences. Only infers when score ≥ "medio".
export function buildOperationalImpacts(externalRisks, climateTrends) {
  const impacts = [];
  const hazards = Array.isArray(externalRisks?.hazards) ? externalRisks.hazards : [];
  const climText = Array.isArray(climateTrends?.narrative)
    ? climateTrends.narrative.flatMap(t => t.messages || []).join(" ").toLowerCase()
    : "";

  const order = { bajo: 1, medio: 2, alto: 3 };
  const hasScore = (types, min = "medio") =>
    hazards.some(h => types.includes(h.hazard) && (order[h.baseline?.score] || 0) >= (order[min] || 2));

  if (hasScore(["heat", "extreme_heat"]) || /calor|temperatura.*aument/.test(climText)) {
    impacts.push("Posible aumento en costos de climatización y refrigeración");
  }
  if (hasScore(["drought"]) || /estrés hídrico|escasez.*agua/.test(climText)) {
    impacts.push("Potencial presión sobre disponibilidad y costo del agua");
  }
  if (hasScore(["flood", "pluvial", "fluvial", "coastal"])) {
    impacts.push("Riesgo potencial de afectación logística por eventos de lluvia o inundación");
  }
  if (hasScore(["landslide"])) {
    impacts.push("Señales compatibles con riesgo de deslizamientos en zonas de ladera");
  }

  return impacts;
}

// ── 4. Bundled reading — single entry point for ClimateReadingPanel ────────────
export function buildClimateReading(externalRisks, climateTrends, territorialCtx) {
  const rawLevel = externalRisks?.overall_score;
  const level = rawLevel && rawLevel !== "sin data" ? rawLevel : null;
  return {
    climateStateSummary: buildClimateStateSummary(climateTrends),
    attentionSignals:    buildAttentionSignals(climateTrends, territorialCtx),
    operationalImpacts:  buildOperationalImpacts(externalRisks, climateTrends),
    exposureLevel:       level,
    exposureCfg:         level ? getRiskLevelConfig(level) : null,
  };
}

// ── Executive summary — used by AIPanel as grounding context ──────────────────
export function summarizeClimateLocation(externalRisks, climateTrends, territorialCtx) {
  const reading = buildClimateReading(externalRisks, climateTrends, territorialCtx);
  const parts = [];

  if (reading.exposureLevel) {
    parts.push(`Nivel de exposición: ${getRiskLevelConfig(reading.exposureLevel).label}.`);
  }

  if (reading.attentionSignals[0]) {
    parts.push(reading.attentionSignals[0] + ".");
  }

  if (reading.climateStateSummary[0]) {
    parts.push(reading.climateStateSummary[0] + ".");
  }

  // Fallback: mention top GRI hazard by name only if no other signals
  if (parts.length === 0) {
    const order = { alto: 3, medio: 2, bajo: 1 };
    const topHazard = Array.isArray(externalRisks?.hazards)
      ? externalRisks.hazards
          .filter(h => h.baseline?.score && h.baseline.score !== "sin data")
          .sort((a, b) => (order[b.baseline.score] || 0) - (order[a.baseline.score] || 0))[0]
      : null;
    if (topHazard) {
      parts.push(`Señal de exposición a ${topHazard.hazard_name.toLowerCase()} (${topHazard.baseline.score}).`);
    }
  }

  return parts.length > 0 ? parts.join(" ") : null;
}
