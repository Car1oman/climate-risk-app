/**
 * Risk Calibration Routes — Fase 3.2
 *
 * POST /api/calibrate/compute  — Computa score de riesgo con datos de activo
 * POST /api/calibrate/events   — Registra evento histórico para calibración
 * POST /api/calibrate/recalibrate — Recalibra con nuevo evento
 */

import express from 'express';
import { computeCalibratedRisk, recalibrateWithEvent } from '../services/riskCalibrationService.js';

const router = express.Router();

// POST /api/calibrate/compute
router.post('/calibrate/compute', async (req, res) => {
  try {
    const { climateData, assetInfo, userInput } = req.body;
    if (!assetInfo) {
      return res.status(400).json({ ok: false, error: 'assetInfo es requerido (type, region, criticality)' });
    }
    const result = computeCalibratedRisk(climateData || null, assetInfo, userInput || {});
    if (!result) {
      return res.status(500).json({ ok: false, error: 'Error computando riesgo calibrado' });
    }
    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/calibrate/events
router.post('/calibrate/events', async (req, res) => {
  try {
    const { events, climateData, assetInfo } = req.body;
    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ ok: false, error: 'events debe ser un arreglo no vacío' });
    }
    const result = computeCalibratedRisk(
      climateData || null,
      assetInfo || { sector: 'default' },
      { events }
    );
    if (!result) {
      return res.status(500).json({ ok: false, error: 'Error calibrando con eventos' });
    }
    return res.json({ ok: true, data: result, eventsRegistered: events.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/calibrate/recalibrate
router.post('/calibrate/recalibrate', async (req, res) => {
  try {
    const { previousResult, newEvent, climateData } = req.body;
    if (!previousResult || !newEvent) {
      return res.status(400).json({ ok: false, error: 'previousResult y newEvent son requeridos' });
    }
    const result = recalibrateWithEvent(previousResult, newEvent, climateData || null);
    if (!result) {
      return res.status(500).json({ ok: false, error: 'Error recalibrando' });
    }
    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
