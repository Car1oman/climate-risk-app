import * as React from "react";

function ConfidenceBar({ label, score, max = 1 }) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-32 flex-shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-right font-medium">{score.toFixed(2)}</span>
    </div>
  );
}

export function SignalDetail({ signals }) {
  if (!signals?.length) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Señales ({signals.length})
      </h3>
      <div className="space-y-4">
        {signals.map(signal => (
          <div key={signal.signal_id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{signal.name}</span>
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                  {signal.type}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {signal.source_variables?.join(", ")}
              </span>
            </div>

            <div className="space-y-1.5">
              <ConfidenceBar label="Source Quality" score={signal.source_quality?.score || 0} />
              <ConfidenceBar label="Signal Strength" score={signal.signal_strength?.score || 0} />
            </div>

            {signal.anomaly_value != null && (
              <div className="text-xs text-muted-foreground">
                Anomalía: {signal.anomaly_value} {signal.anomaly_unit || ""}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
