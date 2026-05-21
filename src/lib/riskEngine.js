/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED: Duplicado frontend del modelo H×E×I: R = H×0.40 + E×0.30 + I_norm×0.30.
 * Lógica real archivada en: src/deprecated/lib/riskEngine.js
 * Ver: project-memory/CLEANUP_ANALYSIS.md — riskEngine.js — DEPRECATE
 *
 * Re-export wrapper para compatibilidad temporal. No usar en código nuevo.
 * Migrar formatCurrency y getRiskColor a src/lib/utils.js en Sprint 2.
 * Eliminación física: Sprint 2 o posterior.
 */
export {
  HAZARD_LABELS,
  HAZARD_WEIGHTS,
  HORIZON,
  TYPE_FACTOR,
  getRiskColor,
  calculateHazardScore,
  calculateExposureScore,
  calculateFinancialImpact,
  calculateRiskScore,
  getTopRiskForAsset,
  formatCurrency,
  getTopHazards,
} from '../deprecated/lib/riskEngine.js';
