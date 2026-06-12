/**
 * ENSO Advisory Service
 *
 * Fetches the NOAA CPC ENSO Diagnostic Discussion (Spanish version) to extract
 * the official alert status. This is a second, authoritative source alongside
 * the ONI numerical index — NOAA can issue a Warning even when ONI is slightly
 * below 0.5°C if ocean-atmosphere coupling indicators confirm the phase.
 *
 * Source: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc_Sp.shtml
 * Updated: monthly (typically first Thursday of month)
 */

const ADVISORY_URL =
  'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc_Sp.shtml';
const FETCH_TIMEOUT_MS = 15_000;

// Maps Spanish alert labels to internal codes + derived phase
const ALERT_STATUS_MAP = [
  {
    pattern:  /advertencia de el ni[ñn]o/i,
    code:     'el_nino_warning',
    phase:    'el_nino',
    label_es: 'Advertencia de El Niño',
    severity: 'alto',
  },
  {
    pattern:  /vigilancia de el ni[ñn]o/i,
    code:     'el_nino_watch',
    phase:    'el_nino',
    label_es: 'Vigilancia de El Niño',
    severity: 'medio',
  },
  {
    pattern:  /advertencia de la ni[ñn]a/i,
    code:     'la_nina_warning',
    phase:    'la_nina',
    label_es: 'Advertencia de La Niña',
    severity: 'alto',
  },
  {
    pattern:  /vigilancia de la ni[ñn]a/i,
    code:     'la_nina_watch',
    phase:    'la_nina',
    label_es: 'Vigilancia de La Niña',
    severity: 'medio',
  },
  {
    pattern:  /condiciones neutras del enos/i,
    code:     'neutral',
    phase:    'neutral',
    label_es: 'Condiciones Neutras del ENOS',
    severity: 'bajo',
  },
];

// ── HTML utilities ────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g,    ' ')
    .replace(/&amp;/g,     '&')
    .replace(/&lt;/g,      '<')
    .replace(/&gt;/g,      '>')
    .replace(/&ntilde;/g,  'ñ')
    .replace(/&Ntilde;/g,  'Ñ')
    .replace(/&aacute;/g,  'á')
    .replace(/&Aacute;/g,  'Á')
    .replace(/&eacute;/g,  'é')
    .replace(/&Eacute;/g,  'É')
    .replace(/&iacute;/g,  'í')
    .replace(/&Iacute;/g,  'Í')
    .replace(/&oacute;/g,  'ó')
    .replace(/&Oacute;/g,  'Ó')
    .replace(/&uacute;/g,  'ú')
    .replace(/&Uacute;/g,  'Ú')
    .replace(/&#\d+;/g,    '')
    .replace(/\s+/g,       ' ')
    .trim();
}

// ── Parser ───────────────────────────────────────────────────────────────────

function parseAdvisoryHtml(html) {
  const text = stripHtml(html);

  // 1. Alert status
  let alertCode    = 'unknown';
  let alertPhase   = null;
  let alertLabelEs = null;
  let alertSeverity = null;
  let isActiveAlert = false;

  for (const entry of ALERT_STATUS_MAP) {
    if (entry.pattern.test(text)) {
      alertCode     = entry.code;
      alertPhase    = entry.phase;
      alertLabelEs  = entry.label_es;
      alertSeverity = entry.severity;
      isActiveAlert = entry.code !== 'neutral';
      break;
    }
  }

  // 2. Synopsis — text between "Sinopsis:" and next paragraph
  const synopsisMatch =
    text.match(/S[íi]nopsis\s*:?\s*(.{30,600}?)(?=\s{2,}|El promedio|Las condiciones|El [ií]ndice|Esta discusi)/i) ??
    text.match(/Sinopsis[^:]*:\s*(.{30,500})/i);
  const synopsis = synopsisMatch
    ? synopsisMatch[1].replace(/\s+/g, ' ').trim().slice(0, 500)
    : null;

  // 3. Issued date (e.g. "11 de junio de 2026")
  const dateMatch  = text.match(/(\d{1,2} de \w+ de \d{4})/);
  const issuedDate = dateMatch ? dateMatch[1] : null;

  // 4. Next discussion date
  const nextMatch =
    text.match(/pr[oó]xima Discusi[oó]n[^.]*programada para el (\d{1,2} de \w+ de \d{4})/i) ??
    text.match(/pr[oó]xima.*?(\d{1,2} de \w+ de \d{4})/i);
  const nextDiscussion = nextMatch ? nextMatch[1] : null;

  return {
    alert_code:      alertCode,      // 'el_nino_warning' | 'el_nino_watch' | 'la_nina_warning' | 'la_nina_watch' | 'neutral' | 'unknown'
    alert_phase:     alertPhase,     // 'el_nino' | 'la_nina' | 'neutral' | null
    alert_label_es:  alertLabelEs,   // human-readable Spanish label
    alert_severity:  alertSeverity,  // 'alto' | 'medio' | 'bajo' | null
    is_active_alert: isActiveAlert,  // true when Warning or Watch
    synopsis,
    issued_date:     issuedDate,
    next_discussion: nextDiscussion,
    source_url:      ADVISORY_URL,
    fetched_at:      new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches and parses the NOAA ENSO Diagnostic Discussion.
 * Non-blocking — returns null on any failure.
 *
 * @returns {Promise<Object|null>}
 */
export async function fetchEnsoAdvisory() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ADVISORY_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ClimateRiskApp/1.0 (research; contact: support@datarisk.pe)' },
    });
    if (!res.ok) throw new Error(`NOAA Advisory HTTP ${res.status}`);
    const html = await res.text();
    return parseAdvisoryHtml(html);
  } catch (err) {
    console.warn('[ensoAdvisoryService] Fetch failed (non-blocking):', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
