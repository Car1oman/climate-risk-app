/**
 * Drought Composite Index Service — Fase 2.2
 *
 * Multi-signal drought index que combina cuatro señales satelitales y un
 * multiplicador ENSO en un único índice compuesto normalizado [0,1].
 *
 * Fórmula (auditoría ítem 2):
 *   Drought_Index = weighted_sum(norm(CDD), norm(-TWSA), norm(-soil_moisture),
 *                                norm(-delta_precip)) × ENSO_multiplier
 *
 * Pesos IPCC AR6 para sequía:
 *   - CDD (duración déficit precipitación):    0.30
 *   - TWSA / GRACE-FO (almacenamiento agua):   0.30
 *   - Soil moisture (sequía agrícola):         0.25
 *   - Delta precip (anomalía precipitación):   0.15
 *
 * Referencia: Stull (2011), IPCC AR6 Chapter 8 (Water Cycle Changes),
 *   GRACE-FO mascon solutions (JPL, CSR, GSFC)
 */

import { logger } from '../utils/logger.js';

// Pesos IPCC AR6 para el índice compuesto de sequía multi-señal
const DROUGHT_WEIGHTS = {
  cdd:          0.30,
  twsa:         0.30,
  soilMoisture: 0.25,
  deltaPrecip:  0.15,
};

// Rangos típicos para normalización min-max [0,1]
// Estos rangos representan condiciones plausibles para Perú/regiones tropicales
const NORM_RANGES = {
  // CDD: 0 (sin sequía) a 120+ días consecutivos secos (sequía extrema)
  cdd:          { min: 0, max: 120 },
  // TWSA: 0 cm (normal) a -30 cm (déficit extremo de agua terrestre)
  twsa:         { min: 0, max: -30 },
  // Soil moisture: 50% (normal) a 5% (sequía agrícola extrema)
  soilMoisture: { min: 50, max: 5 },
  // Delta precip: 0% (normal) a -80% (déficit extremo)
  deltaPrecip:  { min: 0, max: -80 },
};

// Multiplicador ENSO para el índice compuesto
const ENSO_MULTIPLIERS = {
  la_nina: 1.3,   // La Niña amplifica sequía en costa norte peruana
  el_nino: 1.0,   // El Niño no amplifica sequía (trae lluvias)
  neutral: 1.0,
};

// Umbrales de clasificación del Drought_Index (compuesto)
const DROUGHT_CLASSES = [
  { max: 0.15, label: 'sin sequía' },
  { max: 0.30, label: 'sequía leve' },
  { max: 0.50, label: 'sequía moderada' },
  { max: 0.70, label: 'sequía severa' },
  { max: 0.85, label: 'sequía extrema' },
  { max: 1.00, label: 'sequía excepcional' },
  { max: Infinity, label: 'sequía excepcional+' },
];

// Narrativas por clasificación
const DROUGHT_NARRATIVES = {
  'sin sequía':        'No se detectan condiciones de sequía significativas en la región.',
  'sequía leve':       'Condiciones de sequía leve detectadas. Monitoreo recomendado.',
  'sequía moderada':   'Sequía moderada: posible afectación a cultivos de secano y disponibilidad hídrica.',
  'sequía severa':     'Sequía severa: alto riesgo para agricultura, ganadería y abastecimiento urbano.',
  'sequía extrema':    'Sequía extrema: pérdidas agrícolas significativas, restricciones hídricas probables.',
  'sequía excepcional':'Sequía excepcional: crisis hídrica generalizada con impacto multisectorial.',
};

/**
 * Normaliza un valor al rango [0, 1] usando los límites definidos.
 * @param {number|null} value
 * @param {{ min: number, max: number }} range
 * @returns {number|null}
 */
function normalize(value, range) {
  if (value == null) return null;
  const { min, max } = range;
  if (max === min) return 0.5;
  const clamped = Math.max(Math.min(value, Math.max(min, max)), Math.min(min, max));
  return (clamped - min) / (max - min);
}

/**
 * Determina el multiplicador ENSO según la fase actual.
 * @param {Object|null} ensoData
 * @returns {number}
 */
function getEnsoMultiplier(ensoData) {
  if (!ensoData) return 1.0;
  const phase = ensoData.phase || 'neutral';
  return ENSO_MULTIPLIERS[phase] ?? 1.0;
}

/**
 * Clasifica el índice compuesto en etiqueta textual.
 * @param {number} index - Valor normalizado [0,1]
 * @returns {{ label: string, severity: number }}
 */
function classifyDrought(index) {
  for (const cls of DROUGHT_CLASSES) {
    if (index <= cls.max) {
      return { label: cls.label, severity: DROUGHT_CLASSES.indexOf(cls) / (DROUGHT_CLASSES.length - 1) };
    }
  }
  return { label: 'sequía excepcional+', severity: 1.0 };
}

/**
 * Construye una narrativa descriptiva a partir de los componentes del índice.
 * @param {number} index
 * @param {{ label: string }} classification
 * @param {Object} components
 * @param {number|null} ensoMultiplier
 * @returns {string}
 */
function buildNarrative(index, classification, components, ensoMultiplier) {
  const base = DROUGHT_NARRATIVES[classification.label] || 'Índice de sequía no clasificable.';
  const activeSignals = [];
  if (components.cdd != null) activeSignals.push(`CDD (${components.rawCdd.toFixed(0)} días secos consecutivos)`);
  if (components.twsa != null) activeSignals.push(`TWS (${components.rawTwsa.toFixed(1)} cm anomalía)`);
  if (components.soilMoisture != null) activeSignals.push(`humedad suelo (${components.rawSoilMoisture.toFixed(1)}%)`);
  if (components.deltaPrecip != null) activeSignals.push(`precipitación (${components.rawDeltaPrecip.toFixed(1)}% vs normal)`);
  const signalsText = activeSignals.length
    ? ` Señales activas: ${activeSignals.join(', ')}.`
    : ' Sin señales disponibles para desglose.';
  const ensoText = ensoMultiplier && ensoMultiplier > 1.0
    ? ` Multiplicador ENSO (La Niña): ×${ensoMultiplier.toFixed(1)}.`
    : '';
  const pct = (index * 100).toFixed(1);
  return `Índice compuesto de sequía: ${pct}% — ${classification.label}.${signalsText}${ensoText}`;
}

/**
 * Calcula el Drought Composite Index a partir de las fuentes disponibles.
 *
 * @param {Object|null} openMeteoData  - climateIndices de Open-Meteo (cdd, avg_soil_moisture, pr, ...)
 * @param {Object|null} graceFoData     - getGraceFoData() output { anomaly: { tws_anomaly_cm } }
 * @param {Object|null} ensoData        - getEnsoContext() output { phase }
 * @returns {Object|null} { compositeIndex, components, classification, narrative }
 */
export function computeDroughtCompositeIndex(openMeteoData, graceFoData, ensoData) {
  try {
    // ── Extraer señales crudas ──────────────────────────────────────────────
    const rawCdd           = openMeteoData?.cdd ?? null;
    const rawSoilMoisture  = openMeteoData?.avg_soil_moisture ?? null;
    // Pr del climateIndices es el valor absoluto, no el delta. Tomamos el delta
    // de la tabla de tendencias del objeto meteo si existe.
    const rawDeltaPrecip   = openMeteoData?.pr_percent ?? null;  // futuro
    const rawTwsa          = graceFoData?.anomaly?.tws_anomaly_cm ?? null;
    const rawSoilMoisturePct = rawSoilMoisture != null ? rawSoilMoisture * 100 : null;

    // ── Normalizar cada señal a [0, 1] ──────────────────────────────────────
    const normCdd          = normalize(rawCdd,          NORM_RANGES.cdd);
    const normTwsa         = normalize(rawTwsa,         NORM_RANGES.twsa);
    const normSoilMoisture = normalize(rawSoilMoisturePct, NORM_RANGES.soilMoisture);
    const normDeltaPrecip  = normalize(rawDeltaPrecip,  NORM_RANGES.deltaPrecip);

    // ── Ponderación ─────────────────────────────────────────────────────────
    let weightedSum = 0;
    let totalWeight = 0;
    const weightsUsed = {};

    if (normCdd != null) {
      weightedSum += DROUGHT_WEIGHTS.cdd * normCdd;
      totalWeight += DROUGHT_WEIGHTS.cdd;
      weightsUsed.cdd = DROUGHT_WEIGHTS.cdd;
    }
    if (normTwsa != null) {
      weightedSum += DROUGHT_WEIGHTS.twsa * normTwsa;
      totalWeight += DROUGHT_WEIGHTS.twsa;
      weightsUsed.twsa = DROUGHT_WEIGHTS.twsa;
    }
    if (normSoilMoisture != null) {
      weightedSum += DROUGHT_WEIGHTS.soilMoisture * normSoilMoisture;
      totalWeight += DROUGHT_WEIGHTS.soilMoisture;
      weightsUsed.soilMoisture = DROUGHT_WEIGHTS.soilMoisture;
    }
    if (normDeltaPrecip != null) {
      weightedSum += DROUGHT_WEIGHTS.deltaPrecip * normDeltaPrecip;
      totalWeight += DROUGHT_WEIGHTS.deltaPrecip;
      weightsUsed.deltaPrecip = DROUGHT_WEIGHTS.deltaPrecip;
    }

    // Si no hay suficientes señales, retornar null
    if (totalWeight < 0.3) {
      logger.debug('droughtCompositeService', 'Señales insuficientes para Drought Composite Index', { totalWeight });
      return null;
    }

    // Rebalancear pesos sobre las señales disponibles
    const compositeIndexRaw = weightedSum / totalWeight;

    // ── Multiplicador ENSO ──────────────────────────────────────────────────
    const ensoMultiplier = getEnsoMultiplier(ensoData);
    const compositeIndex = Math.min(compositeIndexRaw * ensoMultiplier, 1.0);

    // ── Clasificación y narrativa ──────────────────────────────────────────
    const classification = classifyDrought(compositeIndex);
    const narrative = buildNarrative(compositeIndex, classification, {
      rawCdd, rawTwsa, rawSoilMoisture: rawSoilMoisturePct, rawDeltaPrecip,
      cdd: normCdd, twsa: normTwsa, soilMoisture: normSoilMoisture,
    }, ensoMultiplier > 1.0 ? ensoMultiplier : null);

    logger.info('droughtCompositeService', 'Drought Composite Index computed', {
      index: compositeIndex.toFixed(4),
      classification: classification.label,
      signals: Object.keys(weightsUsed).length,
      ensoMultiplier,
    });

    return {
      compositeIndex:      Math.round(compositeIndex * 1000) / 1000,
      classification:      classification.label,
      severityScore:       classification.severity,
      components: {
        cdd:          normCdd,
        twsa:         normTwsa,
        soilMoisture: normSoilMoisture,
        deltaPrecip:  normDeltaPrecip,
      },
      raw: {
        cdd:          rawCdd,
        twsa:         rawTwsa,
        soilMoisture: rawSoilMoisture,
        deltaPrecip:  rawDeltaPrecip,
      },
      ensoMultiplier: ensoMultiplier > 1.0 ? ensoMultiplier : null,
      narrative,
    };
  } catch (err) {
    logger.error('droughtCompositeService', 'Error computing Drought Composite Index', { error: err.message });
    return null;
  }
}
