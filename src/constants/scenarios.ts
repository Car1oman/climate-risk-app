// Scenario and temporal-window display constants.
// SSP codes are an internal concern — only the Spanish labels reach the UI.

import type { ScenarioLabel, TemporalPeriod } from '../domain/consolidatedRisk';

// ─── SSP → human label ────────────────────────────────────────────────────────

/** Maps any SSP variant (as returned by the API) to a human-readable string. */
export const SCENARIO_DISPLAY: Record<string, string> = {
  'SSP1-2.6': 'bajas emisiones',
  'SSP2-4.5': 'emisiones moderadas',
  'SSP5-8.5': 'altas emisiones',
  'ssp126':   'bajas emisiones',
  'ssp245':   'emisiones moderadas',
  'ssp585':   'altas emisiones',
  'N/A':      'escenario base',
  '':         'escenario base',
};

/** Maps any SSP variant to the canonical ScenarioLabel slug. */
export const SCENARIO_SLUG_MAP: Record<string, ScenarioLabel> = {
  'SSP1-2.6': 'bajas_emisiones',
  'SSP2-4.5': 'emisiones_moderadas',
  'SSP5-8.5': 'altas_emisiones',
  'ssp126':   'bajas_emisiones',
  'ssp245':   'emisiones_moderadas',
  'ssp585':   'altas_emisiones',
};

/** Converts any raw SSP string to a ScenarioLabel.  Returns null if unknown. */
export function toScenarioLabel(raw: string | null | undefined): ScenarioLabel {
  if (!raw) return null;
  return SCENARIO_SLUG_MAP[raw.trim()] ?? null;
}

/** Returns the user-facing scenario description. */
export function displayScenario(raw: string | null | undefined): string {
  if (!raw) return 'escenario base';
  return SCENARIO_DISPLAY[raw.trim()] ?? raw;
}

// ─── Temporal horizon → human label ──────────────────────────────────────────

export interface TimeWindowDisplay {
  label: string;
  description: string;
  period: string;
}

export const TIME_WINDOWS_UI: Record<TemporalPeriod | string, TimeWindowDisplay> = {
  historico: {
    label: 'Histórico',
    description: 'Período de referencia observada',
    period: '1980–2014',
  },
  corto_plazo: {
    label: 'Corto plazo',
    description: 'Próxima década',
    period: '2020–2039',
  },
  mediano_plazo: {
    label: 'Mediano plazo',
    description: 'Próximos 15–35 años',
    period: '2040–2059',
  },
  largo_plazo: {
    label: 'Largo plazo',
    description: 'Próximos 35–55 años',
    period: '2060–2080',
  },
  // API aliases
  historical:  { label: 'Histórico',     description: 'Período de referencia observada', period: '1980–2014' },
  short_term:  { label: 'Corto plazo',   description: 'Próxima década',                  period: '2020–2039' },
  mid_term:    { label: 'Mediano plazo', description: 'Próximos 15–35 años',             period: '2040–2059' },
  long_term:   { label: 'Largo plazo',   description: 'Próximos 35–55 años',            period: '2060–2080' },
};

/** Maps API horizon keys to canonical TemporalPeriod slugs. */
export const HORIZON_TO_PERIOD: Record<string, TemporalPeriod> = {
  historical:  'historico',
  short_term:  'corto_plazo',
  mid_term:    'mediano_plazo',
  long_term:   'largo_plazo',
  historico:   'historico',
  corto_plazo: 'corto_plazo',
  mediano_plazo: 'mediano_plazo',
  largo_plazo: 'largo_plazo',
};

/** Converts an API horizon key to a canonical TemporalPeriod. */
export function toTemporalPeriod(raw: string | null | undefined): TemporalPeriod {
  if (!raw) return 'mediano_plazo';
  return HORIZON_TO_PERIOD[raw.trim()] ?? 'mediano_plazo';
}
