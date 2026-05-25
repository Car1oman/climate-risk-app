/**
 * buildNarrativeReport — Sprint 15.
 *
 * Assembles the top-level NarrativeReport from ConsolidatedRisk[].
 * Produces four narrative texts:
 *   - executiveSummary : hero paragraph (all horizons combined)
 *   - historicalNarrative : past-observation risks
 *   - midTermNarrative  : 2040–2059 risks
 *   - longTermNarrative : 2060–2079 risks
 */

import type { ConsolidatedRisk, NarrativeReport, TemporalPeriod } from './consolidatedRisk';
import { buildExecutiveSummary } from './normalizeRisks';

const PERIOD_LABEL: Record<TemporalPeriod, string> = {
  historico:     'período histórico de referencia',
  corto_plazo:   'corto plazo (2020–2039)',
  mediano_plazo: 'mediano plazo (2040–2059)',
  largo_plazo:   'largo plazo (2060–2079)',
};

function buildPeriodNarrative(risks: ConsolidatedRisk[], period: TemporalPeriod): string {
  const filtered = risks.filter(r => r.period === period && r.confidence !== 'baja');
  if (!filtered.length) return '';

  const parts = filtered.map(r => {
    const metric = r.keyMetric ? ` (${r.keyMetric})` : '';
    return `${r.displayName.toLowerCase()}${metric}`;
  });

  const riskList =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1];

  const adaptCount = filtered.flatMap(r => r.adaptationMeasures).length;
  const adaptSentence =
    adaptCount > 0
      ? ` Se disponen ${adaptCount} medida${adaptCount > 1 ? 's' : ''} de adaptación asociada${adaptCount > 1 ? 's' : ''}.`
      : '';

  return (
    `En el ${PERIOD_LABEL[period]}, el análisis identifica ${riskList} ` +
    `como fenómeno${filtered.length > 1 ? 's' : ''} relevante${filtered.length > 1 ? 's' : ''} ` +
    `para esta ubicación.` +
    adaptSentence
  );
}

/**
 * Assembles a complete NarrativeReport from ConsolidatedRisk[].
 *
 * @param risks           - Deduplicated risks from normalizeRisks()
 * @param locationLabel   - Human-readable location name ("Lima, Perú")
 * @param sectorLabel     - Human-readable sector name ("Retail")
 * @param rawResponse     - Optional raw API response for metadata (analysisDate)
 */
export function buildNarrativeReport(
  risks: ConsolidatedRisk[],
  locationLabel: string,
  sectorLabel: string,
  rawResponse?: Record<string, unknown>
): NarrativeReport {
  const executiveSummary    = buildExecutiveSummary(risks, locationLabel, sectorLabel);
  const historicalNarrative = buildPeriodNarrative(risks, 'historico');
  const midTermNarrative    = buildPeriodNarrative(risks, 'mediano_plazo');
  const longTermNarrative   = buildPeriodNarrative(risks, 'largo_plazo');

  const primaryScenario =
    risks.find(r => r.scenario !== null)?.scenario ?? null;

  const confRank: Record<string, number> = { alta: 3, media: 2, baja: 1 };
  const topConfidence = risks.reduce<'alta' | 'media' | 'baja'>(
    (best, r) => (confRank[r.confidence] > confRank[best] ? r.confidence : best),
    'baja'
  );

  const meta = rawResponse?.metadata as Record<string, unknown> | undefined;
  const analysisDate =
    (meta?.generated_at as string | undefined) ?? new Date().toISOString();

  return {
    locationLabel,
    executiveSummary,
    historicalNarrative,
    midTermNarrative,
    longTermNarrative,
    risks,
    sectorLabel,
    analysisDate,
    primaryScenario,
    confidence: topConfidence,
  };
}
