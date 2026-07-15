import { fetchJson, buildRawResponse, detectApiError } from "./common.js";

const INDICATORS = {
  "SI.POV.NAHC": "poverty_rate",
  "NY.GDP.PCAP.CD": "gdp_per_capita",
  "SH.H2O.BASW.ZS": "water_access",
  "SP.URB.TOTL": "urban_population",
};

export async function worldbankAdapter(location, config) {
  const start = Date.now();
  // Fijo a Perú por decisión de producto (no MVP): la plataforma es exclusivamente
  // para Perú. LocationSchema (pipeline/shared/types.js) ya rechaza coordenadas
  // fuera del bbox de Perú antes de llegar a este adapter, por lo que "PE" siempre
  // es correcto para cualquier `location` que alcance esta función.
  const country = "PE";
  const results = {};
  let lastError = null;

  for (const [code, name] of Object.entries(INDICATORS)) {
    try {
      const url = `https://api.worldbank.org/v2/country/${country}/indicator/${code}?format=json&per_page=20&mrv=10`;
      const data = await fetchJson(url, { timeout: 15000 });
      if (Array.isArray(data) && data[1] && data[1].length > 0) {
        const valid = data[1].filter(e => e.value != null);
        results[name] = valid.length > 0 ? valid[0].value : null;
      } else if (Array.isArray(data) && data[0]?.message) {
        lastError = detectApiError(data[0]);
      }
    } catch {
      results[name] = null;
    }
  }

  const anyData = Object.values(results).some(v => v != null);

  return buildRawResponse({
    source_name: "world_bank",
    source_domain: "socioeconomic",
    authority_level: "primary",
    request: { endpoint: "https://api.worldbank.org/v2/country/PE/indicator/*", params: { country, indicators: Object.keys(INDICATORS) }, timestamp: new Date().toISOString() },
    response: results,
    status_code: 200,
    duration_ms: Date.now() - start,
    error: anyData ? null : (lastError || "all indicators returned null"),
    coverage_status: anyData ? "available" : "failed",
    spatial_distance_km: null,
    resolution_native: "país",
  });
}
