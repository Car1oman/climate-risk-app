function getApiBase() {
  if (typeof import.meta?.env?.VITE_CLIMATE_V2_URL === "string" && import.meta.env.VITE_CLIMATE_V2_URL) {
    return import.meta.env.VITE_CLIMATE_V2_URL;
  }
  if (import.meta?.env?.DEV) {
    return "http://localhost:4001/api/v2";
  }
  return "/api/v2";
}

export function createClimateRiskFetcher() {
  const cache = new Map();
  const baseUrl = getApiBase();

  return async function fetchClimateRisk({ lat, lon, sector = "retail", view = "executive" }) {
    const key = `${lat},${lon},${sector},${view}`;
    if (cache.has(key)) return cache.get(key);

    const res = await fetch(`${baseUrl}/climate-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, sector, view }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    cache.set(key, data);
    return data;
  };
}
