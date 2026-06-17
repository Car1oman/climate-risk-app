/**
 * ENSO Intelligence Service — Sprint 5 + Advisory Integration
 *
 * Two-source ENSO intelligence:
 *   1. NOAA ONI (Oceanic Niño Index) — numerical threshold (±0.5°C, seasonal)
 *      URL: https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
 *   2. NOAA ENSO Diagnostic Discussion (Spanish) — official advisory status
 *      URL: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc_Sp.shtml
 *
 * When an active Warning or Watch is issued, the advisory phase supersedes the
 * ONI threshold. NOAA can declare El Niño even with ONI < 0.5°C when ocean-
 * atmosphere coupling indicators (winds, subsurface, convection) confirm the phase.
 *
 * IMPORTANT: This service is additive and non-blocking.
 * Any failure degrades gracefully — callers receive null instead of throwing.
 */

import * as ensoCache from './ensoCache.js';
import { fetchEnsoAdvisory } from './ensoAdvisoryService.js';
import { logger } from '../utils/logger.js';

const NOAA_ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
const FETCH_TIMEOUT_MS = 10_000; // 10 s — NOAA CPC is reliable but can be slow

// Official NOAA ONI thresholds
const EL_NINO_THRESHOLD =  0.5; // °C anomaly
const LA_NINA_THRESHOLD = -0.5; // °C anomaly

// Season codes in chronological order within a year (center month)
const SEASON_ORDER = {
  DJF: 2, JFM: 3, FMA: 4, MAM: 5, AMJ: 6,
  MJJ: 7, JJA: 8, JAS: 9, ASO: 10, SON: 11, OND: 12, NDJ: 1,
};

// For NDJ (Nov-Dec-Jan) the year in the file refers to November, so end-month is January of year+1
const NDJ_CROSS_YEAR = new Set(['NDJ']);

// ── Peru-specific ENSO impact knowledge base ────────────────────────────────

const PERU_IMPACTS = {
  el_nino: {
    summary: 'El Niño activo: alta probabilidad de lluvias extremas, inundaciones y deslizamientos en la costa norte y sierra de Perú.',
    flood_amplifier:      true,
    drought_amplifier:    false,
    supply_chain_risk:    'alto',
    affected_regions:     ['Costa Norte (Piura, Lambayeque, La Libertad)', 'Sierra (Áncash, Cajamarca)', 'Lima Metropolitana'],
    operational_risks: [
      'Interrupción de rutas logísticas costeras (Panamericana Norte)',
      'Daño en infraestructura de distribución por inundación',
      'Incremento de costos de transporte y seguros',
      'Riesgo de desabastecimiento por corte de cadena de suministro',
    ],
    intensity_thresholds: { debil: 0.5, moderado: 1.0, fuerte: 1.5, muy_fuerte: 2.0 },
  },
  la_nina: {
    summary: 'La Niña activa: condiciones de sequía en la costa norte peruana, refuerzo del anticiclón del Pacífico Sur.',
    flood_amplifier:      false,
    drought_amplifier:    true,
    supply_chain_risk:    'medio',
    affected_regions:     ['Costa Norte (déficit hídrico)', 'Selva Alta (lluvias por encima del promedio)'],
    operational_risks: [
      'Estrés hídrico en zonas de abastecimiento agrícola',
      'Reducción de caudales en ríos costeros del norte',
      'Menor riesgo de inundación costera que en El Niño',
    ],
    intensity_thresholds: { debil: -0.5, moderado: -1.0, fuerte: -1.5, muy_fuerte: -2.0 },
  },
  neutral: {
    summary: 'Condiciones ENOS neutras — sin amplificación climática por ENSO en Perú.',
    flood_amplifier:      false,
    drought_amplifier:    false,
    supply_chain_risk:    'bajo',
    affected_regions:     [],
    operational_risks:    [],
  },
};

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parses the raw NOAA CPC ONI text file.
 * Actual format (header + data rows):
 *   SEAS  YR   TOTAL   ANOM
 *   DJF   1950  24.72  -1.53
 *   JFM   1950  25.17  -1.34
 *   ...
 * Column order: season(0) year(1) total_sst(2) anomaly(3)
 * We need column 3 (ANOM), not column 2 (absolute SST).
 *
 * @param {string} text
 * @returns {Array<{season: string, year: number, month: number, anom: number}>}
 */
function parseONIText(text) {
  const lines  = text.split('\n');
  const result = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const [seasonRaw, yearRaw, , anomRaw] = parts; // skip TOTAL (col 2), take ANOM (col 3)
    const season = seasonRaw.toUpperCase();
    if (!(season in SEASON_ORDER)) continue; // skip header/blank lines

    const year  = parseInt(yearRaw,  10);
    const anom  = parseFloat(anomRaw);
    if (isNaN(year) || isNaN(anom)) continue;

    // NDJ: center month is December, spans Nov→Jan (year+1)
    const endMonth      = SEASON_ORDER[season];
    const effectiveYear = NDJ_CROSS_YEAR.has(season) ? year + 1 : year;

    result.push({ season, year, effectiveYear, month: endMonth, anom });
  }

  return result;
}

/**
 * Sorts parsed ONI records chronologically.
 */
function sortChronologically(records) {
  return [...records].sort((a, b) => {
    if (a.effectiveYear !== b.effectiveYear) return a.effectiveYear - b.effectiveYear;
    return a.month - b.month;
  });
}

// ── Phase classification ─────────────────────────────────────────────────────

/**
 * Determines current ENSO phase from the latest ONI value.
 * Uses NOAA threshold (±0.5°C).
 */
function classifyPhase(oni) {
  if (oni >= EL_NINO_THRESHOLD) return 'el_nino';
  if (oni <= LA_NINA_THRESHOLD) return 'la_nina';
  return 'neutral';
}

/**
 * Classifies ENSO intensity based on absolute anomaly magnitude.
 * Source: NOAA CPC intensity scale.
 */
function classifyIntensity(oni) {
  const abs = Math.abs(oni);
  if (abs >= 2.0) return 'muy_fuerte';
  if (abs >= 1.5) return 'fuerte';
  if (abs >= 1.0) return 'moderado';
  if (abs >= 0.5) return 'débil';
  return 'neutro';
}

/**
 * Detects trend direction from the last N records.
 * Returns 'increasing', 'decreasing', or 'stable'.
 */
function detectTrend(records, n = 4) {
  if (records.length < 2) return 'stable';
  const recent = records.slice(-Math.min(n, records.length));
  const first  = recent[0].anom;
  const last   = recent[recent.length - 1].anom;
  const delta  = last - first;
  if (Math.abs(delta) < 0.15) return 'stable';
  return delta > 0 ? 'increasing' : 'decreasing';
}

/**
 * Checks if the current phase has persisted for at least `minMonths` seasons.
 * Official NOAA El Niño/La Niña declaration requires 5 consecutive 3-month seasons.
 */
function countConsecutiveSeasonsInPhase(records, currentPhase, minMonths = 3) {
  let count = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const p = classifyPhase(records[i].anom);
    if (p === currentPhase) {
      count++;
    } else {
      break;
    }
  }
  return { count, isOfficiallyDeclared: count >= 5, meetsMinimum: count >= minMonths };
}

// ── Fetch & normalize ────────────────────────────────────────────────────────

/**
 * Fetches ONI data from NOAA CPC with timeout.
 * @returns {string} Raw text
 */
async function fetchONIRaw() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(NOAA_ONI_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`NOAA ONI HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds the normalized ENSO context object from parsed ONI records + advisory.
 *
 * Phase resolution priority:
 *   1. Advisory (Warning/Watch) → advisory.alert_phase  [most authoritative]
 *   2. ONI threshold (±0.5°C)  → classifyPhase(oni)    [numerical fallback]
 *
 * @param {Array} sorted - chronologically sorted ONI records
 * @param {Object|null} advisory - parsed advisory from ensoAdvisoryService
 * @returns {Object}
 */
function buildEnsoContext(sorted, advisory = null) {
  if (!sorted.length) return null;

  const latest      = sorted[sorted.length - 1];
  const oniPhase    = classifyPhase(latest.anom);
  const intensity   = classifyIntensity(latest.anom);
  const trend       = detectTrend(sorted, 4);
  const persistence = countConsecutiveSeasonsInPhase(sorted, oniPhase);

  // Advisory supersedes ONI when NOAA has issued an active Warning or Watch
  const advisoryActive = advisory?.is_active_alert && advisory?.alert_phase;
  const phase       = advisoryActive ? advisory.alert_phase : oniPhase;
  const phaseSource = advisoryActive ? 'advisory' : 'oni';

  const impacts     = PERU_IMPACTS[phase] ?? PERU_IMPACTS.neutral;

  // Recent 12 seasons for sparkline / trend context
  const history = sorted.slice(-12).map(r => ({
    season: r.season,
    year:   r.year,
    anom:   r.anom,
    phase:  classifyPhase(r.anom),
  }));

  return {
    // Current status — phase may come from advisory, not just ONI threshold
    phase,           // 'el_nino' | 'la_nina' | 'neutral'
    phase_source: phaseSource, // 'advisory' | 'oni'
    intensity,       // 'muy_fuerte' | 'fuerte' | 'moderado' | 'débil' | 'neutro'
    oni_latest:      latest.anom,   // latest 3-month running mean anomaly (°C)
    oni_phase:       oniPhase,      // raw ONI-derived phase (for transparency)
    season_latest:   latest.season, // e.g. 'JFM'
    year_latest:     latest.year,

    // Temporal context
    trend,           // 'increasing' | 'decreasing' | 'stable'
    consecutive_seasons: persistence.count,
    officially_declared: persistence.isOfficiallyDeclared,

    // Official NOAA advisory (null when unavailable)
    advisory: advisory ?? null,

    // Peru-specific intelligence
    summary:              impacts.summary,
    flood_amplifier:      impacts.flood_amplifier,
    drought_amplifier:    impacts.drought_amplifier,
    supply_chain_risk:    impacts.supply_chain_risk,
    affected_regions:     impacts.affected_regions,
    operational_risks:    impacts.operational_risks,

    // Trend data (last 12 seasons)
    history,

    // Data provenance
    source:           'NOAA CPC — Oceanic Niño Index (ONI) + Discusión Diagnóstica ENSO',
    source_url:       NOAA_ONI_URL,
    advisory_url:     'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc_Sp.shtml',
    fetched_at:       new Date().toISOString(),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the current ENSO context, using cache when possible.
 * Safe to call from any Layer — always resolves, never throws.
 *
 * @returns {Promise<Object|null>} ENSO context, or null on failure
 */
export async function getEnsoContext() {
  // Cache hit
  const cached = ensoCache.get();
  if (cached) return cached;

  try {
    // Fetch ONI data and NOAA advisory in parallel (both non-blocking)
    const [oniResult, advisoryResult] = await Promise.allSettled([
      fetchONIRaw(),
      fetchEnsoAdvisory(),
    ]);

    const advisory = advisoryResult.status === 'fulfilled' ? advisoryResult.value : null;
    if (!advisory) {
      console.warn('[ensoService] Advisory fetch failed or returned null — using ONI only');
    } else {
      console.info(`[ensoService] Advisory: ${advisory.alert_code} (${advisory.issued_date})`);
    }

    if (oniResult.status !== 'fulfilled') {
      console.warn('[ensoService] NOAA ONI fetch failed (non-blocking):', oniResult.reason?.message);
      return null;
    }

    const parsed  = parseONIText(oniResult.value);
    const sorted  = sortChronologically(parsed);

    if (!sorted.length) {
      console.warn('[ensoService] ONI parse returned 0 records — check NOAA format');
      return null;
    }

    const context = buildEnsoContext(sorted, advisory);
    if (context) ensoCache.set(context);
    return context;
  } catch (err) {
    console.warn('[ensoService] ENSO context build failed (non-blocking):', err.message);
    return null;
  }
}

/**
 * Forces a cache refresh and returns fresh ENSO data.
 * Use only from admin endpoints — normal callers should use getEnsoContext().
 *
 * @returns {Promise<Object|null>}
 */
export async function refreshEnsoContext() {
  ensoCache.invalidate();
  return getEnsoContext();
}

/**
 * Returns the FULL parsed ONI history (1950–present) for use by
 * conditional risk analysis services (Fase 2.3).
 *
 * Cached separately with same TTL as getEnsoContext().
 *
 * @returns {Promise<Array<{season: string, year: number, effectiveYear: number, month: number, anom: number, phase: string, intensity: string}>|null>}
 */
export async function getFullOniHistory() {
  const cacheKey = 'oni_full_history';
  const cached = ensoCache.get(cacheKey);
  if (cached) return cached;

  try {
    const raw = await fetchONIRaw();
    const parsed = parseONIText(raw);
    const sorted = sortChronologically(parsed);
    const enriched = sorted.map(r => ({
      ...r,
      phase: classifyPhase(r.anom),
      intensity: classifyIntensity(r.anom),
    }));
    ensoCache.set(cacheKey, enriched);
    logger.info('ensoService', 'Full ONI history fetched', { records: enriched.length });
    return enriched;
  } catch (err) {
    logger.warn('ensoService', 'getFullOniHistory failed', { error: err.message });
    return null;
  }
}

/**
 * Returns a short narrative sentence for use in Layer 6 / alerts.
 * Safe when ensoData is null — returns empty string.
 *
 * @param {Object|null} ensoData
 * @returns {string}
 */
export function buildEnsoNarrative(ensoData) {
  if (!ensoData || ensoData.phase === 'neutral') return '';

  const phaseLabel  = ensoData.phase === 'el_nino' ? 'El Niño' : 'La Niña';
  const intensity   = ensoData.intensity !== 'neutro' ? ` ${ensoData.intensity}` : '';
  const oniStr      = ensoData.oni_latest != null
    ? ` (ONI: ${ensoData.oni_latest > 0 ? '+' : ''}${ensoData.oni_latest.toFixed(2)}°C)`
    : '';
  const trendLabel  = ensoData.trend === 'increasing' ? ' en aumento'
                    : ensoData.trend === 'decreasing'  ? ' en disminución'
                    : '';

  return `Contexto ENSO: ${phaseLabel}${intensity} activo${oniStr}${trendLabel}. ${ensoData.summary}`;
}

/**
 * Returns an ENSO alert signal object compatible with the Alerts feed.
 * Returns null when conditions don't warrant an alert.
 *
 * @param {Object|null} ensoData
 * @returns {Object|null}
 */
export function buildEnsoAlertSignal(ensoData) {
  if (!ensoData || ensoData.phase === 'neutral') return null;

  const advisory       = ensoData.advisory;
  const advisoryActive = advisory?.is_active_alert;

  // Emit alert when advisory is active regardless of ONI intensity
  // (fixes edge case: ONI=0.48 but NOAA issued official Warning)
  const intensityOk = ['moderado', 'fuerte', 'muy_fuerte'].includes(ensoData.intensity);
  if (!advisoryActive && !intensityOk) return null;

  const phaseLabel = ensoData.phase === 'el_nino' ? 'El Niño' : 'La Niña';

  // Severity from advisory when available, otherwise from ONI intensity
  let severity;
  if (advisoryActive) {
    severity = advisory.alert_severity ?? 'medio';
  } else {
    severity = ensoData.intensity === 'muy_fuerte' ? 'crítico'
             : ensoData.intensity === 'fuerte'      ? 'alto'
             : 'medio';
  }

  const title = advisory?.alert_label_es
    ? `${advisory.alert_label_es} — NOAA CPC`
    : `${phaseLabel} ${ensoData.intensity} activo`;

  return {
    type:         'enso_phase',
    severity,
    phase:        ensoData.phase,
    phase_source: ensoData.phase_source,
    intensity:    ensoData.intensity,
    oni:          ensoData.oni_latest,
    title,
    message:      advisory?.synopsis ?? ensoData.summary,
    synopsis:     advisory?.synopsis ?? null,
    regions:      ensoData.affected_regions,
    risks:        ensoData.operational_risks,
    issued_date:  advisory?.issued_date ?? null,
    next_discussion: advisory?.next_discussion ?? null,
    source:       advisory ? 'NOAA CPC — Discusión Diagnóstica ENSO + ONI' : 'NOAA CPC ONI',
    advisory_url: ensoData.advisory_url,
    generated_at: new Date().toISOString(),
  };
}
