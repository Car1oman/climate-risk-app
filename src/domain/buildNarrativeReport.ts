/**
 * buildNarrativeReport — Sprint 15.
 *
 * Assembles the top-level NarrativeReport from ConsolidatedRisk[].
 * Produces four narrative texts:
 *   - executiveSummary : hero paragraph (all horizons combined)
 *   - executiveSummary : hero paragraph (all horizons combined)
 *   - historicalNarrative : past-observation risks (1981–2014)
 *   - nearTermNarrative   : near-term projection risks (2020–2039)
 *   - midTermNarrative  : 2040–2059 risks
 *   - longTermNarrative : 2060–2079 risks
 */

import type { ConsolidatedRisk, NarrativeReport, TemporalPeriod } from './consolidatedRisk';
import {
  buildOperationalExecutiveSummary,
  buildOperationalPeriodNarrative,
} from './buildOperationalNarrative';

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
  const executiveSummary    = buildOperationalExecutiveSummary(risks, locationLabel, sectorLabel);
  const historicalNarrative = buildOperationalPeriodNarrative(risks, 'historico');
  const nearTermNarrative   = buildOperationalPeriodNarrative(risks, 'corto_plazo');
  const midTermNarrative    = buildOperationalPeriodNarrative(risks, 'mediano_plazo');
  const longTermNarrative   = buildOperationalPeriodNarrative(risks, 'largo_plazo');

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
    nearTermNarrative,
    midTermNarrative,
    longTermNarrative,
    risks,
    sectorLabel,
    analysisDate,
    primaryScenario,
    confidence: topConfidence,
  };
}
