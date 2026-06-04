/**
 * buildOperationalNarrative — Sprint 18.
 *
 * Translates climate metrics and scientific concepts into operational business
 * language suitable for non-technical executives and managers.
 *
 * Invariants:
 *   - NO technical codes: SSP245/585, CMIP6, Rx5day, anomalías, Tmax, percentiles
 *   - NO raw metric values in any returned narrative string
 *   - Deduplicates by riskType: "lluvias extremas, lluvias extremas y sequía" → impossible
 *   - Focus areas: operational continuity, logistics, supply chain, infrastructure
 */

import type { ConsolidatedRisk, TemporalPeriod, ScenarioVariant, RiskTypeSlug } from './consolidatedRisk';

// ─── Operational impact domains per risk type ─────────────────────────────────

const IMPACT_DOMAINS: Record<string, string[]> = {
  lluvias_extremas: ['accesos y logística', 'continuidad operativa'],
  calor_extremo:    ['productividad del personal', 'demanda energética'],
  sequia:           ['abastecimiento hídrico', 'cadena de suministro'],
  deslizamiento:    ['vías de acceso', 'infraestructura crítica'],
  heladas:          ['instalaciones expuestas', 'operaciones en campo'],
  fenomeno_enso:    ['logística', 'planificación operativa'],
  inundacion:       ['instalaciones', 'rutas logísticas'],
};

// ─── Projection phrases per temporal horizon ─────────────────────────────────

const MID_TERM_PROJECTION: Record<string, string> = {
  lluvias_extremas: 'lluvias más intensas y frecuentes',
  calor_extremo:    'temperaturas más extremas',
  sequia:           'períodos de sequía más extensos y severos',
  deslizamiento:    'mayor susceptibilidad a movimientos de terreno',
  heladas:          'episodios de heladas más intensos',
  fenomeno_enso:    'mayor variabilidad climática interanual',
  inundacion:       'mayor riesgo de desborde e inundaciones',
};

const LONG_TERM_PROJECTION: Record<string, string> = {
  lluvias_extremas: 'un régimen de lluvias más intenso y variable',
  calor_extremo:    'condiciones de calor extremo más frecuentes e intensas',
  sequia:           'mayor escasez hídrica',
  deslizamiento:    'riesgo incrementado de deslizamientos',
  heladas:          'variabilidad en el riesgo de heladas',
  fenomeno_enso:    'variabilidad climática de largo plazo amplificada',
  inundacion:       'mayor exposición a inundaciones',
};

// ─── Scenario phrases (plain language only) ───────────────────────────────────

const SCENARIO_PHRASE: Record<string, string> = {
  emisiones_moderadas: 'bajo un escenario de emisiones moderadas',
  altas_emisiones:     'bajo un escenario de altas emisiones',
  bajas_emisiones:     'bajo un escenario de bajas emisiones',
};

// ─── High-emissions projection phrases (more severe than moderate) ────────────

const MID_TERM_PROJECTION_HIGH: Record<string, string> = {
  lluvias_extremas: 'lluvias significativamente más intensas, con mayor frecuencia de eventos extremos',
  calor_extremo:    'temperaturas extremas con mayor frecuencia e intensidad sostenida',
  sequia:           'períodos de sequía más prolongados y severos, con escasez hídrica crítica',
  deslizamiento:    'un riesgo considerablemente mayor de movimientos de terreno e inestabilidad de laderas',
  heladas:          'episodios de heladas con mayor variabilidad e intensidad',
  fenomeno_enso:    'mayor variabilidad climática interanual, con eventos El Niño / La Niña más intensos',
  inundacion:       'un riesgo de desborde e inundaciones notablemente más elevado',
};

const LONG_TERM_PROJECTION_HIGH: Record<string, string> = {
  lluvias_extremas: 'un régimen de lluvias substancialmente más intenso, variable y disruptivo',
  calor_extremo:    'condiciones de calor extremo persistentes que impactarán gravemente la operación y el personal',
  sequia:           'escasez hídrica crónica con restricciones operativas estructurales',
  deslizamiento:    'un riesgo elevado y persistente de deslizamientos sobre infraestructura crítica',
  heladas:          'variabilidad extrema en el riesgo de heladas con impacto en instalaciones y cultivos',
  fenomeno_enso:    'variabilidad climática de largo plazo significativamente amplificada, con ciclos más extremos',
  inundacion:       'exposición elevada y recurrente a inundaciones con daños estructurales frecuentes',
};

const SHORT_TERM_PROJECTION: Record<string, string> = {
  lluvias_extremas: 'mayor frecuencia de lluvias intensas',
  calor_extremo:    'temperaturas más elevadas con mayor frecuencia de episodios cálidos',
  sequia:           'períodos de déficit hídrico más frecuentes',
  deslizamiento:    'mayor susceptibilidad a movimientos de terreno',
  heladas:          'variabilidad en la intensidad de heladas',
  fenomeno_enso:    'variabilidad climática interanual incrementada',
  inundacion:       'mayor probabilidad de inundaciones y desbordes',
};

const SHORT_TERM_PROJECTION_HIGH: Record<string, string> = {
  lluvias_extremas: 'mayor frecuencia e intensidad de lluvias extremas',
  calor_extremo:    'temperaturas significativamente más elevadas con mayor frecuencia de eventos extremos',
  sequia:           'déficit hídrico más acentuado y frecuente',
  deslizamiento:    'mayor riesgo de inestabilidad de laderas y movimientos de terreno',
  heladas:          'mayor variabilidad e intensidad en episodios de heladas',
  fenomeno_enso:    'mayor variabilidad climática con eventos El Niño / La Niña más frecuentes e intensos',
  inundacion:       'mayor exposición a inundaciones y eventos de desborde',
};

// ─── Additional impacts under high-emissions scenario ─────────────────────────

const HIGH_EMISSION_EXTRA_IMPACTS: Record<string, string[]> = {
  lluvias_extremas: ['daños estructurales más frecuentes y costosos', 'interrupciones logísticas prolongadas'],
  calor_extremo:    ['mayor riesgo de estrés térmico en personal expuesto', 'aumento significativo del consumo energético'],
  sequia:           ['restricciones hídricas severas con impacto en procesos productivos', 'mayor vulnerabilidad en la cadena de suministro regional'],
  deslizamiento:    ['corte frecuente de vías de acceso críticas', 'mayor exposición de activos a daños estructurales'],
  heladas:          ['daños más frecuentes a equipos e instalaciones expuestas', 'mayor impacto en operaciones de campo'],
  fenomeno_enso:    ['disrupciones operativas más frecuentes y de mayor duración', 'mayor incertidumbre en planificación anual'],
  inundacion:       ['mayor exposición de activos estratégicos a daños por agua', 'necesidad de medidas de protección reforzadas'],
};

// ─── Temporal evolution sentences per risk type ───────────────────────────────
// Used by RiskTimeline to contextualize how the risk evolves across time.

const TEMPORAL_EVOLUTION: Record<string, string> = {
  lluvias_extremas: 'Las lluvias intensas ya se observan históricamente en esta zona, y podrían incrementarse en frecuencia e intensidad hacia mediados de siglo, con mayor severidad a largo plazo bajo altas emisiones.',
  calor_extremo:    'El calor extremo es un fenómeno ya registrado históricamente, con proyecciones de aumento significativo en frecuencia e intensidad durante las próximas décadas.',
  sequia:           'La sequía tiene antecedentes históricos en esta área, con mayor riesgo de déficit hídrico proyectado hacia 2050 y condiciones más severas a largo plazo.',
  deslizamiento:    'Los deslizamientos tienen registros históricos en la zona; su susceptibilidad proyecta incrementarse a medida que aumenten las precipitaciones extremas asociadas al cambio climático.',
  heladas:          'Las heladas son un fenómeno documentado históricamente, con variaciones proyectadas en su intensidad y frecuencia que requieren seguimiento continuo.',
  fenomeno_enso:    'El Fenómeno El Niño / La Niña tiene un registro histórico extenso; el cambio climático proyecta amplificar su variabilidad e intensidad en las próximas décadas.',
  inundacion:       'Las inundaciones tienen antecedentes históricos en la zona, con mayor exposición proyectada bajo escenarios de cambio climático y precipitaciones más extremas.',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}

function dedupeByRiskType(risks: ConsolidatedRisk[]): ConsolidatedRisk[] {
  const seen = new Set<string>();
  return risks.filter(r => {
    if (seen.has(r.riskType)) return false;
    seen.add(r.riskType);
    return true;
  });
}

// ─── Executive summary ────────────────────────────────────────────────────────

/**
 * Builds a 2–3 sentence hero paragraph using operational business language.
 * Deduplicates by riskType so the same phenomenon never appears twice.
 * Never exposes raw metrics, IPCC codes, or scenario identifiers.
 */
export function buildOperationalExecutiveSummary(
  risks: ConsolidatedRisk[],
  locationLabel: string,
  sectorLabel: string
): string {
  const qualifying = risks.filter(r => r.confidence !== 'baja');
  const unique = dedupeByRiskType(qualifying).slice(0, 3);

  if (unique.length === 0) {
    return `Para ${locationLabel}, el análisis no identificó riesgos climáticos de alta o media confianza en el período evaluado.`;
  }

  const riskNames = unique.map(r => r.displayName.toLowerCase());
  const riskList = formatList(riskNames);

  const domains = unique
    .flatMap(r => IMPACT_DOMAINS[r.riskType] ?? [])
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3);

  const impactSentence = domains.length > 0
    ? ` Esto podría afectar ${formatList(domains)}.`
    : '';

  const adaptCount = risks.flatMap(r => r.adaptationMeasures).length;
  const adaptSentence = adaptCount > 0
    ? ` Se identificaron ${adaptCount} medidas de adaptación prioritarias.`
    : '';

  return (
    `Para ${locationLabel}, el análisis identifica ${riskList} como los principales` +
    ` riesgos para las operaciones de ${sectorLabel}.` +
    impactSentence +
    adaptSentence
  );
}

// ─── Period narratives ────────────────────────────────────────────────────────

/**
 * Builds an operational narrative for a specific temporal period.
 *
 * - historico: observation language ("se han identificado")
 * - mediano_plazo: projection language ("podría experimentar") + scenario plain label
 * - largo_plazo: projection language ("se proyecta") + scenario plain label
 *
 * No raw metrics. No IPCC/SSP codes.
 */
export function buildOperationalPeriodNarrative(
  risks: ConsolidatedRisk[],
  period: TemporalPeriod
): string {
  const filtered = risks.filter(r => r.period === period && r.confidence !== 'baja');
  if (!filtered.length) return '';

  const unique = dedupeByRiskType(filtered);
  const adaptCount = filtered.flatMap(r => r.adaptationMeasures).length;
  const adaptSuffix = adaptCount > 0
    ? ` Se disponen ${adaptCount} medida${adaptCount > 1 ? 's' : ''} de adaptación.`
    : '';

  if (period === 'historico') {
    const names = unique.map(r => r.displayName.toLowerCase());
    const list = formatList(names);
    const domains = unique
      .flatMap(r => IMPACT_DOMAINS[r.riskType] ?? [])
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 2);
    const domainSuffix = domains.length > 0
      ? `, con potencial afectación sobre ${formatList(domains)}`
      : '';
    return `En el período de referencia, se han identificado ${list} en esta zona${domainSuffix}.${adaptSuffix}`;
  }

  if (period === 'mediano_plazo') {
    const projections = unique.map(
      r => MID_TERM_PROJECTION[r.riskType] ?? r.displayName.toLowerCase()
    );
    const projList = formatList(projections);
    const scenario = unique[0]?.scenario;
    const scenarioPart = scenario && SCENARIO_PHRASE[scenario]
      ? `${SCENARIO_PHRASE[scenario]}, esta zona`
      : 'esta zona';
    return `Hacia mediados de siglo, ${scenarioPart} podría experimentar ${projList}.${adaptSuffix}`;
  }

  if (period === 'largo_plazo') {
    const projections = unique.map(
      r => LONG_TERM_PROJECTION[r.riskType] ?? r.displayName.toLowerCase()
    );
    const projList = formatList(projections);
    const scenario = unique[0]?.scenario;
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo un escenario de altas emisiones'
      : 'A largo plazo';
    return `${lead}, se proyecta ${projList}, con mayor afectación sobre la infraestructura y las operaciones.${adaptSuffix}`;
  }

  // corto_plazo
  const names = unique.map(r => r.displayName.toLowerCase());
  return `En el corto plazo se anticipan ${formatList(names)} con potencial de impacto operativo.${adaptSuffix}`;
}

// ─── Scenario variant builders ────────────────────────────────────────────────

/**
 * Builds the scenario-specific narrative text for a single risk type in a
 * projection period.  Returns empty string for 'historico'.
 */
function buildScenarioNarrativeText(
  riskType: RiskTypeSlug,
  period: TemporalPeriod,
  scenario: 'emisiones_moderadas' | 'altas_emisiones'
): string {
  if (period === 'historico') return '';

  if (period === 'mediano_plazo') {
    const phrase = scenario === 'altas_emisiones'
      ? MID_TERM_PROJECTION_HIGH[riskType]
      : MID_TERM_PROJECTION[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo altas emisiones, hacia mediados de siglo esta zona podría experimentar'
      : 'Hacia mediados de siglo, bajo emisiones moderadas, esta zona podría experimentar';
    return `${lead} ${phrase ?? riskType}.`;
  }

  if (period === 'largo_plazo') {
    const phrase = scenario === 'altas_emisiones'
      ? LONG_TERM_PROJECTION_HIGH[riskType]
      : LONG_TERM_PROJECTION[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo un escenario de altas emisiones a largo plazo, se proyecta'
      : 'A largo plazo, bajo emisiones moderadas, se proyecta';
    return `${lead} ${phrase ?? riskType}, con afectación sobre la infraestructura y las operaciones.`;
  }

  if (period === 'corto_plazo') {
    const phrase = scenario === 'altas_emisiones'
      ? SHORT_TERM_PROJECTION_HIGH[riskType]
      : SHORT_TERM_PROJECTION[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo altas emisiones, en el corto plazo se anticipa'
      : 'En el corto plazo, bajo emisiones moderadas, se anticipa';
    return `${lead} ${phrase ?? riskType}.`;
  }

  return '';
}

/**
 * Builds both ScenarioVariant objects (moderate + high) for a projection risk.
 * Returns empty object for 'historico' period — no scenario distinction needed.
 *
 * Called by normalizeRisks() when building each ConsolidatedRisk entry.
 */
export function buildScenarioVariants(
  riskType: RiskTypeSlug,
  period: TemporalPeriod,
  baseImpacts: string[]
): Partial<Record<'emisiones_moderadas' | 'altas_emisiones', ScenarioVariant>> {
  if (period === 'historico') return {};

  const moderate: ScenarioVariant = {
    narrativeText: buildScenarioNarrativeText(riskType, period, 'emisiones_moderadas'),
    impacts: baseImpacts.slice(),
    confidence: 'media',
  };

  const highExtraImpacts = HIGH_EMISSION_EXTRA_IMPACTS[riskType] ?? [];
  const allHighImpacts = [...baseImpacts, ...highExtraImpacts]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);

  const high: ScenarioVariant = {
    narrativeText: buildScenarioNarrativeText(riskType, period, 'altas_emisiones'),
    impacts: allHighImpacts,
    confidence: 'alta',
  };

  return { emisiones_moderadas: moderate, altas_emisiones: high };
}

/**
 * Returns a single sentence describing how a risk type evolves across
 * historical → mid-term → long-term horizons.
 * Used by RiskTimeline as the "cómo evoluciona el fenómeno" caption.
 */
export function buildTemporalEvolutionSentence(riskType: RiskTypeSlug): string {
  return TEMPORAL_EVOLUTION[riskType] ?? `Este fenómeno presenta variaciones proyectadas a lo largo de los horizontes temporales analizados.`;
}

/**
 * Builds a phase-specific ENSO narrative for the ConsolidatedRisk card.
 * Only for corto_plazo — ENSO is never projected in future horizons (I3).
 *
 * Mirrors ensoService.buildEnsoNarrative() but adapted for the card context.
 */
export function buildEnsoShortTermNarrative(
  phase: string,
  intensity: string | undefined,
  oni: number | undefined,
  trend: string | undefined,
  summary: string | undefined
): string {
  if (phase === 'neutral') {
    const oniStr = oni != null ? ` (ONI: ${oni > 0 ? '+' : ''}${oni.toFixed(2)}°C)` : '';
    return `Fase ENSO neutral${oniStr}. Sin amplificación climática por El Niño/La Niña. Los riesgos de inundación y sequía dependen de las proyecciones climáticas de largo plazo.`;
  }

  const phaseLabel   = phase === 'el_nino' ? 'El Niño' : 'La Niña';
  const intensityStr = intensity && intensity !== 'neutro' ? ` ${intensity}` : '';
  const oniStr       = oni != null
    ? ` (ONI: ${oni > 0 ? '+' : ''}${oni.toFixed(2)}°C)`
    : '';
  const trendStr     = trend === 'increasing'  ? ' en aumento'
                     : trend === 'decreasing'   ? ' en disminución'
                     : '';

  const base = `Se detecta ${phaseLabel}${intensityStr} activo${oniStr}${trendStr}.`;
  return summary ? `${base} ${summary}` : base;
}
