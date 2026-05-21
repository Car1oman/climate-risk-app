/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED con el enfoque de inteligencia climática científica.
 * PESOS NO CALIBRADOS: composite_score con precisión falsa, urgency como semáforo corporativo.
 * Ver: project-memory/CLEANUP_ANALYSIS.md — Layer4 — DEPRECATE
 *
 * Este archivo es la copia de archivo de la lógica heurística.
 * El wrapper en server/layers/Layer4_PrioritizationEngine.js re-exporta desde aquí.
 * Eliminación física: Sprint 2 o posterior.
 */

// ─── Pesos del modelo de priorización ────────────────────────────────────────
// Basado en metodología IPCC AR6 WG2 Chapter 16 — Risk assessment framework
const WEIGHTS = {
  probability:    0.30,
  intensity:      0.25,
  exposure:       0.25,
  sensitivity:    0.10,
  horizon_factor: 0.10,
};

// ─── Umbrales de urgencia ────────────────────────────────────────────────────
const URGENCY_THRESHOLDS = {
  critica: 0.75,
  alta:    0.50,
  media:   0.25,
};

// ─── Factor de horizonte temporal ────────────────────────────────────────────
// Corto plazo tiene mayor urgencia de acción que mediano
const HORIZON_FACTORS = {
  short_term: 1.0,
  mid_term:   0.75,
  long_term:  0.5,
};

// ─── Mapeo de nivel cualitativo a valor numérico (0–1) ───────────────────────
const LEVEL_TO_NUM = {
  alto:  1.0,
  medio: 0.5,
  bajo:  0.2,
};

/**
 * Extrae la probabilidad de ocurrencia de una señal.
 * - Señales GRI: usan la probabilidad proyectada real (0-1)
 * - Señales cuantitativas (climate_cells / Open-Meteo): proxy por confianza
 */
function extractProbability(signal) {
  const isGRI = signal.indicator?.startsWith('gri_');

  if (isGRI || signal.signalType === 'flood_risk') {
    // Para señales GRI y flood_risk el projected ya es probabilidad real
    return Math.min(1, signal.projected ?? signal.historical ?? 0);
  }

  // Para señales cuantitativas: proxy por confianza del dato CMIP6
  const confBase = { high: 0.80, medium: 0.60, low: 0.40 };
  return confBase[signal.confidence] ?? 0.50;
}

/**
 * Normaliza la intensidad de una señal a valor 0-1.
 * Las señales GRI usan probabilidad absoluta; las cuantitativas usan deltas físicos.
 */
function normalizeIntensity(signal) {
  const { signalType, delta, delta_pct, projected } = signal;
  const isGRI = signal.indicator?.startsWith('gri_');

  if (isGRI) {
    // Para señales GRI: intensidad proporcional a la probabilidad proyectada.
    // Umbral de referencia: 0.50 (50%) = intensidad máxima plausible
    return Math.min(1, (projected ?? 0) / 0.50);
  }

  if (signalType === 'flood_risk') {
    return Math.min(1, projected ?? 0);
  }

  // Rangos máximos de referencia para señales cuantitativas (IPCC AR6 América del Sur)
  const MAX_DELTAS = {
    extreme_heat:    60,  // días adicionales hd35
    severe_heat:     20,  // días adicionales hd40
    tropical_nights: 80,  // días adicionales Tmin>20°C (máx observado Perú SSP585 ~+50)
    drought:         45,  // días adicionales CDD (o 50% reducción precipitación)
    extreme_rain:    80,  // % aumento rx5day
    temp_increase:    4,  // °C delta tas
  };

  // Para drought con indicador pr/cdd: usar delta absoluto para CDD, delta_pct para pr
  const useValue = (delta_pct != null && Math.abs(delta_pct) > 0 && signalType !== 'drought')
    ? Math.abs(delta_pct)
    : Math.abs(delta ?? 0);

  const maxRef = MAX_DELTAS[signalType] ?? 50;
  return Math.min(1, useValue / maxRef);
}

/**
 * Convierte nivel cualitativo de exposición/sensibilidad a número.
 */
function levelToNum(level) {
  return LEVEL_TO_NUM[level] ?? 0.2;
}

/**
 * Calcula el composite_score R para un riesgo.
 */
function calcCompositeScore(risk, griData) {
  const { signal, exposure_level, sensitivity_level } = risk;

  const probability    = extractProbability(signal);
  const intensity      = normalizeIntensity(signal);
  const exposure       = levelToNum(exposure_level);
  const sensitivity    = levelToNum(sensitivity_level);
  const horizon_factor = HORIZON_FACTORS[signal.horizon] ?? 0.75;

  const score =
    probability    * WEIGHTS.probability    +
    intensity      * WEIGHTS.intensity      +
    exposure       * WEIGHTS.exposure       +
    sensitivity    * WEIGHTS.sensitivity    +
    horizon_factor * WEIGHTS.horizon_factor;

  return {
    composite_score: Math.round(score * 1000) / 1000,
    score_components: { probability, intensity, exposure, sensitivity, horizon_factor },
  };
}

/**
 * Asigna nivel de urgencia según composite_score.
 */
function assignUrgency(score) {
  if (score >= URGENCY_THRESHOLDS.critica) return 'crítica';
  if (score >= URGENCY_THRESHOLDS.alta)    return 'alta';
  if (score >= URGENCY_THRESHOLDS.media)   return 'media';
  return 'baja';
}

/**
 * Función principal exportada.
 * @param {Object} businessRiskOutput - Output de Layer 3
 * @param {Object} fusedData - Output de Layer 1 (para acceder a griData)
 * @returns {{ prioritized_risks: Array, top_risk: Object|null }}
 */
export function prioritizeRisks(businessRiskOutput, fusedData) {
  const { risks } = businessRiskOutput;
  const griData = fusedData?.griData ?? null;

  const scored = risks.map((risk, idx) => {
    const { composite_score, score_components } = calcCompositeScore(risk, griData);
    return {
      ...risk,
      composite_score,
      score_components,
      urgency: assignUrgency(composite_score),
    };
  });

  // Ordenar por composite_score DESC
  scored.sort((a, b) => b.composite_score - a.composite_score);

  // Asignar rank
  const prioritized_risks = scored.map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    prioritized_risks,
    top_risk: prioritized_risks[0] ?? null,
  };
}
