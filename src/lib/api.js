import { supabase } from './supabase';

export const API_URL = import.meta.env.VITE_API_URL || 'https://climate-risk-app-91ev.onrender.com';

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const authHeader = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeader, ...options.headers },
  });
}

/** @returns {Promise<any[]>} */
export const fetchAssets = async () => {
  try {
    const res = await apiFetch('/api/assets');
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
    const res = await apiFetch(`/api/assets/${id}`);
    if (!res.ok) {
      throw new Error(`Error API asset detail: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Error fetching asset detail:', error);
    return null;
  }
};

export const fetchTerritorialContext = async () => {
  const res = await apiFetch('/api/territorial-context');
  if (!res.ok) {
    return null;
  }
  return res.json();
};

export const fetchDocumentContext = async () => {
  const res = await apiFetch('/api/documentos/context');
  if (!res.ok) {
    return null;
  }
  return res.json();
};

// Returns quantitative climate data from the DB grid (CMIP6 ensemble, SSP5-8.5).
// Includes p10/p90 percentiles per indicator and nearestPoint.distanceKm.
export const fetchClimateDB = async (lat, lng) => {
  const res = await apiFetch(
    `/api/climate-risks/lookup?lat=${lat}&lng=${lng}&scenario=pesimista`
  );
  if (!res.ok) return null;
  return res.json();
};

// POST /api/v2/climate-risk-analysis — señales, interpretación contextual y narrativa
// Retorna: { location, signals, risks, adaptations, narrative, metadata }
export const analyzeClimateRisk = async ({ lat, lon, sector, asset_type, scenario }) => {
  try {
    const res = await apiFetch('/api/v2/climate-risk-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, sector, asset_type, scenario }),
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
    const url = `/api/alerts${active ? '' : '?active=false'}`;
    const res = await apiFetch(url);
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
    const res = await apiFetch(`/api/alerts/${id}/archive`, {
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

