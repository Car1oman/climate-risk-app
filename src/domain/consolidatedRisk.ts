// Canonical domain model for deduplicated climate risk representation.
// One phenomenon → one ConsolidatedRisk.  Assembled by normalizeRisks().

// ─── Core vocabulary ──────────────────────────────────────────────────────────

/**
 * Seven canonical risk slugs that cover all phenomena present in the Peru
 * climate dataset.  Every signal / GRI hazard / contextual risk must map to
 * one of these before reaching the UI.
 */
export type RiskTypeSlug =
  | 'lluvias_extremas'
  | 'calor_extremo'
  | 'sequia'
  | 'deslizamiento'
  | 'heladas'
  | 'fenomeno_enso'
  | 'inundacion';

/**
 * Temporal classification aligned with CMIP6 horizon keys.
 * 'historico' is reserved for past-observation entries.
 */
export type TemporalPeriod =
  | 'historico'
  | 'corto_plazo'
  | 'mediano_plazo'
  | 'largo_plazo';

/** Human-readable scenario slug (SSP internals stripped). */
export type ScenarioLabel =
  | 'emisiones_moderadas'
  | 'altas_emisiones'
  | 'bajas_emisiones'
  | null;

/** IPCC likelihood language mapped to Spanish. */
export type ConfidenceLabel = 'alta' | 'media' | 'baja';

/** Validation status exposed to the UI (Spanish). */
export type ValidationStatusLabel = 'validado' | 'provisional';

// ─── Sub-entities ─────────────────────────────────────────────────────────────

/** Minimal provenance record surfaced per ConsolidatedRisk. */
export interface EvidenceRef {
  /** Human-readable source name: "CMIP6 — Banco Mundial CCKP". */
  sourceLabel: string;
  /** Period description: "2040–2059" or "presente". */
  period: string;
  validationStatus: ValidationStatusLabel;
}

/** Adaptation measure distilled to the minimum needed for the UI. */
export interface AdaptationSummary {
  id: string;
  /** E.g. "Sistemas de drenaje mejorado". */
  name: string;
  timeframe: 'inmediato' | 'corto' | 'mediano' | 'largo';
  effectiveness: 'alta' | 'media' | 'baja';
}

/**
 * Per-scenario variant data for a projection period.
 * Populated for 'mediano_plazo' and 'largo_plazo' periods only.
 * Enables real differences in narrative text and impacts when the
 * user switches between emission scenarios.
 */
export interface ScenarioVariant {
  /** Scenario-specific plain-language narrative.  No IPCC codes. */
  narrativeText: string;
  /** Scenario-specific operational impacts (higher severity for altas_emisiones). */
  impacts: string[];
  /** Confidence may differ between scenarios. */
  confidence: ConfidenceLabel;
}

// ─── Primary model ────────────────────────────────────────────────────────────

/**
 * One entry per (riskType × period) pair — the unit of display in the
 * consolidated UI.  All deduplication logic lives in normalizeRisks().
 */
export interface ConsolidatedRisk {
  /** Deterministic key: `${riskType}_${period}`.  Safe as React list key. */
  id: string;
  riskType: RiskTypeSlug;
  /** Display-ready name: "Lluvias extremas". */
  displayName: string;
  period: TemporalPeriod;
  scenario: ScenarioLabel;
  confidence: ConfidenceLabel;
  /** Plain-language paragraph describing the risk.  No jargon. */
  narrativeText: string;
  /** E.g. "78 mm/día de precipitación máxima diaria".  Null if no value. */
  keyMetric: string | null;
  /** Bullet-ready impact strings in Spanish. */
  impacts: string[];
  evidence: EvidenceRef[];
  adaptationMeasures: AdaptationSummary[];
  /** Internal: which API sources contributed to this entry. */
  rawSources: ('signals' | 'risks' | 'gri')[];
  /**
   * Per-scenario variants for projection periods (mediano_plazo, largo_plazo).
   * Empty object for 'historico'.  Populated by normalizeRisks() via
   * buildScenarioVariants() in buildOperationalNarrative.ts.
   */
  scenarioVariants: Partial<Record<'emisiones_moderadas' | 'altas_emisiones', ScenarioVariant>>;
}

// ─── Timeline-oriented derived models ────────────────────────────────────────
//
// ConsolidatedRiskTimeline groups all temporal periods for a single phenomenon
// into one object.  It is derived from ConsolidatedRisk[] by groupByRiskType()
// in normalizeRisks.ts.  The flat ConsolidatedRisk[] remains the primary model.

/**
 * A single (scenario × period) projection snapshot with trend direction.
 * Populated for mediumTerm and longTerm — not for historical data.
 */
export interface ScenarioProjection {
  /** Plain-language narrative — no IPCC codes. */
  narrative: string;
  /** Bullet-ready operational impact strings. */
  impacts: string[];
  confidence: ConfidenceLabel;
  /**
   * Direction of projected change relative to historical baseline.
   * Used to render trend arrows in the timeline UI.
   */
  trendDirection: 'increasing' | 'decreasing' | 'stable' | 'variable';
}

/**
 * Full timeline for a single climate phenomenon across all temporal periods.
 * One ConsolidatedRiskTimeline per riskType — regardless of how many periods
 * exist in the ConsolidatedRisk[] flat list.
 *
 * Computed by groupByRiskType(risks, meta) in normalizeRisks.ts.
 */
export interface ConsolidatedRiskTimeline {
  riskType: RiskTypeSlug;
  displayName: string;
  /** Emoji icon from RISK_TYPE_DISPLAY. */
  icon: string;
  /** Tailwind text color class from RISK_TYPE_DISPLAY. */
  textColor: string;
  /** One sentence describing how the phenomenon evolves over time. */
  evolutionSentence: string;

  /** Observations from 1980–2014.  Optional — may be absent if no historical data. */
  historical?: {
    narrative: string;
    impacts: string[];
    evidence: EvidenceRef[];
    confidence: ConfidenceLabel;
  };

  /** Projections for 2040–2059.  Optional — may be absent. */
  mediumTerm?: {
    moderateEmissions?: ScenarioProjection;
    highEmissions?: ScenarioProjection;
  };

  /** Projections for 2060–2079.  Optional — may be absent. */
  longTerm?: {
    moderateEmissions?: ScenarioProjection;
    highEmissions?: ScenarioProjection;
  };

  /** Aggregated adaptation measures from all periods. */
  adaptationMeasures: AdaptationSummary[];
}

// ─── Report-level model ───────────────────────────────────────────────────────

/**
 * Top-level result of the normalization pipeline.
 * Replaces the raw ClimateAnalysisResponse for all narrative UI components.
 */
export interface NarrativeReport {
  locationLabel: string;
  /** Hero paragraph synthesizing all risks in plain Spanish. */
  executiveSummary: string;
  /** Plain-language paragraph for past observations. Empty string if no historical risks. */
  historicalNarrative: string;
  /** Plain-language paragraph for mid-term projections (2040–2059). */
  midTermNarrative: string;
  /** Plain-language paragraph for long-term projections (2060–2079). */
  longTermNarrative: string;
  risks: ConsolidatedRisk[];
  sectorLabel: string;
  analysisDate: string;
  primaryScenario: ScenarioLabel;
  confidence: ConfidenceLabel;
}
