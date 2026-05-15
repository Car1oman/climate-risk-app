import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

/**
 * GET /healthz — liveness probe.
 * Returns 200 immediately. Used by load balancers / uptime monitors.
 */
router.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

/**
 * GET /readyz — readiness probe.
 * Verifies that the Supabase connection is reachable before returning 200.
 * Returns 503 if the database is unreachable.
 */
router.get('/readyz', async (_req, res) => {
  try {
    // Lightweight query — just checks connectivity, returns at most 1 row.
    const { error } = await supabase.from('assets').select('id').limit(1);

    if (error) {
      return res.status(503).json({
        status: 'not ready',
        reason: 'database unreachable',
        ts: new Date().toISOString(),
      });
    }

    res.json({ status: 'ready', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({
      status: 'not ready',
      reason: err.message,
      ts: new Date().toISOString(),
    });
  }
});

export default router;
