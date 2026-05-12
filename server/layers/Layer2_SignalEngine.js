/**
 * Layer 2 — Signal Engine
 * Detecta señales climáticas comparando historical vs short_term vs mid_term
 * usando umbrales científicos basados en IPCC AR6, WRI y WMO.
 */

// ─── Umbrales científicos ────────────────────────────────────────────────────
// Fuente: IPCC AR6 WG1 Chapter 11 (extremos climáticos), WMO 2023 State of Climate
const THRESHOLDS = {
  // Días con Tmax > 35°C: aumento > 10 días en corto plazo, > 20 en mediano
  EXTREME_HEAT_SHORT: 10,
  EXTREME_HEAT_MID:   20,

  // Días con Tmax > 40°C: aumento > 5 días
  SEVERE_HEAT: 5,

  // Noches tropicales (Tmin > 20°C): aumento > 10 días en corto, > 20 en mediano
  // Fuente: IPCC AR6 WG1 Chapter 11.3 — Warm nights / TN90p
  // Señal clave para salud, confort y cadena frío en regiones costeras de Perú
  TROPICAL_NIGHTS_SHORT: 10,
  TROPICAL_NIGHTS_MID:   20,

  // Días secos consecutivos: aumento > 15 días
  DROUGHT_CDD: 15,

  // Precipitación anual: reducción > 15% (usando prpercnt de DB o delta_pct calculado)
  DROUGHT_PR_PCT: -15,

  // Precipitación máxima 5 días: aumento > 20%
  EXTREME_RAIN_RX5DAY_PCT: 20,

  // Precipitación máxima 1 día: supera 50 mm (o r50mm > 0 días/año con lluvia > 50mm)
  EXTREME_RAIN_RX1DAY_MM: 50,

  // Temperatura media: delta > 1.5°C corto plazo, > 2.5°C mediano
  TEMP_INCREASE_SHORT: 1.5,
  TEMP_INCREASE_MID:   2.5,

  // Probabilidad de inundación GRI > 0.35
  FLOOD_RISK_PROB: 0.35,
};

/**
 * Calcula delta porcentual entre valor histórico y proyectado.
 * Retorna null si alguno es nulo o el histórico es 0.
 */
function deltaPct(historical, projected) {
  if (historical == null || projected == null || historical === 0) return null;
  return ((projected - historical) / Math.abs(historical)) * 100;
}

/**
 * Calcula delta absoluto. Retorna null si alguno es nulo.
 */
function deltaAbs(historical, projected) {
  if (historical == null || projected == null) return null;
  return projected - historical;
}

/**
 * Determina el nivel de confianza de una señal según la fuente de datos disponible.
 * - 'high':   dato proviene de climate_cells (CMIP6 ensemble)
 * - 'medium': dato proviene de GRI o Open-Meteo
 * - 'low':    inferido
 */
function confidence(hasClimateCell, hasGriOrMeteo) {
  if (hasClimateCell) return 'high';
  if (hasGriOrMeteo)  return 'medium';
  return 'low';
}

/**
 * Construye un objeto de señal estandarizado.
 */
function buildSignal({ signalType, indicator, historical, projected, delta, delta_pct,
  conf, horizon, threshold_reference, exceeds_threshold }) {
  return {
    signalType,
    indicator,
    historical:          historical  ?? null,
    projected:           projected   ?? null,
    delta:               delta       ?? null,
    delta_pct:           delta_pct   ?? null,
    confidence:          conf,
    horizon,
    threshold_reference,
    exceeds_threshold,
  };
}

/**
 * Extrae la probabilidad de inundación del objeto GRI.
 * Busca en los hazards de tipo flood/fluvial/pluvial/coastal.
 */
function extractFloodProbability(griData) {
  if (!griData?.hazards) return null;
  const floodHazards = griData.hazards.filter(h =>
    ['flood', 'fluvial', 'pluvial', 'coastal', 'river'].includes(h.hazard)
  );
  if (floodHazards.length === 0) return null;

  // Tomar el valor máximo de probabilidad futura (high emissions)
  let maxProb = null;
  for (const h of floodHazards) {
    const val = h.future_high_emissions?.value_decimal;
    if (val != null && (maxProb === null || val > maxProb)) maxProb = val;
  }
  return maxProb;
}

/**
 * Función principal exportada.
 * @param {Object} fusedData - Output de Layer 1
 * @returns {{ signals: Array, signals_count: number, dominant_signal: string|null }}
 */
export function detectSignals(fusedData) {
  const { climateData, griData, meteoData } = fusedData;
  const signals = [];

  const hist  = climateData?.historical  ?? null;
  const short = climateData?.short_term  ?? null;
  const mid   = climateData?.mid_term    ?? null;
  const hasCC = climateData != null;

  // ── EXTREME_HEAT (hd35) ──────────────────────────────────────────────────
  if (hist?.hd35 != null && short?.hd35 != null) {
    const d = deltaAbs(hist.hd35, short.hd35);
    if (d != null && d > THRESHOLDS.EXTREME_HEAT_SHORT) {
      signals.push(buildSignal({
        signalType:          'extreme_heat',
        indicator:           'hd35',
        historical:          hist.hd35,
        projected:           short.hd35,
        delta:               d,
        delta_pct:           deltaPct(hist.hd35, short.hd35),
        conf:                confidence(hasCC, !!meteoData),
        horizon:             'short_term',
        threshold_reference: 'IPCC AR6 WG1 Table 11.1 — umbral: +10 días hd35 en corto plazo',
        exceeds_threshold:   true,
      }));
    }
  }
  if (hist?.hd35 != null && mid?.hd35 != null) {
    const d = deltaAbs(hist.hd35, mid.hd35);
    if (d != null && d > THRESHOLDS.EXTREME_HEAT_MID) {
      signals.push(buildSignal({
        signalType:          'extreme_heat',
        indicator:           'hd35',
        historical:          hist.hd35,
        projected:           mid.hd35,
        delta:               d,
        delta_pct:           deltaPct(hist.hd35, mid.hd35),
        conf:                confidence(hasCC, !!meteoData),
        horizon:             'mid_term',
        threshold_reference: 'IPCC AR6 WG1 Table 11.1 — umbral: +20 días hd35 en mediano plazo',
        exceeds_threshold:   true,
      }));
    }
  }

  // ── SEVERE_HEAT (hd40) ───────────────────────────────────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    if (hist?.hd40 != null && period?.hd40 != null) {
      const d = deltaAbs(hist.hd40, period.hd40);
      if (d != null && d > THRESHOLDS.SEVERE_HEAT) {
        signals.push(buildSignal({
          signalType:          'severe_heat',
          indicator:           'hd40',
          historical:          hist.hd40,
          projected:           period.hd40,
          delta:               d,
          delta_pct:           deltaPct(hist.hd40, period.hd40),
          conf:                confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: 'IPCC AR6 WG1 SPM — umbral calor severo: +5 días hd40',
          exceeds_threshold:   true,
        }));
      }
    }
  }

  // ── TROPICAL_NIGHTS (tr) ────────────────────────────────────────────────
  // Noches con Tmin > 20°C — señal de bienestar, salud y cadena frío en Perú costero
  // La DB tiene este índice y muestra incrementos de +20-50 días en la región
  for (const [horizon, period, threshold] of [
    ['short_term', short, THRESHOLDS.TROPICAL_NIGHTS_SHORT],
    ['mid_term',   mid,   THRESHOLDS.TROPICAL_NIGHTS_MID],
  ]) {
    if (hist?.tr != null && period?.tr != null) {
      const d = deltaAbs(hist.tr, period.tr);
      if (d != null && d > threshold) {
        signals.push(buildSignal({
          signalType:          'tropical_nights',
          indicator:           'tr',
          historical:          hist.tr,
          projected:           period.tr,
          delta:               d,
          delta_pct:           deltaPct(hist.tr, period.tr),
          conf:                confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `IPCC AR6 WG1 Ch.11.3 / WMO — noches tropicales: +${threshold} días Tmin>20°C`,
          exceeds_threshold:   true,
        }));
      }
    }
  }

  // ── DROUGHT (cdd + pr + prpercnt) ────────────────────────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    // Por CDD (cuando está disponible en DB)
    if (hist?.cdd != null && period?.cdd != null) {
      const d = deltaAbs(hist.cdd, period.cdd);
      if (d != null && d > THRESHOLDS.DROUGHT_CDD) {
        signals.push(buildSignal({
          signalType:          'drought',
          indicator:           'cdd',
          historical:          hist.cdd,
          projected:           period.cdd,
          delta:               d,
          delta_pct:           deltaPct(hist.cdd, period.cdd),
          conf:                confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: 'IPCC AR6 WG1 Chapter 11.6 — umbral sequía: +15 días CDD',
          exceeds_threshold:   true,
        }));
      }
    }
    // Por prpercnt (porcentaje de precipitación vs histórico — directo de DB)
    // prpercnt = 100 significa igual al histórico; < 85 significa reducción > 15%
    if (period?.prpercnt != null) {
      const pctChange = period.prpercnt - 100; // convierte a delta vs histórico
      if (pctChange < THRESHOLDS.DROUGHT_PR_PCT) {
        signals.push(buildSignal({
          signalType:          'drought',
          indicator:           'prpercnt',
          historical:          100,
          projected:           period.prpercnt,
          delta:               null,
          delta_pct:           pctChange,
          conf:                confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: 'IPCC AR6 WG2 Chapter 4 — umbral estrés hídrico: -15% precipitación',
          exceeds_threshold:   true,
        }));
      }
    }
    // Por PR (precipitación anual absoluta — fallback)
    if (!period?.prpercnt && hist?.pr != null && period?.pr != null) {
      const pct = deltaPct(hist.pr, period.pr);
      if (pct != null && pct < THRESHOLDS.DROUGHT_PR_PCT) {
        signals.push(buildSignal({
          signalType:          'drought',
          indicator:           'pr',
          historical:          hist.pr,
          projected:           period.pr,
          delta:               deltaAbs(hist.pr, period.pr),
          delta_pct:           pct,
          conf:                confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: 'IPCC AR6 WG2 Chapter 4 — umbral estrés hídrico: -15% precipitación',
          exceeds_threshold:   true,
        }));
      }
    }
  }

  // ── EXTREME_RAIN (rx5day + rx1day) ───────────────────────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    // Por RX5DAY
    if (hist?.rx5day != null && period?.rx5day != null) {
      const pct = deltaPct(hist.rx5day, period.rx5day);
      if (pct != null && pct > THRESHOLDS.EXTREME_RAIN_RX5DAY_PCT) {
        signals.push(buildSignal({
          signalType:          'extreme_rain',
          indicator:           'rx5day',
          historical:          hist.rx5day,
          projected:           period.rx5day,
          delta:               deltaAbs(hist.rx5day, period.rx5day),
          delta_pct:           pct,
          conf:                confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: 'IPCC AR6 WG1 Chapter 11.4 — umbral lluvia extrema: +20% rx5day',
          exceeds_threshold:   true,
        }));
      }
    }
    // Por RX1DAY absoluto
    if (period?.rx1day != null && period.rx1day > THRESHOLDS.EXTREME_RAIN_RX1DAY_MM) {
      signals.push(buildSignal({
        signalType:          'extreme_rain',
        indicator:           'rx1day',
        historical:          hist?.rx1day ?? null,
        projected:           period.rx1day,
        delta:               deltaAbs(hist?.rx1day ?? null, period.rx1day),
        delta_pct:           deltaPct(hist?.rx1day ?? null, period.rx1day),
        conf:                confidence(hasCC, !!meteoData),
        horizon,
        threshold_reference: 'WMO 2023 — umbral alerta lluvia intensa: rx1day > 50 mm',
        exceeds_threshold:   true,
      }));
    }
  }

  // ── TEMP_INCREASE (tas) ──────────────────────────────────────────────────
  // Complemento con Open-Meteo si climate_cells no tiene tas
  const meteoShortDelta = meteoData?.short_term?.delta_temp  ?? null;
  const meteoMidDelta   = meteoData?.medium_term?.delta_temp ?? null;

  for (const [horizon, period, meteoDelta, threshold] of [
    ['short_term', short, meteoShortDelta, THRESHOLDS.TEMP_INCREASE_SHORT],
    ['mid_term',   mid,   meteoMidDelta,   THRESHOLDS.TEMP_INCREASE_MID],
  ]) {
    const tasDelta = (hist?.tas != null && period?.tas != null)
      ? deltaAbs(hist.tas, period.tas)
      : meteoDelta;

    const tasHist = hist?.tas ?? meteoData?.historical?.avg_temp ?? null;
    const tasProj = period?.tas ?? (tasHist != null && tasDelta != null ? tasHist + tasDelta : null);

    if (tasDelta != null && tasDelta > threshold) {
      signals.push(buildSignal({
        signalType:          'temp_increase',
        indicator:           'tas',
        historical:          tasHist,
        projected:           tasProj,
        delta:               tasDelta,
        delta_pct:           deltaPct(tasHist, tasProj),
        conf:                confidence(hasCC && hist?.tas != null, !!meteoData),
        horizon,
        threshold_reference: `IPCC AR6 WG1 SPM — Acuerdo de París: umbral +${threshold}°C`,
        exceeds_threshold:   true,
      }));
    }
  }

  // ── FLOOD_RISK (GRI) ─────────────────────────────────────────────────────
  const floodProb = extractFloodProbability(griData);
  if (floodProb != null && floodProb > THRESHOLDS.FLOOD_RISK_PROB) {
    signals.push(buildSignal({
      signalType:          'flood_risk',
      indicator:           'flood_probability',
      historical:          griData?.hazards?.find(h =>
        ['flood','fluvial','pluvial','coastal'].includes(h.hazard)
      )?.baseline?.value_decimal ?? null,
      projected:           floodProb,
      delta:               null,
      delta_pct:           null,
      conf:                confidence(false, true),
      horizon:             'short_term',
      threshold_reference: 'WRI Aqueduct Floods — umbral riesgo significativo: prob > 0.35',
      exceeds_threshold:   true,
    }));
  }

  // ── SEÑALES CUALITATIVAS GRI ─────────────────────────────────────────────
  // Cuando los índices cuantitativos (CMIP6 / Open-Meteo) no generan señales,
  // los scores GRI brindan contexto de exposición real. Se agregan solo si no
  // existe ya una señal cuantitativa del mismo tipo.
  // confidence = 'medium' porque GRI usa probabilidades históricas, no proyecciones CMIP6.
  //
  // Conversión score GRI → probabilidad representativa
  const GRI_SCORE_PROB = { bajo: 0.15, medio: 0.50, alto: 0.85 };

  function extractGriHazard(types) {
    return griData?.hazards?.find(h => types.includes(h.hazard)) ?? null;
  }
  function griProb(entry) {
    return entry?.value_decimal ?? GRI_SCORE_PROB[entry?.score] ?? null;
  }

  // Sequía/estrés hídrico desde GRI
  if (!signals.some(s => s.signalType === 'drought')) {
    const griDrought = extractGriHazard(['drought']);
    const baseScore  = griDrought?.baseline?.score;
    if (baseScore && baseScore !== 'sin data') {
      const baseProb   = griProb(griDrought.baseline);
      const futureHigh = griDrought.future_high_emissions;
      const futureMod  = griDrought.future_moderate_emissions;
      const futureProb = griProb(futureHigh) ?? griProb(futureMod);
      const futureScore = futureHigh?.score ?? futureMod?.score;
      const scoreOrder  = { bajo: 1, medio: 2, alto: 3 };
      const exceeds = (scoreOrder[baseScore] ?? 0) >= 2
        || (scoreOrder[futureScore] ?? 0) > (scoreOrder[baseScore] ?? 0);

      signals.push(buildSignal({
        signalType:          'drought',
        indicator:           'gri_drought_probability',
        historical:          baseProb,
        projected:           futureProb,
        delta:               (baseProb != null && futureProb != null) ? futureProb - baseProb : null,
        delta_pct:           deltaPct(baseProb, futureProb),
        conf:                'medium',
        horizon:             'short_term',
        threshold_reference: `GRI Infrastructure Resilience — exposición sequía nivel ${baseScore}`,
        exceeds_threshold:   exceeds,
      }));
    }
  }

  // Calor extremo desde GRI
  if (!signals.some(s => ['extreme_heat', 'severe_heat'].includes(s.signalType))) {
    const griHeat   = extractGriHazard(['heat', 'extreme_heat', 'wildfire']);
    const baseScore = griHeat?.baseline?.score;
    if (baseScore && baseScore !== 'sin data') {
      const baseProb    = griProb(griHeat.baseline);
      const futureEntry = griHeat.future_high_emissions ?? griHeat.future_moderate_emissions;
      const futureProb  = griProb(futureEntry);
      const futureScore = futureEntry?.score;
      const scoreOrder  = { bajo: 1, medio: 2, alto: 3 };
      const exceeds = (scoreOrder[baseScore] ?? 0) >= 2
        || (scoreOrder[futureScore] ?? 0) > (scoreOrder[baseScore] ?? 0);

      signals.push(buildSignal({
        signalType:          'extreme_heat',
        indicator:           'gri_heat_probability',
        historical:          baseProb,
        projected:           futureProb,
        delta:               (baseProb != null && futureProb != null) ? futureProb - baseProb : null,
        delta_pct:           deltaPct(baseProb, futureProb),
        conf:                'medium',
        horizon:             'short_term',
        threshold_reference: `GRI Infrastructure Resilience — exposición calor extremo nivel ${baseScore}`,
        exceeds_threshold:   exceeds,
      }));
    }
  }

  // Inundación costera desde GRI (complementa flood_risk si prob < 0.35)
  if (!signals.some(s => s.signalType === 'flood_risk')) {
    const griFlood  = extractGriHazard(['flood', 'fluvial', 'pluvial', 'coastal', 'river']);
    const baseScore = griFlood?.baseline?.score;
    if (baseScore && baseScore !== 'sin data') {
      const baseProb    = griProb(griFlood.baseline);
      const futureEntry = griFlood.future_high_emissions ?? griFlood.future_moderate_emissions;
      const futureProb  = griProb(futureEntry) ?? baseProb;
      const futureScore = futureEntry?.score;
      const scoreOrder  = { bajo: 1, medio: 2, alto: 3 };
      const exceeds = (scoreOrder[baseScore] ?? 0) >= 2
        || (scoreOrder[futureScore] ?? 0) > (scoreOrder[baseScore] ?? 0);

      signals.push(buildSignal({
        signalType:          'flood_risk',
        indicator:           'gri_flood_probability',
        historical:          baseProb,
        projected:           futureProb,
        delta:               (baseProb != null && futureProb != null) ? futureProb - baseProb : null,
        delta_pct:           deltaPct(baseProb, futureProb),
        conf:                'medium',
        horizon:             'short_term',
        threshold_reference: `GRI Infrastructure Resilience — exposición inundación nivel ${baseScore}`,
        exceeds_threshold:   exceeds,
      }));
    }
  }

  // ── ENSO PHASE (Sprint 5 — informacional, non-blocking) ─────────────────
  // Solo agrega señal cuando hay una fase activa (El Niño o La Niña).
  // No modifica señales existentes ni scores de riesgo.
  const ensoData = fusedData?.ensoData ?? null;
  if (ensoData && ensoData.phase !== 'neutral' && ensoData.oni_latest != null) {
    signals.push(buildSignal({
      signalType:          'enso_phase',
      indicator:           'oni',
      historical:          null,
      projected:           ensoData.oni_latest,
      delta:               ensoData.oni_latest,  // anomaly vs baseline (0)
      delta_pct:           null,
      conf:                'high',               // NOAA official data
      horizon:             'short_term',
      threshold_reference: `NOAA CPC ONI — umbral ENSO: ±0.5°C (actual: ${ensoData.oni_latest > 0 ? '+' : ''}${ensoData.oni_latest.toFixed(2)}°C, fase: ${ensoData.phase})`,
      exceeds_threshold:   true,
    }));
  }

  // ── Señal dominante: la de mayor delta absoluto o la primera ─────────────
  // enso_phase excluido de dominancia — es informacional, no un señal de riesgo primaria
  const scorableSignals = signals.filter(s => s.signalType !== 'enso_phase');
  const dominant_signal = scorableSignals.length > 0
    ? scorableSignals.reduce((best, s) =>
        (Math.abs(s.delta ?? 0) > Math.abs(best.delta ?? 0) ? s : best)
      ).signalType
    : (signals.length > 0 ? signals[0].signalType : null);

  return {
    signals,
    signals_count:   signals.length,
    dominant_signal,
    enso_phase:      ensoData?.phase ?? null,   // convenience field for consumers
  };
}
