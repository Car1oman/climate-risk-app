import { fetchJson, buildRawResponse, detectApiError } from "./common.js";

export async function weatherapiAdapter(location, config) {
  const start = Date.now();
  const apiKey = process.env.WEATHER_API_KEY || "demo";
  const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${location.lat},${location.lon}&aqi=no`;
  const data = await fetchJson(url, { timeout: 15000 });
  const apiError = detectApiError(data);
  if (apiError) {
    return buildRawResponse({
      source_name: "weatherapi",
      source_domain: "observation_current",
      authority_level: "primary",
      request: { endpoint: url, params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
      response: data,
      status_code: data?.error?.code ?? 0,
      duration_ms: Date.now() - start,
      error: apiError,
      coverage_status: "failed",
      spatial_distance_km: null,
      resolution_native: null,
    });
  }
  return buildRawResponse({
    source_name: "weatherapi",
    source_domain: "observation_current",
    authority_level: "primary",
    request: { endpoint: url, params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
    response: data,
    status_code: 200,
    duration_ms: Date.now() - start,
    coverage_status: "available",
    // WeatherAPI interpolates from an undisclosed station/satellite/NWP blend
    // (see authoritative-sources.json:observation_current.known_limitations) —
    // unlike nasa_power/openmeteo there is no known regular grid to derive a
    // half-cell bound from. The vendor's own claimed effective resolution
    // (~2km) is the best available proxy for distance-to-source, so it is
    // used directly rather than assuming 0 (exact point).
    spatial_distance_km: 2,
    resolution_native: "~2km",
  });
}
