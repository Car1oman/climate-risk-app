/**
 * Scientific Governance Layer — Sprint 11
 *
 * Pure function module. No I/O, no side effects.
 * Wraps all scientific engine outputs with:
 *
 *   FASE A — Traceability: per-source metadata (source, dataset, model, version, resolution, confidence)
 *   FASE B — Disclaimer System: limitations, uncertainty, assumptions per domain
 *   FASE C — Scientific Metadata: validation_status, evidence_strength, peer_review_status
 *
 * Invariants enforced by construction:
 *   - Every traceability entry has all 6 required fields
 *   - Every disclaimer has limitations[], uncertainty string, and assumptions[]
 *   - Scientific metadata always includes validation_status, evidence_strength, peer_review_status
 *   - No urgency language, no financial figures, no heuristic scores
 *
 * Sources: CMIP6 CCKP / IPCC AR6 / NASA SRTM / INGEMMET 2021 /
 *          NOAA CPC / WRI Aqueduct 4.0 / SENAMHI / GRI Oxford
 */

// ─── FASE A — Traceability Registry ──────────────────────────────────────────

/**
 * Canonical traceability metadata for every data source used in the platform.
 * Each entry defines: source, dataset, model, version, resolution, confidence.
 * These are the 6 required traceability fields per Sprint 11 specification.
 */
export const TRACEABILITY_REGISTRY = {

  CMIP6_CCKP: {
    source:      'CMIP6 CCKP',
    dataset:     'CMIP6 Multi-Model Ensemble — Climate Change Knowledge Portal (World Bank)',
    model:       'Ensemble multi-modelo CMIP6 (21+ GCMs: ACCESS-CM2, BCC-CSM2-MR, CESM2, CNRM-CM6-1, EC-Earth3, GFDL-ESM4, INM-CM5-0, IPSL-CM6A-LR, MIROC6, MPI-ESM1-2-HR, MRI-ESM2-0, otros)',
    version:     'AR6 (2021) — IPCC Sixth Assessment Report generation',
    resolution:  '~25 km grid cell (interpolado desde resolución nativa ~100–250 km GCM)',
    confidence:  'high',
    reference:   'IPCC AR6 WGI Atlas — Projected changes in climate extremes — www.ipcc.ch/report/ar6/wg1/',
  },

  IPCC_AR6: {
    source:      'IPCC AR6',
    dataset:     'IPCC Sixth Assessment Report — WGI (Physical Science Basis), WGII (Impacts), WGIII (Mitigation)',
    model:       'Síntesis multi-modelo — no modelo único; incluye CMIP6 + literatura de observación',
    version:     'AR6 (agosto 2021 — febrero 2022)',
    resolution:  'Regional (SAM — South America / subregiones andinas)',
    confidence:  'high',
    reference:   'IPCC AR6 WGI Chapters 4, 11, Atlas — www.ipcc.ch/report/ar6/',
  },

  NASA_SRTM: {
    source:      'NASA SRTM',
    dataset:     'Shuttle Radar Topography Mission (SRTM) Digital Elevation Model — NASA / NGA',
    model:       'Interferometría radar (SAR) — no modelo climático; datos topográficos observados',
    version:     'SRTM v3.0 (2013, post-procesado con relleno de vacíos)',
    resolution:  '30 m resolución horizontal (1 arc-second); precisión vertical ±16 m (90% CI)',
    confidence:  'high',
    reference:   'NASA SRTM — https://www2.jpl.nasa.gov/srtm/ — Farr et al. (2007) Rev. Geophys.',
  },

  INGEMMET_2021: {
    source:      'INGEMMET 2021',
    dataset:     'Mapa de susceptibilidad a movimientos en masa — Instituto Geológico Minero y Metalúrgico del Perú',
    model:       'Análisis determinístico multicriterio: pendiente (SRTM), litología, cobertura vegetal (NDVI), inventario de eventos',
    version:     '2021 (última edición disponible)',
    resolution:  'Escala cartográfica 1:100,000; unidad mínima de mapeo ~1 km²',
    confidence:  'medium',
    reference:   'INGEMMET — www.ingemmet.gob.pe — Boletín Serie C Geodinámica e Ingeniería Geológica',
  },

  NOAA_ENSO: {
    source:      'NOAA CPC',
    dataset:     'Oceanic Niño Index (ONI) — NOAA Climate Prediction Center; basado en ERSSTv5',
    model:       'Observación oceánica in-situ + satélite; índice derivado de SST anomalías (Niño 3.4)',
    version:     'Actualización mensual (serie histórica desde 1950)',
    resolution:  'Regional (Niño 3.4: 5°N–5°S, 120°W–170°W); promedio trimestral de SST',
    confidence:  'high',
    reference:   'NOAA CPC ONI — www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php',
  },

  WRI_AQUEDUCT: {
    source:      'WRI Aqueduct 4.0',
    dataset:     'Aqueduct Water Risk Atlas — World Resources Institute (WRI)',
    model:       'PCR-GLOBWB 2 (modelo hidrológico global) + proyecciones hidrológicas CMIP6 (GFDL-ESM4, MPI-ESM1-2-HR)',
    version:     '4.0 (2023); mejoras respecto a v3.0 en resolución y cobertura de cuencas',
    resolution:  '~10 km (HydroBASINS Niveau 6 — cuencas de ~1,000–10,000 km²)',
    confidence:  'medium',
    reference:   'WRI Aqueduct 4.0 — www.wri.org/aqueduct — Kuzma et al. (2023) WRI Technical Note',
  },

  SENAMHI: {
    source:      'SENAMHI',
    dataset:     'Red de Estaciones Meteorológicas e Hidrológicas — Servicio Nacional de Meteorología e Hidrología del Perú',
    model:       'Observación directa in-situ (termómetros, pluviómetros, estaciones automáticas); no modelo',
    version:     'Actualización periódica; serie histórica variable por estación (décadas a >50 años)',
    resolution:  'Estaciones puntuales (~500 estaciones operativas a nivel nacional)',
    confidence:  'high',
    reference:   'SENAMHI — www.senamhi.gob.pe — Autoridad meteorológica e hidrológica nacional del Perú',
  },

  GRI: {
    source:      'GRI Infrastructure Resilience',
    dataset:     'Global Infrastructure Risk Index — Oxford Infrastructure Resilience / GRI',
    model:       'Análisis de exposición física a inundación urbana; combina modelos de flujo superficial con datos de activos',
    version:     '2021',
    resolution:  '~100 m (áreas urbanas); análisis de exposición de infraestructura a cota de inundación',
    confidence:  'medium',
    reference:   'GRI Oxford — www.globalresilienceindex.org — Oxford Programme for Sustainable Infrastructure Systems',
  },
};

/**
 * Maps sources_cited string labels (as produced by storytelling.js extractSources)
 * to registry keys in TRACEABILITY_REGISTRY and SCIENTIFIC_METADATA_CATALOG.
 */
export const SOURCE_KEY_MAP = {
  'CMIP6':                         'CMIP6_CCKP',
  'IPCC AR6':                      'IPCC_AR6',
  'NASA SRTM':                     'NASA_SRTM',
  'INGEMMET 2021':                 'INGEMMET_2021',
  'GRI Infrastructure Resilience': 'GRI',
  'WRI Aqueduct 4.0':              'WRI_AQUEDUCT',
  'NOAA CPC':                      'NOAA_ENSO',
  'SENAMHI':                       'SENAMHI',
};

// ─── FASE B — Disclaimer Catalog ──────────────────────────────────────────────

/**
 * Standard disclaimer text blocks by domain.
 * 'general' is always applied; domain-specific entries are merged on top.
 *
 * Domains: 'general' | 'temperature' | 'precipitation' | 'terrain' | 'projection'
 */
export const DISCLAIMER_CATALOG = {

  general: {
    limitations: [
      'Los resultados se basan en datos de modelos climáticos globales (GCMs) con incertidumbre inherente a escala regional.',
      'Las proyecciones CMIP6 reflejan tendencias estadísticas de largo plazo y no constituyen predicciones de eventos climáticos específicos.',
      'La resolución espacial de los modelos (~25 km) limita la representación de fenómenos climáticos locales y efectos orográficos complejos.',
      'Los umbrales de señal empleados son referencias orientativas basados en literatura científica revisada por pares; no constituyen dictamen técnico-legal.',
      'Este análisis no reemplaza la evaluación de riesgo in-situ por profesionales certificados en ingeniería, geología o climatología.',
    ],
    uncertainty:
      'La incertidumbre de las proyecciones climáticas proviene de tres fuentes principales: (1) variabilidad climática interna — componente aleatoria irreducible; ' +
      '(2) incertidumbre en el escenario de emisiones futuras — dependiente de decisiones socioeconómicas y políticas; ' +
      '(3) incertidumbre estructural de los modelos — diferencias entre GCMs en la representación de procesos físicos. ' +
      'Los resultados deben interpretarse como distribuciones de posibles futuros, no como valores deterministas exactos.',
    assumptions: [
      'Se asume continuidad aproximada en las condiciones socioeconómicas base, sin cambios abruptos de uso de suelo o emisiones fuera del rango de escenarios SSP evaluados.',
      'Se asume que los datos de estaciones meteorológicas (SENAMHI) son representativos de las condiciones climáticas de la región de análisis.',
      'Las proyecciones utilizan el período histórico 1980–2014 como línea base de referencia (estándar CMIP6 CCKP).',
      'Se asume que los patrones de circulación atmosférica de gran escala relevantes para la región se mantienen dentro del rango de variabilidad climática natural bajo los escenarios evaluados.',
    ],
  },

  temperature: {
    limitations: [
      'Los modelos CMIP6 presentan mayor robustez para tendencias de temperatura media que para distribuciones de extremos en la región andina peruana.',
      'Los valores de días de calor extremo (hd35, hd40) son proyecciones del ensemble multi-modelo sin downscaling estadístico local.',
      'La variabilidad interanual modulada por ENSO puede producir desviaciones significativas respecto a los valores promedio proyectados.',
      'Los efectos de isla de calor urbano no están capturados en la resolución de los modelos GCM.',
    ],
    uncertainty:
      'Las proyecciones de temperatura media tienen alta confianza para la tendencia de calentamiento a nivel regional, ' +
      'pero el spread inter-modelo aumenta hacia horizontes temporales más lejanos (2060–2079). ' +
      'Los extremos de temperatura (hd35, hd40) tienen confianza media — mayor que precipitación, menor que temperatura media. ' +
      'La variabilidad interanual ENSO añade incertidumbre no capturada por los percentiles del ensemble.',
    assumptions: [
      'Las proyecciones de temperatura se derivan del ensemble CMIP6 sin corrección de sesgo estadístico local.',
      'El período histórico de referencia es 1980–2014 (estándar CMIP6 CCKP).',
      'Los umbrales hd35 y hd40 se aplican uniformemente en el área de análisis sin ajuste por altitud.',
    ],
  },

  precipitation: {
    limitations: [
      'Los modelos CMIP6 muestran señal divergente para precipitación anual media en la región andina peruana — baja confianza para totales anuales.',
      'Los valores de precipitación extrema (Rx5day) tienen confianza media; mayor robustez para tendencias de intensidad que para magnitud absoluta.',
      'La orografía compleja del Perú (Andes, altiplano, costa árida) no está completamente representada a la resolución ~25 km de los GCMs.',
      'No se incluye downscaling dinámico ni estadístico para precipitación en este análisis.',
    ],
    uncertainty:
      'La precipitación es la variable climática con mayor incertidumbre en los modelos CMIP6 para la región andina. ' +
      'El spread inter-modelo es alto para precipitación anual media — algunos modelos proyectan aumento, otros disminución. ' +
      'Las proyecciones de extremos de precipitación (Rx5day) son más robustas que los totales anuales, con señal de intensificación consistente. ' +
      'La incertidumbre es especialmente alta en la sierra sur y el altiplano.',
    assumptions: [
      'Los datos de precipitación CMIP6 no han sido downscalados estadísticamente a escala local.',
      'Se asume que los patrones de teleconexión ENSO-precipitación se mantienen relativamente estables bajo los escenarios SSP evaluados.',
      'El umbral Rx5day (precipitación máxima de 5 días consecutivos) se usa como indicador de eventos extremos según IPCC AR6 Capítulo 11.',
    ],
  },

  terrain: {
    limitations: [
      'El mapa INGEMMET 2021 representa susceptibilidad relativa a movimientos en masa, no probabilidad absoluta de ocurrencia en un período dado.',
      'La escala de trabajo (1:100,000) limita la aplicación del análisis a nivel de sub-cuenca; no es adecuado para evaluaciones a nivel de parcela o estructura individual.',
      'Los cambios en cobertura vegetal, uso de suelo y actividad antrópica pueden alterar la susceptibilidad real respecto al mapa cartografiado.',
      'Los efectos del cambio climático sobre la estabilidad de laderas (mayor intensidad de lluvia, deshielo de glaciares) no están capturados en el mapa estático.',
    ],
    uncertainty:
      'La susceptibilidad a movimientos en masa es una función de factores dinámicos — lluvia detonante, condiciones de saturación del suelo, actividad sísmica — ' +
      'no completamente capturados en el mapa geomorfológico estático INGEMMET. ' +
      'La evaluación cartográfica debe complementarse con inspección de campo y análisis geotécnico detallado para decisiones de diseño o inversión.',
    assumptions: [
      'La susceptibilidad geomorfológica mapeada por INGEMMET 2021 es representativa del estado actual del terreno en ausencia de eventos perturbadores recientes.',
      'El umbral de pendiente > 15° se asume como indicativo de mayor susceptibilidad a flujos de detritos y deslizamientos, según clasificación INGEMMET.',
      'No se consideran efectos de refuerzo artificial del terreno (muros de contención, cobertura vegetal inducida) en el análisis de susceptibilidad.',
    ],
  },

  projection: {
    limitations: [
      'Las proyecciones cubren dos escenarios SSP (SSP2-4.5 y SSP5-8.5); escenarios más optimistas (SSP1-1.9, SSP1-2.6) no están incluidos.',
      'Los tres horizontes temporales evaluados (2020–2039, 2040–2059, 2060–2079) no capturan la variabilidad intra-decadal.',
      'Las proyecciones no incluyen efectos de retroalimentaciones climáticas abruptas (tipping points) que podrían amplificar los cambios.',
    ],
    uncertainty:
      'La incertidumbre aumenta sistemáticamente con el horizonte temporal: es menor en 2020–2039 (near-term) y mayor en 2060–2079 (far-term). ' +
      'La elección del escenario SSP es la principal fuente de incertidumbre para el largo plazo. ' +
      'Para el corto plazo (2020–2039), la variabilidad climática interna domina sobre la señal de escenario.',
    assumptions: [
      'Los escenarios SSP2-4.5 y SSP5-8.5 son representativos del rango de incertidumbre de emisiones futuras relevante para la toma de decisiones empresarial.',
      'Los valores de temperatura y precipitación proyectados son anomalías respecto al período histórico 1980–2014 (línea base CMIP6 estándar).',
    ],
  },
};

// ─── FASE C — Scientific Metadata Catalog ────────────────────────────────────

/**
 * Per-source metadata about scientific rigor:
 *   validation_status:  'validated' | 'partially_validated' | 'pending'
 *   evidence_strength:  'strong' | 'moderate' | 'limited'
 *   peer_review_status: 'peer_reviewed' | 'institutional' | 'expert_review'
 */
export const SCIENTIFIC_METADATA_CATALOG = {

  CMIP6_CCKP: {
    validation_status:   'validated',
    evidence_strength:   'strong',
    peer_review_status:  'peer_reviewed',
    validation_notes:
      'Validado extensivamente por IPCC AR6 WGI. Ensemble multi-modelo curado con métricas de performance estándar ' +
      '(Taylor diagrams, RMSE, skill scores). Publicado en cientos de artículos revisados por pares.',
  },

  IPCC_AR6: {
    validation_status:   'validated',
    evidence_strength:   'strong',
    peer_review_status:  'peer_reviewed',
    validation_notes:
      'IPCC AR6 es la síntesis más reciente del estado del arte del conocimiento climático. ' +
      'Sujeto a proceso de revisión doble-ciega por >700 expertos y revisión gubernamental.',
  },

  NASA_SRTM: {
    validation_status:   'validated',
    evidence_strength:   'strong',
    peer_review_status:  'peer_reviewed',
    validation_notes:
      'Validado globalmente con puntos de control GPS. Precisión vertical ±16 m (90% CI) en terreno escarpado, ' +
      '±10 m en terreno llano. Referencia topográfica estándar internacional (Farr et al. 2007, Rev. Geophys.).',
  },

  INGEMMET_2021: {
    validation_status:   'validated',
    evidence_strength:   'moderate',
    peer_review_status:  'institutional',
    validation_notes:
      'Validación institucional por INGEMMET mediante trabajo de campo y contraste con inventario de eventos históricos. ' +
      'No sujeto a revisión por pares externa de alcance internacional. Representativo a escala 1:100,000.',
  },

  NOAA_ENSO: {
    validation_status:   'validated',
    evidence_strength:   'strong',
    peer_review_status:  'peer_reviewed',
    validation_notes:
      'ONI es el índice estándar de referencia internacional para el seguimiento del fenómeno ENSO. ' +
      'Validado operativamente por NOAA desde 1950. Publicado en decenas de artículos revisados por pares.',
  },

  WRI_AQUEDUCT: {
    validation_status:   'validated',
    evidence_strength:   'moderate',
    peer_review_status:  'peer_reviewed',
    validation_notes:
      'Aqueduct 4.0 publicado en Technical Note revisada (Kuzma et al. 2023, WRI). ' +
      'Confianza media para cuencas en zonas áridas o con datos de observación limitados (incluye partes del Perú).',
  },

  SENAMHI: {
    validation_status:   'validated',
    evidence_strength:   'strong',
    peer_review_status:  'institutional',
    validation_notes:
      'Red oficial de observación meteorológica e hidrológica del Perú. ' +
      'Sujeta a control de calidad institucional según estándares WMO. Autoridad nacional reconocida.',
  },

  GRI: {
    validation_status:   'validated',
    evidence_strength:   'moderate',
    peer_review_status:  'expert_review',
    validation_notes:
      'GRI Infrastructure Resilience desarrollado por el Oxford Programme for Sustainable Infrastructure Systems. ' +
      'Revisión por panel de expertos internacionales. Uso orientativo para evaluación de exposición a inundación urbana.',
  },
};

// ─── Aggregation Helpers ──────────────────────────────────────────────────────

function resolveRegistryKeys(sourcesCited) {
  return (sourcesCited ?? []).map(s => SOURCE_KEY_MAP[s]).filter(Boolean);
}

function aggregateValidationStatus(registryKeys) {
  if (registryKeys.length === 0) return 'pending';
  const statuses = registryKeys.map(k => SCIENTIFIC_METADATA_CATALOG[k]?.validation_status ?? 'pending');
  if (statuses.every(s => s === 'validated'))         return 'validated';
  if (statuses.some(s => s === 'validated'))           return 'partially_validated';
  return 'pending';
}

function aggregateEvidenceStrength(registryKeys) {
  if (registryKeys.length === 0) return 'limited';
  const strengths = registryKeys.map(k => SCIENTIFIC_METADATA_CATALOG[k]?.evidence_strength ?? 'limited');
  if (strengths.includes('strong'))   return 'strong';
  if (strengths.includes('moderate')) return 'moderate';
  return 'limited';
}

function aggregatePeerReviewStatus(registryKeys) {
  if (registryKeys.length === 0) return 'expert_review';
  const statuses = registryKeys.map(k => SCIENTIFIC_METADATA_CATALOG[k]?.peer_review_status ?? 'expert_review');
  if (statuses.includes('peer_reviewed'))  return 'peer_reviewed';
  if (statuses.includes('institutional')) return 'institutional';
  return 'expert_review';
}

// ─── FASE A — buildTraceability() ─────────────────────────────────────────────

/**
 * FASE A — Builds per-source traceability metadata for all sources cited in the narrative.
 *
 * Each traceability entry includes the 6 required fields:
 *   source, dataset, model, version, resolution, confidence
 *
 * @param {string[]} sourcesCited - Array of source label strings from narrative.sources_cited
 * @param {Object}   [opts]
 * @returns {Object} { entries, unmapped_sources, total_sources, generated_at }
 */
export function buildTraceability(sourcesCited, opts = {}) {
  const entries        = {};
  const unmapped       = [];

  for (const src of (sourcesCited ?? [])) {
    const registryKey = SOURCE_KEY_MAP[src];
    if (registryKey && TRACEABILITY_REGISTRY[registryKey]) {
      entries[src] = { ...TRACEABILITY_REGISTRY[registryKey] };
    } else {
      unmapped.push(src);
    }
  }

  return {
    entries,
    unmapped_sources: unmapped,
    total_sources:    Object.keys(entries).length,
    generated_at:     new Date().toISOString(),
  };
}

// ─── FASE B — buildDisclaimer() ───────────────────────────────────────────────

/**
 * FASE B — Builds a structured disclaimer with limitations, uncertainty, and assumptions.
 *
 * The general disclaimer is always included. Domain-specific content is merged on top.
 * Domains: 'general' | 'temperature' | 'precipitation' | 'terrain' | 'projection'
 *
 * @param {Object} [opts]
 * @param {string} [opts.domain='general'] - Domain for domain-specific additions
 * @returns {Object} { limitations, uncertainty, assumptions, domain }
 */
export function buildDisclaimer(opts = {}) {
  const domain         = opts.domain ?? 'general';
  const base           = DISCLAIMER_CATALOG.general;
  const domainSpecific = DISCLAIMER_CATALOG[domain] ?? null;

  const limitations = [
    ...base.limitations,
    ...(domainSpecific && domain !== 'general' ? domainSpecific.limitations ?? [] : []),
  ];

  const assumptions = [
    ...base.assumptions,
    ...(domainSpecific && domain !== 'general' ? domainSpecific.assumptions ?? [] : []),
  ];

  const uncertainty = (domainSpecific && domain !== 'general' && domainSpecific.uncertainty)
    ? domainSpecific.uncertainty
    : base.uncertainty;

  return {
    limitations,
    uncertainty,
    assumptions,
    domain,
  };
}

// ─── FASE C — buildScientificMetadata() ──────────────────────────────────────

/**
 * FASE C — Builds scientific metadata for the output, aggregated from all cited sources.
 *
 * @param {string[]} sourcesCited          - From narrative.sources_cited
 * @param {Object}   [interpretationOutput] - Layer 7 output (for signal_count)
 * @param {Object}   [projectionContext]    - Layer 9 output (for scenario_count)
 * @returns {Object} {
 *   validation_status, evidence_strength, peer_review_status,
 *   per_source, signal_count, scenario_count, generated_at
 * }
 */
export function buildScientificMetadata(sourcesCited, interpretationOutput, projectionContext) {
  const registryKeys = resolveRegistryKeys(sourcesCited);

  const validation_status  = aggregateValidationStatus(registryKeys);
  const evidence_strength  = aggregateEvidenceStrength(registryKeys);
  const peer_review_status = aggregatePeerReviewStatus(registryKeys);

  const per_source = {};
  for (const src of (sourcesCited ?? [])) {
    const key = SOURCE_KEY_MAP[src];
    if (key && SCIENTIFIC_METADATA_CATALOG[key]) {
      per_source[src] = { ...SCIENTIFIC_METADATA_CATALOG[key] };
    }
  }

  return {
    validation_status,
    evidence_strength,
    peer_review_status,
    per_source,
    signal_count:   (interpretationOutput?.signal_groups ?? []).length,
    scenario_count: (projectionContext?.scenarios        ?? []).length,
    generated_at:   new Date().toISOString(),
  };
}

// ─── Main Entry — attachGovernance() ─────────────────────────────────────────

/**
 * Attaches the full governance layer to a buildStorytellingContext() output.
 *
 * Adds a 'governance' key containing:
 *   traceability       — FASE A: per-source metadata
 *   disclaimer         — FASE B: limitations, uncertainty, assumptions
 *   scientific_metadata — FASE C: validation_status, evidence_strength, peer_review_status
 *
 * @param {Object} storyContext - Output of buildStorytellingContext()
 * @param {Object} [opts]
 * @param {string} [opts.domain='general'] - Disclaimer domain
 * @returns {Object} governed output with .governance key attached
 */
export function attachGovernance(storyContext, opts = {}) {
  const domain   = opts.domain ?? 'general';
  const narrative = storyContext?.narrative ?? {};
  const sources   = narrative.sources_cited ?? [];

  const traceability        = buildTraceability(sources, opts);
  const disclaimer          = buildDisclaimer({ domain });
  const scientific_metadata = buildScientificMetadata(
    sources,
    storyContext?.metadata ? { signal_groups: Array.from({ length: storyContext.metadata.signals_used ?? 0 }) } : null,
    storyContext?.metadata ? { scenarios: storyContext.metadata.scenario ? [storyContext.metadata.scenario] : [] } : null
  );

  return {
    ...storyContext,
    governance: {
      traceability,
      disclaimer,
      scientific_metadata,
      governance_version: 'Sprint 11 — Scientific Governance Layer',
      governed_at:        new Date().toISOString(),
    },
  };
}

// ─── validateGovernance() ─────────────────────────────────────────────────────

/**
 * Validates that the governance layer is complete and well-formed.
 * All 8 checks must pass for validation_passed = true.
 *
 * @param {Object} output - Output of attachGovernance()
 * @returns {Object} { ...checks, validation_passed }
 */
export function validateGovernance(output) {
  const gov   = output?.governance               ?? {};
  const trace = gov.traceability                 ?? {};
  const disc  = gov.disclaimer                   ?? {};
  const meta  = gov.scientific_metadata          ?? {};

  const VALID_VALIDATION_STATUSES  = new Set(['validated', 'partially_validated', 'pending']);
  const VALID_EVIDENCE_STRENGTHS   = new Set(['strong', 'moderate', 'limited']);
  const VALID_PEER_REVIEW_STATUSES = new Set(['peer_reviewed', 'institutional', 'expert_review']);

  const checks = {
    has_traceability:          typeof trace.entries === 'object' && trace.entries !== null,
    has_total_sources:         typeof trace.total_sources === 'number',
    has_disclaimer_uncertainty: typeof disc.uncertainty === 'string' && disc.uncertainty.length > 10,
    has_limitations:           Array.isArray(disc.limitations) && disc.limitations.length > 0,
    has_assumptions:           Array.isArray(disc.assumptions) && disc.assumptions.length > 0,
    has_validation_status:     VALID_VALIDATION_STATUSES.has(meta.validation_status),
    has_evidence_strength:     VALID_EVIDENCE_STRENGTHS.has(meta.evidence_strength),
    has_peer_review_status:    VALID_PEER_REVIEW_STATUSES.has(meta.peer_review_status),
  };

  const validation_passed = Object.values(checks).every(Boolean);

  return { ...checks, validation_passed };
}
