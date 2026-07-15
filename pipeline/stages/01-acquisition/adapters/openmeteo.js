import { fetchJson, buildRawResponse, detectApiError } from "./common.js";

// HighResMIP CMIP6 multi-model ensemble (7 models, all Open-Meteo currently
// supports for /v1/climate — verified live 2026-07-14; see HALLAZGO-8).
//
// CORRECTION (HALLAZGO-8): this adapter previously requested 4 different
// model IDs (MRI_ESM2_0, CMCC_ESM2, EC_Earth3_Veg, FGOALS_g3) that do NOT
// exist in Open-Meteo's API — every request failed with
// "Cannot initialize MultiDomains from invalid String value ..." (confirmed
// via live curl call against climate-api.open-meteo.com). openmeteo_cmip6 —
// the authoritative source for source_domain=projection_climate — had a
// 100% failure rate until this fix.
//
// SCIENTIFIC SCOPE CHANGE: the old model list and this file's own comments
// claimed "SSP1-2.6, SSP2-4.5, SSP3-7.0, SSP5-8.5" scenario support
// (ScenarioMIP-style). That claim is no longer true of what Open-Meteo's
// Climate API actually offers. Per Open-Meteo's own docs (fetched
// 2026-07-14): "The high resolution climate models are as close to RCP8.5
// as possible within CMIP6" — this is a HighResMIP ensemble, a *different*
// CMIP6 experiment (decadal, high-resolution, single high-emissions-like
// pathway), not ScenarioMIP. There is no scenario-selection parameter.
// authoritative-sources.json (projection_climate) has been corrected to
// match — do not re-add SSP-scenario claims without re-verifying against
// a source that actually provides them.
export const CMIP6_ENSEMBLE_MODELS = [
  "CMCC_CM2_VHR4", // CMCC, Italy — 30km
  "FGOALS_f3_H",   // CAS, China — 28km
  "HiRAM_SIT_HR",  // AS-RCEC, Taiwan — 25km
  "MRI_AGCM3_2_S", // MRI, Japan — 20km — highest resolution in ensemble
  "EC_Earth3P_HR", // EC-Earth consortium / SMHI, Europe — 29km
  "MPI_ESM1_2_XR", // Max Planck Institute, Germany — 51km — coarsest in ensemble
  "NICAM16_8S",    // JAMSTEC, Japan — 31km
];

// spatial_distance_km is a plain geometric distance, not a scientific judgment
// call by itself — its interpretation is entirely delegated downstream to this
// project's exponential spatial decorrelation model (rho(d) = exp(-d/L), theta=0.5,
// Isaaks & Srivastava 1989 "An Introduction to Applied Geostatistics"; see
// pipeline/config/spatial-decorrelation.json), which consumes this value at:
//   - Stage 02 evaluateCoverage(): compares against max_distance_km = -L*ln(theta)
//   - Stage 03 _scoreSources(): proximityScore = exp(-distance / decorrL)
//   - Stage 03 _deriveCoverageAction(): same d_max = -L*ln(theta) threshold
//
// The distance itself: Open-Meteo does not expose which grid node it snapped/
// interpolated to, so we can't measure the true query-to-node distance. As a
// conservative geometric proxy, we use half the native cell width of the
// coarsest ensemble member (MPI_ESM1_2_XR, 51km) — the worst-case distance
// from any query point to its nearest grid node in that model, so the
// ensemble mean is never assumed more spatially precise than its coarsest
// contributor. Resolutions are Open-Meteo's own stated km values per model
// (docs table), not degree-to-km conversions, so no KM_PER_DEG approximation
// is needed here (contrast nasa_power.js, which does need one).
const MODEL_RESOLUTION_KM = {
  CMCC_CM2_VHR4: 30,
  FGOALS_f3_H: 28,
  HiRAM_SIT_HR: 25,
  MRI_AGCM3_2_S: 20,
  EC_Earth3P_HR: 29,
  MPI_ESM1_2_XR: 51,
  NICAM16_8S: 31,
};
const ENSEMBLE_SPATIAL_DISTANCE_KM = Math.max(...Object.values(MODEL_RESOLUTION_KM)) / 2; // 25.5 km

const OPENMETEO_FILL = new Set([null, -999]);

// Open-Meteo's archive spans 1950-01-01 to 2050-01-01 (verified against its
// own docs, fetched 2026-07-14: "Data is available from 1950-01-01 until
// 2050-01-01"). Previously this adapter hardcoded 2020-01-01..2050-12-31
// with no stated reason, silently discarding 70 years of available
// historical baseline and requesting ~1 year past the documented end.
//
// We request from 1991-01-01 rather than the full 1950 floor, for two
// converging reasons (not an arbitrary trim):
//   1. pipeline/shared/horizons.js's "historico" band starts at 1991
//      (WMO No. 1203 climate normal period) — nothing before that is used by
//      any horizon, so fetching 1950-1990 would just be discarded downstream.
//   2. Requesting the full 1950-2050 span with all 7 models x 3 daily
//      variables genuinely exceeds Open-Meteo's per-request data-volume cap —
//      confirmed live: {"error":true,"reason":"Your API call requests too
//      much data. Please reduce the number of variables, locations and/or
//      weather models."} A 1980-2050 (70yr) request succeeds; 1991-2050
//      (59yr) is comfortably under that, with margin, while still covering
//      every horizon this pipeline actually builds.
const REQUEST_START_DATE = "1991-01-01";
const REQUEST_END_DATE = "2050-01-01";

// H-3.5 (documentacion-v2 audit finding 3.5): resolution-inverse was
// previously the only computed scheme — equal-weighting was cited in this
// comment as "the literature default" but never actually run, so an auditor
// had no number to check the claim against. Both schemes are now real,
// pluggable weight tables computed the same way, and injectEnsembleMeans
// below runs BOTH for every request: the active one becomes the canonical
// series, the other is preserved alongside it so Stage03 can quantify their
// disagreement per variable/horizon instead of leaving the comparison as an
// assertion in a code comment.
export const ENSEMBLE_WEIGHTING_SCHEMES = {
  resolution_inverse: (() => {
    const raw = CMIP6_ENSEMBLE_MODELS.map(m => 1 / MODEL_RESOLUTION_KM[m]);
    const sum = raw.reduce((s, w) => s + w, 0);
    return Object.fromEntries(CMIP6_ENSEMBLE_MODELS.map((m, i) => [m, raw[i] / sum]));
  })(),
  equal: Object.fromEntries(CMIP6_ENSEMBLE_MODELS.map(m => [m, 1 / CMIP6_ENSEMBLE_MODELS.length])),
};

// Which scheme feeds the canonical (e.g. "temperature_2m_max") key that the
// rest of the pipeline consumes as THE value.
//
// Why resolution-inverse is still the active default, not equal-weight:
// IPCC AR6 WGI (2021) Ch.4, Box 4.1, and Tebaldi & Knutti (2007), Phil.
// Trans. R. Soc. A, use an unweighted multi-model mean as the standard
// default for CMIP6 ensemble products — "one model, one vote" is a
// defensible, literature-grounded baseline, not an oversight. But Peru's
// Andean terrain has strong orographic control on temperature and
// precipitation that coarser grids smooth away (Giorgi et al., 2009, JGR,
// on regional-model resolution vs. orographic precipitation fidelity).
// Under equal weighting, MRI_AGCM3_2_S (20km) and MPI_ESM1_2_XR (51km,
// >2.5x coarser) count identically; resolution-inverse down-weights the
// coarsest contributor instead of treating it as equally locally
// representative — a domain-specific argument stronger than the generic
// literature default for this specific project and terrain.
//
// What this explicitly is NOT: skill-based weighting (e.g. ClimWIP —
// Brunner et al., 2020, Earth Syst. Dynam. 11, 995-1012 — weights by both
// independence AND historical performance against an observational
// reference). Genuine skill weighting needs an observational baseline and a
// performance-metric pipeline this project does not have; fabricating skill
// scores without one would be exactly the kind of unsupported claim this
// audit has been correcting elsewhere (see HALLAZGO-6's tx84rr exclusion for
// the same principle). Resolution is also only a weak, contested proxy for
// skill: finer resolution does not guarantee better skill for a given
// variable/region, and naive resolution weighting can amplify biases shared
// by structurally similar models (Knutti et al., 2010, GRL, "Challenges in
// combining projections from multiple climate models"). This is a deliberate
// middle ground between "no weighting" and "true skill weighting" — not a
// claim of scientific superiority over either. RMSE-based weighting against
// SENAMHI observations (the finding's other suggested alternative) is not
// implemented: no SENAMHI observational series is wired into this pipeline
// yet. Fabricating RMSE numbers without one would repeat the exact problem
// this note just warned against — this is a real gap, tracked here, not
// silently substituted with resolution-inverse dressed up as skill.
export const ACTIVE_ENSEMBLE_WEIGHTING_SCHEME = "resolution_inverse";

function weightedMeanSeries(modelEntries, len) {
  return Array.from({ length: len }, (_, i) => {
    const valid = modelEntries
      .map(e => ({ v: e.arr[i], w: e.weight }))
      .filter(e => typeof e.v === "number" && !OPENMETEO_FILL.has(e.v));
    if (valid.length === 0) return null;
    // Re-normalize among only the models with valid data at this specific
    // timestep, so one model missing a single day doesn't silently zero out
    // its share of that day's weighted mean.
    const wSum = valid.reduce((s, e) => s + e.w, 0);
    return valid.reduce((s, e) => s + e.v * (e.w / wSum), 0);
  });
}

// Computes the ensemble mean under every scheme in
// ENSEMBLE_WEIGHTING_SCHEMES and injects the active one under the canonical
// key (e.g. "temperature_2m_max") so downstream stages work without
// modification, plus every other scheme under
// "temperature_2m_max_ensemble_alt_<scheme>" purely for audit comparison
// (Stage03 reads these to report the delta per variable/horizon — see
// canonical-schema.js's HighResMIP assumption text). Individual model
// arrays (e.g. "temperature_2m_max_MRI_AGCM3_2_S") are preserved separately
// for ensemble spread analysis in later pipeline stages.
export function injectEnsembleMeans(daily) {
  if (!daily) return;
  for (const baseVar of ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"]) {
    const rawEntries = CMIP6_ENSEMBLE_MODELS
      .map(m => ({ m, arr: daily[`${baseVar}_${m}`] }))
      .filter(e => Array.isArray(e.arr) && e.arr.length > 0);
    if (rawEntries.length === 0) continue;
    const len = rawEntries[0].arr.length;

    for (const [schemeName, weights] of Object.entries(ENSEMBLE_WEIGHTING_SCHEMES)) {
      const modelEntries = rawEntries.map(e => ({ arr: e.arr, weight: weights[e.m] }));
      const series = weightedMeanSeries(modelEntries, len);
      const key = schemeName === ACTIVE_ENSEMBLE_WEIGHTING_SCHEME ? baseVar : `${baseVar}_ensemble_alt_${schemeName}`;
      daily[key] = series;
    }
  }
}

export async function openmeteoAdapter(location, config) {
  const start = Date.now();
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    start_date: REQUEST_START_DATE,
    end_date: REQUEST_END_DATE,
    models: CMIP6_ENSEMBLE_MODELS.join(","),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
  });
  const url = `https://climate-api.open-meteo.com/v1/climate?${params}`;
  const data = await fetchJson(url, { timeout: 60000 });
  const apiError = detectApiError(data);
  if (!apiError) injectEnsembleMeans(data?.daily);
  return buildRawResponse({
    source_name: "openmeteo_cmip6",
    source_domain: "projection_climate",
    authority_level: "primary",
    request: {
      endpoint: url,
      params: { ...Object.fromEntries(params), ensemble_models: CMIP6_ENSEMBLE_MODELS },
      timestamp: new Date().toISOString(),
    },
    response: data,
    status_code: 200,
    duration_ms: Date.now() - start,
    error: apiError,
    coverage_status: apiError ? "failed" : "available",
    spatial_distance_km: apiError ? null : ENSEMBLE_SPATIAL_DISTANCE_KM,
    resolution_native: apiError ? null : "20km–51km",
  });
}
