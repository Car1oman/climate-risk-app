import { fetchJson, buildRawResponse } from "./common.js";

const GRI_URL = "https://global.infrastructureresilience.org/api/pixel-driller/point";

export async function griOxfordAdapter(location, config) {
  const start = Date.now();
  const url = `${GRI_URL}/${location.lon}/${location.lat}`;

  try {
    const data = await fetchJson(url, { timeout: 60000 });
    const results = Array.isArray(data?.results) ? data.results : [];

    return buildRawResponse({
      source_name: "gri_oxford",
      source_domain: "hazard_risk_gri",
      authority_level: "primary",
      request: { endpoint: url, params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
      response: data,
      status_code: 200,
      duration_ms: Date.now() - start,
      coverage_status: results.length > 0 ? "available" : "out_of_coverage",
      spatial_distance_km: null,
      resolution_native: "~1km",
    });
  } catch (err) {
    return buildRawResponse({
      source_name: "gri_oxford",
      source_domain: "hazard_risk_gri",
      authority_level: "primary",
      request: { endpoint: url, params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
      response: null,
      status_code: 0,
      duration_ms: Date.now() - start,
      error: err.message ?? "unknown error",
      coverage_status: "failed",
      spatial_distance_km: null,
      resolution_native: null,
    });
  }
}
