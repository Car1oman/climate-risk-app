import { fetchText, buildRawResponse } from "./common.js";

export async function noaaOniAdapter(location, config) {
  const start = Date.now();
  const url = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";
  const text = await fetchText(url, { timeout: 20000 });

  const lines = text.split("\n");
  const dataLines = lines.filter(l => /^[A-Z]{3}\s+\d{4}/.test(l.trim()));

  const rows = dataLines.map(l => {
    const parts = l.trim().split(/\s+/);
    return { season: parts[0], year: parseInt(parts[1]), total: parseFloat(parts[2]), anom: parseFloat(parts[3]) };
  }).filter(r => !isNaN(r.anom));

  const latest = rows[rows.length - 1];

  return buildRawResponse({
    source_name: "noaa_cpc_oni",
    source_domain: "enso",
    authority_level: "primary",
    request: { endpoint: url, params: {}, timestamp: new Date().toISOString() },
    response: { raw_lines: rows.length, latest_season: latest?.season, latest_year: latest?.year, latest_anom: latest?.anom, all_rows: rows.slice(-20) },
    status_code: 200,
    duration_ms: Date.now() - start,
    coverage_status: "available",
    spatial_distance_km: null,
    resolution_native: "trimestral",
  });
}
