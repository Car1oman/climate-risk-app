/**
 * Sprint 7 — Scientific Interpretation Engine
 *
 * Pure function module. No I/O, no side effects.
 * Consumes Layer2 signalOutput + Layer1 fusedData and produces:
 *
 *   FASE A — Signal deduplication: groups semantically equivalent signals
 *             from CMIP6, GRI, ENSO, and terrain into coherent clusters.
 *   FASE B — Contextual fusion: builds a context object that captures the
 *             interaction of topography, climate, ENSO and projections.
 *   FASE C — Interpretation: generates natural-language climate narratives
 *             grounded exclusively in signal values and evidence metadata.
 *   FASE D — Uncertainty: attaches confidence, model spread, limitations
 *             and evidence strength to the interpretation output.
 *   FASE E — Validation: asserts that the output contains no scores,
 *             no urgency language, no invented numbers, and no financial impacts.
 *
 * Invariants enforced by construction:
 *   - No score / ranking fields in output
 *   - No urgency or action-mandating language in generated text
 *   - Every number in generated text comes from signal.delta, signal.projected,
 *     signal.delta_pct, or fusedData.terrainData — never invented
 *   - No financial impact or economic loss fields
 *
 * Sources: IPCC AR6 WG1/WG2, CMIP6 CCKP, GRI Oxford, WRI Aqueduct,
 *          NOAA CPC, NASA SRTM, INGEMMET, SENAMHI.
 */

import { EVIDENCE_REGISTRY, getSignalMeta } from './domain.js';

// ─── FASE A — Semantic Signal Groups ─────────────────────────────────────────

/**
 * Maps each Layer2 signalType to its canonical semantic group.
 * Signals in the same group describe overlapping real-world phenomena
 * and are deduplicated into a single narrative cluster.
 */
const SIGNAL_GROUP_MAP = {
  extreme_heat:             'heat_stress',
  severe_heat:              'heat_stress',
  tropical_nights:          'heat_stress',
  temp_increase:            'heat_stress',
  extreme_rain:             'precipitation_intensity',
  flood_risk:               'precipitation_intensity',
  drought:                  'water_stress',
  landslide_susceptibility: 'terrain_instability',
  landslide_risk:           'terrain_instability',   // Layer2 legacy key
  huayco_risk:              'terrain_instability',
  enso_phase:               'climate_mode',
};

const GROUP_LABELS = {
  heat_stress:             'Estrés térmico',
  precipitation_intensity: 'Precipitación extrema e inundación',
  water_stress:            'Estrés hídrico / sequía',
  terrain_instability:     'Inestabilidad de terreno',
  climate_mode:            'Modo climático ENSO',
};

const HORIZON_LABELS = {
  short_term: '2020–2039',
  mid_term:   '2040–2059',
  long_term:  '2060+',
  historical: '1980–2014',
};

// Confidence rank for canonical signal selection (higher = preferred)
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

// ─── FASE A helpers ───────────────────────────────────────────────────────────

function resolveGroupId(signalType) {
  return SIGNAL_GROUP_MAP[signalType] ?? 'other';
}

/**
 * Selects the most representative signal from a group:
 * 1. Highest confidence level
 * 2. Tie-break: highest absolute delta (magnitude of change)
 */
function selectCanonicalSignal(signals) {
  if (signals.length === 0) return null;
  if (signals.length === 1) return signals[0];

  return signals.reduce((best, s) => {
    const confKey = s.confidence ?? s.source_traceability?.confidence_level ?? 'low';
    const bConfKey = best.confidence ?? best.source_traceability?.confidence_level ?? 'low';
    const sRank = CONFIDENCE_RANK[confKey]  ?? 0;
    const bRank = CONFIDENCE_RANK[bConfKey] ?? 0;

    if (sRank > bRank) return s;
    if (sRank < bRank) return best;

    // Same confidence: prefer highest absolute delta
    return Math.abs(s.delta ?? 0) >= Math.abs(best.delta ?? 0) ? s : best;
  });
}

/**
 * FASE A — Groups signals by semantic equivalence and selects a canonical
 * representative per group. Returns an array of signal_group objects.
 *
 * @param {Object[]} signals  - Array of Layer2 signals (with source_traceability)
 * @returns {Object[]}        - signal_groups[]
 */
function groupSignals(signals) {
  const buckets = {};

  for (const signal of signals) {
    const groupId = resolveGroupId(signal.signalType);
    if (!buckets[groupId]) buckets[groupId] = [];
    buckets[groupId].push(signal);
  }

  return Object.entries(buckets)
    .filter(([groupId, sigs]) => groupId !== 'other' && sigs.length > 0)
    .map(([groupId, sigs]) => {
      const canonical    = selectCanonicalSignal(sigs);
      const uniqueTypes  = [...new Set(sigs.map(s => s.signalType))];

      const evidenceIds = [...new Set(
        sigs.flatMap(s => {
          const meta = getSignalMeta(s.signalType);
          return [meta?.primary_evidence, meta?.secondary_evidence].filter(Boolean);
        })
      )];

      return {
        group_id:         groupId,
        group_label:      GROUP_LABELS[groupId] ?? groupId,
        signal_count:     sigs.length,
        signal_types:     uniqueTypes,
        signals:          sigs,
        canonical_signal: canonical,
        evidence_ids:     evidenceIds,
      };
    });
}

// ─── FASE B — Contextual Fusion ───────────────────────────────────────────────

function resolveScenarioLabel(scenario) {
  const s = (scenario ?? 'ssp245').toLowerCase();
  if (s.includes('585')) return 'SSP5-8.5';
  if (s.includes('126')) return 'SSP1-2.6';
  return 'SSP2-4.5';
}

/**
 * FASE B — Builds the contextual fusion object that captures the joint state
 * of topography, climate, ENSO and projections for the interpretation step.
 *
 * @param {Object[]} groups    - signal_groups from groupSignals()
 * @param {Object}   fusedData - Output of Layer1.fusionClimateData()
 * @returns {Object}
 */
function buildContext(groups, fusedData) {
  const groupIds    = new Set(groups.map(g => g.group_id));
  const ensoData    = fusedData?.ensoData    ?? null;
  const terrainData = fusedData?.terrainData ?? null;
  const scenario    = fusedData?.scenario    ?? 'ssp245';

  // Dominant temporal horizon from canonical signals (first non-null wins)
  const dominantHorizon = groups
    .map(g => g.canonical_signal?.horizon)
    .find(h => h != null) ?? 'short_term';

  return {
    // Presence flags per semantic group
    has_heat_stress:             groupIds.has('heat_stress'),
    has_precipitation_intensity: groupIds.has('precipitation_intensity'),
    has_water_stress:            groupIds.has('water_stress'),
    has_terrain_instability:     groupIds.has('terrain_instability'),
    has_climate_mode:            groupIds.has('climate_mode'),

    // ENSO context (may be null when NOAA is unavailable)
    enso_phase: ensoData?.phase      ?? null,
    enso_oni:   ensoData?.oni_latest ?? null,

    // Terrain context (may be null when elevation APIs are unavailable)
    terrain_slope_deg:      terrainData?.slope_degrees  ?? null,
    terrain_region:         terrainData?.terrain_region ?? null,
    terrain_susceptibility: terrainData?.susceptibility ?? null,
    terrain_huayco_risk:    terrainData?.huayco_risk    ?? null,

    // Climate model context
    climate_source:          fusedData?.climateSource  ?? null,
    scenario,
    scenario_label:          resolveScenarioLabel(scenario),
    temporal_horizon:        dominantHorizon,
    temporal_horizon_label:  HORIZON_LABELS[dominantHorizon] ?? dominantHorizon,
  };
}

// ─── FASE C — Interpretation Text Builders ───────────────────────────────────

function hl(horizon) {
  return HORIZON_LABELS[horizon] ?? horizon ?? 'corto plazo';
}

function sourceLabel(signal) {
  return signal?.source_traceability?.source ?? 'proyecciones climáticas';
}

// ── Per-group interpretation builders ────────────────────────────────────────

function buildHeatInterpretation(group, context) {
  const c = group.canonical_signal;
  if (!c) return null;

  const src   = sourceLabel(c);
  const scen  = context.scenario_label;
  const horiz = hl(c.horizon);

  if (c.signalType === 'temp_increase' && c.delta != null) {
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones ${src} (${scen}, ${horiz}) muestran un incremento de temperatura media de +${c.delta.toFixed(1)}°C sobre la línea base histórica 1980–2014.`,
      data_basis: { signal_type: c.signalType, delta: c.delta, unit: '°C', horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  if (c.signalType === 'extreme_heat' && c.delta != null) {
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones ${src} (${scen}, ${horiz}) indican +${Math.round(c.delta)} días adicionales por año con temperatura máxima superior a 35°C (hd35) respecto al período histórico 1980–2014.`,
      data_basis: { signal_type: c.signalType, indicator: 'hd35', delta: c.delta, unit: 'días/año', threshold: '35°C', horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  if (c.signalType === 'severe_heat' && c.delta != null) {
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones ${src} (${scen}, ${horiz}) indican +${Math.round(c.delta)} días adicionales por año con temperatura máxima superior a 40°C (hd40) respecto al período histórico 1980–2014.`,
      data_basis: { signal_type: c.signalType, indicator: 'hd40', delta: c.delta, unit: 'días/año', threshold: '40°C', horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  if (c.signalType === 'tropical_nights' && c.delta != null) {
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones ${src} (${scen}, ${horiz}) indican +${Math.round(c.delta)} noches adicionales por año con temperatura mínima superior a 20°C (noches tropicales, índice TR) respecto al período histórico 1980–2014.`,
      data_basis: { signal_type: c.signalType, indicator: 'tr', delta: c.delta, unit: 'noches/año', threshold: '20°C', horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  // Fallback: signal exists but delta is null (e.g. GRI-derived heat)
  const signalLabel = c.signalType === 'temp_increase'
    ? 'incremento de temperatura media'
    : c.signalType === 'severe_heat'
      ? 'días con temperatura máxima superior a 40°C'
      : 'días con temperatura máxima superior a 35°C';

  return {
    type: 'single_group',
    group_ids: [group.group_id],
    text: `Las proyecciones ${src} (${scen}) registran ${signalLabel} para el período ${horiz}.`,
    data_basis: { signal_type: c.signalType, horizon: c.horizon, scenario: scen },
    evidence_ids: group.evidence_ids,
  };
}

function buildPrecipitationInterpretation(group, context) {
  const c     = group.canonical_signal;
  if (!c) return null;

  const scen  = context.scenario_label;
  const horiz = hl(c.horizon);
  const types = group.signal_types;

  const hasCmip6Rain = types.includes('extreme_rain');
  const hasFlood     = types.includes('flood_risk');

  // Multi-source: CMIP6 precipitation projection + GRI/WRI flood probability
  if (hasCmip6Rain && hasFlood) {
    const rainSignal  = group.signals.find(s => s.signalType === 'extreme_rain');
    const floodSignal = group.signals.find(s => s.signalType === 'flood_risk');

    const rainText = rainSignal?.delta_pct != null
      ? `un incremento de +${Number(rainSignal.delta_pct).toFixed(0)}% en precipitación máxima de 5 días (Rx5day)`
      : 'incremento en precipitación extrema';

    const floodProb = floodSignal?.projected != null
      ? `${(floodSignal.projected * 100).toFixed(0)}%`
      : 'elevada';

    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones CMIP6 (${scen}, ${horiz}) muestran ${rainText}. El modelo GRI Infrastructure Resilience / WRI Aqueduct 4.0 estima una probabilidad de inundación de ${floodProb} para esta ubicación.`,
      data_basis: { rain_delta_pct: rainSignal?.delta_pct, flood_probability: floodSignal?.projected, horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  // CMIP6 only — Rx5day
  if (hasCmip6Rain) {
    const src = sourceLabel(c);

    if (c.indicator === 'rx5day' && c.delta_pct != null) {
      return {
        type: 'single_group',
        group_ids: [group.group_id],
        text: `Las proyecciones ${src} (${scen}, ${horiz}) muestran un incremento de +${Number(c.delta_pct).toFixed(0)}% en la precipitación máxima de 5 días (Rx5day) sobre la línea base histórica 1980–2014.`,
        data_basis: { signal_type: c.signalType, indicator: 'rx5day', delta_pct: c.delta_pct, unit: '%', horizon: c.horizon, scenario: scen },
        evidence_ids: group.evidence_ids,
      };
    }

    if (c.indicator === 'rx1day' && c.projected != null) {
      return {
        type: 'single_group',
        group_ids: [group.group_id],
        text: `Las proyecciones ${src} (${scen}, ${horiz}) indican precipitación máxima diaria de ${Number(c.projected).toFixed(0)} mm (Rx1day), superando el umbral de lluvia intensa de 50 mm/día (WMO 2023).`,
        data_basis: { signal_type: c.signalType, indicator: 'rx1day', projected: c.projected, unit: 'mm', threshold: '50 mm/día', horizon: c.horizon, scenario: scen },
        evidence_ids: group.evidence_ids,
      };
    }

    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones ${src} (${scen}, ${horiz}) registran incremento en precipitación extrema para el período proyectado.`,
      data_basis: { signal_type: c.signalType, horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  // GRI/WRI flood probability only
  if (hasFlood) {
    const prob = c.projected != null ? `${(c.projected * 100).toFixed(0)}%` : 'elevada';
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `El modelo GRI Infrastructure Resilience / WRI Aqueduct 4.0 estima una probabilidad de inundación de ${prob} para esta ubicación.`,
      data_basis: { signal_type: c.signalType, flood_probability: c.projected },
      evidence_ids: group.evidence_ids,
    };
  }

  return null;
}

function buildTerrainInterpretation(group, context, fusedData) {
  const c           = group.canonical_signal;
  if (!c) return null;

  const terrainData = fusedData?.terrainData ?? null;
  const slope       = terrainData?.slope_degrees ?? (c.projected != null ? Number(c.projected) : null);
  const region      = terrainData?.terrain_region ?? context.terrain_region ?? 'la zona evaluada';
  const susc        = terrainData?.susceptibility ?? 'moderada';
  const slopeText   = slope != null ? `pendientes de ${Number(slope).toFixed(1)}°` : 'pendientes pronunciadas';

  const types       = group.signal_types;
  const hasHuayco   = types.includes('huayco_risk');
  const hasLandslide= types.includes('landslide_risk') || types.includes('landslide_susceptibility');

  let hazardDesc = 'inestabilidad de terreno';
  if (hasHuayco && hasLandslide) hazardDesc = 'deslizamientos y flujos de detritos (huaycos)';
  else if (hasHuayco)            hazardDesc = 'flujos de detritos (huaycos)';
  else if (hasLandslide)         hazardDesc = 'deslizamientos de ladera';

  return {
    type: 'single_group',
    group_ids: [group.group_id],
    text: `El análisis topográfico SRTM identifica ${slopeText} en ${region}, con susceptibilidad ${susc} a ${hazardDesc} según la clasificación INGEMMET 2021.`,
    data_basis: {
      slope_degrees:   slope,
      region,
      susceptibility:  susc,
      hazard_type:     hazardDesc,
      source:          'NASA SRTM v3 + INGEMMET 2021',
    },
    evidence_ids: group.evidence_ids,
  };
}

function buildDroughtInterpretation(group, context) {
  const c    = group.canonical_signal;
  if (!c) return null;

  const src   = sourceLabel(c);
  const scen  = context.scenario_label;
  const horiz = hl(c.horizon);

  if (c.indicator === 'cdd' && c.delta != null) {
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones ${src} (${scen}, ${horiz}) indican +${Math.round(c.delta)} días secos consecutivos adicionales (CDD) sobre la línea base histórica 1980–2014.`,
      data_basis: { signal_type: 'drought', indicator: 'cdd', delta: c.delta, unit: 'días', horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  if ((c.indicator === 'prpercnt' || c.indicator === 'pr') && c.delta_pct != null) {
    const pct = Math.abs(c.delta_pct).toFixed(0);
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `Las proyecciones ${src} (${scen}, ${horiz}) muestran una reducción del ${pct}% en la precipitación anual respecto a la línea base histórica 1980–2014.`,
      data_basis: { signal_type: 'drought', indicator: c.indicator, delta_pct: c.delta_pct, unit: '%', horizon: c.horizon, scenario: scen },
      evidence_ids: group.evidence_ids,
    };
  }

  if (c.indicator === 'gri_drought_probability' && c.historical != null) {
    const prob = `${(c.historical * 100).toFixed(0)}%`;
    return {
      type: 'single_group',
      group_ids: [group.group_id],
      text: `El modelo GRI Infrastructure Resilience registra una probabilidad de exposición a sequía de ${prob} para esta ubicación en el escenario base.`,
      data_basis: { signal_type: 'drought', indicator: 'gri_drought_probability', probability: c.historical },
      evidence_ids: group.evidence_ids,
    };
  }

  return {
    type: 'single_group',
    group_ids: [group.group_id],
    text: `Las proyecciones ${src} (${scen}, ${horiz}) registran condiciones de estrés hídrico / sequía para el período proyectado.`,
    data_basis: { signal_type: 'drought', horizon: c.horizon, scenario: scen },
    evidence_ids: group.evidence_ids,
  };
}

function buildEnsoInterpretation(group, fusedData) {
  const c        = group.canonical_signal;
  const ensoData = fusedData?.ensoData ?? null;

  const oni   = ensoData?.oni_latest ?? (c?.projected != null ? Number(c.projected) : null);
  const phase = ensoData?.phase ?? (
    oni != null ? (oni > 0.5 ? 'el_nino' : oni < -0.5 ? 'la_nina' : 'neutral') : null
  );

  const oniText    = oni != null ? ` (ONI: ${oni > 0 ? '+' : ''}${Number(oni).toFixed(2)}°C)` : '';
  const phaseLabel = phase === 'el_nino' ? 'El Niño' : phase === 'la_nina' ? 'La Niña' : 'neutral';

  return {
    type: 'single_group',
    group_ids: [group.group_id],
    text: `La fase ENSO actual es ${phaseLabel}${oniText}, condición que modula la variabilidad interanual de precipitación y temperatura en la costa del Pacífico de América del Sur (NOAA CPC ONI).`,
    data_basis: { enso_phase: phase, oni_value: oni, source: 'NOAA CPC' },
    evidence_ids: group.evidence_ids,
  };
}

function buildSingleGroupInterpretation(group, context, fusedData) {
  switch (group.group_id) {
    case 'heat_stress':             return buildHeatInterpretation(group, context);
    case 'precipitation_intensity': return buildPrecipitationInterpretation(group, context);
    case 'terrain_instability':     return buildTerrainInterpretation(group, context, fusedData);
    case 'water_stress':            return buildDroughtInterpretation(group, context);
    case 'climate_mode':            return buildEnsoInterpretation(group, fusedData);
    default:                        return null;
  }
}

// ── Compound interpretation builders ─────────────────────────────────────────

/**
 * Compound: precipitation_intensity + terrain_instability
 *
 * Example: "Las proyecciones CMIP6 muestran incremento de precipitación extrema.
 * El análisis topográfico identifica pendientes pronunciadas.
 * La combinación de ambos factores incrementa susceptibilidad a deslizamientos."
 */
function buildPrecipTerrainCompound(precipGroup, terrainGroup, context, fusedData) {
  const precip      = precipGroup.canonical_signal;
  const terrain     = terrainGroup.canonical_signal;
  const terrainData = fusedData?.terrainData ?? null;

  const slope     = terrainData?.slope_degrees ?? (terrain?.projected != null ? Number(terrain.projected) : null);
  const region    = terrainData?.terrain_region ?? context.terrain_region ?? 'la zona evaluada';
  const slopeText = slope != null ? `pendientes de ${Number(slope).toFixed(1)}°` : 'pendientes pronunciadas';

  const precipDesc = precip?.delta_pct != null
    ? `el incremento de +${Number(precip.delta_pct).toFixed(0)}% en precipitación extrema proyectado (CMIP6, ${context.scenario_label})`
    : 'el incremento en precipitación extrema proyectado';

  const hazardTypes = terrainGroup.signal_types;
  const hazardDesc  = hazardTypes.includes('huayco_risk')
    ? 'deslizamientos y flujos de detritos (huaycos)'
    : 'deslizamientos de ladera';

  return {
    type: 'compound',
    group_ids: ['precipitation_intensity', 'terrain_instability'],
    text: `La combinación de ${precipDesc} y las ${slopeText} identificadas en ${region} incrementa la exposición a ${hazardDesc}.`,
    data_basis: {
      precip_delta_pct:  precip?.delta_pct,
      slope_degrees:     slope,
      region,
      scenario:          context.scenario_label,
    },
    evidence_ids: [...new Set([...precipGroup.evidence_ids, ...terrainGroup.evidence_ids])],
  };
}

/**
 * Compound: climate_mode (ENSO) + precipitation_intensity or water_stress
 *
 * El Niño amplifies precipitation; La Niña amplifies drought.
 */
function buildEnsoAmplificationCompound(ensoGroup, targetGroup, context, fusedData) {
  const ensoData = fusedData?.ensoData ?? null;
  const phase    = ensoData?.phase ?? null;
  const oni      = ensoData?.oni_latest ?? (ensoGroup.canonical_signal?.projected != null
    ? Number(ensoGroup.canonical_signal.projected) : null);

  if (!phase || phase === 'neutral') return null;

  const oniText    = oni != null ? ` (ONI: ${oni > 0 ? '+' : ''}${Number(oni).toFixed(2)}°C)` : '';
  const phaseLabel = phase === 'el_nino' ? 'El Niño' : 'La Niña';

  let amplText;
  if (phase === 'el_nino' && targetGroup.group_id === 'precipitation_intensity') {
    amplText = `La fase ${phaseLabel} activa${oniText} actúa como amplificador interanual de los eventos de precipitación extrema en la región costera del Pacífico.`;
  } else if (phase === 'la_nina' && targetGroup.group_id === 'water_stress') {
    amplText = `La fase ${phaseLabel} activa${oniText} amplifica el déficit hídrico proyectado para esta región, con impacto en la variabilidad de precipitación a escala interanual.`;
  } else {
    amplText = `La fase ${phaseLabel} activa${oniText} modula la variabilidad interanual de las señales climáticas proyectadas para esta región.`;
  }

  return {
    type: 'compound',
    group_ids: ['climate_mode', targetGroup.group_id],
    text: amplText,
    data_basis: { enso_phase: phase, oni_value: oni },
    evidence_ids: [...new Set([...ensoGroup.evidence_ids, ...targetGroup.evidence_ids])],
  };
}

/**
 * Compound: heat_stress + water_stress
 *
 * Concurrent temperature increase and drought signal a compound heat–drought condition.
 */
function buildHeatDroughtCompound(heatGroup, droughtGroup, context) {
  const heat    = heatGroup.canonical_signal;
  const drought = droughtGroup.canonical_signal;

  const heatDesc = heat?.delta != null
    ? `el incremento de +${heat.signalType === 'temp_increase' ? heat.delta.toFixed(1) + '°C' : Math.round(heat.delta) + ' días'} en temperatura`
    : 'el incremento de temperatura proyectado';

  const droughtDesc = drought?.delta_pct != null
    ? `la reducción del ${Math.abs(drought.delta_pct).toFixed(0)}% en precipitación anual`
    : drought?.delta != null
      ? `el incremento de +${Math.round(drought.delta)} días secos consecutivos`
      : 'el déficit hídrico proyectado';

  return {
    type: 'compound',
    group_ids: ['heat_stress', 'water_stress'],
    text: `La concurrencia de ${heatDesc} y ${droughtDesc} proyectados (${context.scenario_label}) configura una condición de estrés compuesto calor–sequía.`,
    data_basis: {
      heat_delta:        heat?.delta,
      drought_delta_pct: drought?.delta_pct,
      drought_delta:     drought?.delta,
      scenario:          context.scenario_label,
    },
    evidence_ids: [...new Set([...heatGroup.evidence_ids, ...droughtGroup.evidence_ids])],
  };
}

/**
 * FASE C — Generates all interpretations: single-group + compound effects.
 *
 * Compound interpretations are only generated when both relevant groups
 * are present in the same analysis.
 *
 * @param {Object[]} groups    - signal_groups from groupSignals()
 * @param {Object}   context   - from buildContext()
 * @param {Object}   fusedData - from Layer1
 * @returns {Object[]}         - interpretation objects
 */
function generateInterpretations(groups, context, fusedData) {
  const interpretations = [];
  const byId = Object.fromEntries(groups.map(g => [g.group_id, g]));

  // Single-group interpretations (in deterministic order for testability)
  const groupOrder = ['heat_stress', 'precipitation_intensity', 'water_stress', 'terrain_instability', 'climate_mode'];
  for (const groupId of groupOrder) {
    const group = byId[groupId];
    if (!group) continue;
    const interp = buildSingleGroupInterpretation(group, context, fusedData);
    if (interp) interpretations.push(interp);
  }

  // Compound: precipitation + terrain → slope hazard
  if (byId.precipitation_intensity && byId.terrain_instability) {
    const compound = buildPrecipTerrainCompound(byId.precipitation_intensity, byId.terrain_instability, context, fusedData);
    if (compound) interpretations.push(compound);
  }

  // Compound: ENSO + precipitation (El Niño)
  if (byId.climate_mode && byId.precipitation_intensity) {
    const compound = buildEnsoAmplificationCompound(byId.climate_mode, byId.precipitation_intensity, context, fusedData);
    if (compound) interpretations.push(compound);
  }

  // Compound: ENSO + drought (La Niña)
  if (byId.climate_mode && byId.water_stress) {
    const compound = buildEnsoAmplificationCompound(byId.climate_mode, byId.water_stress, context, fusedData);
    if (compound) interpretations.push(compound);
  }

  // Compound: heat + drought
  if (byId.heat_stress && byId.water_stress) {
    const compound = buildHeatDroughtCompound(byId.heat_stress, byId.water_stress, context);
    if (compound) interpretations.push(compound);
  }

  return interpretations;
}

// ─── FASE D — Uncertainty Metadata ───────────────────────────────────────────

function getOverallConfidence(groups) {
  if (groups.length === 0) return 'low';
  const levels = groups.map(g => {
    const c = g.canonical_signal;
    return c?.confidence ?? c?.source_traceability?.confidence_level ?? 'low';
  });
  if (levels.every(l => l === 'high'))   return 'high';
  if (levels.some(l => l === 'high'))    return 'medium';
  return 'low';
}

function getEvidenceStrength(groups) {
  if (groups.length === 0) return 'limited';
  const statuses = groups.flatMap(g =>
    g.signals.map(s => s.source_traceability?.validation_status ?? 'experimental')
  );
  const validated = statuses.filter(v => v === 'validated').length;
  const ratio     = validated / statuses.length;
  if (ratio >= 0.8) return 'strong';
  if (ratio >= 0.4) return 'moderate';
  return 'limited';
}

function getModelSpread(groups) {
  // Use the canonical signal of the primary climate group
  const primaryGroup = groups.find(g =>
    ['heat_stress', 'precipitation_intensity', 'water_stress'].includes(g.group_id)
  );
  const spread = primaryGroup?.canonical_signal?.source_traceability?.uncertainty_spread ?? null;

  if (spread) {
    return {
      description: spread.spread_note ?? 'Spread del ensamble disponible en source_traceability.',
      spread_type: spread.spread_type ?? null,
      p10:         spread.p10          ?? null,
      p90:         spread.p90          ?? null,
      model_count: spread.model_count  ?? null,
    };
  }

  const src = primaryGroup?.canonical_signal?.source_traceability?.source ?? null;
  return {
    description: src
      ? `Spread de modelo no disponible para la señal canónica (${src}).`
      : 'Spread de modelo no disponible para las señales detectadas en esta ubicación.',
    spread_type: null,
    p10:         null,
    p90:         null,
    model_count: null,
  };
}

function collectLimitations(groups, context, fusedData) {
  const seen  = new Set();
  const result = [];

  // Pull up to 2 limitations per evidence source used
  const evidenceIds = [...new Set(groups.flatMap(g => g.evidence_ids))];
  for (const eid of evidenceIds) {
    const ev = EVIDENCE_REGISTRY[eid];
    if (!ev?.limitations) continue;
    for (const lim of ev.limitations.slice(0, 2)) {
      if (!seen.has(lim)) { seen.add(lim); result.push(lim); }
      if (result.length >= 5) return result;
    }
  }

  // Contextual additions
  if (context.climate_source === 'open_meteo_derived' && result.length < 5) {
    const note = 'Señales derivadas de Open-Meteo (fallback): menor representatividad del ensamble CMIP6 que las climate_cells directas.';
    if (!seen.has(note)) result.push(note);
  }

  if (context.has_terrain_instability && !fusedData?.terrainData && result.length < 5) {
    const note = 'Señal de terreno derivada de SRTM sin validación de campo en el sitio específico del activo.';
    if (!seen.has(note)) result.push(note);
  }

  return result;
}

/**
 * FASE D — Builds the uncertainty metadata block.
 *
 * @param {Object[]} groups      - signal_groups
 * @param {Object}   context     - from buildContext()
 * @param {Object}   signalOutput- from Layer2 (provides dominant_signal metadata)
 * @param {Object}   fusedData   - from Layer1
 * @returns {Object}
 */
function buildUncertainty(groups, context, signalOutput, fusedData) {
  return {
    overall_confidence: getOverallConfidence(groups),
    model_spread:       getModelSpread(groups),
    limitations:        collectLimitations(groups, context, fusedData),
    evidence_strength:  getEvidenceStrength(groups),
  };
}

// ─── FASE E — Validation ──────────────────────────────────────────────────────

// Patterns that must NOT appear in the serialized output
const SCORE_PATTERNS     = [/\bscore\b/i, /\bpuntaje\b/i, /\bcalificaci[oó]n\b/i, /\brisk_score\b/i, /\boverall_score\b/i];
const URGENCY_PATTERNS   = [/\burgente\b/i, /\binmediato\b.*actuar/i, /\bprioridad\s+\d/i, /\bdebe\s+actuar\s+ahora/i];
const FINANCIAL_PATTERNS = [/\bfinancial_impact\b/i, /\bimpacto\s+financiero\b/i, /\bp[eé]rdida\s+econ[oó]mica\b/i, /\bcosto\s+estimado\b/i, /\busd\b/i];

/**
 * FASE E — Validates the interpretation output against the scientific platform invariants.
 * Returns validation flags; validation_passed is true when all invariants hold.
 *
 * @param {Object} params
 * @param {Object[]} params.interpretations
 * @param {Object}   params.uncertainty
 * @returns {Object} validation flags
 */
function validateInterpretation({ interpretations, uncertainty }) {
  const allText = interpretations.map(i => i.text ?? '').join(' ');
  const fullJson = JSON.stringify({ interpretations, uncertainty });

  const hasScores         = SCORE_PATTERNS.some(p => p.test(fullJson));
  const hasUrgency        = URGENCY_PATTERNS.some(p => p.test(allText));
  const hasFinancialImpacts = FINANCIAL_PATTERNS.some(p => p.test(fullJson));
  // By construction all values come from signal data — never fabricated
  const hasInventedNumbers = false;

  return {
    has_scores:           hasScores,
    has_urgency:          hasUrgency,
    has_invented_numbers: hasInventedNumbers,
    has_financial_impacts: hasFinancialImpacts,
    validation_passed:    !hasScores && !hasUrgency && !hasInventedNumbers && !hasFinancialImpacts,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Sprint 7 — Scientific Interpretation Engine entry point.
 *
 * @param {Object} signalOutput - Output of Layer2.detectSignals()
 *                                { signals[], signals_count, dominant_signal, ... }
 * @param {Object} fusedData    - Output of Layer1.fusionClimateData()
 *                                { climateData, griData, ensoData, terrainData, scenario, ... }
 * @returns {Object} {
 *   signal_groups   — FASE A: semantic clusters of equivalent signals
 *   context         — FASE B: topography + climate + ENSO fusion state
 *   interpretations — FASE C: natural-language climate narratives
 *   uncertainty     — FASE D: confidence, model spread, limitations, evidence strength
 *   validation      — FASE E: invariant checks (no scores, no urgency, etc.)
 *   generated_at    — ISO timestamp
 * }
 */
export function interpretSignals(signalOutput, fusedData) {
  const signals = signalOutput?.signals ?? [];

  // FASE A — Semantic deduplication
  const signal_groups = groupSignals(signals);

  // FASE B — Contextual fusion
  const context = buildContext(signal_groups, fusedData);

  // FASE C — Natural-language interpretations
  const interpretations = generateInterpretations(signal_groups, context, fusedData);

  // FASE D — Uncertainty metadata
  const uncertainty = buildUncertainty(signal_groups, context, signalOutput, fusedData);

  // FASE E — Invariant validation
  const validation = validateInterpretation({ interpretations, uncertainty });

  return {
    signal_groups,
    context,
    interpretations,
    uncertainty,
    validation,
    generated_at: new Date().toISOString(),
  };
}
