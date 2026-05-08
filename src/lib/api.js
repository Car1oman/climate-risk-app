export const API_URL = import.meta.env.VITE_API_URL || 'https://climate-risk-app-91ev.onrender.com';

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

export const calculateRisk = async (assetId) => {
  try {
    const res = await fetch(`${API_URL}/api/calculate-risk/${assetId}`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error(`Error cálculo riesgo: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Error cálculo riesgo', error);
    return null;
  }
};

export const fetchExternalRisks = async (lat, lng) => {
  const res = await fetch(`${API_URL}/api/external-risks/lookup?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Error ${res.status}`);
  }
  return res.json();
};

export const fetchClimateTrends = async (lat, lng) => {
  const res = await fetch(`${API_URL}/api/climate-trends?lat=${lat}&lng=${lng}`);
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
