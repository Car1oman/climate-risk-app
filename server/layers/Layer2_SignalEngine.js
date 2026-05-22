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

function climateSourceLabel(climateSource) {
  if (climateSource === 'climate_cells') return 'CMIP6 ensemble / climate_cells';
  if (climateSource === 'open_meteo_derived') return 'Open-Meteo derived climate indices';
  return 'climate model unavailable';
}

function endpointForSignal(signal, fusedData) {
  const indicator = signal.indicator ?? '';
  if (signal.signalType === 'enso_phase') return 'NOAA CPC ONI via getEnsoContext()';
  if (signal.signalType === 'landslide_risk' || signal.signalType === 'huayco_risk') {
    return 'Terrain intelligence API via getTerrainIntelligence()';
  }
  if (indicator.startsWith('gri_') || signal.signalType === 'flood_risk') {
    return 'GRI Infrastructure Resilience via getGriRiskByLocation()';
  }
  if (fusedData?.climateSource === 'climate_cells') {
    return 'Supabase RPC get_nearest_climate_cell';
  }
  if (fusedData?.climateSource === 'open_meteo_derived') {
    return 'Open-Meteo Archive/Forecast via getClimateTrends()';
  }
  return 'Layer2_SignalEngine.detectSignals()';
}

function sourceForSignal(signal, fusedData) {
  const indicator = signal.indicator ?? '';
  if (signal.signalType === 'enso_phase') return 'NOAA CPC';
  if (signal.signalType === 'landslide_risk' || signal.signalType === 'huayco_risk') return 'SRTM terrain + INGEMMET/SENAMHI thresholds';
  if (indicator.startsWith('gri_')) return 'GRI Infrastructure Resilience';
  if (signal.signalType === 'flood_risk') return 'GRI Infrastructure Resilience + WRI Aqueduct Floods';
  return climateSourceLabel(fusedData?.climateSource);
}

function modelBadgeForSignal(signal, fusedData) {
  const indicator = signal.indicator ?? '';
  if (indicator.startsWith('gri_') || signal.signalType === 'flood_risk') return 'GRI/WRI';
  if (signal.signalType === 'enso_phase') return 'NOAA ONI';
  if (signal.signalType === 'landslide_risk' || signal.signalType === 'huayco_risk') return 'SRTM';
  return fusedData?.climateSource === 'climate_cells' ? 'CMIP6 ensemble' : 'Open-Meteo derived';
}

function transformationForSignal(signal) {
  if (signal.delta_pct != null) {
    const sign = signal.delta_pct >= 0 ? '+' : '';
    return `Percent change vs historical baseline (${sign}${signal.delta_pct.toFixed(1)}pp)`;
  }
  if (signal.delta != null) {
    const sign = signal.delta >= 0 ? '+' : '';
    return `Absolute delta vs historical baseline (${sign}${Number(signal.delta).toFixed(1)})`;
  }
  return 'Threshold comparison against projected/current indicator value';
}

// ── Evidence metadata helpers (FASE A) ──────────────────────────────────────

function datasetForSignal(signal, fusedData) {
  const indicator = signal.indicator ?? '';
  if (signal.signalType === 'enso_phase') return 'NOAA ONI / ERSST v5 — Oceanic Niño Index';
  if (['landslide_risk', 'huayco_risk'].includes(signal.signalType)) return 'SRTM 30m v3 / NASA — Shuttle Radar Topography Mission 2000';
  if (indicator.startsWith('gri_') || signal.signalType === 'flood_risk') return 'GRI Infrastructure Resilience / WRI Aqueduct Floods 4.0';
  if (fusedData?.climateSource === 'climate_cells') return 'CMIP6 CCKP 2023 — climate_cells ensemble (49+ GCMs)';
  if (fusedData?.climateSource === 'open_meteo_derived') return 'CMIP6 via Open-Meteo API — derived climate indices';
  return 'dataset not identified';
}

function modelForSignal(signal, fusedData) {
  if (signal.signalType === 'enso_phase') return 'NOAA CPC ONI (near-real-time observational)';
  if (['landslide_risk', 'huayco_risk'].includes(signal.signalType)) return 'SRTM topography + INGEMMET/SENAMHI slope thresholds';
  if ((signal.indicator ?? '').startsWith('gri_') || signal.signalType === 'flood_risk') return 'GRI / ISIMIP2b + WRI Aqueduct hydrological models';
  if (fusedData?.climateSource === 'climate_cells') return 'CMIP6 multi-model ensemble (BCC-CSM2-MR, CanESM5, CNRM-CM6, EC-Earth3, GFDL-ESM4, IPSL-CM6A-LR, MIROC6, MPI-ESM1-2-HR, MRI-ESM2-0 + 40 others)';
  if (fusedData?.climateSource === 'open_meteo_derived') return 'CMIP6 ensemble via Open-Meteo aggregation';
  return 'model not identified';
}

function sspForSignal(signal, fusedData) {
  if (['enso_phase', 'landslide_risk', 'huayco_risk'].includes(signal.signalType)) return 'N/A — non-projection signal';
  const sc = (fusedData?.scenario ?? 'ssp245').toLowerCase();
  return sc === 'ssp585' ? 'SSP5-8.5 (high emissions)' : 'SSP2-4.5 (moderate emissions)';
}

function temporalWindowForSignal(signal) {
  const map = {
    short_term: '2020–2039 (short-term)',
    mid_term:   '2040–2059 (mid-term)',
    long_term:  '2060–2100 (long-term)',
    historical: '1980–2014 (historical baseline)',
  };
  return map[signal.horizon] ?? (signal.horizon ?? 'unknown');
}

function validationStatusForSignal(signal, fusedData) {
  if (signal.signalType === 'enso_phase') return 'validated';
  if (['landslide_risk', 'huayco_risk'].includes(signal.signalType)) return 'provisional';
  if ((signal.indicator ?? '').startsWith('gri_')) return 'validated';
  if (signal.signalType === 'flood_risk') return 'validated';
  if (fusedData?.climateSource === 'climate_cells') return 'validated';
  if (fusedData?.climateSource === 'open_meteo_derived') return 'provisional';
  return 'experimental';
}

// ── Uncertainty helpers (FASE B) ─────────────────────────────────────────────

function uncertaintySpreadForSignal(signal, fusedData) {
  const indicator = signal.indicator ?? '';
  if (signal.signalType === 'enso_phase') return null; // single observational series
  if (indicator.startsWith('gri_') || signal.signalType === 'flood_risk') {
    return {
      spread_type: 'model_agreement',
      p10: null,
      p90: null,
      spread_note: 'Inter-model spread from multiple hazard probability models (ISIMIP2b, WRI Aqueduct 4.0, GRI). Reflects uncertainty in hazard probability estimates across scenarios.',
      model_count: null,
    };
  }
  if (['landslide_risk', 'huayco_risk'].includes(signal.signalType)) {
    return {
      spread_type: 'threshold_based',
      p10: null,
      p90: null,
      spread_note: 'Slope-derived susceptibility; uncertainty from SRTM 30m resolution and absence of dynamic land-use/soil data.',
      model_count: null,
    };
  }
  const horizonKey = signal.horizon ?? 'short_term';
  const stats = fusedData?.climateDataStats?.[horizonKey]?.[indicator];
  if (!stats) {
    return {
      spread_type: 'ensemble_percentile',
      p10: null,
      p90: null,
      spread_note: 'CMIP6 ensemble spread data not available for this variable/period combination.',
      model_count: 49,
    };
  }
  return {
    spread_type: 'ensemble_percentile',
    p10: stats.p10 ?? null,
    p90: stats.p90 ?? null,
    spread_note: stats.p10 != null && stats.p90 != null
      ? `CMIP6 ensemble 10th–90th percentile for ${indicator}: [${stats.p10.toFixed(1)}, ${stats.p90.toFixed(1)}] — median ${stats.median?.toFixed(1) ?? 'n/a'}`
      : 'CMIP6 ensemble spread available; p10/p90 not stored for this variable.',
    model_count: 49,
  };
}

function confidenceTextForSignal(signal, fusedData) {
  const level = signal.confidence ?? 'low';
  const source = sourceForSignal(signal, fusedData);
  if (level === 'high')   return `High confidence — derived from ${source} with validated historical calibration and multi-model ensemble agreement.`;
  if (level === 'medium') return `Medium confidence — ${source} provides probabilistic estimates; inherits uncertainty from emission scenario choice and regional climate variability.`;
  return `Low confidence — signal inferred from available data; limited direct observational validation for this location and variable.`;
}

function scientificDisclaimerForSignal(signal, fusedData) {
  if (signal.signalType === 'enso_phase') {
    return 'ENSO phase reflects current oceanic conditions; not a climate change projection. ENSO interactions with local climate vary by region, season, and El Niño / La Niña intensity.';
  }
  if (['landslide_risk', 'huayco_risk'].includes(signal.signalType)) {
    return 'Terrain susceptibility is based on SRTM topography (NASA, 2000). Does not account for post-2000 land-use changes, vegetation cover, soil saturation, or engineered slope stabilization.';
  }
  if ((signal.indicator ?? '').startsWith('gri_') || signal.signalType === 'flood_risk') {
    return 'GRI hazard probabilities represent modeled exposure at ~1 km resolution. Actual risk depends on local vulnerability, adaptive capacity, and asset-specific characteristics not captured in this dataset.';
  }
  const sc = (fusedData?.scenario ?? 'ssp245').toUpperCase();
  const window = temporalWindowForSignal(signal);
  return `CMIP6 projections represent ensemble median under ${sc} for ${window}. Spatial resolution ~25 km does not capture urban heat islands or local microclimates. Uncertainty increases with temporal horizon. These projections describe physical climate tendencies, not guaranteed future conditions or financial losses.`;
}

function enrichTraceability(signal, fusedData) {
  const scenario = (fusedData?.scenario ?? 'ssp245').toUpperCase();
  const source = sourceForSignal(signal, fusedData);
  const modelBadge = modelBadgeForSignal(signal, fusedData);
  const confLevel = signal.confidence ?? 'low';

  // FASE A — Evidence metadata
  const dataset           = datasetForSignal(signal, fusedData);
  const model             = modelForSignal(signal, fusedData);
  const SSP               = sspForSignal(signal, fusedData);
  const temporal_window   = temporalWindowForSignal(signal);
  const validation_status = validationStatusForSignal(signal, fusedData);

  // FASE B — Uncertainty layer
  const uncertainty_spread    = uncertaintySpreadForSignal(signal, fusedData);
  const confidence_text       = confidenceTextForSignal(signal, fusedData);
  const scientific_disclaimer = scientificDisclaimerForSignal(signal, fusedData);

  return {
    ...signal,
    source_traceability: {
      // Legacy fields (backward-compatible)
      source_origin: source,
      climate_variable: signal.indicator ?? signal.signalType,
      temporal_period: signal.horizon,
      temporal_period_label: signal.horizon === 'mid_term'
        ? '2040-2059'
        : signal.horizon === 'long_term'
          ? '2060+'
          : '2020-2039',
      scenario_ssp: scenario,
      threshold_applied: signal.threshold_reference ?? 'No explicit threshold reference',
      transformation_applied: transformationForSignal(signal),
      confidence_level: confLevel,
      responsible_endpoint: endpointForSignal(signal, fusedData),
      provenance_badges: Array.from(new Set([
        source.includes('GRI') ? 'GRI' : null,
        source.includes('CMIP6') ? 'CMIP6' : null,
        source.includes('Open-Meteo') ? 'Open-Meteo' : null,
        source.includes('NOAA') ? 'NOAA' : null,
        source.includes('SRTM') ? 'Terrain' : null,
      ].filter(Boolean))),
      climate_model_badge: modelBadge,
      // FASE A — Full evidence metadata
      source:             source,
      dataset,
      model,
      SSP,
      temporal_window,
      confidence:         confLevel,
      validation_status,
      // FASE B — Uncertainty layer
      uncertainty_spread,
      confidence_text,
      scientific_disclaimer,
    },
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

  // ── LANDSLIDE / HUAYCO (terrain — Sprint 6) ──────────────────────────────
  // Terrain signals are derived from SRTM elevation data, not CMIP6 projections.
  // They represent static topographic susceptibility, not climate change delta.
  // confidence = 'medium': SRTM-derived slope, not ensemble climate model.
  const terrainData = fusedData?.terrainData ?? null;

  if (terrainData?.exceeds_landslide_threshold) {
    signals.push(buildSignal({
      signalType:          'landslide_risk',
      indicator:           'slope_degrees',
      historical:          null,
      projected:           terrainData.slope_degrees,
      delta:               null,
      delta_pct:           null,
      conf:                'medium',
      horizon:             'short_term',
      threshold_reference: `INGEMMET/SENAMHI — susceptibilidad ${terrainData.susceptibility}: pendiente ${terrainData.slope_degrees}° en ${terrainData.terrain_region} (score: ${terrainData.landslide_score})`,
      exceeds_threshold:   true,
    }));
  }

  if (terrainData?.huayco_risk === 'alto' || terrainData?.huayco_risk === 'medio') {
    signals.push(buildSignal({
      signalType:          'huayco_risk',
      indicator:           'terrain_huayco',
      historical:          null,
      projected:           terrainData.landslide_score,
      delta:               null,
      delta_pct:           null,
      conf:                'medium',
      horizon:             'short_term',
      threshold_reference: `INGEMMET — riesgo de huayco nivel ${terrainData.huayco_risk}: ${terrainData.terrain_region} a ${terrainData.elevation_m} m.s.n.m., pendiente ${terrainData.slope_degrees}°`,
      exceeds_threshold:   true,
    }));
  }

  // ── Señal dominante: la de mayor delta absoluto o la primera ─────────────
  // enso_phase, landslide_risk y huayco_risk excluidos de dominancia —
  // son señales informacionales/estáticas, no proyecciones climáticas primarias.
  const scorableSignals = signals.filter(s =>
    !['enso_phase', 'landslide_risk', 'huayco_risk'].includes(s.signalType)
  );
  const dominant_signal = scorableSignals.length > 0
    ? scorableSignals.reduce((best, s) =>
        (Math.abs(s.delta ?? 0) > Math.abs(best.delta ?? 0) ? s : best)
      ).signalType
    : (signals.length > 0 ? signals[0].signalType : null);

  const traceableSignals = signals.map(signal => enrichTraceability(signal, fusedData));

  return {
    signals:          traceableSignals,
    signals_count:    signals.length,
    dominant_signal,
    enso_phase:       ensoData?.phase   ?? null,  // convenience field for consumers
    terrain_region:   terrainData?.terrain_region ?? null,  // Sprint 6 convenience
    terrain_slope:    terrainData?.slope_degrees  ?? null,  // Sprint 6 convenience
  };
}
