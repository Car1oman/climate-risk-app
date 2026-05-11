/**
 * Layer 4 — Prioritization Engine
 * Calcula composite_score R = (probability×0.30) + (intensity×0.25) +
 * (exposure×0.25) + (sensitivity×0.10) + (horizon_factor×0.10)
 * y asigna urgencia a cada riesgo.
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
 * Para flood_risk usa el valor proyectado directamente (ya es probabilidad 0-1).
 * Para otras señales, deriva una probabilidad implícita del delta normalizado.
 */
function extractProbability(signal, griData) {
  if (signal.signalType === 'flood_risk') {
    return Math.min(1, signal.projected ?? 0);
  }

  // Para señales de climate_cells: usar confianza como proxy de probabilidad base
  const confBase = { high: 0.80, medium: 0.60, low: 0.40 };
  return confBase[signal.confidence] ?? 0.50;
}

/**
 * Normaliza el delta de una señal a un valor de intensidad entre 0 y 1.
 * Usa rangos máximos esperados por tipo de señal para normalizar.
 */
function normalizeIntensity(signal) {
  const { signalType, delta, delta_pct } = signal;

  // Rangos máximos de referencia para normalización
  // Fuente: IPCC AR6 WG1 — valores extremos proyectados para América del Sur
  const MAX_DELTAS = {
    extreme_heat: 60,   // días adicionales hd35
    severe_heat:  20,   // días adicionales hd40
    drought:      45,   // días adicionales CDD
    extreme_rain: 80,   // % aumento rx5day
    temp_increase: 4,   // °C delta tas
    flood_risk:    1,   // probabilidad ya normalizada
  };

  if (signalType === 'flood_risk') {
    return Math.min(1, signal.projected ?? 0);
  }

  // Usar delta_pct si está disponible y es positivo, sino delta absoluto
  const useValue = (delta_pct != null && Math.abs(delta_pct) > 0)
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

  const probability    = extractProbability(signal, griData);
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
