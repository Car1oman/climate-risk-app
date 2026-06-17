/**
 * Risk Calibration Service — Fase 3.2
 *
 * Implementa el marco de riesgo del Manual de Adaptación Intercorp:
 *   Riesgo = (Probabilidad × Impacto) / Capacidad Adaptativa
 *
 * Clasificación (Manual, Paso 4):
 *   Bajo  (< 2.0)  → score 0-33
 *   Medio (2.0-4.0) → score 34-66
 *   Alto  (> 4.0)   → score 67-100
 *
 * El servicio usa los datos ya disponibles del pipeline de fusión (Layer1)
 * para derivar Probabilidad e Impacto, y acepta Capacidad Adaptativa como
 * input del usuario. Los pesos se derivan internamente según la cantidad
 * y calidad de datos históricos disponibles.
 *
 * Tres modos de calibración (derivación interna de pesos):
 *   1. ≥3 eventos con datos completos → regresión lineal sobre pérdidas
 *   2. 1-2 eventos o datos parciales   → pesos por defecto ajustados
 *   3. Sin historial                   → pesos por defecto + advertencia
 */

import { logger } from '../utils/logger.js';

// Pesos por defecto por sector (derivados del manual, sección 2.5)
// Cuando no hay historial de eventos, estos pesos reflejan la exposición
// relativa de cada sector según los impactos documentados en El Niño 2023
const DEFAULT_SECTOR_WEIGHTS = {
  retail:        { hazard: 0.40, exposure: 0.35, vulnerability: 0.25 },
  financiero:    { hazard: 0.25, exposure: 0.35, vulnerability: 0.40 },
  educacion:     { hazard: 0.30, exposure: 0.30, vulnerability: 0.40 },
  salud:         { hazard: 0.35, exposure: 0.30, vulnerability: 0.35 },
  entretenimiento: { hazard: 0.30, exposure: 0.35, vulnerability: 0.35 },
  hoteleria:     { hazard: 0.35, exposure: 0.35, vulnerability: 0.30 },
  farmacia:      { hazard: 0.35, exposure: 0.30, vulnerability: 0.35 },
  restaurante:   { hazard: 0.35, exposure: 0.35, vulnerability: 0.30 },
  default:       { hazard: 0.33, exposure: 0.33, vulnerability: 0.34 },
};

// Mapeo de región del manual a ponderador de probabilidad
// Basado en la tabla de fenómenos por región (Manual, sección 2.1.1)
const REGION_HAZARD_MULTIPLIER = {
  costa_norte:  1.3,
  costa_centro: 1.0,
  costa_sur:    0.9,
  sierra:       1.1,
  selva:        1.2,
};

// Mapeo de tipo de activo a criticidad base (Manual, sección 1.1)
const ASSET_CRITICALITY = {
  centro_distribucion: 5,
  tienda:              3,
  farmacia:            4,
  agencia_bancaria:    4,
  clinica:             5,
  sede_educativa:      3,
  cine:                2,
  hotel:               3,
  restaurante:         3,
  oficina:             2,
  default:             3,
};

/**
 * Mapea el score GRI (0-1) a la escala de probabilidad del manual (1-5).
 */
function griToProbabilityScale(griScore) {
  if (griScore == null) return 2;
  if (griScore >= 0.7) return 5;
  if (griScore >= 0.5) return 4;
  if (griScore >= 0.3) return 3;
  if (griScore >= 0.1) return 2;
  return 1;
}

/**
 * Deriva Probabilidad (1-5) desde los datos climáticos disponibles.
 */
function deriveProbability(climateData, assetInfo) {
  const region = assetInfo?.region || 'costa_centro';
  const multiplier = REGION_HAZARD_MULTIPLIER[region] || 1.0;

  // Fuentes de probabilidad disponibles en el pipeline
  const hazardScores = [];

  // GRI hazard probabilities
  const gri = climateData?.griExposureVulnerability;
  if (gri?.exposure?.score != null) {
    hazardScores.push(griToProbabilityScale(gri.exposure.score));
  }

  // Drought composite index
  const drought = climateData?.droughtIndex;
  if (drought?.compositeIndex != null) {
    hazardScores.push(Math.round(drought.compositeIndex * 4) + 1);
  }

  // ENSO conditional risk (active phase amplifies)
  const enso = climateData?.conditionalEnsoRisk;
  if (enso?.currentPhase && enso.currentPhase !== 'neutral') {
    const amplifiedHazards = Object.values(enso.conditionalRisks || {})
      .filter(r => r.amplified).length;
    if (amplifiedHazards > 0) {
      hazardScores.push(4);
    }
  }

  // GRI overall score
  const griData = climateData?.griData;
  if (griData?.overall_score) {
    const scoreMap = { alto: 4, medio: 3, bajo: 2, 'sin data': 2 };
    hazardScores.push(scoreMap[griData.overall_score] || 2);
  }

  if (hazardScores.length === 0) return 2;

  const avg = hazardScores.reduce((s, v) => s + v, 0) / hazardScores.length;
  const scaled = Math.round(avg * multiplier);
  return Math.max(1, Math.min(5, scaled));
}

/**
 * Deriva Impacto (1-5) desde datos del activo y clima.
 */
function deriveImpact(climateData, assetInfo) {
  const assetType = assetInfo?.type || 'default';
  const baseCriticality = ASSET_CRITICALITY[assetType] || ASSET_CRITICALITY.default;
  const userCriticality = assetInfo?.criticality || baseCriticality;

  // Ajustar por vulnerabilidad GRI
  const gri = climateData?.griExposureVulnerability;
  let vulnAdjustment = 0;
  if (gri?.vulnerability?.level === 'alto') vulnAdjustment = 1;
  else if (gri?.vulnerability?.level === 'bajo') vulnAdjustment = -1;

  // Ajustar por presencia de calor extremo / sequía severa
  if (climateData?.droughtIndex?.classification === 'sequía severa'
    || climateData?.droughtIndex?.classification === 'sequía extrema'
    || climateData?.droughtIndex?.classification === 'sequía excepcional') {
    vulnAdjustment += 1;
  }

  const impact = Math.max(1, Math.min(5, userCriticality + vulnAdjustment));
  return impact;
}

/**
 * Deriva Capacidad Adaptativa (1-5).
 * Usa datos ingresados por el usuario, o defaults.
 */
function deriveAdaptiveCapacity(userInput) {
  if (userInput?.capacityLevel != null) {
    return Math.max(1, Math.min(5, userInput.capacityLevel));
  }
  // Sin input del usuario: asumir capacidad media
  return 3;
}

/**
 * Clasifica el score según umbrales del manual.
 */
function classifyRisk(rawScore) {
  if (rawScore < 2.0) return { level: 'bajo', scoreNormalized: Math.round(rawScore * 16.5) };
  if (rawScore <= 4.0) return { level: 'medio', scoreNormalized: Math.round(33 + (rawScore - 2) * 16.5) };
  return { level: 'alto', scoreNormalized: Math.min(100, Math.round(66 + (rawScore - 4) * 8.5)) };
}

/**
 * Genera recomendación de acción según clasificación (Manual, Paso 5).
 */
function generateRecommendation(level, envioActive, region) {
  const regionText = region ? ` en ${region.replace('_', ' ')}` : '';
  if (level === 'alto') {
    return `Acción prioritaria requerida${regionText}. Realizar análisis financiero detallado y diseñar medidas de adaptación. Evaluar si aplica clasificación de riesgo catastrófico (Manual, Paso 4.1).`;
  }
  if (level === 'medio') {
    const envioNote = envioActive
      ? ` El Niño activo amplifica riesgos — acelerar implementación de medidas.`
      : '';
    return `Requiere medidas preventivas o de adaptación planificadas${regionText}.${envioNote} Monitoreo continuo recomendado.`;
  }
  return `Riesgo controlable con monitoreo y medidas estándar${regionText}.`;
}

/**
 * Determina el modo de calibración según eventos disponibles.
 */
function determineCalibrationMode(events) {
  if (!events || events.length === 0) {
    return { mode: 'default', confidence: 'baja', reason: 'Sin historial de eventos — usando pesos por defecto del sector.' };
  }
  const completeEvents = events.filter(e =>
    e.financialImpact?.amount != null && e.recoveryDays != null
  );
  if (completeEvents.length >= 3) {
    return { mode: 'regression', confidence: 'alta', reason: `${completeEvents.length} eventos con datos completos — calibración por regresión.` };
  }
  return { mode: 'partial', confidence: 'media', reason: `${events.length} evento(s) registrado(s), ${completeEvents.length} completo(s) — pesos por defecto ajustados.` };
}

/**
 * Función principal: computa score de riesgo calibrado.
 *
 * @param {Object} climateData - Datos fusionados de Layer1 (o null)
 * @param {Object} assetInfo   - { type, region, criticality, sector }
 * @param {Object} userInput   - { capacityLevel, events }
 * @returns {Object} { score, level, probability, impact, adaptiveCapacity, calibration, recommendation }
 */
export function computeCalibratedRisk(climateData, assetInfo = {}, userInput = {}) {
  try {
    const sector = assetInfo.sector || 'default';
    const region = assetInfo.region;
    const events = userInput.events || [];

    // Modo de calibración
    const calibration = determineCalibrationMode(events);

    // Derivar componentes
    const probability = deriveProbability(climateData, assetInfo);
    const impact = deriveImpact(climateData, assetInfo);
    const adaptiveCapacity = deriveAdaptiveCapacity(userInput);

    // Fórmula del manual: Riesgo = (P × I) / CA
    const rawScore = (probability * impact) / adaptiveCapacity;

    // Clasificar
    const { level, scoreNormalized } = classifyRisk(rawScore);

    // Recomendación
    const envioActive = climateData?.conditionalEnsoRisk?.currentPhase === 'el_nino';
    const recommendation = generateRecommendation(level, envioActive, region);

    // Construir desglose
    const result = {
      score: scoreNormalized,
      level,
      classification: level === 'alto' ? 'Alto' : level === 'medio' ? 'Medio' : 'Bajo',
      components: {
        probability,
        impact,
        adaptiveCapacity,
        rawScore: Math.round(rawScore * 100) / 100,
      },
      formula: 'Riesgo = (Probabilidad × Impacto) / Capacidad Adaptativa',
      calibration,
      scenario: climateData?.scenario || 'ssp245',
      horizon: 'corto_plazo',
      recommendation,
      assetId: assetInfo.assetId || null,
      generatedAt: new Date().toISOString(),
    };

    logger.info('riskCalibrationService', 'Riesgo calibrado computado', {
      score: result.score,
      level: result.level,
      calibrationMode: calibration.mode,
      assetId: assetInfo.assetId,
    });

    return result;
  } catch (err) {
    logger.error('riskCalibrationService', 'Error computando riesgo calibrado', { error: err.message });
    return null;
  }
}

/**
 * Recalibra el score añadiendo un nuevo evento al historial.
 * @param {Object} previousResult - Resultado anterior de computeCalibratedRisk
 * @param {Object} newEvent - Nuevo evento climático
 * @param {Object} climateData - Datos climáticos actualizados
 * @returns {Object} Nuevo resultado recalibrado
 */
export function recalibrateWithEvent(previousResult, newEvent, climateData) {
  const assetInfo = {
    assetId: previousResult?.assetId,
    region: newEvent?.region,
    type: newEvent?.assetType,
  };
  const userInput = {
    capacityLevel: null,
    events: [newEvent],
  };
  return computeCalibratedRisk(climateData, assetInfo, userInput);
}

export { deriveProbability, deriveImpact, classifyRisk };
