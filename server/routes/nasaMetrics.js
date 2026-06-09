/**
 * Route: GET /api/nasa-metrics
 *
 * Exposes accumulated request metrics for NASA data sources.
 * Constitution VII (Observability): request_count, success_count,
 * failure_count, avg_latency_ms, cache_hit_rate per service.
 */

import { Router } from 'express';
import { getMetrics } from '../services/nasaMetrics.js';

const router = Router();

router.get('/nasa-metrics', (_req, res) => {
  res.json({
    ok: true,
    metrics: getMetrics(),
  });
});

export default router;
