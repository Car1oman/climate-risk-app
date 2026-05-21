/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED: composite_score con pesos no calibrados estadísticamente.
 * Lógica real archivada en: server/deprecated/layers/Layer4_PrioritizationEngine.js
 * Ver: project-memory/CLEANUP_ANALYSIS.md — Layer4 — DEPRECATE
 *
 * Re-export wrapper para compatibilidad temporal. No usar en código nuevo.
 * Layer4 no puede eliminarse físicamente aún porque Layer5 y Layer6 dependen de su output.
 * Eliminación física: Sprint 2 o posterior (junto con refactor del pipeline v2).
 */
export { prioritizeRisks } from '../deprecated/layers/Layer4_PrioritizationEngine.js';
