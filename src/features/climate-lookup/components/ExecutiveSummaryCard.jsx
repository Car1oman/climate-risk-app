// @ts-nocheck
import { Building2, Calendar } from "lucide-react";
import { RISK_TYPE_DISPLAY } from "@/constants/riskTypes";

const CONFIDENCE_CONFIG = {
  alta:  { label: 'Alta confianza',  dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  media: { label: 'Confianza media', dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400'    },
  baja:  { label: 'Baja confianza',  dot: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400'       },
};

export default function ExecutiveSummaryCard({ narrativeReport }) {
  if (!narrativeReport) return null;

  const { executiveSummary, sectorLabel, locationLabel, risks, confidence, analysisDate } = narrativeReport;
  const conf = CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG.media;

  // One pill per unique risk type (no period duplicates)
  const uniqueRisks = (risks ?? []).filter(
    (r, i, arr) => arr.findIndex(x => x.riskType === r.riskType) === i
  );

  const formattedDate = analysisDate
    ? new Date(analysisDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Evaluación de riesgo climático
          </p>
          <h2 className="text-xl font-bold text-foreground leading-tight">
            {locationLabel}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
              {sectorLabel}
            </span>
            {formattedDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                {formattedDate}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${conf.text}`}>
            <span className={`w-2 h-2 rounded-full ${conf.dot}`} />
            {conf.label}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {uniqueRisks.length} fenómeno{uniqueRisks.length !== 1 ? 's' : ''} identificado{uniqueRisks.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Executive narrative */}
      <p className="text-sm leading-relaxed text-foreground border-l-2 border-primary/30 pl-4 py-0.5">
        {executiveSummary}
      </p>

      {/* Risk pills — unique per type */}
      {uniqueRisks.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {uniqueRisks.map(r => {
            const meta = RISK_TYPE_DISPLAY[r.riskType] ?? {
              icon: '⚠️', label: r.displayName,
              bgColor: 'bg-secondary', textColor: 'text-foreground', borderColor: 'border-border',
            };
            return (
              <span
                key={r.riskType}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border ${meta.borderColor} ${meta.bgColor} ${meta.textColor}`}
              >
                {meta.icon} {meta.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
