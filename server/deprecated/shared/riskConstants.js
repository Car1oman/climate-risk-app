/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED con el enfoque de inteligencia climática científica.
 * Constantes heurísticas H×E×I sin calibración estadística.
 * Ver: project-memory/CLEANUP_ANALYSIS.md — riskConstants — DEPRECATE
 *
 * Este archivo es la copia de archivo de las constantes heurísticas.
 * El wrapper en server/shared/riskConstants.js re-exporta desde aquí.
 * Eliminación física: Sprint 2 o posterior.
 */

// Shared H×E×I risk model constants — single source of truth for all backend services.
// Frontend (src/lib/constants.js) maintains its own copy intentionally; do not import from there.

export const HAZARD_WEIGHTS = {
  hazard_flood:      0.30,
  hazard_elnino:     0.25,
  hazard_earthquake: 0.20,
  hazard_landslide:  0.15,
  hazard_drought:    0.10,
};

export const HAZARD_LABELS = {
  hazard_flood:      'Inundación Fluvial',
  hazard_elnino:     'Fenómeno El Niño',
  hazard_earthquake: 'Sismo',
  hazard_landslide:  'Deslizamiento',
  hazard_drought:    'Sequía Hídrica',
};

export const HORIZON = {
  hazard_flood:      'corto',
  hazard_elnino:     'corto',
  hazard_earthquake: 'largo',
  hazard_landslide:  'medio',
  hazard_drought:    'medio',
};

export const TYPE_FACTOR = {
  supermercado_grande:  1.0,
  supermercado_mediano: 0.8,
  centro_distribucion:  1.2,
  tienda_express:       0.6,
};

// Rehabilitation cost per m² by hazard type (S/ per m²)
export const REHAB_FACTOR = {
  hazard_flood:      120,
  hazard_elnino:     150,
  hazard_earthquake: 350,
  hazard_landslide:  200,
  hazard_drought:    40,
};

// Closure days by integer risk level (0–4)
export const CLOSURE_DAYS = { 0: 0, 1: 3, 2: 7, 3: 21, 4: 45 };
