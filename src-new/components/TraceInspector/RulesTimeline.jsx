import * as React from "react";

const STATUS_ICON = {
  success: "✓",
  partial: "~",
  failed: "✗",
};

const STATUS_COLOR = {
  success: "border-green-500 bg-green-50",
  partial: "border-yellow-500 bg-yellow-50",
  failed: "border-red-500 bg-red-50",
};

export function RulesTimeline({ stages }) {
  if (!stages?.length) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Etapas del Pipeline
      </h3>
      <div className="relative">
        <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" />
        <div className="space-y-4">
          {stages.map((stage) => (
            <div key={stage.stage_id} className="relative pl-10">
              <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                STATUS_COLOR[stage.status] || "border-gray-300 bg-gray-50"
              }`} />
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Stage {stage.stage_id}
                    </span>
                    <span className="font-medium text-sm">{stage.stage_name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      stage.status === "success" ? "bg-green-100 text-green-700" :
                      stage.status === "partial" ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {STATUS_ICON[stage.status] || "?"} {stage.status}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {stage.duration_ms}ms
                  </span>
                </div>

                {stage.rules_applied?.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Reglas aplicadas ({stage.rules_applied.length})
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4 list-disc">
                      {stage.rules_applied.map((rule, i) => (
                        <li key={i} className="text-muted-foreground">{rule}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {stage.error && (
                  <div className="mt-2 text-xs text-red-600">
                    Error: {stage.error.message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
