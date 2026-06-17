/**
 * Conditional ENSO Risk Service — Fase 2.3
 *
 * Computa probabilidades condicionales de amenazas climáticas basadas en la
 * fase ENSO actual, usando la serie histórica completa ONI (1950–2026).
 *
 * Concepto:
 *   P(Riesgo↑ | Fase_ENSO) = probabilidad histórica de que una amenaza
 *   (sequía/inundación/calor extremo) ocurra dado El Niño, La Niña o Neutro.
 *
 * La serie ONI de 76 años (~300 trimestres) proporciona robustez estadística
 * para calcular frecuencias condicionales, duraciones medias de fase y
 * probabilidades de transición utilizables como priors bayesianos en el
 * framework AHP (Fase 3.2).
 *
 * Fuente: NOAA CPC ONI (ERSST v5) 1950–2026, IPCC AR6 Chapter 8,
 *   SENAMHI estudios de impacto ENSO en Perú.
 */

import { logger } from '../utils/logger.js';

// Umbrales ONI para clasificación de fase
const EL_NINO_THRESHOLD = 0.5;
const LA_NINA_THRESHOLD = -0.5;

// Intensidades ENSO
const INTENSITY_LEVELS = [
  { min: 2.0, label: 'muy_fuerte' },
  { min: 1.5, label: 'fuerte' },
  { min: 1.0, label: 'moderado' },
  { min: 0.5, label: 'débil' },
  { min: 0,   label: 'neutro' },
];

// Pesos de impacto por fase ENSO para cada amenaza (Perú)
// Derivado de: SENAMHI, IPCC AR6 Chapter 8 (Water Cycle), NOAA CPC
const HAZARD_WEIGHTS = {
  el_nino: {
    flood_risk:       2.8,   // El Niño fuerte multiplica riesgo de inundación en costa norte
    extreme_rain:     2.5,   // Lluvias extremas (Piura, Tumbes)
    landslide_risk:   2.0,   // Deslizamientos por saturación de suelos
    drought_risk:     0.6,   // El Niño reduce riesgo de sequía en norte
    extreme_heat:     1.3,   // Temperaturas elevadas en costa
  },
  la_nina: {
    flood_risk:       0.7,   // La Niña reduce inundaciones en costa norte
    extreme_rain:     0.6,   // Menos lluvias extremas
    landslide_risk:   0.8,   // Menor saturación
    drought_risk:     2.5,   // La Niña amplifica sequía en costa norte peruana
    extreme_heat:     0.9,   // Temperaturas ligeramente más frescas
  },
  neutral: {
    flood_risk:       1.0,
    extreme_rain:     1.0,
    landslide_risk:   1.0,
    drought_risk:     1.0,
    extreme_heat:     1.0,
  },
};

// Categorías de amenaza con etiquetas en español
const HAZARD_LABELS = {
  flood_risk:     'inundación',
  extreme_rain:   'lluvias extremas',
  landslide_risk: 'deslizamientos',
  drought_risk:   'sequía',
  extreme_heat:   'calor extremo',
};

/**
 * Clasifica fase ENSO desde anomalía ONI.
 */
function classifyPhase(oni) {
  if (oni >= EL_NINO_THRESHOLD) return 'el_nino';
  if (oni <= LA_NINA_THRESHOLD) return 'la_nina';
  return 'neutral';
}

/**
 * Clasifica intensidad desde anomalía ONI.
 */
function classifyIntensity(oni) {
  const abs = Math.abs(oni);
  for (const level of INTENSITY_LEVELS) {
    if (abs >= level.min) return level.label;
  }
  return 'neutro';
}

/**
 * Computa estadísticas de fase sobre la serie histórica completa.
 */
function computePhaseStats(history) {
  const phases = { el_nino: [], la_nina: [], neutral: [] };
  const intensities = { el_nino: {}, la_nina: {} };

  for (const r of history) {
    const phase = classifyPhase(r.anom);
    phases[phase].push(r);
    if (phase !== 'neutral') {
      const int = classifyIntensity(r.anom);
      intensities[phase][int] = (intensities[phase][int] || 0) + 1;
    }
  }

  const total = history.length;
  const phaseFrequencies = {};
  for (const [phase, records] of Object.entries(phases)) {
    phaseFrequencies[phase] = {
      count: records.length,
      frequency: total > 0 ? records.length / total : 0,
    };
  }

  return { phaseFrequencies, intensities, total };
}

/**
 * Computa duraciones medias de cada fase (número consecutivo de trimestres).
 */
function computePhaseDurations(history) {
  const durations = [];
  let currentPhase = null;
  let currentDuration = 0;

  for (const r of history) {
    const phase = classifyPhase(r.anom);
    if (phase === currentPhase) {
      currentDuration++;
    } else {
      if (currentPhase && currentDuration > 0) {
        durations.push({ phase: currentPhase, duration: currentDuration });
      }
      currentPhase = phase;
      currentDuration = 1;
    }
  }
  // Cerrar última fase
  if (currentPhase && currentDuration > 0) {
    durations.push({ phase: currentPhase, duration: currentDuration });
  }

  const byPhase = { el_nino: [], la_nina: [], neutral: [] };
  for (const d of durations) {
    byPhase[d.phase].push(d.duration);
  }

  const avgDurations = {};
  for (const [phase, vals] of Object.entries(byPhase)) {
    avgDurations[phase] = vals.length > 0
      ? vals.reduce((s, v) => s + v, 0) / vals.length
      : 0;
  }

  return { avgDurations, raw: durations };
}

/**
 * Construye matriz de transición 3×3: P(fase_siguiente | fase_actual).
 */
function computeTransitionMatrix(history) {
  const counts = {
    el_nino:  { el_nino: 0, la_nina: 0, neutral: 0 },
    la_nina:  { el_nino: 0, la_nina: 0, neutral: 0 },
    neutral:  { el_nino: 0, la_nina: 0, neutral: 0 },
  };

  for (let i = 0; i < history.length - 1; i++) {
    const from = classifyPhase(history[i].anom);
    const to   = classifyPhase(history[i + 1].anom);
    counts[from][to]++;
  }

  const matrix = {};
  for (const [from, transitions] of Object.entries(counts)) {
    const total = Object.values(transitions).reduce((s, v) => s + v, 0);
    matrix[from] = {};
    for (const [to, count] of Object.entries(transitions)) {
      matrix[from][to] = total > 0 ? Math.round((count / total) * 1000) / 1000 : 0;
    }
  }

  return matrix;
}

/**
 * Computa probabilidad de que una fase dada dure al menos N trimestres más.
 */
function computePersistenceProb(avgDurations) {
  const result = {};
  for (const [phase, avg] of Object.entries(avgDurations)) {
    result[phase] = {
      avgQuarters: Math.round(avg * 10) / 10,
      avgMonths:   Math.round(avg * 3 * 10) / 10,
      probNextQuarter: avg > 1 ? (avg - 1) / avg : 0.5,
    };
  }
  return result;
}

/**
 * Construye factores de riesgo condicional para cada amenaza.
 */
function computeConditionalRisks(currentPhase) {
  const hazardWeights = HAZARD_WEIGHTS[currentPhase] || HAZARD_WEIGHTS.neutral;
  const risks = {};

  for (const [hazard, multiplier] of Object.entries(hazardWeights)) {
    risks[hazard] = {
      multiplier,
      label: HAZARD_LABELS[hazard] || hazard,
      amplified: multiplier > 1.0,
      reduced: multiplier < 1.0,
      interpretation: multiplier > 1.0
        ? `Riesgo aumentado (×${multiplier.toFixed(1)}) bajo ${currentPhase === 'el_nino' ? 'El Niño' : 'La Niña'}`
        : multiplier < 1.0
          ? `Riesgo reducido (×${multiplier.toFixed(1)}) bajo ${currentPhase === 'el_nino' ? 'El Niño' : 'La Niña'}`
          : 'Riesgo neutro — sin amplificación ENSO',
    };
  }

  return risks;
}

/**
 * Construye narrativa del riesgo condicional ENSO.
 */
function buildNarrative(currentPhase, phaseStats, avgDurations, transitionMatrix, conditionalRisks) {
  const phaseLabel = currentPhase === 'el_nino' ? 'El Niño'
    : currentPhase === 'la_nina' ? 'La Niña'
    : 'ENSO Neutro';
  const intensityLabel = currentPhase !== 'neutral'
    ? ` (amplificador climático activo)`
    : '';

  const freq = phaseStats.phaseFrequencies[currentPhase];
  const freqPct = freq ? (freq.frequency * 100).toFixed(1) : '?';

  const avgDur = avgDurations[currentPhase] || 0;
  const avgMonths = (avgDur * 3).toFixed(0);

  const amplifiedHazards = Object.entries(conditionalRisks)
    .filter(([, v]) => v.amplified)
    .map(([k]) => HAZARD_LABELS[k] || k);

  const reducedHazards = Object.entries(conditionalRisks)
    .filter(([, v]) => v.reduced)
    .map(([k]) => HAZARD_LABELS[k] || k);

  const amplifiedText = amplifiedHazards.length
    ? `Amenazas amplificadas: ${amplifiedHazards.join(', ')}.`
    : '';
  const reducedText = reducedHazards.length
    ? `Amenazas reducidas: ${reducedHazards.join(', ')}.`
    : '';

  return [
    `Riesgo condicional ENSO: fase actual ${phaseLabel}${intensityLabel}.`,
    `Frecuencia histórica: ${freqPct}% de los trimestres desde 1950.`,
    `Duración media: ${avgMonths} meses (${avgDur.toFixed(1)} trimestres consecutivos).`,
    amplifiedText,
    reducedText,
    `Probabilidad de persistir al próximo trimestre: ${(avgDur > 1 ? ((avgDur - 1) / avgDur * 100).toFixed(0) : '50')}%.`,
  ].filter(Boolean).join(' ');
}

/**
 * Función principal: computa el riesgo condicional ENSO completo.
 *
 * @param {Array|null} oniHistory - Serie ONI completa de getFullOniHistory()
 * @param {Object|null} ensoContext - Contexto ENSO actual de getEnsoContext()
 * @returns {Object|null} { currentPhase, phaseStats, avgDurations, transitionMatrix, conditionalRisks, narrative }
 */
export function computeConditionalEnsoRisk(oniHistory, ensoContext) {
  if (!oniHistory || oniHistory.length < 20) {
    logger.warn('conditionalEnsoRiskService', 'ONI history insuficiente', { records: oniHistory?.length ?? 0 });
    return null;
  }

  try {
    const currentPhase = ensoContext?.phase || 'neutral';

    // Estadísticas sobre toda la serie histórica
    const phaseStats = computePhaseStats(oniHistory);
    const { avgDurations } = computePhaseDurations(oniHistory);
    const transitionMatrix = computeTransitionMatrix(oniHistory);
    const persistence = computePersistenceProb(avgDurations);
    const conditionalRisks = computeConditionalRisks(currentPhase);
    const narrative = buildNarrative(currentPhase, phaseStats, avgDurations, transitionMatrix, conditionalRisks);

    logger.info('conditionalEnsoRiskService', 'Riesgo condicional ENSO computado', {
      phase: currentPhase,
      records: oniHistory.length,
      amplifiedHazards: Object.entries(conditionalRisks).filter(([, v]) => v.amplified).length,
    });

    return {
      currentPhase,
      phaseStats,
      avgDurations,
      transitionMatrix,
      persistence,
      conditionalRisks,
      narrative,
    };
  } catch (err) {
    logger.error('conditionalEnsoRiskService', 'Error computando riesgo condicional ENSO', { error: err.message });
    return null;
  }
}
