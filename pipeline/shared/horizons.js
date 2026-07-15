import { getThresholds } from "../orchestration/config-loader.js";

// WMO No. 1203 (2017) Guidelines on the Calculation of Climate Normals: the
// standard 30-year reference period for a "historical" climate baseline.
const HISTORICAL_START = "1991-01-01";
const HISTORICAL_END = "2020-12-31";

// Matches what pipeline/stages/01-acquisition/adapters/openmeteo.js actually
// requests (REQUEST_START_DATE/REQUEST_END_DATE there) — not Open-Meteo's
// full archive floor (1950), which the adapter deliberately doesn't request
// (see that file's comment: matches HISTORICAL_START below, and requesting
// further back would exceed Open-Meteo's per-request data-volume cap for no
// benefit, since no horizon here starts before 1991 anyway). Every horizon
// window is clamped to this range — "largo" (see below) routinely needs it.
const SOURCE_MIN_DATE = "1991-01-01";
const SOURCE_MAX_DATE = "2050-01-01";

function clampToSourceRange(dateStr) {
  if (dateStr < SOURCE_MIN_DATE) return SOURCE_MIN_DATE;
  if (dateStr > SOURCE_MAX_DATE) return SOURCE_MAX_DATE;
  return dateStr;
}

// Horizon windows: sequential, non-overlapping bands built from
// thresholds.json's horizon_years (short=5, medium=10, long=30 — TCFD 2017 +
// CEPLAN Peru + World Bank Infrastructure Guidelines; see thresholds.json
// _refs), read as consecutive bands (corto: baseline..+5, mediano: +5..+10,
// largo: +10..+30) rather than cumulative "baseline..+N" windows. This
// matches how IPCC AR6 (this project's stated risk framework, see
// thresholds.json _methodology.framework) defines near/mid/long-term as
// non-overlapping periods, and roughly tracks the external reference periods
// cited alongside those same numbers in thresholds.json (SENAMHI 2031-2040
// for "medium", IPCC AR6 mid-century 2041-2060 for "long", from a 2026
// baseline) without hardcoding those absolute years, so the bands stay
// correct as "now" advances rather than drifting stale.
//
// "largo" routinely gets clamped to SOURCE_MAX_DATE (2050): from a 2026
// baseline, baseline+30=2056 exceeds Open-Meteo's archive ceiling by ~6
// years. `truncated: true` on the returned window flags this so downstream
// consumers know the horizon is shorter than nominally intended, instead of
// silently averaging over fewer years than the label implies.
export function getHorizons(referenceDate = new Date()) {
  const thresholds = getThresholds();
  const hy = thresholds.horizon_years;
  const baselineYear = referenceDate.getUTCFullYear();

  const nominal = [
    { name: "historico", start: HISTORICAL_START, end: HISTORICAL_END },
    { name: "corto", start: `${baselineYear}-01-01`, end: `${baselineYear + hy.short}-12-31` },
    { name: "mediano", start: `${baselineYear + hy.short}-01-01`, end: `${baselineYear + hy.medium}-12-31` },
    { name: "largo", start: `${baselineYear + hy.medium}-01-01`, end: `${baselineYear + hy.long}-12-31` },
  ];

  return nominal.map(b => {
    const start = clampToSourceRange(b.start);
    const end = clampToSourceRange(b.end);
    return {
      name: b.name,
      start,
      end,
      truncated: start !== b.start || end !== b.end,
      nominal_start: b.start,
      nominal_end: b.end,
    };
  });
}

// Extracts the (times[i], values[i]) pairs whose date falls within
// [start, end] inclusive. Assumes `times` are ISO "YYYY-MM-DD" strings
// (as returned by Open-Meteo's daily arrays), so lexicographic comparison
// is equivalent to chronological comparison.
export function sliceByDateRange(times, values, start, end) {
  const slicedTimes = [];
  const slicedValues = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t >= start && t <= end) {
      slicedTimes.push(t);
      slicedValues.push(values[i]);
    }
  }
  return { times: slicedTimes, values: slicedValues };
}
