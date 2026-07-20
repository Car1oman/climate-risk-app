import { apiFetch } from './api';

// ── Pipeline v2 (7-stage rebuild) ────────────────────────────────────────────
// NOTE: unrelated to the legacy "/api/v2/climate-risk-analysis" endpoint in
// api.js (that one belongs to the *current* production system — the "v2" in
// its path predates this pipeline rebuild). This file talks to the new
// decoupled pipeline mounted at /api/v2/climate-risk (see server/climate-v2.js).

// POST /api/v2/climate-risk — runs the 7-stage pipeline end to end.
// Returns: { success, view, scenario, location, artifact_id, execution_id, summary, data }
// data.response holds the presentation-ready shape (Stage07): overall_risk,
// phenomena[] (con horizon/scenario/recommendation por fenómeno),
// phenomena_not_detected[], executive_summary, recommendations[],
// confidence_note, scenario_requested/scenario_requested_label, trace_id.
//
// `scenario`: "ssp245" (emisiones moderadas, default) | "ssp585" (altas
// emisiones) — ver pipeline/shared/types.js ScenarioEnum. Cambiar este
// parámetro y volver a llamar es lo que hace que el toggle de escenario en
// la UI produzca resultados realmente distintos (no un re-etiquetado del
// mismo resultado): la respuesta del backend cambia (03-normalization/
// index.js extrae bloques ensemble-all-{scenario}_* distintos), no solo la
// etiqueta.
export const analyzeClimateRiskV2 = async ({ lat, lon, sector = 'retail', view = 'executive', scenario = 'ssp245' }) => {
  const res = await apiFetch('/api/v2/climate-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, sector, view, scenario }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.message || `Error API pipeline v2: ${res.status}`);
  }
  return body;
};

// POST /api/ai/analyze-v2 — recomendaciones de IA con guardrails científicos,
// construidas a partir de la respuesta YA calculada del pipeline V2 (nunca
// datos crudos). Ver server/routes/ai.js buildV2AnalysisPrompt().
export const generateV2Recommendations = async (payload) => {
  const res = await apiFetch('/api/ai/analyze-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(body?.message || `Error API IA v2: ${res.status}`), { code: body?.error });
  }
  return body;
};

// GET /api/v2/climate-risk/:traceId/trace — per-stage trace for a prior execution.
export const fetchClimateRiskTraceV2 = async (traceId) => {
  const res = await apiFetch(`/api/v2/climate-risk/${traceId}/trace`);
  if (!res.ok) return null;
  return res.json();
};
