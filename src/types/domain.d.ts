// Shared domain types for frontend and consumed by server via JSDoc imports.

// ─── Infrastructure entities ──────────────────────────────────────────────────

export interface AssetLocation {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  country?: string;
  region?: string;
}

export interface Asset {
  id: string;
  name: string;
  type?: string;
  location: AssetLocation;
  value?: number;
  currency?: string;
  area?: number;
  owner?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  assetId?: string;
  riskType?: string;
  timestamp: string;
  acknowledged?: boolean;
  source?: string;
}

export interface Document {
  id: string;
  title: string;
  type: string;
  url?: string;
  content?: string;
  summary?: string;
  uploadedAt: string;
  source?: string;
  tags?: string[];
  assetIds?: string[];
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  requestId?: string;
}

export interface PaginatedResponse<T = unknown> extends APIResponse<T[]> {
  total?: number;
  page?: number;
  pageSize?: number;
}

// ─── Scientific domain taxonomy ───────────────────────────────────────────────

/**
 * Canonical signal type identifiers.
 * Defined authoritatively in server/scientific/domain.js SIGNAL_TAXONOMY.
 */
export type SignalType =
  | 'extreme_heat'
  | 'severe_heat'
  | 'tropical_nights'
  | 'temp_increase'
  | 'drought'
  | 'extreme_rain'
  | 'flood_risk'
  | 'landslide_susceptibility'
  | 'huayco_risk'
  | 'enso_phase';

/** Broad thematic grouping of signal types. */
export type SignalCategory =
  | 'temperature'
  | 'precipitation'
  | 'hydrology'
  | 'terrain'
  | 'climate_mode';

/** Whether a signal value comes from observations or a climate model projection. */
export type ObservationMode = 'observed' | 'projected';

/** Temporal horizon identifiers aligned with CMIP6 period keys. */
export type TemporalHorizon =
  | 'historical'
  | 'short_term'
  | 'mid_term'
  | 'long_term';

/** Shared Socioeconomic Pathway scenario designations. */
export type SSPScenario =
  | 'SSP1-2.6'
  | 'SSP2-4.5'
  | 'SSP5-8.5'
  | 'N/A';

/** Three-tier confidence classification aligned with IPCC AR6 likelihood language. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Validation status of a dataset or signal relative to observational baselines. */
export type ValidationStatus = 'validated' | 'provisional' | 'experimental';

// ─── Entity 1: UncertaintyMetadata ───────────────────────────────────────────

/**
 * Quantifies and describes the uncertainty associated with a climate signal value.
 * Ensemble percentile spread (p10/p90) is the primary form for CMIP6 signals.
 */
export interface UncertaintyMetadata {
  /** Statistical method used to characterize spread. */
  spread_type:
    | 'ensemble_percentile'
    | 'model_agreement'
    | 'threshold_based'
    | 'none';
  /** 10th percentile of the model ensemble for the indicator value. Null if unavailable. */
  p10: number | null;
  /** 90th percentile of the model ensemble for the indicator value. Null if unavailable. */
  p90: number | null;
  /** Human-readable description of the spread or limitations of uncertainty quantification. */
  spread_note: string;
  /** Number of GCMs contributing to the ensemble. Null for non-ensemble sources. */
  model_count: number | null;
}

// ─── Entity 2: ScientificEvidence ────────────────────────────────────────────

/**
 * Full provenance record for a dataset or observational source.
 * Satisfies FASE D requirements: dataset, institution, citation,
 * temporal coverage, spatial resolution, scientific validity, limitations.
 */
export interface ScientificEvidence {
  /** Short identifier key (e.g. 'CMIP6_CCKP', 'GRI_OXFORD'). */
  id: string;
  /** Human-readable dataset name with version. */
  dataset: string;
  /** Producing institution or consortium. */
  institution: string;
  /** Bibliographic or data citation. */
  citation: string;
  /** Temporal span covered by the dataset. */
  temporal_coverage: {
    start_year: number;
    end_year?: number;
    label: string;
  };
  /** Native spatial resolution of the dataset (e.g. '~25 km', '30 m'). */
  spatial_resolution: string;
  /** Validation status relative to observational benchmarks. */
  scientific_validity: ValidationStatus;
  /** Known limitations affecting interpretation at this location or scale. */
  limitations: string[];
}

// ─── Entity 3: ClimateSignal ──────────────────────────────────────────────────

/**
 * Standard structure for any detected climate signal.
 * Implements FASE B canonical fields; all signals from Layer2 conform to this shape.
 */
export interface ClimateSignal {
  // ── FASE B canonical fields ────────────────────────────────────────────────
  signal_type: SignalType;
  category: SignalCategory;
  observed_or_projected: ObservationMode;
  /** Projected (or current observed) value of the primary indicator. */
  value: number | null;
  /** Physical unit of the value (e.g. 'days/year', '°C', 'mm', 'probability'). */
  unit: string;
  temporal_window: TemporalHorizon;
  scenario: SSPScenario;
  /** Short name of the originating data source (e.g. 'CMIP6 CCKP', 'NOAA CPC'). */
  source: string;
  confidence: ConfidenceLevel;
  uncertainty: UncertaintyMetadata;
  /** Scientific threshold definition that was exceeded or assessed. */
  threshold_reference: string;
  /** Geographic scope of the underlying data (e.g. '~25 km grid cell'). */
  geographic_scope: string;

  // ── Extended Layer2 fields (backward-compatible) ───────────────────────────
  /** Internal CMIP6 variable code (e.g. 'hd35', 'rx5day', 'tr'). */
  indicator?: string;
  /** Historical baseline value for the indicator. */
  historical?: number | null;
  /** Projected future value for the indicator. */
  projected?: number | null;
  /** Absolute difference (projected − historical). */
  delta?: number | null;
  /** Percentage difference relative to historical baseline. */
  delta_pct?: number | null;
  /** Legacy horizon key used by Layer2 (maps 1:1 to temporal_window). */
  horizon?: TemporalHorizon;
  /** Whether the signal value crosses the scientific threshold. */
  exceeds_threshold?: boolean;
  /** Full provenance and uncertainty record attached by Layer2. */
  source_traceability?: SignalTraceability;
}

/** Full source traceability object attached to each signal by Layer2. */
export interface SignalTraceability {
  source_origin: string;
  climate_variable: string;
  temporal_period: string;
  temporal_period_label: string;
  scenario_ssp: string;
  threshold_applied: string;
  transformation_applied: string;
  confidence_level: ConfidenceLevel;
  responsible_endpoint: string;
  provenance_badges: string[];
  climate_model_badge: string;
  // FASE A fields
  source: string;
  dataset: string;
  model: string;
  SSP: string;
  temporal_window: string;
  confidence: ConfidenceLevel;
  validation_status: ValidationStatus;
  // FASE B fields
  uncertainty_spread: UncertaintyMetadata | null;
  confidence_text: string;
  scientific_disclaimer: string;
}

// ─── Entity 4: HistoricalEvent ────────────────────────────────────────────────

/**
 * Observed climate indicator value over the historical baseline period.
 * Typically derived from CMIP6 historical runs (1980–2014).
 */
export interface HistoricalEvent {
  signal_type: SignalType;
  /** Internal variable code (e.g. 'hd35', 'rx5day'). */
  indicator: string;
  /** Label describing the observation period (e.g. '1980–2014 CMIP6 historical'). */
  period: string;
  /** Observed or modeled baseline value. */
  value: number | null;
  unit: string;
  source: string;
  evidence: ScientificEvidence;
}

// ─── Entity 5: ClimateProjection ─────────────────────────────────────────────

/**
 * Model-derived future value for a climate indicator under a specific scenario and horizon.
 */
export interface ClimateProjection {
  signal_type: SignalType;
  indicator: string;
  temporal_window: TemporalHorizon;
  scenario: SSPScenario;
  /** Projected median value for the indicator in the target period. */
  value: number | null;
  unit: string;
  /** Absolute change relative to historical baseline. */
  delta: number | null;
  /** Percentage change relative to historical baseline. */
  delta_pct: number | null;
  uncertainty: UncertaintyMetadata;
  evidence: ScientificEvidence;
}

// ─── Entity 6: TopographicContext ────────────────────────────────────────────

/**
 * Static terrain intelligence derived from SRTM 30m and slope analysis.
 * Does not change with climate scenario; updated only when terrain data changes.
 */
export interface TopographicContext {
  elevation_m: number | null;
  slope_degrees: number | null;
  /** General terrain classification (e.g. 'coastal plain', 'andean foothills'). */
  terrain_type: string;
  landslide_susceptibility: 'none' | 'low' | 'moderate' | 'high' | 'very_high';
  huayco_susceptibility: 'none' | 'low' | 'moderate' | 'high' | 'very_high';
  drainage_basin?: string;
  distance_to_water_km?: number | null;
  /** Data source identifier (e.g. 'NASA SRTM 30m v3'). */
  source: string;
  /** Spatial resolution of the underlying terrain data. */
  resolution: string;
}

// ─── Entity 7: NarrativeFragment ─────────────────────────────────────────────

/**
 * A structured narrative text block tied to a specific analysis section.
 * Generated by Layer6 from real numeric signal data — never templated.
 */
export interface NarrativeFragment {
  /** Section of the analysis this fragment describes. */
  section:
    | 'overview'
    | 'signals'
    | 'projections'
    | 'adaptation'
    | 'uncertainty';
  /** Full narrative text in the target language. */
  content: string;
  /** List of signal_type or evidence IDs that anchor the narrative content. */
  data_basis: string[];
  confidence: ConfidenceLevel;
}

// ─── Entity 8: AdaptationMeasure ─────────────────────────────────────────────

/**
 * A concrete adaptation action mapped to a specific signal type.
 * Sourced from IPCC AR6 WG2 Chapter 17 and TCFD Retail Guidance.
 */
export interface AdaptationMeasure {
  /** Stable identifier (e.g. 'extreme_heat_hvac_upgrade'). */
  id: string;
  signal_type: SignalType;
  nombre: string;
  descripcion: string;
  donde_impacta: string;
  horizonte_implementacion: 'inmediato' | 'corto' | 'mediano' | 'largo';
  costo_estimado_rango: { min_usd: number; max_usd: number };
  efectividad: 'baja' | 'media' | 'alta';
  /** Bibliographic reference (e.g. 'IPCC AR6 WG2 Ch.17', 'TCFD Retail Guidance 2023'). */
  reference?: string;
}

// ─── API response shape (v2) ──────────────────────────────────────────────────

/** Shape of the primary POST /api/v2/climate-risk-analysis response body. */
export interface ClimateAnalysisResponse {
  location: AssetLocation & { distance_km?: number };
  signals: ClimateSignal[];
  risks: unknown[];
  adaptations: AdaptationMeasure[];
  narrative: string | NarrativeFragment[];
  confidence: ConfidenceLevel;
  evidence: ScientificEvidence[];
  scenario: SSPScenario | string;
  provenance: Record<string, unknown>;
  uncertainty: UncertaintyMetadata | Record<string, UncertaintyMetadata>;
  gri_hazards: unknown[];
  territorial: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
