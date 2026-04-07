// ClimateRisk Scoring Engine
// Based on weighted rule-based system for Intercorp Retail

const HAZARD_WEIGHTS = {
  hazard_flood: 0.30,
  hazard_elnino: 0.25,
  hazard_earthquake: 0.20,
  hazard_landslide: 0.15,
  hazard_drought: 0.10,
};

const TYPE_FACTOR = {
  supermercado_grande: 1.0,
  supermercado_mediano: 0.8,
  centro_distribucion: 1.2,
  tienda_express: 0.6,
};

const REHAB_FACTOR = {
  hazard_flood: 120,
  hazard_elnino: 150,
  hazard_earthquake: 350,
  hazard_landslide: 200,
  hazard_drought: 40,
};

const CLOSURE_DAYS = { 0: 0, 1: 3, 2: 7, 3: 21, 4: 45 };

const HAZARD_LABELS = {
  hazard_flood: "Inundación Fluvial",
  hazard_elnino: "Fenómeno El Niño",
  hazard_earthquake: "Sismo",
  hazard_landslide: "Deslizamiento",
  hazard_drought: "Sequía Hídrica",
};

const HORIZON = {
  hazard_flood: "corto",
  hazard_elnino: "corto",
  hazard_earthquake: "largo",
  hazard_landslide: "medio",
  hazard_drought: "medio",
};

export function calculateHazardScore(asset) {
  let weightedSum = 0;
  let totalWeight = 0;
  Object.entries(HAZARD_WEIGHTS).forEach(([key, weight]) => {
    const level = asset[key] || 0;
    weightedSum += weight * (level / 4);
    totalWeight += weight;
  });
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export function calculateExposureScore(asset, maxArea = 5000) {
  const area = asset.area_m2 || 1000;
  const factor = TYPE_FACTOR[asset.type] || 0.8;
  const raw = (area / maxArea) * factor;
  return Math.min(raw, 1.0);
}

export function calculateFinancialImpact(asset, elNinoMultiplier = 1.0) {
  const sales = asset.monthly_sales || 500000;
  const employees = asset.num_employees || 50;
  const isRented = asset.condition === "alquilado";
  const area = asset.area_m2 || 1000;

  // Find top hazard
  let topHazardKey = "hazard_flood";
  let topLevel = 0;
  Object.keys(HAZARD_WEIGHTS).forEach((key) => {
    const level = (asset[key] || 0) * (key === "hazard_elnino" ? elNinoMultiplier : 1);
    if (level > topLevel) {
      topLevel = level;
      topHazardKey = key;
    }
  });

  const riskLevel = Math.min(Math.round(topLevel), 4);
  const closureDays = CLOSURE_DAYS[riskLevel] || 0;

  const lostSales = sales * (closureDays / 30);
  const staffCost = employees * 80 * closureDays;
  const logisticsCost = lostSales * 0.15;
  const rehabCost = area * (REHAB_FACTOR[topHazardKey] || 120) * (isRented ? 0.4 : 1);

  return {
    total: lostSales + staffCost + logisticsCost + rehabCost,
    lostSales,
    staffCost,
    logisticsCost,
    rehabCost,
    closureDays,
    topHazardKey,
  };
}

export function calculateRiskScore(asset, maxArea = 5000, elNinoMultiplier = 1.0) {
  const H = calculateHazardScore(asset);
  const E = calculateExposureScore(asset, maxArea);
  const impact = calculateFinancialImpact(asset, elNinoMultiplier);

  // Normalize impact (max ~20M soles)
  const I_norm = Math.min(impact.total / 20000000, 1.0);

  const R = H * 0.40 + E * 0.30 + I_norm * 0.30;

  let level = "bajo";
  if (R >= 0.75) level = "critico";
  else if (R >= 0.50) level = "alto";
  else if (R >= 0.25) level = "medio";

  return {
    riskScore: R,
    riskLevel: level,
    hazardScore: H,
    exposureScore: E,
    impactScore: I_norm,
    financialImpact: impact.total,
    topRisk: HAZARD_LABELS[impact.topHazardKey],
    topRiskKey: impact.topHazardKey,
    impactBreakdown: impact,
  };
}

export function getTopRiskForAsset(asset) {
  let topKey = "hazard_flood";
  let topVal = 0;
  Object.keys(HAZARD_WEIGHTS).forEach((key) => {
    if ((asset[key] || 0) > topVal) {
      topVal = asset[key] || 0;
      topKey = key;
    }
  });
  return { key: topKey, label: HAZARD_LABELS[topKey], level: topVal, horizon: HORIZON[topKey] };
}

export function getRiskColor(level) {
  switch (level) {
    case "critico": return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-500" };
    case "alto": return { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-500" };
    case "medio": return { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-500" };
    case "bajo": return { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-500" };
    default: return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", dot: "bg-muted-foreground" };
  }
}

export function formatCurrency(value) {
  if (value >= 1000000) return `S/ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `S/ ${(value / 1000).toFixed(0)}K`;
  return `S/ ${value.toFixed(0)}`;
}

export { HAZARD_LABELS, HAZARD_WEIGHTS, HORIZON, TYPE_FACTOR };

/**
 * Obtiene las amenazas dominantes (top 2 por score)
 */
export function getTopHazards(asset) {
  const hazards = Object.entries(HAZARD_WEIGHTS).map(([key, weight]) => {
    const level = asset[key] || 0;
    const weighted = weight * level;
    return {
      key,
      label: HAZARD_LABELS[key],
      level,
      weight,
      weighted,
      horizon: HORIZON[key],
    };
  });

  return hazards.sort((a, b) => b.weighted - a.weighted).slice(0, 2);
}

/**
 * Genera insight narrativo basado en el modelo de riesgo
 */
export function generateRiskNarrative(asset, scores) {
  const district = asset.district || "la zona";
  const topHazards = getTopHazards(asset);
  const H = (scores.hazardScore * 100).toFixed(0);
  const E = (scores.exposureScore * 100).toFixed(0);
  const I = (scores.impactScore * 100).toFixed(0);
  const R = (scores.riskScore * 100).toFixed(0);

  let narrative = `En ${district} se identifican riesgos relevantes asociados a `;

  // Agregar amenazas dominantes
  if (topHazards.length === 2) {
    narrative += `${topHazards[0].label} (${topHazards[0].level}/4) y ${topHazards[1].label} (${topHazards[1].level}/4)`;
  } else if (topHazards.length === 1) {
    narrative += `${topHazards[0].label} (${topHazards[0].level}/4)`;
  }

  narrative += `. Dado el nivel de exposición del activo (${E}%) y su volumen de ventas, eventos de este tipo podrían generar impactos financieros significativos `;

  // Agregar horizonte temporal basado en amenaza dominante
  if (topHazards[0]?.horizon === "corto") {
    narrative += "en el corto plazo (próximos 6-12 meses).";
  } else if (topHazards[0]?.horizon === "medio") {
    narrative += "a mediano plazo (1-3 años).";
  } else {
    narrative += "a largo plazo (3+ años).";
  }

  // Agregar contexto financiero
  const impactLevel = scores.impactScore > 0.75 ? "muy significativo" : 
                      scores.impactScore > 0.5 ? "significativo" : 
                      "moderado";
  
  narrative += ` El impacto financiero estimado es ${impactLevel}, equivalente a ${formatCurrency(scores.financialImpact)} en pérdidas potenciales.`;

  // Agregar clasificación
  const riskContext = scores.riskLevel === "critico" ? 
    " Este riesgo requiere atención inmediata y acciones de mitigación." :
    scores.riskLevel === "alto" ? 
    " Se recomienda implementar medidas de adaptación en corto plazo." :
    scores.riskLevel === "medio" ? 
    " Se debe monitorear la evolución de este riesgo." :
    " El riesgo es manejable con medidas estándar de precaución.";

  narrative += riskContext;

  return narrative;
}

/**
 * Genera recomendaciones basadas en los riesgos dominantes
 */
export function generateRiskRecommendations(asset, scores) {
  const topHazards = getTopHazards(asset);
  const recommendations = [];

  // Recomendación basada en amenaza principal
  if (topHazards[0]) {
    const key = topHazards[0].key;
    const level = topHazards[0].level;

    if (key === "hazard_flood" && level >= 2) {
      recommendations.push({
        priority: "alta",
        title: "Implementar sistema de drenaje avanzado",
        description: "Instalar sistemas de drenaje inteligente y barreras contra inundación para reducir exposición a fenómenos fluviales.",
        impact: "Reducción 40-60% de riesgo por inundación",
      });
    }

    if (key === "hazard_elnino" && level >= 2) {
      recommendations.push({
        priority: "alta",
        title: "Reforzar cadena de suministro",
        description: "Diversificar proveedores y crear reservas estratégicas para mantener operatividad durante eventos El Niño.",
        impact: "Continuidad operativa 90%+",
      });
    }

    if (key === "hazard_earthquake" && level >= 2) {
      recommendations.push({
        priority: "crítica",
        title: "Refuerzo estructural sísmico",
        description: "Realizar evaluación sísmica completa e implementar refuerzos estructurales según normativa peruana.",
        impact: "Reducción 50-70% de riesgo sísmico",
      });
    }

    if (key === "hazard_landslide" && level >= 2) {
      recommendations.push({
        priority: "alta",
        title: "Estabilización geotécnica",
        description: "Ejecutar estudios geotécnicos y obras de estabilización en taludes o laderas cercanas.",
        impact: "Mitigación de riesgo de deslizamiento",
      });
    }

    if (key === "hazard_drought" && level >= 2) {
      recommendations.push({
        priority: "media",
        title: "Plan de eficiencia hídrica",
        description: "Implementar sistemas de captación de agua lluvia y optimizar consumo en operaciones.",
        impact: "Reducción 30-40% de costo hídrico",
      });
    }
  }

  // Recomendación basada en exposición
  if (scores.exposureScore > 0.7) {
    recommendations.push({
      priority: "media",
      title: "Seguro de cobertura integral",
      description: "Contratar póliza de seguros que cubra pérdidas por eventos climáticos (inundación, sismo, etc).",
      impact: "Cobertura financiera 80-100%",
    });
  }

  // Recomendación basada en impacto financiero
  if (scores.impactScore > 0.6) {
    recommendations.push({
      priority: "media",
      title: "Programa de continuidad operativa",
      description: "Desarrollar plan de continuidad de negocio con sitios alternativos y sistemas redundantes.",
      impact: "Recuperación en 48-72 horas",
    });
  }

  return recommendations.slice(0, 3); // Return top 3
}

/**
 * Obtiene todas las métricas del modelo de riesgo
 */
export function getCompleteRiskModel(asset, maxArea = 5000, elNinoMultiplier = 1.0) {
  const scores = calculateRiskScore(asset, maxArea, elNinoMultiplier);
  const topHazards = getTopHazards(asset);
  const narrative = generateRiskNarrative(asset, scores);
  const recommendations = generateRiskRecommendations(asset, scores);

  return {
    ...scores,
    topHazards,
    narrative,
    recommendations,
    formula: {
      H: (scores.hazardScore * 100).toFixed(1),
      E: (scores.exposureScore * 100).toFixed(1),
      I: (scores.impactScore * 100).toFixed(1),
      R: (scores.riskScore * 100).toFixed(1),
      weights: "R = (H × 0.40) + (E × 0.30) + (I × 0.30)",
    },
  };
}