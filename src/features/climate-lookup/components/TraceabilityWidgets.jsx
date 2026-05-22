// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { CONFIDENCE_BADGE } from "../constants";

export function TraceBadges({ trace }) {
  if (!trace) return null;
  const confidence = trace.confidence_level ?? "low";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={`text-[9px] py-0 px-1.5 font-semibold border ${CONFIDENCE_BADGE[confidence] ?? CONFIDENCE_BADGE.low}`}>
        confianza {confidence}
      </Badge>
      {(trace.provenance_badges ?? []).map(source => (
        <Badge key={source} variant="outline" className="text-[9px] py-0 px-1.5 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
          {source}
        </Badge>
      ))}
      {trace.climate_model_badge && (
        <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/60 dark:text-violet-200">
          {trace.climate_model_badge}
        </Badge>
      )}
    </div>
  );
}

export function TraceabilityDetails({ trace }) {
  if (!trace) return null;
  const rows = [
    ["Fuente", trace.source_origin],
    ["Variable", trace.climate_variable],
    ["Periodo", trace.temporal_period_label ?? trace.temporal_period],
    ["Escenario", trace.scenario_ssp],
    ["Cambio detectado", trace.transformation_applied],
    ["Umbral", trace.threshold_applied],
    ["API", trace.responsible_endpoint],
  ];

  return (
    <div className="rounded-md border border-border bg-secondary p-2.5 space-y-2">
      <p className="text-[10px] font-semibold text-secondary-foreground">
        ¿Por qué se detectó este riesgo?
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[9px] uppercase tracking-widest text-slate-400">{label}</dt>
            <dd className="text-[10px] text-secondary-foreground break-words">{value ?? "No disponible"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
