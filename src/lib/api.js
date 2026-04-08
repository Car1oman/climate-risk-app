import { assets as mockAssets } from "@/data/assets";

export const API_URL = import.meta.env.VITE_API_URL || 'https://climate-risk-app-91ev.onrender.com';

export const fetchAssets = async () => {
  try {
    const res = await fetch(`${API_URL}/api/assets`);
    if (!res.ok) throw new Error('Error API');
    const data = await res.json();
    return Array.isArray(data) ? data : mockAssets;
  } catch (error) {
    console.error('Fallback a mocks', error);
    return mockAssets;
  }
};

export const fetchAssetDetail = async (id) => {
  try {
    const res = await fetch(`${API_URL}/api/assets/${id}`);
    if (!res.ok) throw new Error('Error API');
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Fallback detalle', error);
    return mockAssets.find((asset) => String(asset.id) === String(id));
  }
};

export const calculateRisk = async (assetId) => {
  try {
    const res = await fetch(`${API_URL}/api/calculate-risk/${assetId}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error('Error cálculo riesgo');
    return await res.json();
  } catch (error) {
    console.error('Error cálculo riesgo', error);
    return null;
  }
};
