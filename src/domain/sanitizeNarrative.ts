/**
 * sanitizeNarrative — Sprint 21.
 *
 * Transforms raw Layer9 scientific narratives into executive operational language.
 * Applied to any text that might contain IPCC codes, SSP identifiers, CMIP6
 * references, or technical climate-science terminology before it reaches the UI.
 *
 * Invariants:
 *   - No SSP codes visible outside ScientificFooter
 *   - No CMIP6, ensemble, percentile, anomalía visible to non-technical users
 *   - No raw variable names (Rx5day, Tmax, hd35, SPEI, ONI) in executive UI
 *   - Clean double-spaces and dangling punctuation after replacements
 */

// ─── Term replacement table ───────────────────────────────────────────────────
// Order matters: more specific patterns before generic ones.

export const NARRATIVE_REPLACEMENTS: Array<[RegExp, string]> = [
  // ── SSP scenario codes ─────────────────────────────────────────────────────
  [/SSP\s*2[-–]4\.5/gi,                    'escenario de emisiones moderadas'],
  [/SSP\s*5[-–]8\.5/gi,                    'escenario de altas emisiones'],
  [/SSP\s*1[-–]2\.6/gi,                    'escenario de bajas emisiones'],
  [/\bssp\s*245\b/gi,                       'emisiones moderadas'],
  [/\bssp\s*585\b/gi,                       'altas emisiones'],
  [/\bssp\s*126\b/gi,                       'bajas emisiones'],
  [/bajo\s+SSP\s*2[-–]4\.5/gi,             'bajo emisiones moderadas'],
  [/bajo\s+SSP\s*5[-–]8\.5/gi,             'bajo altas emisiones'],

  // ── Dataset / model references ─────────────────────────────────────────────
  [/CMIP6\s+ensemble\s+spread/gi,           ''],
  [/CMIP6\s+ensemble/gi,                    ''],
  [/\bCMIP6\b/gi,                           ''],
  [/\bensemble\s+spread\b/gi,               ''],
  [/\bensemble\b/gi,                        ''],
  [/\bGCM\b/gi,                             ''],
  [/modelos?\s+climáticos?\s+globales?/gi,  ''],

  // ── Precipitation / rainfall variables ────────────────────────────────────
  [/\bRx5day\b/gi,                          'lluvias intensas persistentes'],
  [/\bRx1day\b/gi,                          'precipitaciones extremas diarias'],
  [/\brx5day\b/gi,                          'lluvias intensas persistentes'],
  [/\brx1day\b/gi,                          'precipitaciones extremas diarias'],
  [/\bprecipitación\s+máxima\s+en\s+5\s+días\b/gi, 'lluvias intensas persistentes'],
  [/\bprecipitación\s+máxima\s+diaria\b/gi, 'precipitación extrema'],

  // ── Temperature variables ──────────────────────────────────────────────────
  [/\bTmax\s*[>≥]\s*\d+\s*°?C\b/gi,        'episodios de calor extremo'],
  [/\bTmax\s*[>≥]\s*\d+\b/gi,              'episodios de calor extremo'],
  [/\bTmax\b/gi,                            'temperatura máxima'],
  [/\btasmax\b/gi,                          'temperatura máxima'],
  [/\btasmin\b/gi,                          'temperatura mínima'],
  [/\btas\b/gi,                             'temperatura media'],
  [/\bhd\d{2}\b/gi,                         'días de calor extremo'],
  [/\bhd35\b/gi,                            'días de calor extremo'],
  [/\bhd40\b/gi,                            'días de calor muy extremo'],

  // ── Drought / hydric variables ─────────────────────────────────────────────
  [/\bSPEI[-\s]?\d*\b/gi,                   'índice de estrés hídrico'],
  [/\bSPI[-\s]?\d*\b/gi,                    'indicador de sequía'],
  [/\bPDSI\b/gi,                            'indicador de sequía'],

  // ── ENSO codes ─────────────────────────────────────────────────────────────
  [/\bONI\b/g,                              'índice El Niño/La Niña'],
  [/\bENSO\b/gi,                            'Fenómeno El Niño / La Niña'],

  // ── Statistical / baseline references ─────────────────────────────────────
  [/baseline\s+\d{4}[–\-]\d{4}/gi,         ''],
  [/\d{4}[–\-]\d{4}\s+baseline/gi,         ''],
  [/\bbaseline\s+\d{4}\b/gi,               ''],   // single-year form: "baseline 1981"
  [/\bbaseline\b/gi,                        ''],   // any remaining standalone baseline
  [/per[íi]odo\s+de\s+referencia\s+\d{4}[–\-]\d{4}/gi, 'período histórico de referencia'],
  [/percentil\s+\d+/gi,                     'nivel de referencia'],
  [/percentile\s+\d+/gi,                    'reference threshold'],
  [/p\d{2}\s+percentile/gi,                 'reference threshold'],
  [/\bpercentil\b/gi,                       'nivel de referencia'],
  [/\bpercentile\b/gi,                      'reference threshold'],

  // ── Uncertainty / confidence language ─────────────────────────────────────
  [/confidence\s+interval/gi,               'margen de incertidumbre'],
  [/intervalo\s+de\s+confianza/gi,          'margen de incertidumbre'],
  [/spread\s+de?\s+incertidumbre/gi,        'nivel de incertidumbre'],

  // ── Anomaly language ───────────────────────────────────────────────────────
  [/anomal[íi]a\s+de\s+temperatura/gi,      'incremento de temperatura'],
  [/anomal[íi]a\s+de\s+precipitaci[oó]n/gi, 'variación en precipitación'],
  [/anomal[íi]a\s+t[eé]rmica/gi,            'variación de temperatura'],
  [/\banomal[íi]a\b/gi,                     'variación proyectada'],
  [/\banomal[íi]as\b/gi,                    'variaciones proyectadas'],
  [/\banomaly\b/gi,                         'projected change'],

  // ── Raw numeric values with climate units ─────────────────────────────────
  // Remove patterns like "55.1 mm/día", "2.3°C de incremento" from exec context
  [/\d+\.?\d*\s*mm\/d[íi]a/gi,             ''],
  [/\d+\.?\d*\s*mm\/día/gi,                ''],
  [/\d+\.?\d*°C\s+de\s+(incremento|aumento|elevación|anomal[íi]a)/gi, 'incremento de temperatura'],
];

// ─── Core sanitizer ────────────────────────────────────────────────────────────

/**
 * Applies all NARRATIVE_REPLACEMENTS to a text string and cleans up
 * double-spaces and dangling punctuation left by empty replacements.
 *
 * Safe to call on null/undefined — returns the input unchanged.
 */
export function sanitizeScientificTerms(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;
  for (const [pattern, replacement] of NARRATIVE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // Clean artifacts from empty-string replacements
  result = result
    .replace(/\s{2,}/g, ' ')           // collapse double spaces
    .replace(/\s+([.,;:])/g, '$1')     // remove space before punctuation
    .replace(/\(\s*\)/g, '')           // remove empty parentheses
    .replace(/,\s*,/g, ',')            // collapse double commas
    .trim();

  return result;
}

/**
 * Converts a raw Layer9 narrative to executive operational language.
 *
 * If the result of sanitization is shorter than 10 characters (i.e. the raw
 * text was entirely technical codes), returns empty string so the caller can
 * fall back to the operational narrative built in buildOperationalNarrative.ts.
 */
export function buildExecutiveNarrative(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  const sanitized = sanitizeScientificTerms(rawText);
  if (sanitized.length < 10) return '';
  return sanitized;
}

// ─── Validation guard ─────────────────────────────────────────────────────────

/**
 * List of technical terms that must never appear outside the ScientificFooter.
 * Used by the sanitizer test suite and by runtime assertions in DEV mode.
 */
export const BANNED_TERMS_IN_EXECUTIVE_UI = [
  'SSP2-4.5', 'SSP5-8.5', 'SSP1-2.6',
  'ssp245', 'ssp585', 'ssp126',
  'CMIP6', 'ensemble spread', 'ensemble',
  'Rx5day', 'Rx1day', 'rx5day', 'rx1day',
  'Tmax', 'tasmax', 'tasmin',
  'SPEI', 'PDSI',
  'hd35', 'hd40',
  'percentil', 'percentile',
  'anomalía', 'anomalias', 'anomaly',
  'ONI', 'ENSO',
  'baseline 1981', 'baseline 1980',
  'confidence interval', 'intervalo de confianza',
];

/**
 * DEV-only check: logs a warning if any banned term is found in `text`.
 * Call this before rendering any narrative string outside ScientificFooter.
 */
export function assertNoBannedTerms(text: string, context = 'UI'): void {
  if (!import.meta.env.DEV || !text) return;
  for (const term of BANNED_TERMS_IN_EXECUTIVE_UI) {
    if (text.includes(term)) {
      console.warn(`[sanitizeNarrative] Banned term "${term}" detected in ${context}:`, text);
    }
  }
}
