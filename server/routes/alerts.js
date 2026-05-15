import express from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { createAlertSchema } from '../validators/alerts.js';

const router = express.Router();

// GET /api/alerts — active alerts only by default; pass ?active=false for all
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (req.query.active !== 'false') {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
  } catch (err) {
    console.error('GET /api/alerts error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/alerts/:id/archive — mark alert as inactive
router.patch('/:id/archive', requireAuth, strictLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('alerts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('PATCH /api/alerts/:id/archive error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/alerts — create a new alert
router.post('/', requireAuth, strictLimiter, validate(createAlertSchema), async (req, res) => {
  try {
    const { title, description, severity, type, source, region, asset_id } = req.body;

    if (!title || !severity) {
      return res.status(400).json({ error: 'title y severity son obligatorios' });
    }

    if (!['critical', 'warning', 'info'].includes(severity)) {
      return res.status(400).json({ error: 'severity debe ser critical, warning o info' });
    }

    const { data, error } = await supabase
      .from('alerts')
      .insert({ title, description, severity, type, source, region, asset_id })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/alerts error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
