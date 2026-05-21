/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED: Constantes heurísticas H×E×I sin calibración estadística.
 * Lógica real archivada en: server/deprecated/shared/riskConstants.js
 * Ver: project-memory/CLEANUP_ANALYSIS.md — riskConstants — DEPRECATE
 *
 * Re-export wrapper para compatibilidad temporal. No usar en código nuevo.
 * Eliminación física: Sprint 2 o posterior.
 */
export {
  HAZARD_WEIGHTS,
  HAZARD_LABELS,
  HORIZON,
  TYPE_FACTOR,
  REHAB_FACTOR,
  CLOSURE_DAYS,
} from '../deprecated/shared/riskConstants.js';
