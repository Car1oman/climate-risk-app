/**
 * useClimateAnalysisV2 — consumes the new 7-stage pipeline (/api/v2/climate-risk).
 *
 * Unlike useClimateAnalysis (v1), there is no client-side normalization step:
 * Stage07Presentation already returns a presentation-ready shape. This hook
 * only owns fetch lifecycle (loading/error), the executive/analyst view toggle,
 * and on-demand trace fetching for the traceability panel.
 */

import { useState, useCallback, useRef } from 'react';
import { analyzeClimateRiskV2, fetchClimateRiskTraceV2 } from '@/lib/apiV2';

export function useClimateAnalysisV2() {
  const [result, setResult] = useState(null); // full API body: { success, view, location, artifact_id, execution_id, summary, data }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('executive');

  const [trace, setTrace] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState(null);

  const lastParamsRef = useRef(null);

  const analyze = useCallback(async ({ lat, lon, sector, scenario, view: requestedView }) => {
    const nextView = requestedView || view;
    lastParamsRef.current = { lat, lon, sector, scenario, view: nextView };
    setLoading(true);
    setError(null);
    setTrace(null);
    try {
      const body = await analyzeClimateRiskV2({ lat, lon, sector, scenario, view: nextView });
      setResult(body);
      setView(nextView);
    } catch (err) {
      setError(err.message || 'Error al ejecutar el análisis con el pipeline v2.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [view]);

  const switchView = useCallback((nextView) => {
    if (!lastParamsRef.current) { setView(nextView); return; }
    analyze({ ...lastParamsRef.current, view: nextView });
  }, [analyze]);

  const fetchTrace = useCallback(async (traceId) => {
    if (!traceId) return;
    setTraceLoading(true);
    setTraceError(null);
    try {
      const data = await fetchClimateRiskTraceV2(traceId);
      if (!data) throw new Error('No se encontró la traza para esta ejecución.');
      setTrace(data);
    } catch (err) {
      setTraceError(err.message || 'Error al obtener la trazabilidad.');
    } finally {
      setTraceLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setTrace(null);
    setTraceError(null);
    lastParamsRef.current = null;
  }, []);

  // Stage07Presentation's { view, response } lives inside the last stage's
  // output on the evidence artifact — the route only wraps the raw artifact,
  // it doesn't hoist `response` to the top level.
  const response = result?.data?.stages?.find(s => s.stage_name === 'Presentation')?.output?.response ?? null;

  return {
    loading,
    error,
    hasResults: !!response,
    view,
    response,          // Stage07 presentation payload
    artifactId: result?.artifact_id ?? null,
    executionId: result?.execution_id ?? null,
    summary: result?.summary ?? null,

    trace,
    traceLoading,
    traceError,
    fetchTrace,

    analyze,
    switchView,
    reset,
  };
}
