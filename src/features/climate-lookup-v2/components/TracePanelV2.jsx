import { useEffect, useState } from "react";
import { ChevronDown, FlaskConical, Loader2, CheckCircle2, XCircle } from "lucide-react";

const STATUS_ICON = {
  success: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-hidden="true" />,
  error: <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" aria-hidden="true" />,
};

/**
 * TracePanelV2 — collapsible per-stage trace (mirrors ScientificFooter's
 * collapsed-by-default pattern from v1). Unlike v1, every stage here is a
 * first-class traceable unit — this is the pipeline's "Observable Artifacts"
 * guarantee made visible in the UI.
 */
export default function TracePanelV2({ traceId, trace, traceLoading, traceError, onFetchTrace }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && traceId && !trace && !traceLoading) {
      onFetchTrace(traceId);
    }
  }, [expanded, traceId, trace, traceLoading, onFetchTrace]);

  if (!traceId) return null;

  return (
    <div className="rounded-lg border border-border/25 bg-transparent overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls="trace-panel-v2-content"
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" aria-hidden="true" />
          <p className="text-[10px] font-medium text-muted-foreground/70">
            Trazabilidad del pipeline (7 etapas)
          </p>
        </div>
        <ChevronDown
          className={`w-3 h-3 text-muted-foreground/50 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id="trace-panel-v2-content" className="border-t border-border/20 px-3 py-3 space-y-2">
          {traceLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              Cargando traza...
            </div>
          )}

          {traceError && !traceLoading && (
            <p className="text-xs text-destructive">{traceError}</p>
          )}

          {trace && !traceLoading && (
            <ol className="space-y-1.5">
              {trace.stages?.map((s) => (
                <li key={s.stage_id} className="flex items-start gap-2 text-xs">
                  {STATUS_ICON[s.status] || <span className="w-3.5 h-3.5 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-foreground/90">
                      <span className="text-muted-foreground/60 font-mono mr-1.5">#{s.stage_id}</span>
                      {s.stage_name}
                      {typeof s.duration_ms === 'number' && (
                        <span className="text-muted-foreground/50 ml-1.5">· {s.duration_ms}ms</span>
                      )}
                    </p>
                    {s.error && <p className="text-destructive/80 mt-0.5">{s.error}</p>}
                    {s.rules_applied?.length > 0 && (
                      <ul className="mt-0.5 space-y-0.5">
                        {s.rules_applied.map((rule, i) => (
                          <li key={i} className="text-muted-foreground/60">— {rule}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
