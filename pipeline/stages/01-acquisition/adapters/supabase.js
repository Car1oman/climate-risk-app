import { buildRawResponse } from "./common.js";

// climate_cells grid resolution: confirmed empirically from live table data —
// adjacent rows differ by exactly 0.25° in longitude at fixed latitude
// (e.g. lon -81.5 -> -81.25 at lat -18.5), matching the documented resolution
// in authoritative-sources.json (precomputed_grid: "0.25° (~28km)").
const GRID_RESOLUTION_DEG = 0.25;

// A lat/lon bounding-box search must extend at least one full grid step past
// the nearest node in every direction to guarantee catching it (worst case:
// the query point sits just inside one edge of the box, up to ~1 grid step
// away from the nearest node in that direction) — so the box half-width must
// be >= 1 grid step, and 2x (0.5°) leaves margin for the grid not being fully
// populated near coastlines/borders (Peru-only coverage, per PROJECT scope —
// see PERU_BBOX in pipeline/shared/types.js). If that still misses, the box
// is doubled up to MAX_BUFFER_DEG; if nothing is found even then, the point
// is genuinely treated as out_of_coverage rather than guessing further —
// that cap is set at 8x grid resolution (2°, ~220km), an order of magnitude
// past the grid step, well beyond what "missing a neighboring cell" can
// plausibly explain.
const INITIAL_BUFFER_DEG = GRID_RESOLUTION_DEG * 2;
const MAX_BUFFER_DEG = GRID_RESOLUTION_DEG * 8;

// CORRECTION: an earlier version of this comment claimed climate_cells.data
// arrives as a JSON string that needs parsing. That was wrong — verified
// live against the real climate_cells table: the `data` column is genuinely
// `jsonb` (jsonb_typeof() = "object" on every sampled row), and the actual
// @supabase/supabase-js client (same call pattern as queryCellsInBuffer
// below) returns it already deserialized (typeof === "object", no
// JSON.parse needed). The real reason Stage03 previously extracted nothing
// from this source was a shape mismatch — source.response's top-level keys
// are period/scenario labels ("historical", "ensemble-all-sspXXX_..."), not
// flat variable names, so no key ever matched CANONICAL_VARIABLES — fixed in
// Stage03's dedicated historical-block extraction, not here.
// This function is kept as a harmless defensive fallback only (jsonb *can*
// legitimately hold a scalar string, and PostgREST would then return one) —
// it is a no-op pass-through for the object shape actually returned today.
function parseCellData(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function degToKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function queryCellsInBuffer(client, location, buffer) {
  const { data, error } = await client
    .from("climate_cells")
    .select("id, lat, lon, data")
    .gte("lat", location.lat - buffer)
    .lte("lat", location.lat + buffer)
    .gte("lon", location.lon - buffer)
    .lte("lon", location.lon + buffer)
    .limit(50);
  if (error) throw error;
  return data;
}

export async function supabaseAdapter(location, config) {
  const start = Date.now();
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_KEY || "";
  if (!supabaseUrl || !supabaseKey) {
    return buildRawResponse({
      source_name: "supabase_climate_cells",
      source_domain: "precomputed_grid",
      authority_level: "primary",
      request: { endpoint: "supabase climate_cells", params: { lat: location.lat, lon: location.lon }, timestamp: new Date().toISOString() },
      response: null,
      status_code: 0,
      duration_ms: Date.now() - start,
      error: "Supabase not configured (SUPABASE_URL/SUPABASE_ANON_KEY missing)",
      coverage_status: "failed",
    });
  }
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, supabaseKey);

  let data = null;
  let bufferUsed = null;
  for (let buffer = INITIAL_BUFFER_DEG; buffer <= MAX_BUFFER_DEG; buffer *= 2) {
    const rows = await queryCellsInBuffer(client, location, buffer);
    if (rows && rows.length > 0) {
      data = rows;
      bufferUsed = buffer;
      break;
    }
  }

  if (!data || data.length === 0) {
    return buildRawResponse({
      source_name: "supabase_climate_cells",
      source_domain: "precomputed_grid",
      authority_level: "primary",
      request: { endpoint: "supabase climate_cells", params: { lat: location.lat, lon: location.lon, search_buffer_deg_tried_up_to: MAX_BUFFER_DEG }, timestamp: new Date().toISOString() },
      response: null,
      status_code: 200,
      duration_ms: Date.now() - start,
      coverage_status: "out_of_coverage",
      spatial_distance_km: null,
      resolution_native: "0.25° (~28km)",
    });
  }

  let best = data[0];
  let bestDist = degToKm(location.lat, location.lon, best.lat, best.lon);
  for (let i = 1; i < data.length; i++) {
    const d = degToKm(location.lat, location.lon, data[i].lat, data[i].lon);
    if (d < bestDist) { bestDist = d; best = data[i]; }
  }

  return buildRawResponse({
    source_name: "supabase_climate_cells",
    source_domain: "precomputed_grid",
    authority_level: "primary",
    request: { endpoint: "supabase climate_cells", params: { lat: location.lat, lon: location.lon, search_buffer_deg: bufferUsed }, timestamp: new Date().toISOString() },
    response: parseCellData(best.data),
    status_code: 200,
    duration_ms: Date.now() - start,
    coverage_status: "available",
    spatial_distance_km: Math.round(bestDist * 100) / 100,
    resolution_native: "0.25° (~28km)",
  });
}
