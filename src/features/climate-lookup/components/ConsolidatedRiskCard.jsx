// @ts-nocheck
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { RISK_TYPE_DISPLAY } from "@/constants/riskTypes";

const CONFIDENCE_STYLES = {
  alta:  { label: 'Alta confianza',  cls: 'text-emerald-600 dark:text-emerald-400' },
  media: { label: 'Confianza media', cls: 'text-amber-600 dark:text-amber-400'    },
  baja:  { label: 'Confianza baja',  cls: 'text-muted-foreground'                 },
};

const EFFECTIVENESS_STYLES = {
  alta:  'text-emerald-600 dark:text-emerald-400',
  media: 'text-amber-600 dark:text-amber-400',
  baja:  'text-muted-foreground',
};

export default function ConsolidatedRiskCard({ risk }) {
  const [expanded, setExpanded] = useState(false);

  const meta = RISK_TYPE_DISPLAY[risk.riskType] ?? {
    label: risk.displayName, icon: '⚠️',
    bgColor: 'bg-secondary', textColor: 'text-foreground', borderColor: 'border-border',
  };
  const conf = CONFIDENCE_STYLES[risk.confidence] ?? CONFIDENCE_STYLES.media;
  const hasDetails = risk.impacts?.length > 0 || risk.adaptationMeasures?.length > 0;

  return (
    <div className={`rounded-xl border ${meta.borderColor} ${meta.bgColor} overflow-hidden`}>
      {/* Main */}
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="text-lg leading-none mt-0.5 flex-shrink-0">{meta.icon}</span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-tight ${meta.textColor}`}>
                {risk.displayName}
              </p>
              {risk.keyMetric && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{risk.keyMetric}</p>
              )}
            </div>
          </div>
          <span className={`text-[10px] font-medium flex-shrink-0 mt-0.5 ${conf.cls}`}>
            {conf.label}
          </span>
        </div>

        <p className="text-xs text-foreground/75 leading-relaxed">{risk.narrativeText}</p>
      </div>

      {/* Expandable section */}
      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-black/5 dark:border-white/5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>
              {expanded
                ? 'Ocultar'
                : `Ver impactos${risk.adaptationMeasures?.length ? ' y adaptaciones' : ''}`}
            </span>
            {expanded
              ? <ChevronDown className="w-3 h-3" aria-hidden="true" />
              : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
          </button>

          {expanded && (
            <div className="px-4 pb-4 pt-3 space-y-3.5 border-t border-black/5 dark:border-white/5">
              {risk.impacts?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Impactos operativos
                  </p>
                  <ul className="space-y-1">
                    {risk.impacts.slice(0, 4).map((impact, i) => (
                      <li key={i} className="text-xs text-foreground/75 flex items-start gap-2">
                        <span className="text-muted-foreground mt-0.5 flex-shrink-0">–</span>
                        {impact}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {risk.adaptationMeasures?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Medidas de adaptación
                  </p>
                  <div className="space-y-1.5">
                    {risk.adaptationMeasures.slice(0, 3).map(m => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 text-xs py-1 border-b border-black/5 dark:border-white/5 last:border-0"
                      >
                        <span className="text-foreground/80">{m.name}</span>
                        <span className={`text-[10px] flex-shrink-0 font-medium capitalize ${EFFECTIVENESS_STYLES[m.effectiveness] ?? 'text-muted-foreground'}`}>
                          {m.effectiveness}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
