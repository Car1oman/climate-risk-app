import * as React from "react";
import { SourceList } from "./SourceList.jsx";
import { SignalDetail } from "./SignalDetail.jsx";
import { RulesTimeline } from "./RulesTimeline.jsx";

export function TraceInspector({ traceId, stages, signals }) {
  if (!traceId && !stages) return null;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trazabilidad</h2>
        {traceId && (
          <span className="text-xs text-muted-foreground font-mono">
            ID: {traceId}
          </span>
        )}
      </div>

      <SourceList stages={stages} />
      <SignalDetail signals={signals} />
      <RulesTimeline stages={stages} />

      <div className="text-xs text-muted-foreground text-center pt-4 border-t">
        Los datos presentados provienen del artefacto de evidencia. Cada afirmación tiene trazabilidad interna.
      </div>
    </div>
  );
}
