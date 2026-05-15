/**
 * Terrain API routes — Sprint 6
 *
 * Exposes terrain slope, elevation, and landslide susceptibility data
 * for arbitrary coordinates.
 *
 * All endpoints are read-only and non-blocking:
 *   - 503 is returned (not 500) when elevation APIs are unavailable, so
 *     callers can distinguish "service degraded" from "programming error".
 */

import express from 'express';
import { getTerrainIntelligence } from '../services/terrainService.js';
import * as terrainCache          from '../services/terrainCache.js';
import { requireAuth } from '../middleware/auth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// ── GET /api/terrain/slope ────────────────────────────────────────────────────
// Returns elevation, slope, and landslide/huayco risk for a coordinate pair.
//
// Query params:
//   lat  {number}  Latitude  (decimal degrees, WGS84)
//   lon  {number}  Longitude (decimal degrees, WGS84)
//
// Response 200:
//   { success: true, terrain: { elevation_m, slope_degrees, aspect_degrees,
//     terrain_region, susceptibility, landslide_score, huayco_risk,
//     exceeds_landslide_threshold, exceeds_huayco_threshold,
//     source, method, grid_spacing_m, fetched_at } }
//
// Response 503 when elevation APIs are unavailable (graceful degradation).

router.get('/terrain/slope', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({
      error: 'Los parámetros lat y lon son requeridos y deben ser valores numéricos',
    });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Coordenadas fuera del rango válido (lat: ±90, lon: ±180)' });
  }

  try {
    const terrain = await getTerrainIntelligence(lat, lon);

    if (!terrain) {
      return res.status(503).json({
        error:  'Datos de terreno no disponibles temporalmente',
        detail: 'Las APIs de elevación (OpenTopoData / Open-Elevation) no respondieron. El análisis de terreno es un componente opcional y su ausencia no afecta el riesgo climático base.',
      });
    }

    return res.json({ success: true, terrain });
  } catch (err) {
    console.error('[GET /api/terrain/slope]', err.message);
    return res.status(500).json({ error: 'Error interno al calcular el perfil de terreno' });
  }
});

// ── GET /api/terrain/cache-stats ─────────────────────────────────────────────
// Returns metrics about the in-memory terrain cache.

router.get('/terrain/cache-stats', (_req, res) => {
  return res.json({ success: true, cache: terrainCache.stats() });
});

// ── DELETE /api/terrain/cache ─────────────────────────────────────────────────
// Invalidates the terrain cache.
//
// Query params (optional):
//   lat, lon — invalidate a single coordinate entry; omit to clear all entries.

router.delete('/terrain/cache', requireAuth, strictLimiter, (req, res) => {
  const lat = req.query.lat != null ? parseFloat(req.query.lat) : null;
  const lon = req.query.lon != null ? parseFloat(req.query.lon) : null;

  terrainCache.invalidate(lat, lon);

  const msg = lat != null && lon != null
    ? `Cache invalidado para (${lat}, ${lon})`
    : 'Cache de terreno completo invalidado';

  return res.json({ success: true, message: msg });
});

export default router;
