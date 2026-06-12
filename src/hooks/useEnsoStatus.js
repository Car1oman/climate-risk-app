import { useQuery } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'https://climate-risk-app-91ev.onrender.com';

async function fetchEnsoStatus() {
  const res = await fetch(`${API_URL}/api/enso/status`);
  if (!res.ok) throw new Error(`ENSO status ${res.status}`);
  return res.json();
}

/**
 * Returns current ENSO status including NOAA advisory.
 * data.enso  → full context (phase, oni_latest, advisory, ...)
 * data.alert → alert signal (null when neutral/weak)
 */
export function useEnsoStatus() {
  return useQuery({
    queryKey: ['enso-status'],
    queryFn:  fetchEnsoStatus,
    staleTime: 1000 * 60 * 60 * 6, // 6 h — advisory updates monthly
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
