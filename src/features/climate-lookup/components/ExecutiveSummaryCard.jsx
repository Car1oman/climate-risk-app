// @ts-nocheck
import { Building2, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { RISK_TYPE_DISPLAY } from "@/constants/riskTypes";

const CONFIDENCE_CONFIG = {
  alta:  { label: 'Alta confianza',  dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  media: { label: 'Confianza media', dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400'    },
  baja:  { label: 'Baja confianza',  dot: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400'       },
};

const PERIOD_LABEL = {
  historico:     'Período histórico',
  corto_plazo:   'Proyección 2020–2039',
  mediano_plazo: 'Proyección 2040–2059',
  largo_plazo:   'Proyección 2060–2079',
};

const CONF_RANK = { alta: 3, media: 2, baja: 1 };

function getTopAction(risks) {
  for (const eff of ['alta', 'media']) {
    for (const risk of risks ?? []) {
      const m = (risk.adaptationMeasures ?? []).find(a => a.effectiveness === eff);
      if (m) return m;
    }
  }
  return null;
}

// Scenario-aware impact collector: uses scenarioVariants when available
export function getTopImpactsWithScenario(risks, activeScenario) {
  const seen = new Set();
  const result = [];
  for (const risk of risks ?? []) {
    const variant = activeScenario && risk.scenarioVariants?.[activeScenario];
    const impacts = variant?.impacts?.length ? variant.impacts : (risk.impacts ?? []);
    for (const impact of impacts) {
      if (!seen.has(impact) && result.length < 2) {
        seen.add(impact);
        result.push(impact);
      }
    }
  }
  return result;
}

// Period-filtered unique risks — returns [] when period is null/unset or has no data
export function getPeriodRisks(consolidatedRisks, selectedPeriod) {
  if (!consolidatedRisks?.length || selectedPeriod == null) return [];
  return consolidatedRisks.filter(r => r.period === selectedPeriod);
}

// Top confidence from a risk list, scenario-aware
export function getPeriodConfidence(risks, activeScenario) {
  return risks.reduce((best, r) => {
    const variant = activeScenario && r.scenarioVariants?.[activeScenario];
    const c = variant?.confidence ?? r.confidence ?? 'baja';
    return CONF_RANK[c] > CONF_RANK[best] ? c : best;
  }, 'baja');
}

/**
 * ExecutiveSummaryCard — Sprint 22.
 * Briefing ejecutivo reactivo: responde 4 preguntas en < 20 segundos.
 * Actualiza contenido según selectedPeriod + activeScenario.
 *
 *   1. ¿Qué riesgos existen?         → pills del período seleccionado
 *   2. ¿Qué podría pasar?             → narrativa del período + impactos scenario-aware
 *   3. ¿Qué tan confiable es?         → badge de confianza del período/escenario
 *   4. ¿Qué hacer?                    → acción prioritaria del período
 */
export default function ExecutiveSummaryCard({
  narrativeReport,
  consolidatedRisks,
  selectedPeriod,
  activeScenario = 'emisiones_moderadas',
}) {
  if (!narrativeReport) {
    if (import.meta.env.DEV) {
      console.warn('[ExecutiveSummaryCard] narrativeReport es null/undefined — verificar buildNarrativeReport() en useClimateAnalysis.');
    }
    return null;
  }

  const { sectorLabel, locationLabel, analysisDate } = narrativeReport;

  // 1. Period-specific risks — empty when period is null/unset
  const periodRisks = getPeriodRisks(consolidatedRisks, selectedPeriod);

  // 2. Unique risk pills for the current period
  const uniqueRisks = periodRisks.filter(
    (r, i, arr) => arr.findIndex(x => x.riskType === r.riskType) === i
  );

  // 3. Brief overview narrative — executiveSummary (cross-period overview, not duplicated in RiskPeriodSection)
  const briefNarrative = narrativeReport.executiveSummary || null;

  // 4. Top adaptation action from the current period
  const topAction = getTopAction(periodRisks);

  // 5. Period + scenario confidence
  const periodConf = periodRisks.length
    ? getPeriodConfidence(periodRisks, activeScenario)
    : (narrativeReport.confidence ?? 'baja');
  const conf = CONFIDENCE_CONFIG[periodConf] ?? CONFIDENCE_CONFIG.media;

  const formattedDate = analysisDate
    ? new Date(analysisDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const hasLowConfidence = periodConf === 'baja';
  const periodLabel = PERIOD_LABEL[selectedPeriod];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Low confidence warning banner */}
      {hasLowConfidence && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" aria-hidden="true" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Datos limitados para esta zona — los resultados son orientativos
          </p>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Evaluación de riesgo climático
              </p>
              {periodLabel && (
                <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground">
                  {periodLabel}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground leading-tight">{locationLabel}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                {sectorLabel}
              </span>
              {formattedDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  {formattedDate}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${conf.text}`}>
              <span className={`w-2 h-2 rounded-full ${conf.dot}`} aria-hidden="true" />
              {conf.label}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {uniqueRisks.length} fenómeno{uniqueRisks.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* 1 — Qué riesgos existen (period-filtered pills) */}
        {uniqueRisks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {uniqueRisks.map(r => {
              const meta = RISK_TYPE_DISPLAY[r.riskType] ?? {
                icon: '⚠️', label: r.displayName,
                bgColor: 'bg-secondary', textColor: 'text-foreground', borderColor: 'border-border',
              };
              return (
                <span
                  key={r.riskType}
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border ${meta.borderColor} ${meta.bgColor} ${meta.textColor}`}
                >
                  {meta.icon} {meta.label}
                </span>
              );
            })}
          </div>
        )}

        {/* 2 — Visión general (executiveSummary — no duplica narrativa de RiskPeriodSection) */}
        {briefNarrative && (
          <p className="text-sm leading-relaxed text-foreground border-l-2 border-primary/30 pl-4 py-0.5">
            {briefNarrative}
          </p>
        )}

        {/* 3 — Acción prioritaria del período */}
        {topAction && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-0.5">
                Acción prioritaria
              </p>
              <p className="text-xs text-foreground/80 leading-snug">{topAction.name}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
