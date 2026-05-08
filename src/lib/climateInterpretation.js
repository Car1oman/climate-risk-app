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

function inferTopHazard(externalRisks, climateTrends, territorialCtx) {
  // Primero, intentar usar datos GRI si hay algo moderado
  const hazards = Array.isArray(externalRisks?.hazards) ? externalRisks.hazards : [];
  const moderateHazards = hazards.filter(h => h.baseline?.score === "medio");
  if (moderateHazards.length > 0) {
    const topModerate = moderateHazards[0];
    return {
      name: topModerate.hazard_name,
      current: "medio",
      future: topModerate.future_high_emissions?.score || null,
      hazard: topModerate.hazard,
      narrative: `Exposición moderada a ${topModerate.hazard_name.toLowerCase()}, requiere atención preventiva.`,
      inferred: false,
    };
  }

  // Inferir de tendencias climáticas
  const trends = Array.isArray(climateTrends?.narrative) ? climateTrends.narrative : [];
  for (const trend of trends) {
    const messages = trend.messages || [];
    const text = messages.join(" ").toLowerCase();
    if (text.includes("temperatura") || text.includes("calor")) {
      return { ...INFERRED_RISKS.temperature, inferred: true };
    }
    if (text.includes("sequía") || text.includes("drought")) {
      return { ...INFERRED_RISKS.drought, inferred: true };
    }
    if (text.includes("precipitación") || text.includes("lluvia")) {
      return { ...INFERRED_RISKS.precipitation, inferred: true };
    }
  }

  // Inferir de contexto territorial
  const territorial = Array.isArray(territorialCtx?.narrative) ? territorialCtx.narrative : [];
  const terrText = territorial.join(" ").toLowerCase();
  if (terrText.includes("costa") || terrText.includes("mar")) {
    return { ...INFERRED_RISKS.coastal, inferred: true };
  }
  if (terrText.includes("urbana") || terrText.includes("ciudad")) {
    return { ...INFERRED_RISKS.urban, inferred: true };
  }

  // Fallback inteligente
  return { ...INFERRED_RISKS.default, inferred: true };
}

export function interpretExternalRisks(raw, climateTrends, territorialCtx) {
  const hazards = Array.isArray(raw?.hazards) ? raw.hazards : [];
  const overall = raw?.overall_score || "sin data";
  const overallCfg = getRiskLevelConfig(overall);

  const sortedHazards = hazards
    .filter((h) => h.baseline?.score)
    .sort((a, b) => {
      const order = { alto: 3, medio: 2, bajo: 1, "sin data": 0 };
      return (order[b.baseline?.score] || 0) - (order[a.baseline?.score] || 0);
    });

  const topHazard = sortedHazards[0] || inferTopHazard(raw, climateTrends, territorialCtx);
  const narrative = topHazard.narrative || (topHazard
    ? `La amenaza principal es ${topHazard.name} con exposición actual ${topHazard.current || "sin data"}.` +
      (topHazard.future && topHazard.future !== topHazard.current
        ? ` Las proyecciones altas muestran un cambio a ${topHazard.future}.`
        : "")
    : "Evaluación de riesgos en proceso.");

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
