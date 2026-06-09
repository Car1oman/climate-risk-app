/**
 * NASA Routes — Sprint 7
 *
 * GET  /api/nasa-power/health   NASA POWER service health diagnostics
 */

import express from 'express';
import * as nasaPowerCache from '../services/nasaPowerCache.js';

const router = express.Router();

// GET /api/nasa-power/health
router.get('/nasa-power/health', (_req, res) => {
  try {
    const cacheSize = nasaPowerCache.size();
    return res.json({
      ok: true,
      service: 'nasa_power',
      last_success: null,
      cache_entries: cacheSize,
      avg_latency_ms: null,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      service: 'nasa_power',
      error: err.message,
      ts: new Date().toISOString(),
    });
  }
});

export default router;
