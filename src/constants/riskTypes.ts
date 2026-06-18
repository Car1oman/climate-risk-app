// Human-facing display metadata for canonical risk slugs.
// Technical identifiers (SSP, CMIP6 codes, ONI) must NEVER appear in these values.

import type { RiskTypeSlug } from '../domain/consolidatedRisk';

export interface RiskTypeDisplay {
  label: string;
  shortLabel: string;
  icon: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  /** One-sentence plain narrative for uninitiated users. */
  briefNarrative: string;
}

export const RISK_TYPE_DISPLAY: Record<RiskTypeSlug, RiskTypeDisplay> = {
  lluvias_extremas: {
    label: 'Lluvias extremas',
    shortLabel: 'Lluvias',
    icon: '🌧️',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-700',
    briefNarrative:
      'Precipitaciones que superan los umbrales históricos de daño, con potencial de interrupción operativa.',
  },
  calor_extremo: {
    label: 'Calor extremo',
    shortLabel: 'Calor',
    icon: '🌡️',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-200 dark:border-orange-700',
    briefNarrative:
      'Temperaturas muy por encima del promedio histórico que afectan personas, equipos e infraestructura.',
  },
  sequia: {
    label: 'Sequía',
    shortLabel: 'Sequía',
    icon: '☀️',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-700',
    briefNarrative:
      'Déficit hídrico prolongado que compromete el suministro de agua para operaciones y personas.',
  },
  deslizamiento: {
    label: 'Deslizamiento',
    shortLabel: 'Desliz.',
    icon: '⛰️',
    bgColor: 'bg-stone-50 dark:bg-stone-900/20',
    textColor: 'text-stone-700 dark:text-stone-300',
    borderColor: 'border-stone-200 dark:border-stone-700',
    briefNarrative:
      'Movimiento de masas de tierra o roca por pendientes, potenciado por lluvia intensa o saturación del suelo.',
  },
  heladas: {
    label: 'Heladas',
    shortLabel: 'Heladas',
    icon: '❄️',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    textColor: 'text-sky-700 dark:text-sky-300',
    borderColor: 'border-sky-200 dark:border-sky-700',
    briefNarrative:
      'Temperaturas bajo cero que pueden dañar infraestructura, cultivos y sistemas de distribución.',
  },
  fenomeno_enso: {
    label: 'Fenómeno El Niño / La Niña',
    shortLabel: 'El Niño',
    icon: '🌊',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    textColor: 'text-teal-700 dark:text-teal-300',
    borderColor: 'border-teal-200 dark:border-teal-700',
    briefNarrative:
      'Variabilidad climática interanual que amplifica lluvias o sequías según la fase activa.',
  },
  inundacion: {
    label: 'Inundación',
    shortLabel: 'Inundac.',
    icon: '🌊',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-700',
    briefNarrative:
      'Desborde de cuerpos de agua que puede afectar instalaciones, accesos y operaciones.',
  },
  exposicion: {
    label: 'Exposición multi-amenaza',
    shortLabel: 'Exposición',
    icon: '🎯',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-700',
    briefNarrative:
      'Grado en que activos e infraestructura están expuestos a múltiples amenazas climáticas simultáneas.',
  },
  vulnerabilidad: {
    label: 'Vulnerabilidad GRI',
    shortLabel: 'Vulnerab.',
    icon: '🛡️',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    textColor: 'text-rose-700 dark:text-rose-300',
    borderColor: 'border-rose-200 dark:border-rose-700',
    briefNarrative:
      'Susceptibilidad de sistemas y comunidades a sufrir daños ante el impacto de amenazas climáticas.',
  },
  riesgo_calibrado: {
    label: 'Riesgo calibrado (P×I/CA)',
    shortLabel: 'R. Calibrado',
    icon: '📊',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    textColor: 'text-indigo-700 dark:text-indigo-300',
    borderColor: 'border-indigo-200 dark:border-indigo-700',
    briefNarrative:
      'Índice integrado de riesgo según probabilidad, impacto y capacidad de adaptación (Manual Intercorp).',
  },
  capacidad_adaptativa: {
    label: 'Capacidad adaptativa',
    shortLabel: 'Cap. Adapt.',
    icon: '📶',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-200 dark:border-emerald-700',
    briefNarrative:
      'Capacidad estructural del territorio para absorber, responder y recuperarse de impactos climáticos.',
  },
};

// ─── Technical metric → human label ──────────────────────────────────────────
// Used to strip CMIP6/IPCC codes from displayed values.

export const METRIC_DISPLAY: Record<string, string> = {
  rx1day: 'precipitación máxima diaria',
  rx5day: 'precipitación máxima en 5 días',
  hd35: 'días de calor extremo (>35 °C)',
  hd40: 'días de calor muy extremo (>40 °C)',
  tr: 'noches tropicales (>20 °C)',
  pr: 'cambio en precipitación',
  tas: 'temperatura media',
  tasmax: 'temperatura máxima',
  tasmin: 'temperatura mínima',
  oni: 'variabilidad climática El Niño',
  ONI: 'variabilidad climática El Niño',
  cdd: 'días consecutivos secos',
  spei: 'índice de estrés hídrico',
  gri_flood: 'riesgo de inundación',
  gri_heat: 'exposición a calor extremo',
  gri_drought: 'estrés hídrico',
  gri_landslide: 'susceptibilidad a deslizamiento',
};

/**
 * Returns a human-readable metric label for a technical indicator code.
 * Falls back to the raw indicator if not found.
 */
export function humanizeMetric(indicator: string): string {
  return METRIC_DISPLAY[indicator] ?? indicator;
}

/**
 * Formats a signal value + unit + indicator into a readable key metric string.
 * Example: "78 mm/día de precipitación máxima diaria"
 */
export function formatKeyMetric(
  value: number | null | undefined,
  unit: string | null | undefined,
  indicator: string | null | undefined
): string | null {
  if (value == null) return null;
  const roundedValue = Number.isInteger(value) ? value : value.toFixed(1);
  const unitStr = unit ? ` ${unit.trim()}` : '';
  const metricLabel = indicator ? ` de ${humanizeMetric(indicator)}` : '';
  return `${roundedValue}${unitStr}${metricLabel}`;
}
