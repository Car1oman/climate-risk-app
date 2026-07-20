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

// Escenarios climáticos soportados. Solo 2: los únicos 2 que
// supabase_climate_cells expone como bloques de proyección explícitos
// (ensemble-all-ssp245_*, ensemble-all-ssp585_*) — ver
// 03-normalization/index.js _extractVariablesFromSource(). No es una
// selección de conveniencia: openmeteo_cmip6 (la otra fuente de proyección
// de este pipeline) no tiene NINGUNA dimensión de escenario, así que "ssp245"
// y "ssp585" no son 2 de N escenarios posibles — son los 2 únicos que el
// sistema puede respaldar con datos reales hoy. Default "ssp245" (emisiones
// moderadas) por ser el escenario de referencia ya usado como default
// implícito en el resto del pipeline (Layer1_ClimateDataFusion.js v1, y la
// selección de RCP intermedio como caso base en la literatura IPCC AR6).
export const SUPPORTED_SCENARIOS = ["ssp245", "ssp585"];
export const ScenarioEnum = z.enum(SUPPORTED_SCENARIOS);
// Etiquetas de negocio — nunca mostrar el código SSP crudo en UI (mismo
// principio que server/ai/scientificValidator.js RAW_SSP_CODE ya aplica del
// lado de la IA).
export const SCENARIO_LABELS = {
  ssp245: "Emisiones moderadas",
  ssp585: "Altas emisiones",
};

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

// Fenómenos climáticos válidos del sistema — fuente única de verdad:
// pipeline/config/phenomenon-definitions.json
export const PhenomenonNameEnum = z.enum([
  "ola_de_calor", "ola_de_frio", "sequia", "inundacion",
  "el_nino", "la_nina", "vientos_fuertes", "deslizamiento", "huayco",
]);

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
  // Solo presente (no-null) cuando la variable proviene de un bloque de
  // proyección con escenario explícito en la fuente (hoy: bloques
  // ensemble-all-sspXXX de supabase_climate_cells). null para observaciones
  // actuales, líneas base históricas, y proyecciones de fuentes sin
  // dimensión de escenario (openmeteo_cmip6) — no se infiere ni se rellena,
  // solo se declara cuando la fuente lo declaró primero.
  scenario: ScenarioEnum.optional().nullable(),
  // p10/p90 del ensemble, cuando la fuente los expone junto a la mediana
  // (supabase_climate_cells) — nunca fabricado para fuentes que no lo dan.
  uncertainty_range: z.object({
    p10: z.number().nullable(),
    p90: z.number().nullable(),
  }).optional().nullable(),
  // Declara explícitamente cuando este valor es un proxy de granularidad más
  // amplia que el punto consultado (ej. indicador socioeconómico nacional
  // usado como proxy de capacidad adaptativa local) — ver auditoría de
  // transformación de datos, hallazgo P4.
  spatial_granularity: z.enum(["point", "national"]).optional(),
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
  scenario: ScenarioEnum.optional().nullable(),
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
  name: PhenomenonNameEnum,
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

// H-7.9 (documentacion-v2/stage-07, MEDIO): Stage07Presentation.execute() no
// validaba la forma de su input — `location.location_name` o
// `assessments.length` lanzaban TypeError genéricos no controlados si
// location/assessments faltaban, en vez de un PresentationError tipado
// (pipeline/shared/errors.js, ya existía pero no se usaba en ningún stage).
//
// Decisiones de alcance deliberadas, no una validación exhaustiva de cada
// campo de cada assessment/phenomenon (eso duplicaría RiskAssessmentSchema/
// ClimatePhenomenonSchema — responsabilidad de contrato de Stage 6/Stage 5,
// no de Stage 7 re-verificando su propio upstream campo por campo):
// - `location`: REQUERIDO y validado con el MISMO LocationSchema que
//   pipeline/orchestration/engine.js (PipelineEngine.run(), el motor real
//   usado por server/climate-v2.js) ya usa en la entrada del pipeline
//   (single source of verdad de "qué es una ubicación válida", no una
//   versión más laxa duplicada aquí) — es el único campo sin el cual
//   Stage 7 literalmente no puede renderizar nada (ni siquiera el nombre
//   de la ubicación).
// - `sector`: NO se fuerza a SectorEnum ni se exige presencia. H-7.2 ya
//   implementó un fallback explícito y probado ("no especificado") para
//   sector ausente/vacío — forzar aquí un fallo duro regresionaría esa
//   degradación elegante a un error. Queda como string opcional.
// - `assessments`/`phenomena`: arrays con default [] (no rechazan el
//   request si faltan) — un pipeline real siempre los provee como arrays
//   (posiblemente vacíos) desde Stage 5/6, y Stage 7 YA tiene manejo
//   explícito y testeado para el caso vacío (H-7.3: "no se identificaron
//   fenómenos evaluables"; H-7.4: "confianza no evaluable") — rechazar con
//   error en vez de degradar sería PEOR experiencia que la ya construida
//   para ese caso. Cada elemento solo exige `phenomenon_id` (string) — el
//   campo mínimo que todo el código de Stage 7 usa para cruzar
//   assessments↔phenomena (H-7.2 driverPhenomenon, H-7.4 confidence
//   cross-reference, H-7.7 getRiskContribution, H-7.8 contributing_to) — no
//   se re-exige risk_level/risk_score_raw/etc. aquí porque son opcionales
//   en la práctica de cada método consumidor (`?? `/`||` ya los tratan como
//   posiblemente ausentes).
// - `.passthrough()` a nivel raíz: el orchestrator (H-7.8) reenvía el
//   pipelineState COMPLETO a Stage 7 (canonical_variables, source_decisions,
//   exposure, etc. de stages anteriores) — un schema .strict() rechazaría
//   una llamada real del orchestrator por campos que Stage 7 simplemente
//   ignora, no por datos inválidos.
export const PresentationInputSchema = z.object({
  location: LocationSchema,
  sector: z.string().optional(),
  // Auditoría de transformación de datos, hallazgo P2: eco del parámetro de
  // escenario de la consulta — opcional/nullable porque ejecuciones previas
  // a este cambio (artefactos persistidos) no lo tienen.
  scenario: ScenarioEnum.optional().nullable(),
  assessments: z.array(z.object({ phenomenon_id: z.string() }).passthrough()).optional().default([]),
  phenomena: z.array(z.object({ phenomenon_id: z.string() }).passthrough()).optional().default([]),
  // Auditoría de brecha funcional (D1 §1): fenómenos evaluados sin evidencia
  // suficiente para activarse — Stage 05 los produce, Stage 07 ahora los
  // proyecta (ver phenomena_not_detected en execute()).
  phenomena_not_detected: z.array(z.object({ name: z.string(), reason: z.string() }).passthrough()).optional().default([]),
  transition_risks: z.array(z.object({}).passthrough()).optional().default([]),
  view: z.enum(["executive", "analyst"]).optional().default("executive"),
  execution_id: z.string().optional(),
  sources_consulted: z.array(z.object({}).passthrough()).optional().default([]),
  signals: z.array(z.object({}).passthrough()).optional().default([]),
}).passthrough();
