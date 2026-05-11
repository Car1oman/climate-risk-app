/**
 * Layer 6 — Narrative Engine
 * Genera executive_summary y key_metrics basados en datos numéricos reales.
 * NUNCA usa texto genérico: siempre incluye señal + valor numérico + horizonte.
 */

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
  extreme_heat:  'calor extremo (días con Tmax > 35°C)',
  severe_heat:   'calor severo (días con Tmax > 40°C)',
  drought:       'sequía / estrés hídrico',
  extreme_rain:  'lluvia extrema',
  temp_increase: 'aumento de temperatura media',
  flood_risk:    'riesgo de inundación',
};

// Etiquetas de horizonte temporal
const HORIZON_LABELS = {
  short_term: '2020–2039',
  mid_term:   '2040–2059',
  long_term:  '2060+',
};

// Etiquetas de urgencia
const URGENCY_LABELS = {
  'crítica': 'crítica',
  alta:      'alta',
  media:     'media',
  baja:      'baja',
};

/**
 * Formatea un número con separadores de miles y símbolo de moneda.
 */
function formatUSD(value) {
  if (value == null) return 'N/D';
  if (value >= 1_000_000) return `USD ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `USD ${Math.round(value / 1_000)}K`;
  return `USD ${value}`;
}

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
 * Genera la oración principal del executive_summary basada en el top_risk.
 * Incluye siempre: señal + valor numérico + horizonte + impacto financiero.
 */
function buildMainSentence(topRisk, lat, lon) {
  if (!topRisk) return null;

  const signal      = topRisk.signal;
  const signalLabel = SIGNAL_LABELS[signal.signalType] ?? signal.signalType;
  const horizonLabel = HORIZON_LABELS[signal.horizon] ?? signal.horizon;
  const financialMin = topRisk.financial_impact_range?.min_usd;
  const financialMax = topRisk.financial_impact_range?.max_usd;

  // Construir descripción del delta numérico según tipo de señal
  let deltaDesc = '';
  if (signal.signalType === 'flood_risk') {
    const prob = signal.projected != null ? `${(signal.projected * 100).toFixed(0)}%` : 'elevada';
    deltaDesc = `probabilidad de inundación de ${prob}`;
  } else if (signal.signalType === 'temp_increase') {
    const d = signal.delta != null ? `+${signal.delta.toFixed(1)}°C` : 'incremento significativo';
    const hist = signal.historical != null ? ` (base histórica: ${signal.historical.toFixed(1)}°C)` : '';
    deltaDesc = `aumento de temperatura media de ${d}${hist}`;
  } else if (['extreme_heat', 'severe_heat'].includes(signal.signalType)) {
    const proj = signal.projected != null ? `${Math.round(signal.projected)} días/año` : 'incremento significativo';
    const d    = signal.delta     != null ? ` (+${Math.round(signal.delta)} días vs histórico)` : '';
    deltaDesc = `${proj}${d} con ${signal.indicator === 'hd40' ? 'Tmax > 40°C' : 'Tmax > 35°C'}`;
  } else if (signal.signalType === 'drought') {
    if (signal.indicator === 'cdd') {
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

  const financialDesc = (financialMin != null && financialMax != null)
    ? ` El impacto financiero estimado es de ${formatUSD(financialMin)}–${formatUSD(financialMax)} anuales.`
    : '';

  return `Para esta ubicación (${lat.toFixed(4)}, ${lon.toFixed(4)}), el análisis proyecta ${signalLabel} con ${deltaDesc} hacia ${horizonLabel}.${financialDesc}`;
}

/**
 * Genera la segunda oración con contexto de urgencia y adaptación disponible.
 */
function buildContextSentence(topRisk, adaptations) {
  if (!topRisk) return null;

  const urgency = URGENCY_LABELS[topRisk.urgency] ?? topRisk.urgency;
  const score   = topRisk.composite_score != null
    ? ` (score de riesgo: ${(topRisk.composite_score * 100).toFixed(0)}/100)`
    : '';

  const numMeasures = adaptations?.adaptations?.[0]?.measures?.length ?? 0;
  const adaptDesc = numMeasures > 0
    ? ` Se identificaron ${numMeasures} medidas de adaptación aplicables.`
    : '';

  return `La urgencia de acción es ${urgency}${score}.${adaptDesc}`;
}

/**
 * Función principal exportada.
 * @param {Object} params - { fusedData, signalOutput, businessRiskOutput,
 *                            prioritizationOutput, adaptationOutput, sector, lat, lon }
 * @returns {{ executive_summary: string, key_metrics: Object, generated_from: Object }}
 */
export function generateNarrative({
  fusedData,
  signalOutput,
  businessRiskOutput,
  prioritizationOutput,
  adaptationOutput,
  sector,
  lat,
  lon,
}) {
  const latNum = Number(lat);
  const lonNum = Number(lon);

  const topRisk        = prioritizationOutput?.top_risk ?? null;
  const dominantSignal = signalOutput?.dominant_signal  ?? null;
  const signals        = signalOutput?.signals          ?? [];

  // Construir executive_summary con datos numéricos reales
  const sentence1 = buildMainSentence(topRisk, latNum, lonNum);
  const sentence2 = buildContextSentence(topRisk, adaptationOutput);

  const executive_summary = [sentence1, sentence2]
    .filter(Boolean)
    .join(' ') || buildFallbackSummary(fusedData);

  // key_metrics: métricas clave extraídas de los outputs anteriores
  const topSignal = topRisk?.signal ?? null;
  const key_metrics = {
    señal_dominante:        dominantSignal ? (SIGNAL_LABELS[dominantSignal] ?? dominantSignal) : null,
    delta_principal:        topSignal?.delta     != null ? topSignal.delta     : topSignal?.projected ?? null,
    delta_pct_principal:    topSignal?.delta_pct != null ? topSignal.delta_pct : null,
    indicador_principal:    topSignal?.indicator ?? null,
    horizonte:              topSignal?.horizon   != null ? HORIZON_LABELS[topSignal.horizon] ?? topSignal.horizon : null,
    urgencia_top_riesgo:    topRisk?.urgency     ?? null,
    composite_score_top:    topRisk?.composite_score ?? null,
    impacto_financiero_min: topRisk?.financial_impact_range?.min_usd ?? null,
    impacto_financiero_max: topRisk?.financial_impact_range?.max_usd ?? null,
    total_señales:          signals.length,
    exposicion_general:     businessRiskOutput?.overall_exposure ?? null,
    sector,
  };

  // Trazabilidad: qué fuentes de datos alimentaron el análisis
  const generated_from = {
    climate_cells:   fusedData?.climateData    != null,
    gri:             fusedData?.griData        != null,
    open_meteo:      fusedData?.meteoData      != null,
    world_bank:      fusedData?.territorialData != null,
    distance_km:     fusedData?.distanceKm     ?? null,
    scenario:        fusedData?.scenario       ?? null,
  };

  return {
    executive_summary,
    key_metrics,
    generated_from,
  };
}
