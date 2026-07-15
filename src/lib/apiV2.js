import { apiFetch } from './api';

// ── Pipeline v2 (7-stage rebuild) ────────────────────────────────────────────
// NOTE: unrelated to the legacy "/api/v2/climate-risk-analysis" endpoint in
// api.js (that one belongs to the *current* production system — the "v2" in
// its path predates this pipeline rebuild). This file talks to the new
// decoupled pipeline mounted at /api/v2/climate-risk (see server/climate-v2.js).

// POST /api/v2/climate-risk — runs the 7-stage pipeline end to end.
// Returns: { success, view, location, artifact_id, execution_id, summary, data }
// data.response holds the presentation-ready shape (Stage07): overall_risk,
// phenomena[], executive_summary, recommendations[], confidence_note, trace_id.
export const analyzeClimateRiskV2 = async ({ lat, lon, sector = 'retail', view = 'executive' }) => {
  const res = await apiFetch('/api/v2/climate-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, sector, view }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.message || `Error API pipeline v2: ${res.status}`);
  }
  return body;
};

// GET /api/v2/climate-risk/:traceId/trace — per-stage trace for a prior execution.
export const fetchClimateRiskTraceV2 = async (traceId) => {
  const res = await apiFetch(`/api/v2/climate-risk/${traceId}/trace`);
  if (!res.ok) return null;
  return res.json();
};
