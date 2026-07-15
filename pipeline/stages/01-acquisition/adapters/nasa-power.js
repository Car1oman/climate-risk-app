import { fetchJson, buildRawResponse, detectApiError } from "./common.js";

const POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
const PARAMETERS = ["T2M", "T2M_MAX", "T2M_MIN", "T2MDEW", "PRECTOTCORR", "WS2M", "RH2M", "ALLSKY_SFC_SW_DWN"];

function formatDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function nasaPowerAdapter(location, config) {
  const start = Date.now();

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 1);

  const params = new URLSearchParams({
    parameters: PARAMETERS.join(","),
    community: "RE",
    longitude: location.lon,
    latitude: location.lat,
    start: formatDate(startDate),
    end: formatDate(endDate),
    format: "JSON",
  });

  const url = `${POWER_BASE_URL}?${params}`;
  const data = await fetchJson(url, { timeout: 30000 });
  const apiError = detectApiError(data);

  return buildRawResponse({
    source_name: "nasa_power",
    source_domain: "observation_historical",
    authority_level: "primary",
    request: {
      endpoint: url,
      params: Object.fromEntries(params),
      timestamp: new Date().toISOString(),
    },
    response: data,
    status_code: 200,
    duration_ms: Date.now() - start,
    error: apiError,
    coverage_status: apiError ? "failed" : "available",
    // Half native grid-cell width: NASA POWER snaps to its 0.5° MERRA-2 grid
    // but doesn't expose which node it used. Half the cell width is the
    // worst-case distance from any query point to its nearest node — same
    // convention as openmeteo.js's ENSEMBLE_SPATIAL_DISTANCE_KM.
    // 0.5° × 111 km/° / 2 = 27.75 km.
    spatial_distance_km: apiError ? null : 27.75,
    resolution_native: apiError ? null : "0.5° (~55km)",
  });
}
