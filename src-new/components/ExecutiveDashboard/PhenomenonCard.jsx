import * as React from "react";

// H-7.5 (documentacion-v2/stage-07, BAJO): catastrofico usa morado (purple),
// no un rojo más oscuro que alto — mismo matiz que
// src/features/climate-lookup-v2/components/riskLevelStyles.js (la UI real
// de /v2) y que Stage07Presentation.RISK_COLORS. Un cambio de matiz es más
// distinguible que un cambio de luminosidad para deficiencias de visión de
// color rojo-verde (WCAG 1.4.1).
const LEVEL_STYLES = {
  bajo: { icon: "🟢", label: "Bajo", color: "text-green-600 bg-green-50 border-green-200" },
  medio: { icon: "🟡", label: "Medio", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  alto: { icon: "🔴", label: "Alto", color: "text-red-600 bg-red-50 border-red-200" },
  catastrofico: { icon: "⛔", label: "Catastrófico", color: "text-purple-700 bg-purple-100 border-purple-300" },
};

const STATUS_LABELS = {
  active: "Activo",
  projected: "Proyectado",
  historical: "Histórico",
  not_detected: "No detectado",
};

export function PhenomenonCard({ name, status, riskContribution }) {
  const level = riskContribution?.level || "bajo";
  const styles = LEVEL_STYLES[level] || LEVEL_STYLES.bajo;
  const statusLabel = STATUS_LABELS[status] || status;

  return (
    <div className={`rounded-lg border p-4 ${styles.color}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{styles.icon}</span>
          <span className="font-medium text-sm">{name || "Fenómeno"}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          status === "active" ? "bg-orange-100 text-orange-700" :
          status === "projected" ? "bg-blue-100 text-blue-700" :
          "bg-gray-100 text-gray-600"
        }`}>
          {statusLabel}
        </span>
      </div>

      {riskContribution && (
        <div className="text-xs">
          <span className="font-medium">Contribución al riesgo: </span>
          <span className={styles.color.split(" ")[0]}>{styles.label}</span>
        </div>
      )}
    </div>
  );
}
