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
  const assetName = asset.name || "Esta tienda";

  // Construir narrativa consultiva
  let narrative = "";

  // Introducción según nivel de riesgo
  if (scores.riskLevel === "critico") {
    narrative += `⚠️ ESTADO CRÍTICO: ${assetName} en ${district} presenta un nivel de riesgo climático muy elevado que requiere acción inmediata. `;
  } else if (scores.riskLevel === "alto") {
    narrative += `⚠️ RIESGO ALTO: ${assetName} en ${district} presenta un nivel de riesgo climático significativo. `;
  } else if (scores.riskLevel === "medio") {
    narrative += `⚠️ RIESGO MODERADO: ${assetName} en ${district} presenta un nivel de riesgo climático medio que requiere monitoreo. `;
  } else {
    narrative += `✓ RIESGO BAJO: ${assetName} en ${district} presenta un riesgo climático manejable. `;
  }

  // Describir las amenazas principales en lenguaje disponible
  if (topHazards.length > 0) {
    narrative += `La zona se caracteriza principalmente por su vulnerabilidad a `;
    
    if (topHazards.length === 2) {
      narrative += `${topHazards[0].label} (nivel ${topHazards[0].level}/4) y ${topHazards[1].label} (nivel ${topHazards[1].level}/4). `;
    } else {
      narrative += `${topHazards[0].label} (nivel ${topHazards[0].level}/4). `;
    }

    // Agregar contexto del horizonte temporal
    if (topHazards[0]?.horizon === "corto") {
      narrative += `Estas amenazas podrían materializarse en los próximos 6-12 meses. `;
    } else if (topHazards[0]?.horizon === "medio") {
      narrative += `Estas amenazas podrían materializarse en los próximos 1-3 años. `;
    } else {
      narrative += `Aunque estas amenazas son de ocurrencia impredecible, son constantes en la zona. `;
    }
  }

  // Explicar por qué esta tienda está expuesta
  const volumeText = asset.monthly_sales > 2000000 ? "muy alto" : 
                     asset.monthly_sales > 1000000 ? "alto" : "moderado";
  
  narrative += `Dado que ${assetName} tiene un volumen de ventas ${volumeText} `;
  narrative += `(S/ ${asset.monthly_sales ? formatCurrency(asset.monthly_sales) : "no especificado"} mensuales) `;
  narrative += `y un área de operación importante (${asset.area_m2 || 1000} m²), `;
  narrative += `un evento climático grave podría interrumpir significativamente las operaciones. `;

  // Impacto financiero
  const impactMonths = scores.financialImpact > 5000000 ? "varios meses" : "algunos meses";
  narrative += `El impacto financiero estimado (${formatCurrency(scores.financialImpact)}) equivale aproximadamente `;
  narrative += `a ${impactMonths} de ventas netas de la tienda.`;

  // Recomendación de acciones
  if (scores.riskLevel === "critico") {
    narrative += "\n\nRECOMENDACIÓN: Se debe desarrollar un plan de reducción de riesgo lo antes posible. Consulte con especialistas en gestión de riesgos climáticos.";
  } else if (scores.riskLevel === "alto") {
    narrative += "\n\nRECOMENDACIÓN: Se deben implementar medidas de adaptación y preparación en los próximos meses.";
  } else if (scores.riskLevel === "medio") {
    narrative += "\n\nRECOMENDACIÓN: Mantenga monitoreo continuo y considere implementar medidas preventivas.";
  } else {
    narrative += "\n\nRECOMENDACIÓN: Mantenga protocolos básicos de seguridad y respuesta ante emergencias.";
  }

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
        title: "Instalar sistemas de protección contra inundaciones",
        description: "Implementar barreras de agua, drenaje mejorado y sistemas de bombeo para mantener la tienda protegida durante lluvias intensas o desborde de ríos.",
        impact: "Reduce el riesgo de cierre por inundación en 40-60%",
      });
    }

    if (key === "hazard_elnino" && level >= 2) {
      recommendations.push({
        priority: "alta",
        title: "Asegurar la continuidad del abastecimiento",
        description: "Identificar proveedores alternativos, crear reservas estratégicas de productos críticos y establecer acuerdos con distribuidores de otras regiones para garantizar inventario durante disrupciones.",
        impact: "Mantiene operaciones con 90%+ de normalidad durante eventos El Niño",
      });
    }

    if (key === "hazard_earthquake" && level >= 2) {
      recommendations.push({
        priority: "crítica",
        title: "Evaluar y reforzar la estructura del edificio",
        description: "Realizar una evaluación sísmica profesional y, si es necesario, ejecutar refuerzos estructurales que cumplan con normativas de construcción antisísmica. Esto es crítico para la seguridad de empleados y clientes.",
        impact: "Mejora la resistencia sísmica en 50-70% y protege vidas",
      });
    }

    if (key === "hazard_landslide" && level >= 2) {
      recommendations.push({
        priority: "alta",
        title: "Verificar la estabilidad del terreno circundante",
        description: "Contratar un estudio geotécnico para evaluar taludes o laderas cercanas. Si hay riesgo, implementar obras de estabilización o considerar relocación parcial de operaciones críticas.",
        impact: "Mitiga el riesgo de deslizamientos que pudieran afectar la estructura",
      });
    }

    if (key === "hazard_drought" && level >= 2) {
      recommendations.push({
        priority: "media",
        title: "Optimizar el uso del agua",
        description: "Instalar sistemas de captación y reciclaje de agua lluvia, mejorar eficiencia en limpieza y operaciones. Esto reduce costos operativos durante períodos de sequía.",
        impact: "Reduce costos de agua en 30-40% y asegura disponibilidad",
      });
    }
  }

  // Recomendación basada en exposición (tamaño / volumen)
  if (scores.exposureScore > 0.65) {
    recommendations.push({
      priority: "media",
      title: "Contratar seguro integral contra eventos climáticos",
      description: "Evaluar pólizas de seguros que cubran daños por inundación, sismo, fenómeno El Niño y otras amenazas. Esto transfiere parte del riesgo financiero a aseguradoras especializadas.",
      impact: "Protege 80-100% de pérdidas financieras en caso de evento cubierto",
    });
  }

  // Recomendación basada en impacto financiero
  if (scores.impactScore > 0.55) {
    recommendations.push({
      priority: "media",
      title: "Desarrollar un plan de continuidad de negocio",
      description: "Crear protocolos para operar desde ubicaciones alternativas, establecer equipos de respuesta rápida, y capacitar a empleados en procedimientos de emergencia. Esto minimiza pérdidas de ventas durante interrupciones.",
      impact: "Permite recuperación operativa en 48-72 horas en lugar de semanas",
    });
  }

  // Recomendación adicional: Monitoreo y preparación
  if (scores.riskLevel !== "bajo") {
    recommendations.push({
      priority: "alta",
      title: "Establecer un sistema de alerta temprana",
      description: "Suscribirse a alertas meteorológicas locales, monitorear pronósticos de El Niño, y recibir avisos sísmicos. Esto permite preparación previa ante eventos predecibles.",
      impact: "Tiempo de reacción aumenta de horas a días",
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