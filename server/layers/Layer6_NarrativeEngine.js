/**
 * Layer 6 — Narrative Engine
 * Genera executive_summary y key_metrics basados en datos numéricos reales.
 * NUNCA usa texto genérico: siempre incluye señal + valor numérico + horizonte.
 *
 * Sprint 5: ENSO narrative enrichment is additive — appended to summary when
 * ensoData is present. No existing narrative logic is modified.
 */

import { buildEnsoNarrative }    from '../services/ensoService.js';
import { buildTerrainNarrative } from '../services/terrainService.js'; // Sprint 6

// Nombres legibles de hazards GRI para el mensaje de contexto
const GRI_HAZARD_LABELS = {
  drought:   'sequía',
  flood:     'inundación',
  fluvial:   'inundación fluvial',
  pluvial:   'inundación pluvial',
  coastal:   'inundación costera',
  river:     'inundación fluvial',
  heat:      'calor extremo',
  wind:      'vientos extremos',
  landslide: 'deslizamiento',
  tsunami:   'tsunami',
};

// Etiquetas legibles por tipo de señal
const SIGNAL_LABELS = {
  extreme_heat:    'calor extremo (días con Tmax > 35°C)',
  severe_heat:     'calor severo (días con Tmax > 40°C)',
  tropical_nights: 'noches tropicales (Tmin > 20°C)',
  drought:         'sequía / estrés hídrico',
  extreme_rain:    'lluvia extrema',
  temp_increase:   'aumento de temperatura media',
  flood_risk:      'riesgo de inundación',
  enso_phase:      'fase ENSO activa (ONI)',      // Sprint 5
  landslide_risk:  'riesgo de deslizamiento (pendiente crítica)',  // Sprint 6
  huayco_risk:     'riesgo de huayco (flujo de detritos)',         // Sprint 6
};

// Etiquetas de horizonte temporal
const HORIZON_LABELS = {
  short_term: '2020–2039',
  mid_term:   '2040–2059',
  long_term:  '2060+',
};

/**
 * Construye un resumen informativo cuando ninguna señal supera umbrales IPCC.
 * En lugar de decir "no hay datos", enumera las amenazas GRI presentes y
 * explica por qué no se activaron señales de alerta.
 */
function buildFallbackSummary(fusedData) {
  const hazards = fusedData?.griData?.hazards ?? [];
  const scored  = hazards
    .filter(h => h.baseline?.score && h.baseline.score !== 'sin data')
    .sort((a, b) => {
      const order = { alto: 3, medio: 2, bajo: 1 };
      return (order[b.baseline.score] ?? 0) - (order[a.baseline.score] ?? 0);
    });

  const sources = [];
  if (fusedData?.climateData)     sources.push('CMIP6');
  if (fusedData?.griData)         sources.push('GRI Infrastructure Resilience');
  if (fusedData?.meteoData)       sources.push('Open-Meteo');
  if (fusedData?.territorialData) sources.push('World Bank');

  const sourcePhrase = sources.length > 0 ? ` (${sources.join(', ')})` : '';
  let msg = `Los datos analizados${sourcePhrase} no muestran cambios que superen los umbrales de alerta definidos por IPCC AR6 / WRI para esta ubicación.`;

  if (scored.length > 0) {
    const parts = scored.map(h => {
      const name = h.hazard_name ?? GRI_HAZARD_LABELS[h.hazard] ?? h.hazard;
      const future = h.future_high_emissions?.score ?? h.future_low_emissions?.score;
      const trend  = future && future !== h.baseline.score ? ` → proyección ${future}` : '';
      return `${name} (${h.baseline.score}${trend})`;
    });
    msg += ` GRI registra exposición a: ${parts.join(', ')}.`;
  }

  return msg;
}

/**
 * Genera la oración principal del executive_summary basada en una señal observada.
 * Incluye señal + valor numérico + horizonte, sin ranking ni puntajes.
 */
function buildMainSentence(contextualRisk, lat, lon) {
  if (!contextualRisk) return null;

  const signal      = contextualRisk.signal;
  const signalLabel = SIGNAL_LABELS[signal.signalType] ?? signal.signalType;
  const horizonLabel = HORIZON_LABELS[signal.horizon] ?? signal.horizon;

  // Construir descripción del delta numérico según tipo de señal
  let deltaDesc = '';
  if (signal.signalType === 'flood_risk') {
    const histP = signal.historical != null ? `${(signal.historical * 100).toFixed(0)}%` : null;
    const projP = signal.projected  != null ? `${(signal.projected  * 100).toFixed(0)}%` : 'elevada';
    deltaDesc = histP && signal.indicator?.startsWith('gri_')
      ? `probabilidad de inundación de ${histP} → proyectada ${projP} (GRI)`
      : `probabilidad de inundación de ${projP}`;
  } else if (signal.signalType === 'temp_increase') {
    const d = signal.delta != null ? `+${signal.delta.toFixed(1)}°C` : 'incremento significativo';
    const hist = signal.historical != null ? ` (base histórica: ${signal.historical.toFixed(1)}°C)` : '';
    deltaDesc = `aumento de temperatura media de ${d}${hist}`;
  } else if (signal.signalType === 'tropical_nights') {
    const hist = signal.historical != null ? `${Math.round(signal.historical)} noches/año` : null;
    const proj = signal.projected  != null ? `${Math.round(signal.projected)} noches/año`  : 'incremento significativo';
    const d    = signal.delta      != null ? ` (+${Math.round(signal.delta)} noches vs histórico)` : '';
    deltaDesc  = hist
      ? `${proj}${d} con Tmin > 20°C (histórico: ${hist})`
      : `${proj} con Tmin > 20°C`;
  } else if (['extreme_heat', 'severe_heat'].includes(signal.signalType)) {
    if (signal.indicator === 'gri_heat_probability') {
      const prob = signal.historical != null ? `${(signal.historical * 100).toFixed(0)}%` : null;
      const futP = signal.projected  != null ? `${(signal.projected  * 100).toFixed(0)}%` : null;
      deltaDesc = prob
        ? `probabilidad de calor extremo de ${prob}${futP && futP !== prob ? ` → proyectada ${futP}` : ''} (GRI)`
        : 'exposición a calor extremo registrada (GRI)';
    } else {
      const proj = signal.projected != null ? `${Math.round(signal.projected)} días/año` : 'incremento significativo';
      const d    = signal.delta     != null ? ` (+${Math.round(signal.delta)} días vs histórico)` : '';
      deltaDesc = `${proj}${d} con ${signal.indicator === 'hd40' ? 'Tmax > 40°C' : 'Tmax > 35°C'}`;
    }
  } else if (signal.signalType === 'drought') {
    if (signal.indicator === 'gri_drought_probability') {
      const prob = signal.historical != null ? `${(signal.historical * 100).toFixed(0)}%` : null;
      const futP = signal.projected  != null ? `${(signal.projected  * 100).toFixed(0)}%` : null;
      deltaDesc = prob
        ? `probabilidad de sequía de ${prob}${futP && futP !== prob ? ` → proyectada ${futP}` : ''} (GRI)`
        : 'exposición a sequía registrada (GRI)';
    } else if (signal.indicator === 'prpercnt') {
      const pct = signal.delta_pct != null ? `${signal.delta_pct.toFixed(0)}%` : 'reducción significativa';
      const proj = signal.projected != null ? `(${signal.projected.toFixed(1)}% del histórico)` : '';
      deltaDesc = `${pct} de variación en precipitación anual ${proj}`.trim();
    } else if (signal.indicator === 'cdd') {
      const d = signal.delta != null ? `+${Math.round(signal.delta)} días` : 'aumento significativo';
      deltaDesc = `${d} de días secos consecutivos`;
    } else {
      const pct = signal.delta_pct != null ? `${signal.delta_pct.toFixed(0)}%` : 'reducción significativa';
      deltaDesc = `${pct} de variación en precipitación anual`;
    }
  } else if (signal.signalType === 'extreme_rain') {
    if (signal.indicator === 'rx5day') {
      const pct = signal.delta_pct != null ? `+${signal.delta_pct.toFixed(0)}%` : 'aumento significativo';
      deltaDesc = `${pct} en precipitación máxima de 5 días`;
    } else {
      const val = signal.projected != null ? `${signal.projected.toFixed(0)} mm` : 'valor extremo';
      deltaDesc = `precipitación máxima diaria de ${val}`;
    }
  }

  return `Para esta ubicación (${lat.toFixed(4)}, ${lon.toFixed(4)}), el análisis identifica ${signalLabel} con ${deltaDesc} hacia ${horizonLabel}.`;
}

/**
 * Genera la segunda oración con evidencia, incertidumbre y adaptación disponible.
 */
function buildContextSentence(contextualRisk, adaptations) {
  if (!contextualRisk) return null;

  const trace = contextualRisk.source_traceability ?? contextualRisk.signal?.source_traceability ?? {};
  const confidence = contextualRisk.confidence ?? contextualRisk.signal?.confidence ?? trace.confidence_level ?? 'low';
  const source = trace.source_origin ?? 'fuente documentada';
  const threshold = trace.threshold_applied ? ` contra el umbral ${trace.threshold_applied}` : '';
  const numMeasures = adaptations?.adaptations?.[0]?.measures?.length ?? 0;
  const adaptDesc = numMeasures > 0
    ? ` Se identificaron ${numMeasures} medidas de adaptación aplicables.`
    : '';

  return `La evidencia proviene de ${source}${threshold}, con confianza ${confidence}; la incertidumbre depende de la resolución espacial, el escenario SSP y la disponibilidad de datos locales.${adaptDesc}`;
}

/**
 * Función principal exportada.
 * @param {Object} params - { fusedData, signalOutput, businessRiskOutput,
 *                            contextualRisks, adaptationOutput, sector, lat, lon }
 * @returns {{ executive_summary: string, key_metrics: Object, generated_from: Object }}
 */
export function generateNarrative({
  fusedData,
  signalOutput,
  businessRiskOutput,
  contextualRisks,
  adaptationOutput,
  sector,
  lat,
  lon,
}) {
  const latNum = Number(lat);
  const lonNum = Number(lon);

  const contextualRisk = contextualRisks?.risks?.[0] ?? businessRiskOutput?.risks?.[0] ?? null;
  const dominantSignal = signalOutput?.dominant_signal  ?? null;
  const signals        = signalOutput?.signals          ?? [];

  // Resolve data sources once — used in key_metrics, generated_from, and narrative
  const enso        = fusedData?.ensoData    ?? null;  // declared here to avoid TDZ (was after key_metrics)
  const terrainData = fusedData?.terrainData ?? null;  // Sprint 6

  // Construir executive_summary con datos numéricos reales
  const sentence1 = buildMainSentence(contextualRisk, latNum, lonNum);
  const sentence2 = buildContextSentence(contextualRisk, adaptationOutput);

  // Sprint 5: ENSO narrative enrichment (appended, never replaces existing sentences)
  const ensoSentence    = buildEnsoNarrative(enso);
  // Sprint 6: Terrain narrative enrichment (appended only when risk exceeds threshold)
  const terrainSentence = buildTerrainNarrative(terrainData);

  const executive_summary = [sentence1, sentence2, ensoSentence, terrainSentence]
    .filter(Boolean)
    .join(' ') || buildFallbackSummary(fusedData);

  // key_metrics: métricas clave extraídas de los outputs anteriores
  const primarySignal = contextualRisk?.signal ?? null;
  const key_metrics = {
    señal_dominante:        dominantSignal ? (SIGNAL_LABELS[dominantSignal] ?? dominantSignal) : null,
    delta_principal:        primarySignal?.delta     != null ? primarySignal.delta     : primarySignal?.projected ?? null,
    delta_pct_principal:    primarySignal?.delta_pct != null ? primarySignal.delta_pct : null,
    indicador_principal:    primarySignal?.indicator ?? null,
    horizonte:              primarySignal?.horizon   != null ? HORIZON_LABELS[primarySignal.horizon] ?? primarySignal.horizon : null,
    confianza_principal:    contextualRisk?.confidence ?? primarySignal?.confidence ?? null,
    total_señales:          signals.length,
    exposicion_general:     businessRiskOutput?.overall_exposure ?? null,
    sector,
    // Sprint 5: ENSO intelligence (informational, may be null)
    enso_fase:              enso?.phase             ?? null,
    enso_intensidad:        enso?.intensity         ?? null,
    enso_oni:               enso?.oni_latest        ?? null,
    enso_supply_chain_risk: enso?.supply_chain_risk ?? null,
    // Sprint 6: Terrain intelligence (informational, may be null)
    terrain_region:         terrainData?.terrain_region    ?? null,
    terrain_elevation_m:    terrainData?.elevation_m       ?? null,
    terrain_slope_deg:      terrainData?.slope_degrees     ?? null,
    terrain_susceptibility: terrainData?.susceptibility    ?? null,
    terrain_huayco_risk:    terrainData?.huayco_risk       ?? null,
    terrain_landslide_score: terrainData?.landslide_score  ?? null,
  };

  // Trazabilidad: qué fuentes de datos alimentaron el análisis
  const generated_from = {
    climate_cells:   fusedData?.climateData     != null,
    gri:             fusedData?.griData         != null,
    open_meteo:      fusedData?.meteoData       != null,
    world_bank:      fusedData?.territorialData != null,
    // Sprint 5: ENSO provenance
    enso:            enso != null,
    enso_phase:      enso?.phase                ?? null,
    enso_oni:        enso?.oni_latest           ?? null,
    // Sprint 6: Terrain provenance
    terrain:         terrainData != null,
    terrain_source:  terrainData?.source        ?? null,
    distance_km:     fusedData?.distanceKm      ?? null,
    scenario:        fusedData?.scenario        ?? null,
  };

  const confidence = contextualRisk?.confidence ?? primarySignal?.confidence ?? 'low';
  const evidence = {
    signal_type: primarySignal?.signalType ?? null,
    indicator: primarySignal?.indicator ?? null,
    historical: primarySignal?.historical ?? null,
    projected: primarySignal?.projected ?? null,
    delta: primarySignal?.delta ?? null,
    delta_pct: primarySignal?.delta_pct ?? null,
    traceability: contextualRisk?.source_traceability ?? primarySignal?.source_traceability ?? null,
  };
  const uncertainty = {
    confidence_level: confidence,
    note: 'Narrativa descriptiva: no prioriza, rankea ni asigna puntajes; resume senales, tendencias, evidencia e incertidumbre.',
  };

  return {
    executive_summary,
    key_metrics,
    generated_from,
    confidence,
    evidence,
    uncertainty,
  };
}
