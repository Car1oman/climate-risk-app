import { z } from "zod";

// El sistema es exclusivamente para Perú por decisión de producto — no es una
// limitación temporal de MVP. Bbox aproximado según extremos geográficos IGN
// (norte ~-0.03, sur ~-18.35, oeste ~-81.33, este ~-68.66), con margen de tolerancia.
export const PERU_BBOX = { latMin: -18.5, latMax: 0.2, lonMin: -81.5, lonMax: -68.5 };

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  elevation: z.number().optional(),
  location_name: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
}).refine(
  loc =>
    loc.lat >= PERU_BBOX.latMin && loc.lat <= PERU_BBOX.latMax &&
    loc.lon >= PERU_BBOX.lonMin && loc.lon <= PERU_BBOX.lonMax,
  {
    error: ctx =>
      `Ubicación (lat=${ctx.input.lat}, lon=${ctx.input.lon}) fuera del alcance geográfico de la plataforma. El sistema cubre exclusivamente Perú (lat [${PERU_BBOX.latMin}, ${PERU_BBOX.latMax}], lon [${PERU_BBOX.lonMin}, ${PERU_BBOX.lonMax}]).`,
  }
);

export const AuthoritativeSourcesSchema = z.object({
  sources: z.record(z.object({
    authoritative: z.string().min(1),
    domain: z.string().min(1),
  }).passthrough()).refine(s => Object.keys(s).length > 0, { message: "sources cannot be empty" }),
}).passthrough();

export const SUPPORTED_SECTORS = ["retail", "agriculture", "finance", "energy", "infrastructure", "default"];
export const SectorEnum = z.enum(SUPPORTED_SECTORS);

export const CoverageActionEnum = z.enum(["direct", "nearest_neighbor", "interpolated", "out_of_coverage"]);
// Adapters (RawSourceResponseSchema) only ever emit available/out_of_coverage/
// failed. "partial" (a multivariate source where some but not all variables
// are in range, HALLAZGO-7) and "unknown" (a source whose variables need a
// distance model but got none, HALLAZGO-8 — fail-closed, not "assumed ok")
// are Stage02/Stage03-only values (SourceDecisionSchema), included here
// since both schemas share this enum.
export const CoverageStatusEnum = z.enum(["available", "partial", "out_of_coverage", "unknown", "failed"]);
export const AuthorityLevelEnum = z.enum(["primary", "complementary"]);
export const PipelineStatusEnum = z.enum(["pending", "running", "completed", "partial", "failed"]);
// H-07 (documentacion-v2/stage-04, ALTO): "static" añadido — ninguno de los
// 4 valores originales describe correctamente un campo fijo no estocástico o
// una estadística de línea base ya agregada (elevación, índices climate_cells,
// banda CMIP6 "_historico", indicadores socioeconómicos anuales). El código
// previo forzaba estos casos a "categorical" (elevation.includes("elevation")
// => "categorical"), que H-07 señala explícitamente como incorrecto: la
// elevación es un dato geofísico continuo, no un estado discreto/cualitativo.
// Ver pipeline/config/signal-taxonomy.json para el mapeo completo y su
// justificación por variable.
//
// H-18 (documentacion-v2/stage-04, BAJO): "trend" fue eliminado del enum
// porque TrendDetector (stage-04-signals.md) requiere una serie temporal
// multi-observación que ninguna variable canónica actual proporciona — el
// pipeline procesa variables como snapshots puntuales por ejecución. Si en
// el futuro se agregan variables con series históricas multi-fecha, se
// implementará trend-detector.js (tasks.md T027, pendiente) y se
// re-agregará "trend" al enum.
export const SignalTypeEnum = z.enum(["anomaly", "categorical", "projected", "static"]);
export const PhenomStatusEnum = z.enum(["active", "projected", "historical", "not_detected"]);
export const RiskLevelEnum = z.enum(["bajo", "medio", "alto", "catastrofico"]);
export const RiskClassEnum = z.enum(["operativo", "estrategico"]);
export const HorizonEnum = z.enum(["corto", "mediano", "largo"]);
export const ExposureLevelEnum = z.enum(["baja", "media", "alta", "sin_datos"]);
export const MeasureTypeEnum = z.enum(["estructural", "naturaleza", "gestion", "financiera"]);
export const StageStatusEnum = z.enum(["success", "partial", "failed"]);

// spatial_distance_km: distance in km between the queried point and the
// effective spatial support (station / grid node / pixel) that produced the
// returned value. It is the physical `d` consumed by this project's
// exponential spatial decorrelation model, rho(d) = exp(-d/L), theta=0.5
// (Isaaks & Srivastava 1989; pipeline/config/spatial-decorrelation.json),
// evaluated in Stage 02 evaluateCoverage() and Stage 03 _scoreSources() /
// _deriveCoverageAction(). Adapters should set the best available estimate:
// a real computed distance when known (e.g. supabase_climate_cells), or a
// conservative geometric proxy when the source's exact sampling point isn't
// disclosed (half native grid-cell width for regular grids; declared vendor
// resolution for undisclosed interpolation methods). Use `null` only for
// domains outside the exponential model's scope — country-level, basin-index,
// or categorical sources (see the `non_stochastic` section of
// spatial-decorrelation.json), where representativeness isn't distance-based.
export const RawSourceResponseSchema = z.object({
  source_name: z.string(),
  source_domain: z.string(),
  authority_level: AuthorityLevelEnum,
  request: z.object({
    endpoint: z.string(),
    params: z.record(z.unknown()),
    timestamp: z.string(),
  }),
  response: z.unknown().nullable(),
  status_code: z.number().int(),
  duration_ms: z.number().int().nonnegative(),
  error: z.string().nullable().default(null),
  coverage_status: CoverageStatusEnum,
  spatial_distance_km: z.number().nullable().default(null),
  resolution_native: z.string().nullable().default(null),
});

// HALLAZGO-13: rewritten 2026-07-14 against Stage02Validation's actual
// output (pipeline/stages/02-validation/index.js), not the pre-existing
// aspirational shape — that version required a "not_available" result value
// no rule produces since HALLAZGO-6 removed validateClimatologicalLimit (the
// only rule that ever emitted it), and ValidatedRecordSchema required
// fill_values_detected/null_fields_detected/warnings fields buildResult()
// has never populated. .passthrough() on ValidationResultSchema because each
// rule (fill_value_detection, physical_range_validation, completeness, …)
// attaches its own extra diagnostic fields (reference, range_issues,
// completeness_pct, thresholds_used, …) beyond the common rule/result/detail
// core — enumerating every rule's exact shape here would be as brittle as
// what this fix is replacing.
export const ValidationResultSchema = z.object({
  rule: z.string(),
  result: z.enum(["pass", "fail", "warning"]),
  detail: z.string(),
}).passthrough();

export const ValidatedRecordSchema = z.object({
  source: z.string(),
  overall_status: z.enum(["passed", "warning", "failed"]),
  is_valid: z.boolean(),
  validation_results: z.array(ValidationResultSchema),
  summary: z.object({
    total_checks: z.number().int(),
    passed: z.number().int(),
    warnings: z.number().int(),
    failed: z.number().int(),
    completeness_pct: z.number().nullable(),
  }),
});

export const SpatialTraceConfidenceEnum = z.enum(["exact", "unavailable"]);

export const CanonicalMethodologySchema = z.object({
  computation_method: z.string(),
  scientific_rationale: z.string(),
  references: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  completeness_ratio: z.number().min(0).max(1),
  validity_score: z.number().min(0).max(1).optional(),
  completeness_threshold: z.number(),
  completeness_threshold_reference: z.string(),
  completeness_threshold_status: z.enum(["passed", "degraded"]),
  correction_applied: z.boolean().optional(),
  mcar_test: z.object({
    tested: z.boolean(),
    reason: z.string().optional(),
    runs: z.number().optional(),
    expected_runs: z.number().optional(),
    z: z.number().optional(),
    p_value: z.number().optional(),
    pattern: z.enum(["consistent_with_random", "clustered", "alternating"]).optional(),
  }).optional(),
  ensemble_weighting_comparison: z.array(z.object({
    scheme: z.string(),
    value: z.number().nullable(),
    delta_abs: z.number().nullable(),
    delta_pct: z.number().nullable(),
  })).optional(),
  fill_values_source_registered: z.boolean().optional(),
  reference_status: z.string().optional(),
}).passthrough();

export const SourceDecisionSchema = z.object({
  domain: z.string(),
  selected_source: z.string(),
  selection_score: z.number(),
  selection_components: z.object({
    completeness: z.number(),
    proximity: z.number(),
    resolution_m: z.number().nullable(),
    resolution_score: z.number().nullable(),
  }),
  selection_rationale: z.string(),
  gated: z.boolean(),
  sensitivity: z.object({
    applicable: z.boolean(),
    reason: z.string().optional(),
    dimensions_used: z.array(z.string()).optional(),
    weight_scheme: z.string().optional(),
    vertices: z.array(z.object({
      dimension: z.string(),
      winner: z.string(),
      value: z.number(),
    })).optional(),
    winner_stable: z.boolean().optional(),
    interpretation: z.string().optional(),
  }),
  authority_level: AuthorityLevelEnum,
  completeness_pct: z.number().nullable(),
  coverage_status: CoverageStatusEnum,
  spatial_distance_km: z.number().nullable(),
  resolution_native: z.string().nullable(),
  total_sources_evaluated: z.number(),
  discarded_sources: z.array(z.object({
    source: z.string(),
    score: z.number().nullable(),
    reasons: z.array(z.string()),
    authority_level: AuthorityLevelEnum,
    completeness_pct: z.number().nullable(),
    coverage_status: CoverageStatusEnum,
    resolution_m: z.number().nullable().optional(),
  })),
});

export const DataTimeRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
}).nullable();

export const CanonicalVariableSchema = z.object({
  name: z.string(),
  unit: z.string(),
  value: z.any(),
  source: z.string(),
  source_authority: AuthorityLevelEnum,
  coverage_action: CoverageActionEnum,
  spatial_info: z.object({
    lat_used: z.number().nullable(),
    lon_used: z.number().nullable(),
    spatial_trace_confidence: SpatialTraceConfidenceEnum,
    distance_km: z.number().optional().nullable(),
    resolution: z.string().optional().nullable(),
  }),
  data_time_range: DataTimeRangeSchema,
  processing_timestamp: z.string(),
  methodology: CanonicalMethodologySchema,
});

// Each component carries its computed value AND the reason it was computed
// or excluded (coverage_spatial-methodology.md §7 "Safeguard 1" — explicit
// null tracking, generalized to all 5 components by H-01's fix). `value` is
// nullable: a component whose methodology genuinely doesn't apply to this
// source (e.g. no decorrelation length registered for a variable) is
// excluded from the weighted average rather than backfilled with a
// fabricated number — see components_excluded below.
export const SourceQualityComponentSchema = z.object({
  value: z.number().min(0).max(1).nullable(),
  reason: z.string(),
});

export const SourceQualitySchema = z.object({
  score: z.number().min(0).max(1).nullable(),
  components: z.object({
    coverage_spatial: SourceQualityComponentSchema,
    coverage_temporal: SourceQualityComponentSchema,
    completeness: SourceQualityComponentSchema,
    resolution: SourceQualityComponentSchema,
    proximity: SourceQualityComponentSchema,
  }),
  weights_applied: z.record(z.number()),
  total_weight_used: z.number(),
  components_excluded: z.array(z.object({
    component: z.string(),
    reason: z.string(),
  })).optional(),
});

// H-02 (documentacion-v2/stage-04, CRÍTICO): signal_strength ahora se calcula
// por detector específico al tipo de variable (categorical/projection/
// anomaly/baseline_or_static/unclassified — ver confidence.js
// calculateSignalStrength), no con una única fórmula universal. Cada
// componente lleva su valor Y la razón por la que se calculó o se excluyó
// (mismo patrón de SourceQualityComponentSchema/H-01) — un componente sin
// línea base o serie pareada disponible se excluye explícitamente en vez de
// aproximarse con un número sin metodología.
export const SignalStrengthComponentSchema = z.object({
  value: z.number().min(0).max(1).nullable(),
  reason: z.string().nullable(),
});

export const SignalStrengthDetectorEnum = z.enum([
  "categorical", "projection", "anomaly", "baseline_or_static", "unclassified",
]);

export const SignalStrengthSchema = z.object({
  score: z.number().min(0).max(1).nullable(),
  label: z.enum(["high", "medium", "low", "not_available"]),
  detector: SignalStrengthDetectorEnum,
  components: z.object({
    anomaly_magnitude: SignalStrengthComponentSchema,
    temporal_persistence: SignalStrengthComponentSchema,
    cross_period_consistency: SignalStrengthComponentSchema,
    projected_change: SignalStrengthComponentSchema,
  }),
});

// H-08 (documentacion-v2/stage-04, ALTO): anomaly_value estaba siempre en
// null — nunca calculado. Ahora expone el Δ físico crudo ("valor_actual -
// media_histórica", en la unidad propia de la variable — anomaly_unit) que
// AnomalyDetector/ProjectionDetector ya calculan internamente en
// confidence.js para anomaly_magnitude/projected_change, pero antes solo
// dejaban dentro del texto de `reason` sin exponer como campo numérico.
// anomaly_value_reason explica por qué es null cuando lo es (sin línea base
// pareada, o variable categórica/estática sin Δ que calcular) — mismo patrón
// "no fabricar, explicar el hueco" que el resto de este archivo.
export const ClimateSignalSchema = z.object({
  signal_id: z.string().uuid(),
  name: z.string(),
  type: SignalTypeEnum,
  value: z.any(),
  source_variables: z.array(z.string()),
  source_quality: SourceQualitySchema,
  signal_strength: SignalStrengthSchema,
  anomaly_value: z.number().optional().nullable(),
  anomaly_value_reason: z.string().optional().nullable(),
  anomaly_unit: z.string().optional().nullable(),
  rules_applied: z.array(z.string()),
});

// H-04 (documentacion-v2/stage-04, CRÍTICO): stage-04-signals.md declara
// signals_discarded: {name, strength, reason}[] con `strength: number`, pero
// una señal puede descartarse por dos motivos distintos — strength medido y
// por debajo de min_signal_strength (strength es un number), o strength no
// calculable en absoluto (H-02: sin línea base/serie pareada — strength es
// null, no 0, porque "desconocido" no es "cero"). `strength` se declara
// nullable aquí para que el tipo refleje ambos casos honestamente en vez de
// forzar el segundo a encajar en el primero.
export const SignalDiscardedSchema = z.object({
  name: z.string(),
  strength: z.number().min(0).max(1).nullable(),
  reason: z.string(),
});

export const ClimatePhenomenonSchema = z.object({
  phenomenon_id: z.string().uuid(),
  name: z.string(),
  status: PhenomStatusEnum,
  confidence: z.object({
    source_quality: z.number(),
    signal_strength: z.number(),
    combined: z.number(),
  }),
  contributing_signals: z.array(z.string().uuid()),
  scenario: z.string().optional().nullable(),
  horizon: HorizonEnum.optional().nullable(),
});

export const ExposureSchema = z.object({
  phenomenon_id: z.string().uuid(),
  level: ExposureLevelEnum,
  factors: z.array(z.string()),
  context_variables_used: z.array(z.string()),
});

export const ProbabilityInfoSchema = z.object({
  value: z.number().int().min(1).max(5),
  source: z.enum(["external", "calculated"]),
  external_source: z.string().optional().nullable(),
  justification: z.string(),
});

export const AdaptiveCapacitySchema = z.object({
  score: z.number().min(1).max(5),
  indicators_used: z.array(z.string()),
  justification: z.string(),
});

export const RiskAssessmentSchema = z.object({
  risk_id: z.string().uuid(),
  phenomenon_id: z.string().uuid(),
  scenario: z.string(),
  horizon: HorizonEnum,
  probability: ProbabilityInfoSchema,
  impact: z.object({
    value: z.number().int().min(1).max(5),
    components: z.object({
      exposure: z.number(),
      sensitivity: z.number(),
      adaptive_capacity: z.number(),
    }),
    justification: z.string(),
  }),
  adaptive_capacity: AdaptiveCapacitySchema,
  risk_score_raw: z.number(),
  risk_level: RiskLevelEnum,
  risk_classification: RiskClassEnum,
});

export const AdaptationMeasureSchema = z.object({
  measure_id: z.string().uuid(),
  risk_id: z.string().uuid(),
  description: z.string(),
  type: MeasureTypeEnum,
  priority: z.enum(["baja", "media", "alta"]),
  urgency: z.string(),
  feasibility: z.string(),
  co_benefits: z.array(z.string()),
  impact_reduction: z.string(),
});

export const StageArtifactSchema = z.object({
  stage_id: z.number().int(),
  stage_name: z.string(),
  input: z.any(),
  output: z.any(),
  rules_applied: z.array(z.string()),
  duration_ms: z.number().int(),
  status: StageStatusEnum,
  error: z.any().optional().nullable(),
});

export const EvidenceArtifactSchema = z.object({
  artifact_id: z.string().uuid(),
  execution_id: z.string().uuid(),
  version: z.string(),
  created_at: z.string(),
  pipeline_summary: z.object({
    total_stages: z.number(),
    passed: z.number(),
    partial: z.number(),
    failed: z.number(),
    overall: StageStatusEnum,
  }),
  stages: z.array(StageArtifactSchema),
  final_result: z.array(RiskAssessmentSchema),
  narratives: z.object({
    executive: z.string(),
    analyst: z.string().optional(),
  }),
  rules_applied: z.array(z.string()),
});

export const PipelineExecutionSchema = z.object({
  execution_id: z.string().uuid(),
  location: LocationSchema,
  sector: z.string(),
  timestamp: z.string(),
  status: PipelineStatusEnum,
  source_count_total: z.number().int(),
  source_count_success: z.number().int(),
  source_count_failed: z.number().int(),
  source_count_out_of_coverage: z.number().int(),
  duration_ms: z.number().int(),
});

export const SectorProfileSchema = z.object({
  sector_id: z.string(),
  signal_to_impact_mapping: z.array(z.object({
    signal: z.string(),
    impact: z.string(),
    sensitivity: z.number(),
  })),
  default_adaptive_capacity: z.number(),
  sensitivity_factors: z.array(z.string()),
});

export const BusinessImpactSchema = z.object({
  sector: z.string(),
  signal: z.string(),
  description: z.string(),
  financial_impact_estimate: z.string().optional(),
});
