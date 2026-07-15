// Shared level → style mapping for the v2 pipeline's risk_level vocabulary
// (bajo/medio/alto/catastrofico), as returned by Stage06Risk / Stage07Presentation.

export const RISK_LEVEL_STYLES = {
  bajo: {
    label: 'Bajo',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  medio: {
    label: 'Medio',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    dot: 'bg-amber-500',
  },
  alto: {
    label: 'Alto',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    dot: 'bg-red-500',
  },
  catastrofico: {
    label: 'Catastrófico',
    badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    dot: 'bg-purple-500',
  },
};

export function riskLevelStyle(level) {
  return RISK_LEVEL_STYLES[level] || {
    label: level || 'Desconocido',
    badge: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground',
  };
}
