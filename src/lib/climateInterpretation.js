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

export function getRiskLevelConfig(level) {
  return RISK_LEVELS[(level || "").toLowerCase()] || RISK_LEVELS["sin data"];
}

export function interpretExternalRisks(raw) {
  const hazards = Array.isArray(raw?.hazards) ? raw.hazards : [];
  const overall = raw?.overall_score || "sin data";
  const overallCfg = getRiskLevelConfig(overall);

  const sortedHazards = hazards
    .filter((h) => h.baseline?.score)
    .sort((a, b) => {
      const order = { alto: 3, medio: 2, bajo: 1, "sin data": 0 };
      return (order[b.baseline?.score] || 0) - (order[a.baseline?.score] || 0);
    });

  const topHazard = sortedHazards[0] || null;
  const narrative = topHazard
    ? `La amenaza principal es ${topHazard.hazard_name} con exposición actual ${topHazard.baseline?.score || "sin data"}.` +
      (topHazard.future_high_emissions?.score && topHazard.future_high_emissions.score !== topHazard.baseline?.score
        ? ` Las proyecciones altas muestran un cambio a ${topHazard.future_high_emissions.score}.`
        : "")
    : "No se identificaron amenazas climáticas significativas con datos válidos.";

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
    topHazard: topHazard ? {
      name: topHazard.hazard_name,
      current: topHazard.baseline?.score || "sin data",
      future: topHazard.future_high_emissions?.score || null,
      hazard: topHazard.hazard,
      narrative,
    } : null,
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
  const risk = interpretExternalRisks(externalRisks);
  const climate = interpretClimateTrends(climateTrends);
  const territory = interpretTerritorialContext(territorialCtx);

  const parts = [
    `Nivel de riesgo general: ${risk.overallCfg.label}.`,
    risk.topHazard ? `Amenaza principal: ${risk.topHazard.name} (${risk.topHazard.current}).` : null,
    climate.headline ? `Tendencia climática clave: ${climate.headline}` : null,
    territory.headline ? `Contexto local: ${territory.headline}` : null,
  ].filter(Boolean);

  return parts.join(" ");
}
