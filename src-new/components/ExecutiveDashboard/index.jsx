import * as React from "react";
import { RiskSummary } from "./RiskSummary.jsx";
import { PhenomenonCard } from "./PhenomenonCard.jsx";
import { RecommendationsList } from "./RecommendationsList.jsx";

const LOADING = "loading";
const LOADED = "loaded";
const ERRORED = "errored";

const INITIAL_STATE = { status: LOADING };

function reducer(state, action) {
  switch (action.type) {
    case LOADED: return { status: LOADED, data: action.data };
    case ERRORED: return { status: ERRORED, error: action.error };
    default: return state;
  }
}

export function ExecutiveDashboard({ fetchRisk, onViewTrace }) {
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);
  const [lat, setLat] = React.useState("");
  const [lon, setLon] = React.useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!lat || !lon) return;
    dispatch({ type: LOADING });
    try {
      const data = await fetchRisk({ lat: Number(lat), lon: Number(lon) });
      dispatch({ type: LOADED, data });
    } catch (err) {
      dispatch({ type: ERRORED, error: err.message });
    }
  }

  const hasResults = state.status === LOADED && state.data?.data?.response;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          placeholder="Latitud (ej: -11.8996)"
          value={lat}
          onChange={e => setLat(e.target.value)}
        />
        <input
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          placeholder="Longitud (ej: -76.67358)"
          value={lon}
          onChange={e => setLon(e.target.value)}
        />
        <button
          type="submit"
          disabled={state.status === LOADING}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {state.status === LOADING ? "Consultando..." : "Consultar"}
        </button>
      </form>

      {state.status === LOADING && !hasResults && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Consultando fuentes climáticas...
        </div>
      )}

      {state.status === ERRORED && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
          {state.error || "Error al consultar riesgo climático"}
        </div>
      )}

      {hasResults && (() => {
        const r = state.data.data.response;
        return (
          <div className="space-y-6">
            <RiskSummary
              overallRisk={r.overall_risk}
              locationName={r.location?.name}
              summary={r.executive_summary}
              confidenceNote={r.confidence_note}
            />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Fenómenos detectados
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {r.phenomena?.map((p, i) => (
                  <PhenomenonCard
                    key={`${p.name}-${i}`}
                    name={p.name}
                    status={p.status}
                    riskContribution={p.risk_contribution}
                  />
                ))}
              </div>
              {(!r.phenomena || r.phenomena.length === 0) && (
                <p className="text-sm text-muted-foreground">No se detectaron fenómenos relevantes.</p>
              )}
            </div>

            <RecommendationsList recommendations={r.recommendations} />

            {r.trace_id && onViewTrace && (
              <button
                onClick={() => onViewTrace(r.trace_id)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Ver trazabilidad completa
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
