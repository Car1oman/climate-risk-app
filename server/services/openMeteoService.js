const OPEN_METEO_URL = 'https://climate-api.open-meteo.com/v1/climate';
const MODELS = ['CMCC_CM2_VHR4', 'FGOALS_f3_H', 'HiRAM_SIT_HR', 'MRI_AGCM3_2_S'];

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenMeteo(lat, lon) {
  let lastError;
  for (const model of MODELS) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      start_date: '1980-01-01',
      end_date: '2050-01-01',
      models: model,
      daily: 'temperature_2m_mean,precipitation_sum',
    });
    try {
      const res = await fetchWithTimeout(`${OPEN_METEO_URL}?${params}`, 30000);
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`No se pudo obtener datos de Open-Meteo: ${lastError?.message}`);
}

function classifyTempDelta(delta) {
  if (delta >= 4)   return 'extreme_warming';
  if (delta >= 2)   return 'significant_warming';
  if (delta >= 0.5) return 'moderate_warming';
  if (delta > 0)    return 'slight_warming';
  return 'stable';
}

function classifyPrecipDelta(pct) {
  if (pct >= 20)  return 'intensifying';
  if (pct <= -20) return 'declining';
  return 'stable';
}

function processData(data) {
  const daily = data.daily || {};
  const dates = daily.time || [];
  const temps = daily.temperature_2m_mean || [];
  const precips = daily.precipitation_sum || [];

  const buckets = {
    historical: { temp: [], precip: [] },
    short_term:  { temp: [], precip: [] },
    medium_term: { temp: [], precip: [] },
  };

  dates.forEach((date, i) => {
    const year = parseInt(date.slice(0, 4));
    const temp   = temps[i];
    const precip = precips[i];
    const bucket = year <= 2020 ? 'historical' : year <= 2039 ? 'short_term' : 'medium_term';
    if (temp   != null) buckets[bucket].temp.push(temp);
    if (precip != null) buckets[bucket].precip.push(precip);
  });

  const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  const hist = {
    avg_temp:   avg(buckets.historical.temp),
    avg_precip: avg(buckets.historical.precip),
  };

  function buildPeriod(key) {
    const avg_temp   = avg(buckets[key].temp);
    const avg_precip = avg(buckets[key].precip);
    const delta_temp = (hist.avg_temp != null && avg_temp != null) ? avg_temp - hist.avg_temp : null;
    const delta_precip_pct =
      (hist.avg_precip != null && hist.avg_precip > 0 && avg_precip != null)
        ? ((avg_precip - hist.avg_precip) / hist.avg_precip) * 100
        : null;
    return {
      avg_temp,
      avg_precip,
      delta_temp,
      delta_precip_pct,
      temp_trend:   delta_temp   != null ? classifyTempDelta(delta_temp)       : null,
      precip_trend: delta_precip_pct != null ? classifyPrecipDelta(delta_precip_pct) : null,
    };
  }

  return {
    historical:  { ...hist },
    short_term:  buildPeriod('short_term'),
    medium_term: buildPeriod('medium_term'),
  };
}

const TEMP_THRESHOLD_REFS = {
  extreme_warming:     'IPCC AR6 WG1: calentamiento extremo (≥4°C) — riesgo severo para ecosistemas y salud',
  significant_warming: 'IPCC AR6 WG1: calentamiento significativo (2–4°C) — impactos importantes en actividad económica',
  moderate_warming:    'IPCC AR6 WG1: calentamiento moderado (0.5–2°C) — gestión de riesgo recomendada',
  slight_warming:      'IPCC AR6 WG1: incremento leve (<0.5°C) — monitoreo continuo',
  stable:              'Sin variación térmica significativa respecto al histórico',
};

function buildNarrative(meteo) {
  const periods = [
    { key: 'short_term',  label: 'Corto plazo (2020–2039)' },
    { key: 'medium_term', label: 'Mediano plazo (2040–2050)' },
  ];

  return periods.map(({ key, label }) => {
    const p = meteo[key];
    const messages = [];

    if (p.avg_temp != null && p.delta_temp != null) {
      const base = meteo.historical.avg_temp?.toFixed(1) ?? '—';
      const proj = p.avg_temp.toFixed(1);
      const sign = p.delta_temp > 0 ? '+' : '';
      messages.push(
        `Temperatura media proyectada: ${proj}°C (${sign}${p.delta_temp.toFixed(1)}°C vs histórico ${base}°C). ` +
        TEMP_THRESHOLD_REFS[p.temp_trend ?? 'stable'] + '.'
      );
    }

    if (p.delta_precip_pct != null) {
      const sign = p.delta_precip_pct > 0 ? '+' : '';
      if (p.precip_trend === 'intensifying') {
        messages.push(
          `Precipitación proyectada: ${sign}${p.delta_precip_pct.toFixed(0)}% sobre el histórico. ` +
          'Mayor frecuencia de lluvias intensas; riesgo de inundaciones incrementado.'
        );
      } else if (p.precip_trend === 'declining') {
        messages.push(
          `Precipitación proyectada: ${p.delta_precip_pct.toFixed(0)}% bajo el histórico. ` +
          'Tendencia de reducción hídrica; mayor riesgo de sequía y estrés en cadenas de suministro.'
        );
      } else {
        messages.push(
          `Precipitación proyectada: ${sign}${p.delta_precip_pct.toFixed(0)}% vs histórico. ` +
          'Sin cambios extremos de precipitación proyectados en este período.'
        );
      }
    }

    if (!messages.length) {
      messages.push('Datos insuficientes para generar proyecciones en este período.');
    }

    return { period: label, messages };
  });
}

export async function getClimateTrends(lat, lon) {
  const data      = await fetchOpenMeteo(lat, lon);
  const meteo     = processData(data);
  const narrative = buildNarrative(meteo);
  return { meteo, narrative };
}
