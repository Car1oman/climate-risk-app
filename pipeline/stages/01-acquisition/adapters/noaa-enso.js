import { fetchText, buildRawResponse } from "./common.js";
import { classifyEnso, MIN_CONSECUTIVE_SEASONS, ONI_THRESHOLD } from "../../../shared/enso-classification.js";

export async function noaaEnsoAdapter(location, config) {
  const start = Date.now();
  const url = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";
  const text = await fetchText(url, { timeout: 20000 });

  const lines = text.split("\n").filter(l => /^[A-Z]{3}\s+\d{4}/.test(l.trim()));
  const rows = lines.map(l => {
    const parts = l.trim().split(/\s+/);
    return { season: parts[0], year: parseInt(parts[1]), anom: parseFloat(parts[3]) };
  }).filter(r => !isNaN(r.anom));

  const latest = rows[rows.length - 1];
  const classification = classifyEnso(rows);

  return buildRawResponse({
    source_name: "noaa_enso_discussion",
    source_domain: "enso",
    authority_level: "complementary",
    request: { endpoint: url, params: {}, timestamp: new Date().toISOString() },
    response: {
      source: "derived_from_oni",
      enso_state: classification.state,
      classification_basis: classification.basis,
      classification_rule: `NOAA CPC / Trenberth (1997): ONI >= ${ONI_THRESHOLD} or <= -${ONI_THRESHOLD} for ${MIN_CONSECUTIVE_SEASONS} consecutive overlapping seasons`,
      latest_anom: latest?.anom,
      latest_season: latest ? `${latest.season} ${latest.year}` : null,
      recent_rows: rows.slice(-12),
    },
    status_code: 200,
    duration_ms: Date.now() - start,
    coverage_status: "available",
    spatial_distance_km: null,
    resolution_native: "trimestral",
  });
}
