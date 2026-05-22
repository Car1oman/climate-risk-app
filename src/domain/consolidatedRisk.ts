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
  risks: ConsolidatedRisk[];
  sectorLabel: string;
  analysisDate: string;
  primaryScenario: ScenarioLabel;
  confidence: ConfidenceLabel;
}
