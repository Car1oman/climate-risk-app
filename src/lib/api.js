export const API_URL = import.meta.env.VITE_API_URL ?? '';

/** @returns {Promise<any[]>} */
export const fetchAssets = async () => {
  try {
    const res = await fetch(`${API_URL}/api/assets`);
    if (!res.ok) {
      throw new Error(`Error API assets: ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching assets:', error);
    return [];
  }
};

/** @returns {Promise<any|null>} */
export const fetchAssetDetail = async (id) => {
  try {
    const res = await fetch(`${API_URL}/api/assets/${id}`);
    if (!res.ok) {
      throw new Error(`Error API asset detail: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Error fetching asset detail:', error);
    return null;
  }
};

/** @param {any[]} data @returns {Promise<any>} */
export const uploadClimateRisks = async (data) => {
  const res = await fetch(`${API_URL}/api/climate-risks/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
};

export const fetchExternalRisks = async (lat, lng) => {
  const res = await fetch(`${API_URL}/api/external-risks/lookup?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Error ${res.status}`);
  }
  return res.json();
};

export const fetchTerritorialContext = async () => {
  const res = await fetch(`${API_URL}/api/territorial-context`);
  if (!res.ok) {
    return null;
  }
  return res.json();
};

export const fetchDocumentContext = async () => {
  const res = await fetch(`${API_URL}/api/documentos/context`);
  if (!res.ok) {
    return null;
  }
  return res.json();
};

// Returns quantitative climate data from the DB grid (CMIP6 ensemble, SSP5-8.5).
// Includes p10/p90 percentiles per indicator and nearestPoint.distanceKm.
export const fetchClimateDB = async (lat, lng) => {
  const res = await fetch(
    `${API_URL}/api/climate-risks/lookup?lat=${lat}&lng=${lng}&scenario=pesimista`
  );
  if (!res.ok) return null;
  return res.json();
};

// POST /api/v2/climate-risk-analysis — Layers 1-6 en secuencia
// Retorna: { location, signals, risks, adaptations, narrative, metadata }
export const analyzeClimateRisk = async ({ lat, lon, sector, asset_type }) => {
  try {
    const res = await fetch(`${API_URL}/api/v2/climate-risk-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, sector, asset_type }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

/** @returns {Promise<any[]>} */
export const fetchAlerts = async ({ active = true } = {}) => {
  try {
    const url = `${API_URL}/api/alerts${active ? '' : '?active=false'}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error API alerts: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return [];
  }
};

/** @param {string} id @returns {Promise<any|null>} */
export const archiveAlert = async (id) => {
  try {
    const res = await fetch(`${API_URL}/api/alerts/${id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Error archiving alert: ${res.status}`);
    return res.json();
  } catch (error) {
    console.error('Error archiving alert:', error);
    return null;
  }
};

// POST /api/risk-model — modelo H×E×I calculado en backend
// Retorna el mismo shape que getCompleteRiskModel() del frontend
export const getRiskModelFromBackend = async (asset) => {
  try {
    const res = await fetch(`${API_URL}/api/risk-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};
