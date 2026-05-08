import { supabase } from '../supabaseClient.js';

async function queryNearestCell(lat, lon) {
  const { data, error } = await supabase.rpc('get_climate_by_location', {
    p_lat: lat,
    p_lon: lon,
  });
  if (error || !data?.length) return null;
  return data[0];
}

function buildNarrative(hist) {
  if (!hist || typeof hist !== 'object') return null;

  const tasmax = hist.tasmax?.median;
  const hd35   = hist.hd35?.median;
  const rx1day = hist.rx1day?.median;
  const r20mm  = hist.r20mm?.median;

  const parts = [];

  // Señal de temperatura
  if (tasmax != null && hd35 != null && hd35 > 10) {
    parts.push(
      `temperaturas máximas elevadas (promedio ${Math.round(tasmax)}°C) con ${Math.round(hd35)} días al año superando los 35°C`
    );
  } else if (tasmax != null && tasmax > 28) {
    parts.push(`temperaturas máximas habitualmente elevadas (promedio ${Math.round(tasmax)}°C)`);
  } else if (hd35 != null && hd35 > 5) {
    parts.push(`${Math.round(hd35)} días al año con calor extremo (>35°C) registrados históricamente`);
  } else if (tasmax != null) {
    parts.push(`temperatura máxima histórica promedio de ${Math.round(tasmax)}°C`);
  }

  // Señal de precipitación
  if (rx1day != null && rx1day > 20 && r20mm != null && r20mm > 10) {
    parts.push(
      `episodios frecuentes de lluvia intensa — hasta ${Math.round(rx1day)} mm en un día y ${Math.round(r20mm)} días de lluvia intensa al año`
    );
  } else if (rx1day != null && rx1day > 20) {
    parts.push(`episodios de lluvia intensa con hasta ${Math.round(rx1day)} mm registrados en 24 horas`);
  } else if (r20mm != null && r20mm > 10) {
    parts.push(`${Math.round(r20mm)} días al año con lluvias intensas (>20 mm) registrados históricamente`);
  }

  if (!parts.length) return null;

  return parts.length === 1
    ? `Los registros históricos de esta zona muestran ${parts[0]}.`
    : `Los registros históricos de esta zona muestran ${parts[0]}, y ${parts[1]}.`;
}

export async function getHistoricalEnrichment(lat, lon) {
  try {
    const cell = await queryNearestCell(lat, lon);
    if (!cell) return null;

    const narrative = buildNarrative(cell.data?.historical);
    if (!narrative) return null;

    return { narrative };
  } catch {
    return null; // fallo silencioso — es complemento, no fuente primaria
  }
}
