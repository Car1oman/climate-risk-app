import { fetchJson, buildRawResponse, detectApiError } from "./common.js";

export async function openElevationAdapter(location, config) {
  const start = Date.now();
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${location.lat},${location.lon}`;
  const data = await fetchJson(url, { timeout: 15000 });
  const apiError = detectApiError(data);
  if (apiError) {
    return buildRawResponse({
      source_name: "open_elevation",
      source_domain: "elevation",
      authority_level: "complementary",
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
    source_name: "open_elevation",
    source_domain: "elevation",
    authority_level: "complementary",
    request: { endpoint: url, params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
    response: data,
    status_code: 200,
    duration_ms: Date.now() - start,
    coverage_status: "available",
    // Same rationale as opentopodata.js: DEM interpolated at query coordinates,
    // negligible distance, elevation is `non_stochastic` in
    // spatial-decorrelation.json (resolution_ratio rule, not exponential decay).
    spatial_distance_km: 0,
    resolution_native: "~90m",
  });
}
