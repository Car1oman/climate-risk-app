import * as React from "react";
import { ExecutiveDashboard } from "../components/ExecutiveDashboard/index.jsx";
import { TraceInspector } from "../components/TraceInspector/index.jsx";
import { createClimateRiskFetcher } from "../hooks/useClimateRisk.js";

const VIEWS = { DASHBOARD: "dashboard", TRACE: "trace" };

export function RiskAnalysis() {
  const [view, setView] = React.useState(VIEWS.DASHBOARD);
  const [traceId, setTraceId] = React.useState(null);
  const [fetcher] = React.useState(() => createClimateRiskFetcher());

  function handleViewTrace(id) {
    setTraceId(id);
    setView(VIEWS.TRACE);
  }

  function handleBack() {
    setView(VIEWS.DASHBOARD);
    setTraceId(null);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Análisis de Riesgo Climático</h1>
        {view === VIEWS.TRACE && (
          <button
            onClick={handleBack}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            ← Volver al dashboard
          </button>
        )}
      </div>

      {view === VIEWS.DASHBOARD && (
        <ExecutiveDashboard fetchRisk={fetcher} onViewTrace={handleViewTrace} />
      )}

      {view === VIEWS.TRACE && (
        <TraceInspector traceId={traceId} />
      )}
    </div>
  );
}
