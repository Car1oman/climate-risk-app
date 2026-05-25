// @ts-nocheck
import { Building2, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { RISK_TYPE_DISPLAY } from "@/constants/riskTypes";

const CONFIDENCE_CONFIG = {
  alta:  { label: 'Alta confianza',  dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  media: { label: 'Confianza media', dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400'    },
  baja:  { label: 'Baja confianza',  dot: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400'       },
};

const EFFECTIVENESS_ORDER = { alta: 0, media: 1, baja: 2 };

function getTopAction(risks) {
  for (const eff of ['alta', 'media']) {
    for (const risk of risks ?? []) {
      const m = (risk.adaptationMeasures ?? []).find(a => a.effectiveness === eff);
      if (m) return m;
    }
  }
  return null;
}

function getTopImpacts(risks) {
  const seen = new Set();
  const result = [];
  for (const risk of risks ?? []) {
    for (const impact of risk.impacts ?? []) {
      if (!seen.has(impact) && result.length < 2) {
        seen.add(impact);
        result.push(impact);
      }
    }
  }
  return result;
}

/**
 * ExecutiveSummaryCard — Sprint 20.
 * Briefing ejecutivo: responde 4 preguntas en < 20 segundos.
 *   1. ¿Qué riesgos existen?         → pills de fenómenos
 *   2. ¿Qué podría pasar?             → impactos operativos top
 *   3. ¿Qué tan confiable es?         → badge de confianza
 *   4. ¿Qué hacer?                    → acción prioritaria
 */
export default function ExecutiveSummaryCard({ narrativeReport }) {
  if (!narrativeReport) return null;

  const { executiveSummary, sectorLabel, locationLabel, risks, confidence, analysisDate } = narrativeReport;
  const conf = CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG.media;

  // 1. Unique risk pills (no period duplicates)
  const uniqueRisks = (risks ?? []).filter(
    (r, i, arr) => arr.findIndex(x => x.riskType === r.riskType) === i
  );

  // 2. Top operational impacts (max 2)
  const topImpacts = getTopImpacts(uniqueRisks);

  // 3. Top adaptation action
  const topAction = getTopAction(risks ?? []);

  const formattedDate = analysisDate
    ? new Date(analysisDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const hasLowConfidence = confidence === 'baja';

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
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Evaluación de riesgo climático
            </p>
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

        {/* 1 — Qué riesgos existen */}
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

        {/* 2 — Qué podría pasar (executive narrative) */}
        <p className="text-sm leading-relaxed text-foreground border-l-2 border-primary/30 pl-4 py-0.5">
          {executiveSummary}
        </p>

        {/* 3 — Impactos operativos top */}
        {topImpacts.length > 0 && (
          <div className="rounded-lg bg-secondary/50 border border-border/60 px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Posibles afectaciones
            </p>
            <ul className="space-y-0.5">
              {topImpacts.map((impact, i) => (
                <li key={i} className="text-xs text-foreground/75 flex items-start gap-2">
                  <span className="text-muted-foreground/60 flex-shrink-0 mt-0.5" aria-hidden="true">–</span>
                  {impact}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 4 — Qué hacer */}
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
