/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED con el enfoque de inteligencia climática científica.
 * Implementa modelo H×E×I: R = H×0.40 + E×0.30 + I_norm×0.30 — no validado estadísticamente.
 * Ver: project-memory/CLEANUP_ANALYSIS.md — riskModelService — DEPRECATE
 *
 * Este archivo es la copia de archivo de la lógica heurística.
 * El wrapper en server/services/riskModelService.js re-exporta desde aquí.
 * Eliminación física: Sprint 2 o posterior.
 */
import {
  HAZARD_WEIGHTS,
  HAZARD_LABELS,
  HORIZON,
  TYPE_FACTOR,
  REHAB_FACTOR,
  CLOSURE_DAYS,
} from '../shared/riskConstants.js';

function calculateHazardScore(asset) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(HAZARD_WEIGHTS)) {
    const level = asset[key] || 0;
    weightedSum += weight * (level / 4);
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function calculateExposureScore(asset, maxArea = 5000) {
  const area   = asset.area_m2 || 1000;
  const factor = TYPE_FACTOR[asset.type] || 0.8;
  return Math.min((area / maxArea) * factor, 1.0);
}

function calculateFinancialImpact(asset, elNinoMultiplier = 1.0) {
  const sales     = asset.monthly_sales  || 500000;
  const employees = asset.num_employees  || 50;
  const isRented  = asset.condition === 'alquilado';
  const area      = asset.area_m2        || 1000;

  let topHazardKey = 'hazard_flood';
  let topLevel = 0;
  for (const key of Object.keys(HAZARD_WEIGHTS)) {
    const level = (asset[key] || 0) * (key === 'hazard_elnino' ? elNinoMultiplier : 1);
    if (level > topLevel) { topLevel = level; topHazardKey = key; }
  }

  const riskLevel    = Math.min(Math.round(topLevel), 4);
  const closureDays  = CLOSURE_DAYS[riskLevel] || 0;
  const lostSales    = sales * (closureDays / 30);
  const staffCost    = employees * 80 * closureDays;
  const logisticsCost = lostSales * 0.15;
  const rehabCost    = area * (REHAB_FACTOR[topHazardKey] || 120) * (isRented ? 0.4 : 1);

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

function calculateRiskScore(asset, maxArea = 5000, elNinoMultiplier = 1.0) {
  const H      = calculateHazardScore(asset);
  const E      = calculateExposureScore(asset, maxArea);
  const impact = calculateFinancialImpact(asset, elNinoMultiplier);
  const I_norm = Math.min(impact.total / 20_000_000, 1.0);
  const R      = H * 0.40 + E * 0.30 + I_norm * 0.30;

  let level = 'bajo';
  if (R >= 0.75) level = 'critico';
  else if (R >= 0.50) level = 'alto';
  else if (R >= 0.25) level = 'medio';

  return {
    riskScore:       R,
    riskLevel:       level,
    hazardScore:     H,
    exposureScore:   E,
    impactScore:     I_norm,
    financialImpact: impact.total,
    topRisk:         HAZARD_LABELS[impact.topHazardKey],
    topRiskKey:      impact.topHazardKey,
    impactBreakdown: impact,
  };
}

function getTopHazards(asset) {
  return Object.entries(HAZARD_WEIGHTS)
    .map(([key, weight]) => ({
      key,
      label:    HAZARD_LABELS[key],
      level:    asset[key] || 0,
      weight,
      weighted: weight * (asset[key] || 0),
      horizon:  HORIZON[key],
    }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 2);
}

function formatCurrency(value) {
  if (value >= 1_000_000) return `S/ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `S/ ${(value / 1_000).toFixed(0)}K`;
  return `S/ ${value.toFixed(0)}`;
}

function generateRecommendations(asset, scores) {
  const topHazards = getTopHazards(asset);
  const recs = [];

  if (topHazards[0]) {
    const { key, level } = topHazards[0];

    if (key === 'hazard_flood' && level >= 2)
      recs.push({ priority: 'alta', title: 'Instalar sistemas de protección contra inundaciones',
        description: 'Implementar barreras de agua, drenaje mejorado y sistemas de bombeo.',
        impact: 'Reduce el riesgo de cierre por inundación en 40–60%' });

    if (key === 'hazard_elnino' && level >= 2)
      recs.push({ priority: 'alta', title: 'Asegurar continuidad del abastecimiento',
        description: 'Identificar proveedores alternativos y crear reservas estratégicas.',
        impact: 'Mantiene operaciones con 90%+ de normalidad durante eventos El Niño' });

    if (key === 'hazard_earthquake' && level >= 2)
      recs.push({ priority: 'crítica', title: 'Evaluar y reforzar la estructura del edificio',
        description: 'Evaluación sísmica profesional y refuerzos estructurales normativos.',
        impact: 'Mejora la resistencia sísmica en 50–70% y protege vidas' });

    if (key === 'hazard_landslide' && level >= 2)
      recs.push({ priority: 'alta', title: 'Verificar estabilidad del terreno',
        description: 'Estudio geotécnico para evaluar taludes o laderas cercanas.',
        impact: 'Mitiga el riesgo de deslizamientos que pudieran afectar la estructura' });

    if (key === 'hazard_drought' && level >= 2)
      recs.push({ priority: 'media', title: 'Optimizar el uso del agua',
        description: 'Sistemas de captación y reciclaje de agua; mejora de eficiencia operativa.',
        impact: 'Reduce costos de agua en 30–40%' });
  }

  if (scores.exposureScore > 0.65)
    recs.push({ priority: 'media', title: 'Contratar seguro integral contra eventos climáticos',
      description: 'Pólizas que cubran daños por inundación, sismo, El Niño y otras amenazas.',
      impact: 'Protege 80–100% de pérdidas financieras en caso de evento cubierto' });

  if (scores.riskLevel !== 'bajo')
    recs.push({ priority: 'alta', title: 'Establecer sistema de alerta temprana',
      description: 'Suscribirse a alertas meteorológicas y monitorear pronósticos climáticos.',
      impact: 'Tiempo de reacción aumenta de horas a días' });

  return recs.slice(0, 3);
}

function generateNarrative(asset, scores) {
  const levelText = {
    critico: 'crítico',
    alto:    'alto',
    medio:   'medio',
    bajo:    'bajo',
  }[scores.riskLevel] ?? 'bajo';

  const topHazard = scores.topRisk ?? 'inundación';
  const financial = formatCurrency(scores.financialImpact);
  const district  = asset.district ? ` en ${asset.district}` : '';

  return `Esta tienda${district} presenta un nivel de riesgo climático ${levelText}. ` +
    `La amenaza principal identificada es ${topHazard.toLowerCase()}, con un impacto financiero ` +
    `potencial estimado en ${financial} ante un evento climático grave. ` +
    (scores.riskLevel === 'critico' || scores.riskLevel === 'alto'
      ? 'Se recomienda implementar medidas de mitigación de forma prioritaria.'
      : 'Se recomienda mantener un monitoreo preventivo y revisar los planes de contingencia.');
}

export function getCompleteRiskModel(asset, { maxArea = 5000, elNinoMultiplier = 1.0 } = {}) {
  const scores     = calculateRiskScore(asset, maxArea, elNinoMultiplier);
  const topHazards = getTopHazards(asset);
  const recommendations = generateRecommendations(asset, scores);

  return {
    ...scores,
    topHazards,
    recommendations,
    narrative: generateNarrative(asset, scores),
    formula: {
      H:       (scores.hazardScore   * 100).toFixed(1),
      E:       (scores.exposureScore * 100).toFixed(1),
      I:       (scores.impactScore   * 100).toFixed(1),
      R:       (scores.riskScore     * 100).toFixed(1),
      weights: 'R = (H × 0.40) + (E × 0.30) + (I × 0.30)',
    },
    financialFormatted: {
      total:        formatCurrency(scores.financialImpact),
      lostSales:    formatCurrency(scores.impactBreakdown.lostSales),
      staffCost:    formatCurrency(scores.impactBreakdown.staffCost),
      logisticsCost: formatCurrency(scores.impactBreakdown.logisticsCost),
      rehabCost:    formatCurrency(scores.impactBreakdown.rehabCost),
    },
  };
}
