import { fetchJson, buildRawResponse, detectApiError } from "./common.js";

export async function opentopodataAdapter(location, config) {
  const start = Date.now();
  const url = `https://api.opentopodata.org/v1/srtm30m?locations=${location.lat},${location.lon}`;
  const data = await fetchJson(url, { timeout: 15000 });
  const apiError = detectApiError(data);
  if (apiError) {
    return buildRawResponse({
      source_name: "opentopodata_srtm30m",
      source_domain: "elevation",
      authority_level: "primary",
      request: { endpoint: url, params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
      response: data,
      status_code: 200,
      duration_ms: Date.now() - start,
      error: apiError,
      coverage_status: "failed",
      spatial_distance_km: null,
      resolution_native: null,
    });
  }
  return buildRawResponse({
    source_name: "opentopodata_srtm30m",
    source_domain: "elevation",
    authority_level: "primary",
    request: { endpoint: url, params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
    response: data,
    status_code: 200,
    duration_ms: Date.now() - start,
    coverage_status: "available",
    // SRTM30m interpolates the DEM raster directly at the query coordinates
    // (~30m pixel). Negligible relative to any decorrelation_length_km in
    // spatial-decorrelation.json, and elevation is a `non_stochastic` domain
    // there anyway (resolution_ratio rule, not the exponential model) — 0 is
    // an accurate rounding, not an unexamined default.
    spatial_distance_km: 0,
    resolution_native: "30m",
  });
}
