const API_BASE = typeof import.meta?.env?.VITE_CLIMATE_V2_URL === "string"
  ? import.meta.env.VITE_CLIMATE_V2_URL
  : "http://localhost:4001/api/v2";

export function useTraceInspection(traceId) {
  const { useState, useEffect } = await import("react");
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/climate-risk/${traceId}/trace`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setTrace(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [traceId]);

  return { trace, loading, error };
}
