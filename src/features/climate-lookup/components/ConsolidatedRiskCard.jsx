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

/**
 * @param {object}  risk            - ConsolidatedRisk
 * @param {string=} activeScenario  - 'emisiones_moderadas' | 'altas_emisiones'
 *                                    When provided, uses scenario-specific narrative + impacts.
 */
export default function ConsolidatedRiskCard({ risk, activeScenario }) {
  const [expanded, setExpanded] = useState(false);

  // Resolve scenario-specific data when available
  const variant = activeScenario && risk.scenarioVariants?.[activeScenario];
  const displayNarrative = variant?.narrativeText || risk.narrativeText;
  const displayImpacts   = variant?.impacts?.length ? variant.impacts : (risk.impacts ?? []);
  const displayConf      = variant?.confidence ?? risk.confidence;

  const meta = RISK_TYPE_DISPLAY[risk.riskType] ?? {
    label: risk.displayName, icon: '⚠️',
    bgColor: 'bg-secondary', textColor: 'text-foreground', borderColor: 'border-border',
  };
  const conf = CONFIDENCE_STYLES[displayConf] ?? CONFIDENCE_STYLES.media;
  const hasDetails = displayImpacts.length > 0 || risk.adaptationMeasures?.length > 0;
  const evidenceCount = risk.evidence?.length ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Main visible section */}
      <div className="p-4 space-y-2.5">

        {/* Fenómeno + confianza */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="text-lg leading-none mt-0.5 flex-shrink-0" aria-hidden="true">{meta.icon}</span>
            <p className={`text-sm font-semibold leading-tight ${meta.textColor}`}>
              {risk.displayName}
            </p>
          </div>
          <span className={`text-[10px] font-medium flex-shrink-0 mt-0.5 ${conf.cls}`}>
            {conf.label}
          </span>
        </div>

        {/* Explicación simple — narrativa operativa, sin jerga técnica */}
        <p className="text-xs text-foreground/75 leading-relaxed">{displayNarrative}</p>

        {/* Métrica clave — valor ya formateado por normalizeRisks */}
        {risk.keyMetric && (
          <p className="text-[11px] font-mono font-medium text-foreground/80 bg-muted/40 rounded px-2 py-0.5 w-fit">
            {risk.keyMetric}
          </p>
        )}

        {/* Evidencia resumida */}
        {evidenceCount > 0 && (
          <p className="text-[10px] text-muted-foreground/70">
            Respaldado por {evidenceCount} fuente{evidenceCount !== 1 ? 's' : ''} científica{evidenceCount !== 1 ? 's' : ''}
          </p>
        )}
        {risk.provenance && (
          <p className="text-[10px] text-muted-foreground/50 italic mt-1">
            Basado en {risk.provenance}
          </p>
        )}
      </div>

      {/* Expandable: impactos + adaptaciones (sin métricas crudas) */}
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
                ? 'Ocultar detalles'
                : `Ver impactos${risk.adaptationMeasures?.length ? ' y adaptaciones' : ''}`}
            </span>
            {expanded
              ? <ChevronDown className="w-3 h-3" aria-hidden="true" />
              : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
          </button>

          {expanded && (
            <div className="px-4 pb-4 pt-3 space-y-3.5 border-t border-black/5 dark:border-white/5">

              {/* Posibles impactos operativos */}
              {displayImpacts.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Posibles impactos operativos
                  </p>
                  <ul className="space-y-1">
                    {displayImpacts.slice(0, 4).map((impact, i) => (
                      <li key={i} className="text-xs text-foreground/75 flex items-start gap-2">
                        <span className="text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true">–</span>
                        {impact}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Medidas de adaptación */}
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

              {/* Fuentes de evidencia (nombres, sin códigos técnicos) */}
              {risk.evidence?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Evidencia científica
                  </p>
                  <ul className="space-y-0.5">
                    {risk.evidence.slice(0, 4).map((ev, i) => (
                      <li key={i} className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ev.validationStatus === 'validado' ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden="true" />
                        {ev.sourceLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
