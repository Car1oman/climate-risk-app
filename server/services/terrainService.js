/**
 * Terrain Intelligence Service — Sprint 6
 *
 * Provides elevation, slope, and landslide/huayco susceptibility analysis
 * using free, no-auth elevation APIs backed by SRTM 30m data.
 *
 * Primary API:  OpenTopoData  — https://api.opentopodata.org/v1/srtm30m
 * Fallback API: Open-Elevation — https://api.open-elevation.com/api/v1/lookup
 *
 * Slope is computed on a 3×3 elevation grid (~100 m cell) using Horn's method,
 * the same algorithm used by ArcGIS and QGIS for raster slope analysis.
 *
 * Peru-specific risk thresholds are based on:
 *   - INGEMMET (Instituto Geológico Minero y Metalúrgico del Perú) hazard maps
 *   - SENAMHI landslide susceptibility guidelines
 *   - USGS shallow-landslide initiation thresholds
 *
 * IMPORTANT: Additive and non-blocking. All failures degrade gracefully to null.
 */

import * as terrainCache from './terrainCache.js';

// ── API endpoints ────────────────────────────────────────────────────────────

const OPENTOPODATA_URL  = 'https://api.opentopodata.org/v1/srtm30m';
const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';
const FETCH_TIMEOUT_MS  = 8_000; // 8 s per API attempt

// ── Grid configuration ───────────────────────────────────────────────────────

// 0.0009° ≈ 100 m at Peru's latitudes (mean ~−12°: cos(12°) × 111 km ≈ 108.6 km/°)
const GRID_SPACING_DEG   = 0.0009;
const CELL_SIZE_METERS   = GRID_SPACING_DEG * 111_000; // ~100 m

// ── Slope thresholds (degrees) ───────────────────────────────────────────────
// Source: INGEMMET, USGS shallow-landslide model, SENAMHI Peru hazard guidelines

const SLOPE = {
  NEGLIGIBLE: 5,   // < 5°  → negligible susceptibility
  LOW:        15,  // 5-15° → low susceptibility
  MODERATE:   25,  // 15-25°→ moderate susceptibility
  HIGH:       35,  // 25-35°→ high susceptibility
  //               // > 35° → very high (active huayco/landslide zone)
};

// ── Elevation thresholds for Peru region classification (m.a.s.l.) ────────────

const ELEV = {
  COSTA_MAX:  500,
  SIERRA_MAX: 4500,
};

// ── Elevation API helpers ────────────────────────────────────────────────────

/**
 * Fetches 9 elevations from OpenTopoData (SRTM30m dataset).
 * Uses the pipe-separated GET format for minimal overhead.
 *
 * @param {Array<{lat: number, lon: number}>} points
 * @returns {Promise<number[]>} Array of elevation values in meters
 */
async function fetchFromOpenTopoData(points) {
  const locs = points
    .map(p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`)
    .join('|');
  const url = `${OPENTOPODATA_URL}?locations=${locs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OpenTopoData HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== 'OK' || !Array.isArray(json.results)) {
      throw new Error(`OpenTopoData unexpected response: status=${json.status}`);
    }
    return json.results.map(r => r.elevation);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches 9 elevations from Open-Elevation (fallback).
 * Uses POST with JSON body to avoid URL length issues.
 *
 * @param {Array<{lat: number, lon: number}>} points
 * @returns {Promise<number[]>}
 */
async function fetchFromOpenElevation(points) {
  const body = JSON.stringify({
    locations: points.map(p => ({ latitude: p.lat, longitude: p.lon })),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(OPEN_ELEVATION_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  controller.signal,
    });
    if (!res.ok) throw new Error(`Open-Elevation HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.results)) throw new Error('Open-Elevation invalid response shape');
    return json.results.map(r => r.elevation);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches elevations with automatic fallback.
 * Returns array of 9 numbers, or throws if both APIs fail.
 */
async function fetchElevations(points) {
  try {
    return await fetchFromOpenTopoData(points);
  } catch (primaryErr) {
    console.warn('[terrainService] OpenTopoData failed, trying Open-Elevation fallback:', primaryErr.message);
  }
  // Fallback — different provider, same SRTM source
  return fetchFromOpenElevation(points);
}

// ── Grid construction ────────────────────────────────────────────────────────

/**
 * Builds a 3×3 grid of coordinate points centered at (lat, lon).
 * Returns 9 points in row-major NW→SE order:
 *   [nw, n, ne, w, center, e, sw, s, se]
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Array<{lat: number, lon: number}>}
 */
function buildGrid(lat, lon) {
  const s = GRID_SPACING_DEG;
  return [
    { lat: lat + s, lon: lon - s }, // 0: nw
    { lat: lat + s, lon         }, // 1: n
    { lat: lat + s, lon: lon + s }, // 2: ne
    { lat,          lon: lon - s }, // 3: w
    { lat,          lon         }, // 4: center
    { lat,          lon: lon + s }, // 5: e
    { lat: lat - s, lon: lon - s }, // 6: sw
    { lat: lat - s, lon         }, // 7: s
    { lat: lat - s, lon: lon + s }, // 8: se
  ];
}

// ── Slope calculation — Horn's method ────────────────────────────────────────

/**
 * Calculates slope (degrees) and aspect (degrees) using Horn's finite-difference
 * method on a 3×3 elevation grid.
 *
 * This is the same algorithm used by ArcGIS Spatial Analyst and QGIS.
 * Reference: Horn, B.K.P. (1981). "Hill shading and the reflectance map."
 *            Proc. IEEE 69(1):14–47.
 *
 * Grid index mapping:
 *   [nw=0] [n=1] [ne=2]
 *   [w=3]  [c=4] [e=5]
 *   [sw=6] [s=7] [se=8]
 *
 * @param {number[]} elev - 9 elevation values (meters)
 * @returns {{ slope_degrees: number, aspect_degrees: number }}
 */
function calculateSlopeHorn(elev) {
  const [nw, n, ne, w, , e, sw, s, se] = elev;

  // Weighted finite differences (Horn weights: 1-2-1 in perpendicular direction)
  const dz_dx = ((ne + 2 * e + se) - (nw + 2 * w + sw)) / (8 * CELL_SIZE_METERS);
  const dz_dy = ((nw + 2 * n + ne) - (sw + 2 * s + se)) / (8 * CELL_SIZE_METERS);

  const slope_rad    = Math.atan(Math.sqrt(dz_dx ** 2 + dz_dy ** 2));
  const slope_degrees = slope_rad * (180 / Math.PI);

  // Aspect: 0° = North, increases clockwise
  let aspect_degrees = Math.atan2(dz_dy, -dz_dx) * (180 / Math.PI);
  if (aspect_degrees < 0) aspect_degrees += 360;

  return {
    slope_degrees:  Math.round(slope_degrees * 10) / 10,   // 1 decimal place
    aspect_degrees: Math.round(aspect_degrees),
  };
}

// ── Peru terrain classification ───────────────────────────────────────────────

/**
 * Classifies the terrain region based on elevation and longitude.
 * Peru has four macro-regions relevant to landslide hazard:
 *   costa  — Pacific coastal plain (west of the Andes)
 *   sierra — Andean cordillera (main landslide/huayco zone)
 *   puna   — High-altitude plateau (> 4500 m.a.s.l.)
 *   selva  — Amazon basin and eastern slopes
 *
 * @param {number} elevationM - elevation in meters
 * @param {number} lon        - longitude
 * @returns {'costa'|'sierra'|'puna'|'selva'}
 */
function classifyTerrainRegion(elevationM, lon) {
  if (elevationM >= ELEV.SIERRA_MAX) return 'puna';
  if (elevationM >= ELEV.COSTA_MAX)  return 'sierra';
  // Below 500 m: east of -76° lon (Amazon basin) → selva; west → costa (Pacific coast)
  // Peru's Amazon starts east of ~-76°; Pacific coast (Lima, Piura) is west of -76°.
  if (lon > -76) return 'selva';
  return 'costa';
}

// ── Landslide susceptibility ─────────────────────────────────────────────────

/**
 * Returns a landslide susceptibility score (0–1) from slope angle and terrain region.
 *
 * Base score is linearly interpolated within each slope class, then multiplied
 * by a Peru-region factor to reflect local geology (clay-rich Andean soils,
 * saturated Amazon laterites, etc.).
 *
 * @param {number} slopeDeg  - slope in degrees
 * @param {string} region    - terrain region
 * @returns {number}         - 0 (negligible) to 1 (very high)
 */
function getLandslideScore(slopeDeg, region) {
  let base;
  if (slopeDeg < SLOPE.NEGLIGIBLE) {
    base = 0.02;
  } else if (slopeDeg < SLOPE.LOW) {
    // 5–15°: 0.05 → 0.25
    base = 0.05 + ((slopeDeg - SLOPE.NEGLIGIBLE) / (SLOPE.LOW - SLOPE.NEGLIGIBLE)) * 0.20;
  } else if (slopeDeg < SLOPE.MODERATE) {
    // 15–25°: 0.25 → 0.55
    base = 0.25 + ((slopeDeg - SLOPE.LOW) / (SLOPE.MODERATE - SLOPE.LOW)) * 0.30;
  } else if (slopeDeg < SLOPE.HIGH) {
    // 25–35°: 0.55 → 0.85
    base = 0.55 + ((slopeDeg - SLOPE.MODERATE) / (SLOPE.HIGH - SLOPE.MODERATE)) * 0.30;
  } else {
    // > 35°: 0.85 → 1.0 (asymptotic)
    base = Math.min(0.85 + ((slopeDeg - SLOPE.HIGH) / SLOPE.HIGH) * 0.15, 1.0);
  }

  // Regional geology multipliers
  const REGION_MULT = { sierra: 1.20, puna: 1.00, selva: 0.90, costa: 0.70 };
  const mult = REGION_MULT[region] ?? 1.0;

  return Math.min(Math.round(base * mult * 1000) / 1000, 1.0);
}

/**
 * Returns qualitative susceptibility label from slope degrees.
 * @param {number} slopeDeg
 * @returns {'negligible'|'bajo'|'moderado'|'alto'|'muy_alto'}
 */
function slopeToLabel(slopeDeg) {
  if (slopeDeg < SLOPE.NEGLIGIBLE) return 'negligible';
  if (slopeDeg < SLOPE.LOW)        return 'bajo';
  if (slopeDeg < SLOPE.MODERATE)   return 'moderado';
  if (slopeDeg < SLOPE.HIGH)       return 'alto';
  return 'muy_alto';
}

/**
 * Classifies huayco (debris flow) risk level.
 * Huaycos are common in Andean quebradas where slopes exceed 15° and
 * elevations are between 200–3500 m (active quebrada zone).
 *
 * @param {number} slopeDeg
 * @param {number} elevationM
 * @param {string} region
 * @returns {'alto'|'medio'|'bajo'|null}
 */
function getHuaycoRisk(slopeDeg, elevationM, region) {
  const isAndean     = region === 'sierra' || region === 'puna';
  const isQuebrZone  = elevationM > 200 && elevationM < 3500;
  const isSteep      = slopeDeg >= SLOPE.LOW;       // > 15°
  const isVerySteep  = slopeDeg >= SLOPE.MODERATE;  // > 25°

  if (isAndean && isSteep && isQuebrZone) {
    return isVerySteep ? 'alto' : 'medio';
  }
  // Non-Andean steep slopes can still generate small debris flows
  if (!isAndean && isVerySteep) return 'bajo';
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns full terrain intelligence for a coordinate pair.
 * Uses cache first; fetches from elevation APIs on miss.
 * Always resolves — returns null on any failure.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object|null>}
 */
export async function getTerrainIntelligence(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);

  const cached = terrainCache.get(latNum, lonNum);
  if (cached) return cached;

  try {
    const gridPoints = buildGrid(latNum, lonNum);
    const elevations = await fetchElevations(gridPoints);

    if (!elevations || elevations.length < 9) {
      console.warn('[terrainService] API returned fewer than 9 elevation points');
      return null;
    }

    const centerElev   = elevations[4];
    const { slope_degrees, aspect_degrees } = calculateSlopeHorn(elevations);
    const region       = classifyTerrainRegion(centerElev, lonNum);
    const susceptibility        = slopeToLabel(slope_degrees);
    const landslide_score       = getLandslideScore(slope_degrees, region);
    const huayco_risk           = getHuaycoRisk(slope_degrees, centerElev, region);

    const result = {
      // Elevation & slope
      elevation_m:    Math.round(centerElev),
      slope_degrees,
      aspect_degrees,

      // Classification
      terrain_region: region,       // 'costa' | 'sierra' | 'puna' | 'selva'
      susceptibility,               // 'negligible' | 'bajo' | 'moderado' | 'alto' | 'muy_alto'

      // Risk scores
      landslide_score,              // 0–1 continuous susceptibility index
      huayco_risk,                  // 'alto' | 'medio' | 'bajo' | null

      // Threshold flags for Layer 2 signal detection
      exceeds_landslide_threshold: landslide_score >= 0.35,
      exceeds_huayco_threshold:    huayco_risk === 'alto' || huayco_risk === 'medio',

      // Data provenance
      source:          'OpenTopoData / SRTM30m (NASA — 30 m resolution)',
      method:          "Horn's 3×3 finite-difference slope analysis",
      grid_spacing_m:  Math.round(CELL_SIZE_METERS),
      fetched_at:      new Date().toISOString(),
    };

    terrainCache.set(latNum, lonNum, result);
    return result;
  } catch (err) {
    console.warn('[terrainService] Terrain analysis failed (non-blocking):', err.message);
    return null;
  }
}

/**
 * Builds a narrative sentence for Layer 6 enrichment.
 * Returns empty string when terrainData is null or risk is negligible
 * (does not pollute summaries for flat urban sites).
 *
 * @param {Object|null} terrainData - output of getTerrainIntelligence()
 * @returns {string}
 */
export function buildTerrainNarrative(terrainData) {
  if (!terrainData || !terrainData.exceeds_landslide_threshold) return '';

  const REGION_LABEL = {
    sierra: 'zona andina',
    puna:   'zona de puna',
    selva:  'ladera amazónica',
    costa:  'zona costera con pendiente',
  };
  const SUSCEPT_LABEL = {
    bajo:     'baja',
    moderado: 'moderada',
    alto:     'alta',
    muy_alto: 'muy alta',
  };

  const region  = REGION_LABEL[terrainData.terrain_region] ?? terrainData.terrain_region;
  const suscept = SUSCEPT_LABEL[terrainData.susceptibility] ?? terrainData.susceptibility;
  const slope   = `${terrainData.slope_degrees}°`;
  const elev    = `${terrainData.elevation_m} m.s.n.m.`;

  let sentence = `Análisis topográfico (SRTM 30 m): ubicación en ${region} a ${elev} con pendiente ${slope}, susceptibilidad ${suscept} a deslizamientos.`;

  if (terrainData.huayco_risk === 'alto') {
    sentence += ' Riesgo de huayco ALTO — terreno en quebrada andina con inclinación crítica; priorizar plan de evacuación y monitoreo de caudales.';
  } else if (terrainData.huayco_risk === 'medio') {
    sentence += ' Riesgo de huayco moderado — monitorear durante temporadas de lluvia intensa (enero–marzo).';
  }

  return sentence;
}
