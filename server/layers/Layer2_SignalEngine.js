/**
 * Layer 2 — Signal Engine
 * Detecta señales climáticas comparando historical vs short_term vs mid_term
 * usando umbrales científicos basados en IPCC AR6, WRI y WMO.
 */

// ─── Umbrales científicos ────────────────────────────────────────────────────
// Fuente: IPCC AR6 WG1 Chapter 11 (extremos climáticos), WMO 2023 State of Climate
const THRESHOLDS = {
  // Días con Tmax > 35°C: aumento > 10 días en corto plazo, > 20 en mediano
  // Fuente: IPCC AR6 WG1 Table 11.1 — Heat extreme indices
  EXTREME_HEAT_SHORT: 10,
  EXTREME_HEAT_MID:   20,

  // Días con Tmax > 40°C: aumento > 5 días
  // Fuente: IPCC AR6 WG1 SPM — umbrales de calor severo para salud humana
  SEVERE_HEAT: 5,

  // Días secos consecutivos: aumento > 15 días
  // Fuente: IPCC AR6 WG1 Chapter 11.6 — Droughts and aridity
  DROUGHT_CDD: 15,

  // Precipitación anual: reducción > 15%
  // Fuente: IPCC AR6 WG2 Chapter 4 — Water security thresholds
  DROUGHT_PR_PCT: -15,

  // Precipitación máxima 5 días: aumento > 20%
  // Fuente: IPCC AR6 WG1 Chapter 11.4 — Heavy precipitation
  EXTREME_RAIN_RX5DAY_PCT: 20,

  // Precipitación máxima 1 día: supera 50 mm
  // Fuente: WMO 2023 — umbral operacional de alerta por lluvia intensa
  EXTREME_RAIN_RX1DAY_MM: 50,

  // Temperatura media: delta > 1.5°C corto plazo, > 2.5°C mediano
  // Fuente: IPCC AR6 WG1 SPM — Paris Agreement thresholds
  TEMP_INCREASE_SHORT: 1.5,
  TEMP_INCREASE_MID:   2.5,

  // Probabilidad de inundación GRI > 0.35
  // Fuente: WRI Aqueduct Floods — umbral de riesgo significativo
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

  // ── DROUGHT (cdd + pr) ───────────────────────────────────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    // Por CDD
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
    // Por PR (precipitación anual)
    if (hist?.pr != null && period?.pr != null) {
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

  // ── Señal dominante: la de mayor delta absoluto o la primera ─────────────
  const dominant_signal = signals.length > 0
    ? signals.reduce((best, s) =>
        (Math.abs(s.delta ?? 0) > Math.abs(best.delta ?? 0) ? s : best)
      ).signalType
    : null;

  return {
    signals,
    signals_count:   signals.length,
    dominant_signal,
  };
}
