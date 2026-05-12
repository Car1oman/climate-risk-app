/**
 * ENSO Routes — Sprint 5
 *
 * GET  /api/enso/status        Current ENSO phase & Peru intelligence
 * POST /api/enso/refresh       Force cache invalidation & re-fetch (admin)
 * GET  /api/enso/cache-stats   Cache health diagnostics
 */

import express from 'express';
import { getEnsoContext, refreshEnsoContext, buildEnsoAlertSignal } from '../services/ensoService.js';
import * as ensoCache from '../services/ensoCache.js';

const router = express.Router();

// GET /api/enso/status
router.get('/enso/status', async (req, res) => {
  try {
    const ensoData = await getEnsoContext();

    if (!ensoData) {
      return res.status(503).json({
        ok:      false,
        error:   'NOAA ENSO data temporalmente no disponible',
        message: 'El servicio ENSO es informacional. El análisis de riesgo continúa sin él.',
      });
    }

    const alert = buildEnsoAlertSignal(ensoData);

    return res.json({
      ok:       true,
      enso:     ensoData,
      alert,    // null when phase is neutral or weak
      cached:   ensoCache.stats().hit,
    });
  } catch (err) {
    console.error('[GET /api/enso/status]', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno al obtener datos ENSO' });
  }
});

// POST /api/enso/refresh  — forces cache invalidation
router.post('/enso/refresh', async (req, res) => {
  try {
    const ensoData = await refreshEnsoContext();
    if (!ensoData) {
      return res.status(503).json({ ok: false, error: 'Re-fetch de NOAA ONI falló' });
    }
    return res.json({ ok: true, message: 'Cache ENSO refrescado', enso: ensoData });
  } catch (err) {
    console.error('[POST /api/enso/refresh]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al refrescar ENSO' });
  }
});

// GET /api/enso/cache-stats
router.get('/enso/cache-stats', (_req, res) => {
  return res.json({ ok: true, cache: ensoCache.stats() });
});

export default router;
