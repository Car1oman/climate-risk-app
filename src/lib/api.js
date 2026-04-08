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
