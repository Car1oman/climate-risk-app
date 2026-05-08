const RISK_LEVELS = {
  bajo: { label: "Exposición baja", color: "bg-emerald-100 text-emerald-800" },
  medio: { label: "Exposición moderada", color: "bg-amber-100 text-amber-800" },
  alto: { label: "Alta exposición", color: "bg-red-100 text-red-800" },
  "sin data": { label: "Sin datos", color: "bg-muted text-muted-foreground" },
};

const HAZARD_ICONS = {
  flood: "🌊",
  fluvial: "🏞️",
  coastal: "🌊",
  pluvial: "🌧️",
  drought: "☀️",
  heat: "🌡️",
  extreme_heat: "🌡️",
  landslide: "⛰️",
};

const INFERRED_RISKS = {
  temperature: { name: "Incremento progresivo de temperatura", hazard: "heat", icon: "🌡️", narrative: "Tendencias climáticas indican un aumento gradual en temperaturas que puede afectar operaciones." },
  precipitation: { name: "Cambios en patrones de precipitación", hazard: "pluvial", icon: "🌧️", narrative: "Variaciones en lluvias pueden generar riesgos de inundación o sequía." },
  drought: { name: "Exposición moderada a estrés hídrico", hazard: "drought", icon: "☀️", narrative: "Indicadores de sequía sugieren monitoreo preventivo de recursos hídricos." },
  coastal: { name: "Vulnerabilidad costera moderada", hazard: "coastal", icon: "🌊", narrative: "Zona costera con exposición a eventos marinos." },
  urban: { name: "Riesgos urbanos distribuidos", hazard: "flood", icon: "🏞️", narrative: "Área urbana con exposición múltiple a riesgos ambientales." },
  default: { name: "Sin amenaza dominante detectada", hazard: "flood", icon: "⚠️", narrative: "La evaluación actual no identifica un riesgo crítico predominante, pero se recomienda monitoreo continuo." },
};

export function getRiskLevelConfig(level) {
  return RISK_LEVELS[(level || "").toLowerCase()] || RISK_LEVELS["sin data"];
}

export function inferPrimaryClimateRisk(externalRisks, climateTrends, territorialCtx) {
  // 1. Sequía / estrés hídrico - Prioridad máxima
  const trends = Array.isArray(climateTrends?.narrative) ? climateTrends.narrative : [];
  const territorial = Array.isArray(territorialCtx?.narrative) ? territorialCtx.narrative : [];
  const allText = [...trends.flatMap(t => t.messages || []), ...territorial].join(" ").toLowerCase();

  if (allText.includes("sequía") || allText.includes("drought") || allText.includes("estrés hídrico") ||
      allText.includes("agua") || allText.includes("precipitación baja")) {
    return {
      name: "Exposición moderada a sequía",
      hazard: "drought",
      icon: "☀️",
      narrative: "Indicadores de sequía y estrés hídrico sugieren monitoreo preventivo de recursos hídricos.",
      inferred: true,
      current: "medio",
      future: null,
    };
  }

  // 2. Estrés térmico
  if (allText.includes("temperatura") || allText.includes("calor") || allText.includes("olas de calor") ||
      allText.includes("noches cálidas") || allText.includes("incremento") || allText.includes("tas")) {
    return {
      name: "Estrés térmico moderado",
      hazard: "heat",
      icon: "🌡️",
      narrative: "Tendencias indican aumento en temperaturas que puede afectar operaciones y salud.",
      inferred: true,
      current: "medio",
      future: null,
    };
  }

  // 3. Inundación
  if (allText.includes("inundación") || allText.includes("flood") || allText.includes("lluvias extremas") ||
      allText.includes("precipitación creciente") || allText.includes("pluvial")) {
    return {
      name: "Riesgo de inundación moderado",
      hazard: "flood",
      icon: "🌊",
      narrative: "Cambios en patrones de precipitación pueden generar riesgos de inundación.",
      inferred: true,
      current: "medio",
      future: null,
    };
  }

  // 4. Vulnerabilidad socioeconómica
  if (allText.includes("vulnerabilidad") || allText.includes("socioeconómica") || allText.includes("pobreza") ||
      allText.includes("urbana") || allText.includes("densidad poblacional")) {
    return {
      name: "Vulnerabilidad socioeconómica moderada",
      hazard: "flood",
      icon: "🏙️",
      narrative: "Factores socioeconómicos aumentan la exposición a impactos climáticos.",
      inferred: true,
      current: "medio",
      future: null,
    };
  }

  // 5. Riesgo climático moderado (fallback)
  return {
    name: "Riesgo climático moderado",
    hazard: "flood",
    icon: "⚠️",
    narrative: "Evaluación general indica exposición moderada a cambios climáticos.",
    inferred: true,
    current: "medio",
    future: null,
  };
}

export function interpretExternalRisks(raw, climateTrends, territorialCtx) {
  const hazards = Array.isArray(raw?.hazards) ? raw.hazards : [];
  const overall = raw?.overall_score || "sin data";
  const overallCfg = getRiskLevelConfig(overall);

  const sortedHazards = hazards
    .filter((h) => h.baseline?.score && h.baseline.score !== "sin data")
    .sort((a, b) => {
      const order = { alto: 3, medio: 2, bajo: 1 };
      return (order[b.baseline?.score] || 0) - (order[a.baseline?.score] || 0);
    });

  let topHazard;
  if (sortedHazards.length > 0) {
    const rawHazard = sortedHazards[0];
    topHazard = {
      name: rawHazard.hazard_name,
      current: rawHazard.baseline?.score || "medio",
      future: rawHazard.future_high_emissions?.score || null,
      hazard: rawHazard.hazard,
      narrative: `La amenaza principal es ${rawHazard.hazard_name} con exposición actual ${rawHazard.baseline?.score || "medio"}.`,
      inferred: false,
    };
  } else {
    // Siempre inferir si no hay datos GRI claros
    topHazard = inferPrimaryClimateRisk(raw, climateTrends, territorialCtx);
  }

  const narrative = topHazard.narrative;

  const hazardSummaries = hazards.map((hazard) => {
    const current = hazard.baseline?.score || "sin data";
    const future = hazard.future_high_emissions?.score || null;
    return {
      name: hazard.hazard_name,
      icon: HAZARD_ICONS[hazard.hazard] || "⚠️",
      current,
      future,
      narrative: future && future !== current
        ? `Actualmente ${current}. Se proyecta ${future} en el futuro.`
        : `Nivel actual ${current}.`,
    };
  });

  return {
    overall,
    overallCfg,
    topHazard,
    narrative,
    hazardSummaries,
  };
}


export function interpretClimateTrends(raw) {
  const narrative = Array.isArray(raw?.narrative) ? raw.narrative : [];
  const headline = narrative.length > 0
    ? `${narrative[0].period}: ${narrative[0].messages?.[0] || "Datos disponibles."}`
    : "No hay proyecciones climáticas disponibles para esta ubicación.";

  const highlights = narrative.map((item) => ({
    period: item.period,
    messages: item.messages || [],
    icon: item.period.toLowerCase().includes("corto") ? "📅" : "🔭",
  }));

  return {
    headline,
    highlights,
    historicalContext: raw?.historical_context?.narrative || null,
  };
}

export function interpretTerritorialContext(raw) {
  const headlines = Array.isArray(raw?.narrative) ? raw.narrative : [];
  return {
    headline: headlines[0] || "No se dispone de contexto territorial para esta zona.",
    details: headlines,
  };
}

export function summarizeClimateLocation(externalRisks, climateTrends, territorialCtx) {
  const risk = interpretExternalRisks(externalRisks, climateTrends, territorialCtx);
  const climate = interpretClimateTrends(climateTrends);
  const territory = interpretTerritorialContext(territorialCtx);

  const parts = [
    `Nivel de riesgo general: ${risk.overallCfg.label}.`,
    risk.topHazard ? `Amenaza principal: ${risk.topHazard.name}.` : null,
    climate.headline ? `Tendencia climática clave: ${climate.headline}` : null,
    territory.headline ? `Contexto local: ${territory.headline}` : null,
  ].filter(Boolean);

  return parts.join(" ");
}
