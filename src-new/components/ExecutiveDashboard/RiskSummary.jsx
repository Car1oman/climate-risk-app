import * as React from "react";

// H-7.5 (documentacion-v2/stage-07, BAJO): catastrofico usa morado (purple),
// no un rojo más oscuro que alto — mismo matiz que
// src/features/climate-lookup-v2/components/riskLevelStyles.js (la UI real
// de /v2) y que Stage07Presentation.RISK_COLORS. Un cambio de matiz es más
// distinguible que un cambio de luminosidad para deficiencias de visión de
// color rojo-verde (WCAG 1.4.1).
const LEVEL_COLORS = {
  bajo: { dot: "bg-green-500", border: "border-green-200", bg: "bg-green-50", text: "text-green-700" },
  medio: { dot: "bg-yellow-500", border: "border-yellow-200", bg: "bg-yellow-50", text: "text-yellow-700" },
  alto: { dot: "bg-red-500", border: "border-red-200", bg: "bg-red-50", text: "text-red-700" },
  catastrofico: { dot: "bg-purple-600", border: "border-purple-300", bg: "bg-purple-100", text: "text-purple-800" },
};

export function RiskSummary({ overallRisk, locationName, summary, confidenceNote }) {
  const colors = LEVEL_COLORS[overallRisk?.level] || LEVEL_COLORS.bajo;
  const label = overallRisk?.label || "Sin datos";

  return (
    <div className={`rounded-xl border p-6 ${colors.border} ${colors.bg}`}>
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-4 h-4 rounded-full ${colors.dot} animate-pulse`} />
        <div>
          <span className={`text-xs font-medium uppercase tracking-wider ${colors.text}`}>
            Riesgo {label}
          </span>
          <p className="text-sm text-muted-foreground mt-0.5">
            {locationName || "Ubicación no especificada"}
          </p>
        </div>
      </div>

      {summary && (
        <p className="text-sm text-foreground leading-relaxed mb-3">
          {summary}
        </p>
      )}

      {confidenceNote && (
        <div className="text-xs text-muted-foreground italic border-t pt-3 mt-3 border-inherit">
          {confidenceNote}
        </div>
      )}
    </div>
  );
}
