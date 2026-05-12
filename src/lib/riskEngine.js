import {
  HAZARD_WEIGHTS,
  TYPE_FACTOR,
  HAZARD_LABELS,
  HORIZON,
  getRiskColor,
} from './constants.js';

export { HAZARD_LABELS, HAZARD_WEIGHTS, HORIZON, TYPE_FACTOR, getRiskColor };

const REHAB_FACTOR = {
  hazard_flood: 120,
  hazard_elnino: 150,
  hazard_earthquake: 350,
  hazard_landslide: 200,
  hazard_drought: 40,
};

const CLOSURE_DAYS = { 0: 0, 1: 3, 2: 7, 3: 21, 4: 45 };

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

export function formatCurrency(value) {
  if (value >= 1000000) return `S/ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `S/ ${(value / 1000).toFixed(0)}K`;
  return `S/ ${value.toFixed(0)}`;
}

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
