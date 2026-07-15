// NOAA CPC / Trenberth (1997) ONI episode definition: El Niño (La Niña)
// requires the 3-month running mean ONI to be >= +0.5C (<= -0.5C) for a
// minimum of 5 consecutive overlapping seasons — a single quarter is not
// sufficient and can misclassify a transient anomaly as an ongoing episode.
// Reference: Trenberth, K.E. (1997). Bull. Amer. Meteor. Soc., 78, 2771-2777.
// doi:10.1175/1520-0477(1997)078<2771:TDOENO>2.0.CO;2
//
// Shared by pipeline/stages/01-acquisition/adapters/noaa-enso.js (raw
// evidence trace) and pipeline/stages/03-normalization/index.js (canonical
// "enso_phase" variable, from noaa_cpc_oni's own all_rows series) so both
// consumers apply the identical rule instead of two independently maintained
// implementations that could drift apart.
export const SEASON_ORDER = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
export const MIN_CONSECUTIVE_SEASONS = 5;
export const ONI_THRESHOLD = 0.5;

// Monotonic month index (year*12 + season position) so consecutiveness of
// overlapping seasons can be checked even across a year boundary (NDJ(year)
// is immediately followed by DJF(year+1) in NOAA's table). Exported so
// Stage02's validateTemporalConsistency (HALLAZGO-18) can check all_rows'
// chronological order/gaps using the same canonical 12-season definition
// this file already uses for classification, instead of a second,
// independently-maintained (and easy-to-get-wrong — NOAA ONI uses 12
// overlapping 3-month seasons per year, not 4 standard non-overlapping
// ones) reimplementation.
export function seasonIndex(row) {
  const i = SEASON_ORDER.indexOf(row.season);
  return i === -1 ? null : row.year * 12 + i;
}

export function classifyEnso(rows) {
  if (!Array.isArray(rows) || rows.length < MIN_CONSECUTIVE_SEASONS) {
    return { state: "neutral", basis: "insufficient_data" };
  }

  const lastN = rows.slice(-MIN_CONSECUTIVE_SEASONS);
  for (let i = 1; i < lastN.length; i++) {
    const prevIdx = seasonIndex(lastN[i - 1]);
    const currIdx = seasonIndex(lastN[i]);
    if (prevIdx == null || currIdx == null || currIdx - prevIdx !== 1) {
      return { state: "neutral", basis: "non_consecutive_seasons_in_source_data" };
    }
  }

  if (lastN.every(r => r.anom >= ONI_THRESHOLD)) {
    return { state: "el_nino", basis: `${MIN_CONSECUTIVE_SEASONS}_consecutive_seasons_ge_${ONI_THRESHOLD}` };
  }
  if (lastN.every(r => r.anom <= -ONI_THRESHOLD)) {
    return { state: "la_nina", basis: `${MIN_CONSECUTIVE_SEASONS}_consecutive_seasons_le_-${ONI_THRESHOLD}` };
  }
  return { state: "neutral", basis: "threshold_not_sustained_5_seasons" };
}
