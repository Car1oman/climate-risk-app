/**
 * Scientific Storytelling Engine — Sprint 10
 *
 * Pure function module. No I/O, no side effects.
 * Assembles a scientifically grounded, explicable climate narrative from:
 *
 *   Layer 7 — Scientific Interpretation Engine (interpretSignals output)
 *   Layer 9 — Projection Scenario Engine (buildProjectionContext output)
 *   Layer 8 — Historical Climate Engine (buildHistoricalContext output)
 *
 * Produces:
 *   FASE A — buildMainNarrative(): paragraphs, sources, scenario, horizon, uncertainty
 *   FASE C — buildAdaptationMeasures(): qualitative, no costs, no efficacy, sector-contextualized
 *   FASE E — validateStorytelling(): clarity, no exaggeration, no alarmism, no heuristics
 *
 * Invariants enforced by construction:
 *   - Every sentence in paragraphs comes from Layer 7 interpretations or Layer 9 projection narratives
 *   - No invented values, no urgency language, no financial figures
 *   - Adaptation measures are qualitative — no costs, no efficacy percentages
 *   - Validation confirms: citations present, scenario mentioned, uncertainty mentioned
 *
 * Sources: CMIP6 / IPCC AR6 WGI Atlas / NASA SRTM / INGEMMET 2021 /
 *          GRI Infrastructure Resilience / WRI Aqueduct 4.0 / NOAA CPC / SENAMHI
 */

// ─── FASE A — Source Detection Helpers ───────────────────────────────────────

const SOURCE_PATTERNS = [
  { key: 'CMIP6',                         pattern: /CMIP6/i              },
  { key: 'IPCC AR6',                      pattern: /IPCC/i               },
  { key: 'NASA SRTM',                     pattern: /SRTM/i               },
  { key: 'INGEMMET 2021',                 pattern: /INGEMMET/i           },
  { key: 'GRI Infrastructure Resilience', pattern: /GRI/i                },
  { key: 'WRI Aqueduct 4.0',              pattern: /WRI Aqueduct/i       },
  { key: 'NOAA CPC',                      pattern: /NOAA/i               },
  { key: 'SENAMHI',                       pattern: /SENAMHI/i            },
];

function extractSources(texts) {
  const found = new Set();
  for (const text of texts) {
    for (const { key, pattern } of SOURCE_PATTERNS) {
      if (pattern.test(text)) found.add(key);
    }
  }
  return [...found];
}

const CONFIDENCE_ES = {
  high:   'alta confianza',
  medium: 'confianza media',
  low:    'baja confianza',
};

const SCENARIO_LABELS = {
  ssp245: 'SSP2-4.5',
  ssp585: 'SSP5-8.5',
};

const WINDOW_LABELS = {
  near_term: '2020–2039',
  mid_term:  '2040–2059',
  far_term:  '2060–2079',
};

// ─── FASE A — Main Narrative Builder ─────────────────────────────────────────

/**
 * Builds the main climate narrative by assembling texts from:
 *   - Layer 7 (interpretSignals) interpretations
 *   - Layer 9 (buildProjectionContext) projection narratives
 *   - Layer 8 (buildHistoricalContext) relevant events (anchor only)
 *
 * Returns paragraphs grounded exclusively in input engine outputs.
 * No numbers, scenario names, or confidence levels are invented.
 *
 * @param {Object}  interpretationOutput - Layer 7 output
 * @param {Object}  projectionContext    - Layer 9 output
 * @param {Object}  historicalContext    - Layer 8 output
 * @param {Object}  [opts]
 * @param {string}  [opts.scenario='ssp245']  - 'ssp245' | 'ssp585'
 * @param {string}  [opts.window='mid_term']  - 'near_term' | 'mid_term' | 'far_term'
 * @returns {Object} narrative object
 */
export function buildMainNarrative(interpretationOutput, projectionContext, historicalContext, opts = {}) {
  const scenario = opts.scenario ?? 'ssp245';
  const window   = opts.window   ?? 'mid_term';

  const interpretations = interpretationOutput?.interpretations ?? [];
  const uncertainty     = interpretationOutput?.uncertainty ?? {};

  // Paragraph 1: single-group interpretations (up to 3 sentences)
  const singleGroup = interpretations.filter(i => i.type === 'single_group').slice(0, 3);

  // Paragraph 2: projection narrative for chosen scenario × window
  const projNarrative = (projectionContext?.narratives ?? []).find(
    n => n.scenario === scenario && n.window === window
  ) ?? null;

  // Paragraph 3: compound interpretations (combined effect descriptions)
  const compound = interpretations.filter(i => i.type === 'compound');

  const paragraphs = [];

  if (singleGroup.length > 0) {
    paragraphs.push(singleGroup.map(i => i.text).join(' '));
  }

  if (projNarrative) {
    paragraphs.push(projNarrative.text);
  }

  if (compound.length > 0) {
    paragraphs.push(compound.map(i => i.text).join(' '));
  }

  // Historical anchor: first relevant event from Layer 8
  const anchorEvent = (historicalContext?.relevant_events ?? [])[0] ?? null;
  const historical_anchor = anchorEvent
    ? {
        id:          anchorEvent.id,
        label:       anchorEvent.label,
        description: anchorEvent.description,
        source:      anchorEvent.source,
        date_start:  anchorEvent.date_start,
      }
    : null;

  // Uncertainty note: assembled from Layer 7 + Layer 9 confidence metadata
  const overallConf = CONFIDENCE_ES[uncertainty.overall_confidence]
    ?? CONFIDENCE_ES.medium;
  const tempConf    = CONFIDENCE_ES[projectionContext?.uncertainty?.temperature_confidence]
    ?? CONFIDENCE_ES.medium;
  const precipConf  = CONFIDENCE_ES[projectionContext?.uncertainty?.precipitation_confidence]
    ?? CONFIDENCE_ES.low;

  const uncertainty_note =
    `Nivel de confianza general: ${overallConf}. ` +
    `Temperatura: ${tempConf}. ` +
    `Precipitación media: ${precipConf} (modelos CMIP6 presentan señal divergente para la región andina peruana).`;

  // Collect sources from all assembled text
  const textForSources = [
    ...paragraphs,
  ];
  const sources_cited = extractSources(textForSources);

  // Projection sources are always cited when a projection narrative is used
  if (projNarrative) {
    if (!sources_cited.includes('CMIP6'))    sources_cited.push('CMIP6');
    if (!sources_cited.includes('IPCC AR6')) sources_cited.push('IPCC AR6');
  }

  // Evidence IDs from Layer 7 interpretations
  const evidence_cited = [...new Set(interpretations.flatMap(i => i.evidence_ids ?? []))];

  return {
    paragraphs,
    sources_cited,
    scenario_label:    projNarrative?.scenario_label  ?? SCENARIO_LABELS[scenario] ?? scenario,
    horizon_label:     projNarrative?.window_label    ?? WINDOW_LABELS[window]     ?? window,
    uncertainty_note,
    historical_anchor,
    evidence_cited,
  };
}

// ─── FASE C — Adaptation Measures Catalog ────────────────────────────────────
// All measures are qualitative: no cost estimates, no efficacy percentages.
// Rationales cite scientific sources (CMIP6, IPCC AR6, INGEMMET, etc.).

const ADAPTATION_CATALOG = {

  heat_stress: {
    measure: {
      general:
        'Evaluar la exposición de instalaciones a temperaturas extremas (Tmax > 35°C) e identificar necesidades de climatización o protección solar.',
      retail:
        'Revisar los sistemas de climatización en tiendas y almacenes ante el incremento proyectado de días con temperaturas superiores a 35°C.',
      agriculture:
        'Ajustar calendarios de siembra y cosecha en función de los días de calor extremo proyectados por CMIP6 para el período seleccionado.',
      infrastructure:
        'Incorporar especificaciones de resistencia térmica en materiales y diseños de infraestructura vial y edilicia.',
      logistics:
        'Planificar la cadena de frío considerando el incremento proyectado de días con temperaturas superiores a 35°C (hd35, CMIP6).',
      manufacturing:
        'Evaluar la carga térmica en procesos industriales y establecer protocolos de operación durante días de calor extremo.',
      financial:
        'Incorporar la proyección de incremento de días de calor extremo en la evaluación de exposición física de activos en cartera.',
      hospitality:
        'Garantizar la disponibilidad de sistemas de climatización y revisar planes de confort para huéspedes y personal durante días de calor extremo.',
    },
    rationale: {
      general:
        'Las proyecciones CMIP6 / IPCC AR6 Capítulo 11 indican un incremento en el número de días con Tmax > 35°C en la región.',
      retail:
        'Las proyecciones CMIP6 / IPCC AR6 Capítulo 11 indican un incremento en días con Tmax > 35°C con confianza media para la región.',
      agriculture:
        'CMIP6 / IPCC AR6 Capítulo 11 proyecta mayor frecuencia de días de calor extremo que puede afectar rendimientos de cultivos.',
      infrastructure:
        'La expansión térmica de materiales y el estrés por calor en sistemas de refrigeración aumentan con el calentamiento proyectado.',
      logistics:
        'El incremento de días con Tmax > 35°C aumenta el riesgo de ruptura de cadena de frío y daño a productos sensibles a temperatura.',
      manufacturing:
        'El calor extremo puede reducir la eficiencia de equipos industriales y aumentar el consumo de energía en climatización.',
      financial:
        'IPCC AR6 WGI Capítulo 11 documenta que el incremento de calor extremo aumenta la exposición física de activos en el sector terciario.',
      hospitality:
        'El confort térmico de huéspedes y la operatividad de instalaciones dependen directamente de la gestión de temperaturas extremas.',
    },
  },

  precipitation_intensity: {
    measure: {
      general:
        'Revisar la capacidad de los sistemas de drenaje e infraestructura hídrica para eventos de precipitación extrema (Rx5day).',
      retail:
        'Revisar la infraestructura de drenaje en locales comerciales y centros logísticos ante precipitaciones extremas proyectadas (CMIP6 Rx5day).',
      agriculture:
        'Implementar sistemas de captación y manejo del agua de lluvia e infraestructura de drenaje para cultivos en zonas de ladera.',
      infrastructure:
        'Evaluar la capacidad hidráulica de puentes, alcantarillas y sistemas de drenaje vial ante el incremento proyectado en Rx5day.',
      logistics:
        'Desarrollar protocolos de contingencia para posibles interrupciones de rutas de distribución ante eventos de precipitación extrema.',
      manufacturing:
        'Revisar los sistemas de drenaje de planta y los protocolos de protección de equipos ante precipitaciones extremas.',
      financial:
        'Incorporar la exposición a inundación (WRI Aqueduct 4.0) como variable en la evaluación de riesgo físico de activos en cartera.',
      hospitality:
        'Revisar la infraestructura de drenaje en instalaciones y desarrollar protocolos de atención a huéspedes durante eventos de lluvia intensa.',
    },
    rationale: {
      general:
        'CMIP6 / IPCC AR6 Capítulo 11 proyectan un incremento en la precipitación extrema de 5 días consecutivos (Rx5day) para la región.',
      retail:
        'CMIP6 / IPCC AR6 Capítulo 11 indica incremento en Rx5day; GRI Infrastructure Resilience / WRI Aqueduct 4.0 estiman probabilidad de inundación.',
      agriculture:
        'CMIP6 proyecta mayor intensidad de eventos de precipitación extrema que puede causar erosión y pérdida de suelo productivo.',
      infrastructure:
        'El incremento en Rx5day (CMIP6) aumenta la carga hidráulica sobre infraestructura de drenaje diseñada con parámetros históricos.',
      logistics:
        'Los eventos de precipitación extrema proyectados incrementan el riesgo de interrupción de rutas en zonas de montaña y valles fluviales.',
      manufacturing:
        'Precipitaciones extremas pueden causar inundaciones en instalaciones industriales y afectar la continuidad operativa.',
      financial:
        'WRI Aqueduct 4.0 y CMIP6 señalan mayor frecuencia de precipitación extrema, aumentando la exposición de activos físicos a inundación.',
      hospitality:
        'La precipitación extrema puede interrumpir el acceso a instalaciones y afectar la experiencia de los huéspedes.',
    },
  },

  water_stress: {
    measure: {
      general:
        'Evaluar la eficiencia en el uso del agua y explorar fuentes alternativas de abastecimiento ante el estrés hídrico proyectado.',
      retail:
        'Auditar el consumo de agua en operaciones comerciales y establecer metas de eficiencia hídrica para la cadena de abastecimiento.',
      agriculture:
        'Adoptar técnicas de riego eficiente (goteo, aspersión localizada) y seleccionar variedades resilientes al déficit hídrico.',
      infrastructure:
        'Diversificar las fuentes de abastecimiento de agua para sistemas de refrigeración, instalaciones sanitarias y operaciones críticas.',
      logistics:
        'Incorporar criterios de disponibilidad hídrica en la evaluación de ubicaciones de centros de distribución y almacenes.',
      manufacturing:
        'Auditar el uso de agua en procesos de fabricación y explorar alternativas de reciclaje o reutilización de agua industrial.',
      financial:
        'Evaluar la exposición de activos en cartera al riesgo de estrés hídrico mediante indicadores WRI Aqueduct 4.0.',
      hospitality:
        'Implementar medidas de eficiencia hídrica en instalaciones y comunicar el contexto de disponibilidad hídrica a los grupos de interés.',
    },
    rationale: {
      general:
        'CMIP6 / IPCC AR6 Atlas señala un posible déficit hídrico para la región, aunque con baja confianza por divergencia de modelos.',
      retail:
        'El estrés hídrico puede afectar la cadena de suministro de productos y las operaciones de limpieza e higiene.',
      agriculture:
        'La reducción proyectada de precipitación anual media (señal con baja confianza, CMIP6) puede aumentar el estrés hídrico en cultivos.',
      infrastructure:
        'La disponibilidad de agua afecta los sistemas de refrigeración, contra incendios y el funcionamiento de instalaciones críticas.',
      logistics:
        'La disponibilidad hídrica es un criterio de resiliencia operativa para centros logísticos en contextos de posible sequía.',
      manufacturing:
        'Muchos procesos industriales requieren agua como insumo o para refrigeración; el estrés hídrico puede interrumpir la producción.',
      financial:
        'WRI Aqueduct 4.0 proporciona indicadores de estrés hídrico por cuenca para la evaluación de riesgo físico de activos.',
      hospitality:
        'La disponibilidad de agua es fundamental para la operación de instalaciones hoteleras y la satisfacción de los huéspedes.',
    },
  },

  terrain_instability: {
    measure: {
      general:
        'Evaluar la susceptibilidad a deslizamientos y huaycos en la ubicación del activo mediante inspección geotécnica.',
      retail:
        'Verificar la distancia de instalaciones a zonas de susceptibilidad a movimientos en masa según el mapa INGEMMET (2021).',
      agriculture:
        'Incorporar los mapas de susceptibilidad a movimientos en masa (INGEMMET 2021) en la selección de áreas de cultivo en zonas de ladera.',
      infrastructure:
        'Incorporar el análisis de estabilidad de taludes en el diseño y mantenimiento de infraestructura en zonas con pendiente > 15°.',
      logistics:
        'Identificar rutas de distribución alternativas ante posibles interrupciones por deslizamientos o huaycos en zonas montañosas.',
      manufacturing:
        'Evaluar la exposición geotécnica de plantas industriales ubicadas en zonas de ladera o adyacentes a quebradas activas.',
      financial:
        'Incorporar la susceptibilidad a movimientos en masa (INGEMMET 2021) como variable en la evaluación de riesgo físico de activos en cartera.',
      hospitality:
        'Revisar la ubicación de instalaciones respecto a zonas de susceptibilidad a deslizamientos y establecer rutas de evacuación documentadas.',
    },
    rationale: {
      general:
        'El análisis topográfico SRTM / INGEMMET 2021 identifica susceptibilidad a deslizamientos y huaycos en zonas con pendiente > 15°.',
      retail:
        'La susceptibilidad a movimientos en masa (INGEMMET 2021) representa un factor de riesgo estructural para instalaciones en zonas de ladera.',
      agriculture:
        'Las zonas de alta susceptibilidad a deslizamientos (INGEMMET 2021) presentan riesgo adicional para activos agrícolas en laderas.',
      infrastructure:
        'Pendientes > 15° en zonas de drenaje convergente (umbral INGEMMET 2021) activan la susceptibilidad a flujos de detritos.',
      logistics:
        'Los eventos históricos de huaycos (catálogo INDECI) documentan interrupciones recurrentes de rutas de distribución en zonas montañosas.',
      manufacturing:
        'INGEMMET 2021 documenta la susceptibilidad a movimientos en masa en función de pendiente, litología y cobertura vegetal.',
      financial:
        'INGEMMET (2021) proporciona la cartografía de susceptibilidad a movimientos en masa para la evaluación de riesgo físico.',
      hospitality:
        'El catálogo histórico de eventos (INDECI / INGEMMET) documenta casos de deslizamientos afectando instalaciones de turismo en zonas de ladera.',
    },
  },

  climate_mode: {
    measure: {
      general:
        'Monitorear la evolución de la fase ENSO mediante NOAA CPC para anticipar variaciones estacionales de precipitación y temperatura.',
      retail:
        'Incorporar la previsión estacional ENSO (SENAMHI / NOAA CPC) en la planificación de inventarios y operaciones por temporada.',
      agriculture:
        'Adaptar el calendario agrícola y las decisiones de riego según el pronóstico estacional ENSO de SENAMHI.',
      infrastructure:
        'Considerar la variabilidad interanual ENSO en los planes de mantenimiento preventivo de infraestructura crítica.',
      logistics:
        'Desarrollar planes de contingencia estacionales alineados con la previsión ENSO para la gestión de la cadena de suministro.',
      manufacturing:
        'Anticipar variaciones en disponibilidad de insumos hídricos y energéticos asociadas a la variabilidad interanual ENSO.',
      financial:
        'Incorporar el contexto ENSO en los modelos de evaluación de exposición estacional de activos físicos en el Perú.',
      hospitality:
        'Ajustar la planificación de actividades al aire libre y la comunicación de condiciones climáticas a huéspedes según la fase ENSO activa.',
    },
    rationale: {
      general:
        'La fase ENSO (NOAA CPC ONI) modula la variabilidad interanual de precipitación y temperatura en la costa del Pacífico de América del Sur.',
      retail:
        'La variabilidad ENSO afecta los patrones estacionales de demanda y las condiciones de transporte y distribución en el Perú.',
      agriculture:
        'El Niño y La Niña modifican la distribución estacional de lluvias: El Niño provoca lluvias extremas en la costa norte; La Niña amplifica la sequía.',
      infrastructure:
        'Los eventos El Niño históricos (1982–83, 1997–98, 2017) han causado daños severos a infraestructura vial, puentes y drenaje en el Perú.',
      logistics:
        'La variabilidad ENSO es el principal factor de riesgo estacional para la interrupción de cadenas de suministro en la región.',
      manufacturing:
        'La disponibilidad de agua para refrigeración y procesos industriales varía con la fase ENSO en la región andina.',
      financial:
        'El catálogo histórico ENSO (NOAA CPC) documenta los impactos de El Niño 1997–98 y 2015–16 como eventos de referencia para evaluación de exposición.',
      hospitality:
        'El Niño 1997–98 y El Niño Costero 2017 causaron disrupciones al turismo y las instalaciones hoteleras en costa y sierra del Perú.',
    },
  },
};

export { ADAPTATION_CATALOG };

const VALID_SECTORS = new Set([
  'general', 'retail', 'agriculture', 'infrastructure',
  'logistics', 'manufacturing', 'financial', 'hospitality',
]);

// ─── FASE C — Adaptation Measures Builder ────────────────────────────────────

/**
 * Builds a list of qualitative adaptation measures contextualized by:
 *   - Signal groups detected in the interpretation output (Layer 7)
 *   - The specified economic sector
 *
 * Invariants:
 *   - No cost estimates (no monetary values)
 *   - No efficacy percentages
 *   - All measures are qualitative and action-oriented
 *   - Rationales cite scientific sources (CMIP6, IPCC AR6, INGEMMET, etc.)
 *
 * @param {Object}  interpretationOutput - Layer 7 output (signal_groups)
 * @param {Object}  [opts]
 * @param {string}  [opts.sector='general'] - Economic sector for contextualization
 * @returns {Object[]} adaptations[]
 */
export function buildAdaptationMeasures(interpretationOutput, opts = {}) {
  const rawSector = (opts.sector ?? 'general').toLowerCase();
  const sector    = VALID_SECTORS.has(rawSector) ? rawSector : 'general';
  const groups    = interpretationOutput?.signal_groups ?? [];
  const groupIds  = groups.map(g => g.group_id);

  const adaptations = [];

  for (const [groupKey, catalog] of Object.entries(ADAPTATION_CATALOG)) {
    if (!groupIds.includes(groupKey)) continue;

    const measure   = catalog.measure[sector]   ?? catalog.measure.general;
    const rationale = catalog.rationale[sector] ?? catalog.rationale.general;

    adaptations.push({
      measure,
      rationale,
      signal_group: groupKey,
      sector,
    });
  }

  return adaptations;
}

// ─── FASE E — Validation Patterns ────────────────────────────────────────────

const URGENCY_PATTERNS = [
  /\burgente\b/i,
  /\burgencia\b/i,
  /\bdebe actuar ahora\b/i,
  /\bacción inmediata\b/i,
  /\binmediata acción\b/i,
];

const ALARMISM_PATTERNS = [
  /\bcatastrófico\b/i,
  /\bcolapso\b/i,
  /\bdesastre inminente\b/i,
  /\binevitable\b/i,
  /\bpeligro inminente\b/i,
  /\bemergencia climática\b/i,
];

const FINANCIAL_PATTERNS = [
  /\bcosto estimado\b/i,
  /\bcosto de\b/i,
  /\bpérdida económica\b/i,
  /\bpérdidas económicas\b/i,
  /\bUSD\b/,
  /\bdólares\b/i,
  /\bmillones de\b/i,
  /\bimpacto financiero\b/i,
];

const HEURISTIC_PATTERNS = [
  /\brisk_score\b/i,
  /\boverall_score\b/i,
  /\bpuntaje de riesgo\b/i,
  /\bcalificación de riesgo\b/i,
  /\burgency_rank\b/i,
  /\branking de riesgo\b/i,
];

const EFFICACY_PATTERNS = [
  /eficacia del \d+%/i,
  /eficiencia del \d+%/i,
  /reduce en \d+%/i,
];

/**
 * FASE E — Validates the storytelling output against platform invariants.
 *
 * Checks:
 *   - No urgency-mandating language
 *   - No alarmism
 *   - No financial language (costs, USD, millions)
 *   - No hidden heuristic scores
 *   - No efficacy claims in adaptation measures
 *   - Citations present (sources_cited non-empty)
 *   - Scenario mentioned in paragraphs (SSP)
 *   - Uncertainty mentioned in uncertainty_note (confianza)
 *
 * @param {Object} output - buildStorytellingContext output (or partial)
 * @returns {Object} validation flags + validation_passed
 */
export function validateStorytelling(output) {
  const narrative   = output?.narrative ?? {};
  const adaptations = output?.adaptations ?? [];

  const paragraphs  = (narrative.paragraphs ?? []).join(' ');
  const uncNote     = narrative.uncertainty_note ?? '';
  const adaptTexts  = adaptations.map(a => `${a.measure} ${a.rationale}`).join(' ');
  const allText     = `${paragraphs} ${uncNote} ${adaptTexts}`;
  const fullJson    = JSON.stringify(output ?? {});

  const has_urgency_language   = URGENCY_PATTERNS.some(p => p.test(allText));
  const has_alarmism           = ALARMISM_PATTERNS.some(p => p.test(allText));
  const has_financial_language = FINANCIAL_PATTERNS.some(p => p.test(allText));
  const has_hidden_heuristics  = HEURISTIC_PATTERNS.some(p => p.test(fullJson));
  const has_efficacy_claims    = EFFICACY_PATTERNS.some(p => p.test(allText));

  const citations_present     = (narrative.sources_cited ?? []).length > 0;
  const scenario_mentioned    = /SSP/i.test(paragraphs);
  const uncertainty_mentioned = /confianza/i.test(uncNote);

  const validation_passed =
    !has_urgency_language &&
    !has_alarmism &&
    !has_financial_language &&
    !has_hidden_heuristics &&
    !has_efficacy_claims &&
    citations_present &&
    scenario_mentioned &&
    uncertainty_mentioned;

  return {
    has_urgency_language,
    has_alarmism,
    has_financial_language,
    has_hidden_heuristics,
    has_efficacy_claims,
    citations_present,
    scenario_mentioned,
    uncertainty_mentioned,
    validation_passed,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Sprint 10 — Scientific Storytelling Engine entry point.
 *
 * Assembles a complete, scientifically traceable climate story from
 * the outputs of Layers 7, 8, and 9.
 *
 * @param {Object}  interpretationOutput - Layer 7: interpretSignals() output
 * @param {Object}  projectionContext    - Layer 9: buildProjectionContext() output
 * @param {Object}  historicalContext    - Layer 8: buildHistoricalContext() output
 * @param {Object}  [opts]
 * @param {string}  [opts.scenario='ssp245']  - Projection scenario
 * @param {string}  [opts.window='mid_term']  - Time window
 * @param {string}  [opts.sector='general']   - Economic sector for adaptations
 * @returns {Object} {
 *   narrative     — FASE A: paragraphs, sources, scenario, horizon, uncertainty
 *   adaptations   — FASE C: qualitative measures, no costs, sector-contextualized
 *   metadata      — signals_used, groups_covered, scenario, window, sector
 *   validation    — FASE E: invariant checks
 *   generated_at  — ISO timestamp
 * }
 */
export function buildStorytellingContext(
  interpretationOutput,
  projectionContext,
  historicalContext,
  opts = {}
) {
  const scenario = opts.scenario ?? 'ssp245';
  const window   = opts.window   ?? 'mid_term';
  const sector   = opts.sector   ?? 'general';

  // FASE A — Main narrative
  const narrative = buildMainNarrative(
    interpretationOutput,
    projectionContext,
    historicalContext,
    { scenario, window }
  );

  // FASE C — Adaptation measures
  const adaptations = buildAdaptationMeasures(interpretationOutput, { sector });

  // Metadata
  const signalGroups = interpretationOutput?.signal_groups ?? [];
  const metadata = {
    signals_used:   (interpretationOutput?.interpretations ?? [])
      .flatMap(i => i.group_ids ?? []),
    groups_covered: signalGroups.map(g => g.group_id),
    scenario,
    window,
    sector,
  };

  const output = {
    narrative,
    adaptations,
    metadata,
    generated_at: new Date().toISOString(),
  };

  // FASE E — Validation (after assembling output)
  output.validation = validateStorytelling(output);

  return output;
}
