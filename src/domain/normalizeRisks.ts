/**
 * normalizeRisks — Semantic deduplication layer (Sprint 14).
 *
 * Takes the raw API response ({ signals, risks, gri_hazards, adaptations })
 * and produces a deduplicated ConsolidatedRisk[] where each entry represents
 * ONE climate phenomenon for ONE temporal period.
 *
 * Rules:
 *   1. Map every signal / GRI hazard / contextual risk to a RiskTypeSlug.
 *   2. Key = `${riskType}_${period}`.  First source wins; later sources enrich.
 *   3. evidence[] and impacts[] are merged — never duplicated.
 *   4. Signals without a known mapping are logged in DEV and skipped.
 */

import type {
  ConsolidatedRisk,
  ConsolidatedRiskTimeline,
  ScenarioProjection,
  RiskTypeSlug,
  TemporalPeriod,
  ScenarioLabel,
  ConfidenceLabel,
  EvidenceRef,
  AdaptationSummary,
} from './consolidatedRisk';

import { RISK_TYPE_DISPLAY, formatKeyMetric } from '../constants/riskTypes';
import { toScenarioLabel, toTemporalPeriod } from '../constants/scenarios';
import { buildScenarioVariants, buildTemporalEvolutionSentence, buildEnsoShortTermNarrative } from './buildOperationalNarrative';

// ─── Semantic mapping tables ──────────────────────────────────────────────────

/**
 * Maps every known signal type (Layer2 + GRI hazard keys) to a RiskTypeSlug.
 * Keys are lowercase.  Extend here when new signal types appear in the API.
 */
export const SIGNAL_TO_CONSOLIDATED: Record<string, RiskTypeSlug> = {
  // ── Layer2 signal_type / signalType values ──────────────────────────────
  extreme_rain:             'lluvias_extremas',
  flood_risk:               'lluvias_extremas',
  extreme_heat:             'calor_extremo',
  severe_heat:              'calor_extremo',
  tropical_nights:          'calor_extremo',
  temp_increase:            'calor_extremo',
  drought:                  'sequia',
  water_stress:             'sequia',
  landslide_susceptibility: 'deslizamiento',
  landslide_risk:           'deslizamiento',
  huayco_risk:              'deslizamiento',
  enso_phase:               'fenomeno_enso',
  enso:                     'fenomeno_enso',
  frost:                    'heladas',
  freeze:                   'heladas',

  // ── GRI Oxford hazard type keys ─────────────────────────────────────────
  flood:        'lluvias_extremas',
  fluvial:      'inundacion',
  pluvial:      'lluvias_extremas',
  coastal:      'inundacion',
  heat:         'calor_extremo',
  heat_stress:  'calor_extremo',
  landslide:    'deslizamiento',
  drought_gri:  'sequia',

  // ── Variants seen in staging responses ─────────────────────────────────
  lluvia_extrema:  'lluvias_extremas',
  calor_extremo:   'calor_extremo',
  sequia:          'sequia',
  deslizamiento:   'deslizamiento',
  inundacion:      'inundacion',
};

// ─── Keyword → RiskTypeSlug for free-text risk.title detection ───────────────

const KEYWORD_MAP: Array<{ pattern: RegExp; slug: RiskTypeSlug }> = [
  { pattern: /lluvi|inundaci|precipitaci/i,    slug: 'lluvias_extremas' },
  { pattern: /calor|temperatura|t[eé]rmic/i,   slug: 'calor_extremo'   },
  { pattern: /sequ[íi]a|h[íi]dric|agua/i,      slug: 'sequia'          },
  { pattern: /desliz|huayco|landslide/i,        slug: 'deslizamiento'   },
  { pattern: /helada|frost|fre[ae]ze/i,         slug: 'heladas'         },
  { pattern: /ni[ñn]o|ni[ñn]a|enso/i,          slug: 'fenomeno_enso'   },
  { pattern: /inundaci/i,                       slug: 'inundacion'      },
];

// ─── Confidence mapping ───────────────────────────────────────────────────────

const CONFIDENCE_MAP: Record<string, ConfidenceLabel> = {
  high:   'alta',
  medium: 'media',
  low:    'baja',
  alta:   'alta',
  media:  'media',
  baja:   'baja',
};

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Extracts signal_type handling both snake_case and camelCase API variants. */
function getSignalTypeKey(signal: Record<string, unknown>): string {
  const raw = (signal['signal_type'] ?? signal['signalType'] ?? '') as string;
  return raw.toLowerCase().trim();
}

/** Resolves RiskTypeSlug from a signal type key.  Returns null if unmapped. */
function resolveSlug(key: string): RiskTypeSlug | null {
  return SIGNAL_TO_CONSOLIDATED[key] ?? null;
}

/** Detects RiskTypeSlug from free-text using keyword patterns. */
function detectSlugFromText(text: string): RiskTypeSlug | null {
  for (const { pattern, slug } of KEYWORD_MAP) {
    if (pattern.test(text)) return slug;
  }
  return null;
}

/** Maps API confidence to ConfidenceLabel, defaulting to 'media'. */
function toConfidence(raw: unknown): ConfidenceLabel {
  if (typeof raw !== 'string') return 'media';
  return CONFIDENCE_MAP[raw.toLowerCase().trim()] ?? 'media';
}

/** Deduplicates an array of strings (case-sensitive). */
function dedupeStrings(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

/** Deduplicates EvidenceRef by sourceLabel. */
function mergeEvidence(existing: EvidenceRef[], incoming: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set(existing.map(e => e.sourceLabel));
  return [...existing, ...incoming.filter(e => !seen.has(e.sourceLabel))];
}

/** Builds an empty ConsolidatedRisk for a given (riskType, period) pair. */
function buildEmpty(
  riskType: RiskTypeSlug,
  period: TemporalPeriod,
  scenario: ScenarioLabel,
  confidence: ConfidenceLabel
): ConsolidatedRisk {
  const display = RISK_TYPE_DISPLAY[riskType];
  return {
    id:                 `${riskType}_${period}`,
    riskType,
    displayName:        display.label,
    period,
    scenario,
    confidence,
    narrativeText:      display.briefNarrative,
    keyMetric:          null,
    impacts:            [],
    evidence:           [],
    adaptationMeasures: [],
    rawSources:         [],
    // Populated after impacts are fully merged (see post-processing step 5b)
    scenarioVariants:   {},
  };
}

/** Logs unmapped signal types in DEV mode only. */
function warnUnmapped(key: string, context: string): void {
  if (import.meta.env.DEV) {
    console.warn(`[normalizeRisks] Unmapped signal type "${key}" from ${context}. Add it to SIGNAL_TO_CONSOLIDATED.`);
  }
}

// ─── Main normalization pipeline ──────────────────────────────────────────────

/**
 * Accepts the raw /api/v2/climate-risk-analysis response and returns a
 * deduplicated ConsolidatedRisk[].
 *
 * Resilient to missing or partial fields — silently degrades to empty list
 * rather than throwing, so existing UI panels continue to render.
 */
export function normalizeRisks(apiResponse: Record<string, unknown>): ConsolidatedRisk[] {
  if (!apiResponse || typeof apiResponse !== 'object') return [];

  const map = new Map<string, ConsolidatedRisk>();

  // ── 1. Process signals[] (Layer2) ────────────────────────────────────────
  // The API may return signals as ClimateSignal[] or { signals: ClimateSignal[] }
  const rawSignals = apiResponse['signals'];
  const signalList: Record<string, unknown>[] = Array.isArray(rawSignals)
    ? rawSignals
    : Array.isArray((rawSignals as Record<string, unknown>)?.['signals'])
      ? (rawSignals as Record<string, unknown>)['signals'] as Record<string, unknown>[]
      : [];

  for (const signal of signalList) {
    const typeKey = getSignalTypeKey(signal);
    if (!typeKey) continue;

    const riskType = resolveSlug(typeKey);
    if (!riskType) {
      warnUnmapped(typeKey, 'signals[]');
      continue;
    }

    const horizon   = (signal['horizon'] ?? signal['temporal_window'] ?? '') as string;
    const period    = toTemporalPeriod(horizon);
    const scenario  = toScenarioLabel((signal['scenario'] ?? signal['SSP'] ?? '') as string);
    const confidence = toConfidence(signal['confidence']);
    const key = `${riskType}_${period}`;

    if (!map.has(key)) {
      map.set(key, buildEmpty(riskType, period, scenario, confidence));
    }

    const entry = map.get(key)!;

    // Upgrade confidence if incoming is stronger
    const confRank: Record<ConfidenceLabel, number> = { alta: 3, media: 2, baja: 1 };
    if (confRank[confidence] > confRank[entry.confidence]) {
      entry.confidence = confidence;
    }

    // Key metric: prefer Layer9 projected value (mid/long) over historical
    if (!entry.keyMetric) {
      const value = (signal['projected'] ?? signal['value']) as number | null;
      const unit = signal['unit'] as string | undefined;
      const indicator = signal['indicator'] as string | undefined;
      entry.keyMetric = formatKeyMetric(value, unit, indicator ?? typeKey);
    }

    // Traceability → evidence
    const trace = signal['source_traceability'] as Record<string, unknown> | undefined;
    const sourceLabel = (
      trace?.['source'] ??
      trace?.['dataset'] ??
      (signal['source'] as string | undefined) ??
      'CMIP6'
    ) as string;
    const periodLabel = (trace?.['temporal_period_label'] ?? (trace?.['temporal_window']) ?? horizon) as string;

    entry.evidence = mergeEvidence(entry.evidence, [{
      sourceLabel,
      period: periodLabel || period,
      validationStatus: (trace?.['validation_status'] === 'validated' || trace?.['validation_status'] === 'validado')
        ? 'validado'
        : 'provisional',
    }]);

    if (!entry.rawSources.includes('signals')) entry.rawSources.push('signals');
  }

  // ── 1b. ENSO fallback from top-level signalOutput.enso_phase (ensure `fenomeno_enso` always appears) −
  if (!map.has('fenomeno_enso_corto_plazo')) {
    const ensoPhase = (rawSignals as Record<string, unknown> | undefined)?.['enso_phase'];
    if (ensoPhase) {
      const riskType: RiskTypeSlug = 'fenomeno_enso';
      const period: TemporalPeriod = 'corto_plazo';
      const entry = buildEmpty(riskType, period, null, 'alta');
      entry.narrativeText = RISK_TYPE_DISPLAY[riskType]?.briefNarrative ?? 'Variabilidad climática interanual';
      entry.keyMetric = formatKeyMetric(null, null, `oni (fase: ${ensoPhase})`);
      entry.evidence = [{
        sourceLabel: 'NOAA CPC ONI',
        period: 'presente',
        validationStatus: 'validado',
      }];
      entry.rawSources.push('signals', 'enso_fallback');
      map.set(`${riskType}_${period}`, entry);
    }
  }

  // ── 2. Enrich with risks[] (Layer3) ──────────────────────────────────────
  // Contextual risks add operational_impacts to existing entries.
  // They do NOT create new entries (prevents triplication).
  const riskList = Array.isArray(apiResponse['risks'])
    ? apiResponse['risks'] as Record<string, unknown>[]
    : [];

  for (const risk of riskList) {
    // Try to identify risk type from nested signal or free-text title
    const nestedSignal = risk['signal'] as Record<string, unknown> | undefined;
    const typeKey = nestedSignal
      ? getSignalTypeKey(nestedSignal)
      : '';

    let riskType: RiskTypeSlug | null = typeKey ? resolveSlug(typeKey) : null;

    if (!riskType) {
      const title = (risk['title'] ?? risk['name'] ?? '') as string;
      riskType = detectSlugFromText(title);
    }

    if (!riskType) {
      warnUnmapped(typeKey || String(risk['title'] ?? ''), 'risks[]');
      continue;
    }

    // Find the best-matching existing entry for this risk type
    const matchedKey = [...map.keys()].find(k => k.startsWith(riskType as string));
    if (!matchedKey) continue;

    const entry = map.get(matchedKey)!;

    const impacts = risk['operational_impacts'] as string[] | undefined;
    if (Array.isArray(impacts)) {
      entry.impacts = dedupeStrings([...entry.impacts, ...impacts]);
    }

    const provenance = risk['provenance'] as string | undefined;
    if (provenance && !entry.provenance) {
      entry.provenance = provenance;
    }

    if (!entry.rawSources.includes('risks')) entry.rawSources.push('risks');
  }

  // ── 3. Enrich with gri_hazards[] ─────────────────────────────────────────
  // GRI hazards only add evidence (probabilities) — they do not create new
  // entries and do not overwrite key metrics.
  const griList = Array.isArray(apiResponse['gri_hazards'])
    ? apiResponse['gri_hazards'] as Record<string, unknown>[]
    : [];

  for (const hazard of griList) {
    const typeKey = ((hazard['hazard'] ?? hazard['type'] ?? '') as string).toLowerCase().trim();
    const riskType = resolveSlug(typeKey);

    if (!riskType) {
      warnUnmapped(typeKey, 'gri_hazards[]');
      continue;
    }

    // Match the closest existing entry (prefer historical or shortest horizon)
    const matchedKey = [...map.keys()].find(k => k.startsWith(riskType));
    if (!matchedKey) continue;

    const entry = map.get(matchedKey)!;

    const baseline = hazard['baseline'] as Record<string, unknown> | undefined;
    const prob = baseline?.['probability'] ?? baseline?.['score'];
    const periodLabel = prob != null ? `probabilidad actual: ${prob}` : 'presente';

    entry.evidence = mergeEvidence(entry.evidence, [{
      sourceLabel: 'GRI Oxford Infrastructure Resilience',
      period: periodLabel,
      validationStatus: 'validado',
    }]);

    if (!entry.rawSources.includes('gri')) entry.rawSources.push('gri');
  }

  // ── 4. Attach adaptation measures ─────────────────────────────────────────
  // Adaptations are mapped per signal_type to the matching ConsolidatedRisk.
  const adaptationList = Array.isArray(apiResponse['adaptations'])
    ? apiResponse['adaptations'] as Record<string, unknown>[]
    : [];

  for (const adapt of adaptationList) {
    const sigType = ((adapt['signal_type'] ?? adapt['signalType'] ?? '') as string).toLowerCase().trim();
    const riskType = resolveSlug(sigType) ?? detectSlugFromText((adapt['nombre'] ?? '') as string);

    if (!riskType) continue;

    const matchedKey = [...map.keys()].find(k => k.startsWith(riskType));
    if (!matchedKey) continue;

    const entry = map.get(matchedKey)!;

    // Avoid duplicate adaptations by id
    const adaptId = (adapt['id'] ?? `${sigType}_${adapt['nombre']}`) as string;
    if (entry.adaptationMeasures.some(a => a.id === adaptId)) continue;

    entry.adaptationMeasures.push({
      id:          adaptId,
      name:        (adapt['nombre'] ?? adapt['name'] ?? 'Medida de adaptación') as string,
      timeframe:   (adapt['horizonte_implementacion'] ?? adapt['timeframe'] ?? 'mediano') as AdaptationSummary['timeframe'],
      effectiveness: (adapt['efectividad'] ?? adapt['effectiveness'] ?? 'media') as AdaptationSummary['effectiveness'],
    });
  }

  // ── 5a. Populate scenario variants for projection periods ─────────────────
  // Must run after impacts are fully merged so variants inherit real impacts.
  for (const entry of map.values()) {
    if (entry.period !== 'historico') {
      entry.scenarioVariants = buildScenarioVariants(entry.riskType, entry.period, entry.impacts);
    }
  }

  // ── 5b. Override ENSO narrative with real phase-specific context ───────────
  // I3: ENSO only exists in corto_plazo — never overrides future horizons.
  // Requires enso_context in the API response (added in server/routes/climate.js).
  const ensoCtx = apiResponse['enso_context'] as Record<string, unknown> | null | undefined;
  const ensoEntry = map.get('fenomeno_enso_corto_plazo');
  if (ensoEntry && ensoCtx) {
    const phase           = ensoCtx['phase']             as string | undefined;
    const intensity       = ensoCtx['intensity']         as string | undefined;
    const oni             = ensoCtx['oni_latest']        as number | undefined;
    const trend           = ensoCtx['trend']             as string | undefined;
    const summary         = ensoCtx['summary']           as string | undefined;
    const opRisks         = ensoCtx['operational_risks'] as string[] | undefined;
    const supplyRisk      = ensoCtx['supply_chain_risk'] as string | undefined;
    const floodAmp        = ensoCtx['flood_amplifier']   as boolean | undefined;
    const droughtAmp      = ensoCtx['drought_amplifier'] as boolean | undefined;
    const affectedRegions = ensoCtx['affected_regions']  as string[] | undefined;

    if (phase) {
      const richNarrative = buildEnsoShortTermNarrative(phase, intensity, oni, trend, summary, affectedRegions);
      ensoEntry.narrativeText = richNarrative;

      // High-emissions suffix is phase-specific — neutral gets no amplification text.
      const highSuffix = phase === 'el_nino'
        ? ' Bajo altas emisiones, la intensidad de los eventos asociados podría ser mayor.'
        : phase === 'la_nina'
        ? ' Bajo altas emisiones, el déficit hídrico asociado podría ser más severo.'
        : '';

      const modVariant  = ensoEntry.scenarioVariants['emisiones_moderadas'];
      const highVariant = ensoEntry.scenarioVariants['altas_emisiones'];
      if (modVariant) modVariant.narrativeText = richNarrative;
      if (highVariant) highVariant.narrativeText = highSuffix ? richNarrative + highSuffix : richNarrative;

      if (oni != null) {
        const oniPhaseLabel = phase === 'el_nino' ? 'El Niño'
                            : phase === 'la_nina' ? 'La Niña'
                            : 'ENSO';
        const rounded = Number.isInteger(oni) ? oni : Number(oni.toFixed(1));
        ensoEntry.keyMetric = `${rounded} °C de variabilidad climática ${oniPhaseLabel}`;
      }

      if (Array.isArray(opRisks) && opRisks.length > 0) {
        const amplifierImpacts: string[] = [];
        if (floodAmp)   amplifierImpacts.push('Amplificación de riesgo de inundación por ENSO');
        if (droughtAmp) amplifierImpacts.push('Amplificación de riesgo de sequía por ENSO');
        if (supplyRisk) amplifierImpacts.push(`Riesgo de cadena de suministro: nivel ${supplyRisk}`);
        ensoEntry.impacts = dedupeStrings([...opRisks, ...amplifierImpacts, ...ensoEntry.impacts]);
        // Rebuild scenarioVariants with the enriched impacts (I3: corto_plazo only)
        const refreshed = buildScenarioVariants('fenomeno_enso', 'corto_plazo', ensoEntry.impacts);
        if (refreshed['emisiones_moderadas']) refreshed['emisiones_moderadas'].narrativeText = richNarrative;
        if (refreshed['altas_emisiones']) {
          refreshed['altas_emisiones'].narrativeText = highSuffix ? richNarrative + highSuffix : richNarrative;
        }
        ensoEntry.scenarioVariants = refreshed;
      } else if (supplyRisk) {
        ensoEntry.impacts = dedupeStrings([`Riesgo en cadena de suministro: nivel ${supplyRisk}`, ...ensoEntry.impacts]);
      }
    }
  }

  // ── 5c. Return sorted: higher-confidence first, then by period ─────────────
  const periodOrder: Record<TemporalPeriod, number> = {
    historico:      0,
    corto_plazo:    1,
    mediano_plazo:  2,
    largo_plazo:    3,
  };
  const confOrder: Record<ConfidenceLabel, number> = { alta: 3, media: 2, baja: 1 };

  return [...map.values()].sort((a, b) => {
    const confDiff = confOrder[b.confidence] - confOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    return periodOrder[a.period] - periodOrder[b.period];
  });
}

// ─── Timeline grouping ────────────────────────────────────────────────────────

/**
 * Default trend direction per risk type for climate-change projections.
 * Used when building ScenarioProjection.trendDirection.
 */
const DEFAULT_TREND: Record<RiskTypeSlug, ScenarioProjection['trendDirection']> = {
  lluvias_extremas: 'increasing',
  calor_extremo:    'increasing',
  sequia:           'increasing',
  deslizamiento:    'increasing',
  heladas:          'variable',
  fenomeno_enso:    'variable',
  inundacion:       'increasing',
};

/**
 * Converts a ScenarioVariant (from ConsolidatedRisk) into a ScenarioProjection
 * (the ConsolidatedRiskTimeline sub-model) adding trend direction.
 */
function variantToProjection(
  variant: { narrativeText: string; impacts: string[]; confidence: ConfidenceLabel },
  riskType: RiskTypeSlug
): ScenarioProjection {
  return {
    narrative:      variant.narrativeText,
    impacts:        variant.impacts,
    confidence:     variant.confidence,
    trendDirection: DEFAULT_TREND[riskType] ?? 'variable',
  };
}

/**
 * Groups a flat ConsolidatedRisk[] into ConsolidatedRiskTimeline[] — one object
 * per unique riskType with all temporal periods nested inside.
 *
 * The flat model remains the canonical source; this is a read-only derived view
 * used by timeline-aware UI components.
 *
 * @param risks  Output of normalizeRisks()
 * @returns      One ConsolidatedRiskTimeline per unique riskType, sorted by the
 *               order in which risk types first appear in the input array.
 */
export function groupByRiskType(risks: ConsolidatedRisk[]): ConsolidatedRiskTimeline[] {
  if (!risks?.length) return [];

  const timelineMap = new Map<RiskTypeSlug, ConsolidatedRiskTimeline>();

  for (const risk of risks) {
    const { riskType } = risk;

    if (!timelineMap.has(riskType)) {
      const meta = RISK_TYPE_DISPLAY[riskType];
      timelineMap.set(riskType, {
        riskType,
        displayName:      meta?.label    ?? riskType,
        icon:             meta?.icon     ?? '⚠️',
        textColor:        meta?.textColor ?? 'text-foreground',
        evolutionSentence: buildTemporalEvolutionSentence(riskType),
        adaptationMeasures: [],
      });
    }

    const timeline = timelineMap.get(riskType)!;

    // Merge adaptation measures (deduplicate by id)
    const existingIds = new Set(timeline.adaptationMeasures.map(a => a.id));
    for (const measure of risk.adaptationMeasures) {
      if (!existingIds.has(measure.id)) {
        timeline.adaptationMeasures.push(measure);
        existingIds.add(measure.id);
      }
    }

    if (risk.period === 'historico') {
      timeline.historical = {
        narrative:  risk.narrativeText,
        impacts:    risk.impacts,
        evidence:   risk.evidence,
        confidence: risk.confidence,
      };
    } else if (risk.period === 'corto_plazo') {
      const variants = risk.scenarioVariants;
      timeline.shortTerm = {
        moderateEmissions: variants?.emisiones_moderadas
          ? variantToProjection(variants.emisiones_moderadas, riskType)
          : undefined,
        highEmissions: variants?.altas_emisiones
          ? variantToProjection(variants.altas_emisiones, riskType)
          : undefined,
      };
    } else if (risk.period === 'mediano_plazo') {
      const variants = risk.scenarioVariants;
      timeline.mediumTerm = {
        moderateEmissions: variants?.emisiones_moderadas
          ? variantToProjection(variants.emisiones_moderadas, riskType)
          : undefined,
        highEmissions: variants?.altas_emisiones
          ? variantToProjection(variants.altas_emisiones, riskType)
          : undefined,
      };
    } else if (risk.period === 'largo_plazo') {
      const variants = risk.scenarioVariants;
      timeline.longTerm = {
        moderateEmissions: variants?.emisiones_moderadas
          ? variantToProjection(variants.emisiones_moderadas, riskType)
          : undefined,
        highEmissions: variants?.altas_emisiones
          ? variantToProjection(variants.altas_emisiones, riskType)
          : undefined,
      };
    }
  }

  return [...timelineMap.values()];
}

// ─── Executive summary builder ────────────────────────────────────────────────

/**
 * Builds a hero paragraph for the NarrativeReport.
 * Deduplicates by riskType before slicing to prevent the same phenomenon
 * appearing twice ("lluvias extremas, lluvias extremas y sequía").
 * Does NOT expose raw keyMetric values.
 *
 * @deprecated Use buildOperationalExecutiveSummary from buildOperationalNarrative.ts.
 *   This function is kept for compatibility with legacy tests only.
 */
export function buildExecutiveSummary(
  risks: ConsolidatedRisk[],
  locationLabel: string,
  sectorLabel: string
): string {
  const seen = new Set<string>();
  const topRisks = risks
    .filter(r => r.confidence !== 'baja')
    .filter(r => {
      if (seen.has(r.riskType)) return false;
      seen.add(r.riskType);
      return true;
    })
    .slice(0, 3)
    .map(r => r.displayName.toLowerCase());

  if (topRisks.length === 0) {
    return `Para ${locationLabel}, el análisis no identificó riesgos climáticos de alta o media confianza en el período evaluado.`;
  }

  const riskList = topRisks.length === 1
    ? topRisks[0]
    : topRisks.slice(0, -1).join(', ') + ' y ' + topRisks[topRisks.length - 1];

  const adaptCount = risks.flatMap(r => r.adaptationMeasures).length;
  const adaptSentence = adaptCount > 0
    ? ` Se identificaron ${adaptCount} medidas de adaptación prioritarias.`
    : '';

  return (
    `Para ${locationLabel}, el análisis identifica ${riskList} como los principales` +
    ` riesgos para las operaciones de ${sectorLabel}.` +
    adaptSentence
  );
}
