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

import type { ConsolidatedRisk, TemporalPeriod } from './consolidatedRisk';

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
