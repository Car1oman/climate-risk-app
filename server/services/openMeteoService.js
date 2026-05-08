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

  return {
    historical:  { avg_temp: avg(buckets.historical.temp),  avg_precip: avg(buckets.historical.precip)  },
    short_term:  { avg_temp: avg(buckets.short_term.temp),  avg_precip: avg(buckets.short_term.precip)  },
    medium_term: { avg_temp: avg(buckets.medium_term.temp), avg_precip: avg(buckets.medium_term.precip) },
  };
}

function buildNarrative(meteo) {
  const hist = meteo.historical;
  const periods = [
    { key: 'short_term',  label: 'Corto plazo (hasta 2039)'    },
    { key: 'medium_term', label: 'Mediano plazo (2040–2050)'   },
  ];

  return periods.map(({ key, label }) => {
    const period = meteo[key];
    const messages = [];

    if (hist.avg_temp != null && period.avg_temp != null) {
      const delta = period.avg_temp - hist.avg_temp;
      if (delta >= 4) {
        messages.push(`Olas de calor extremas proyectadas (aumento de ${delta.toFixed(1)}°C sobre el histórico).`);
      } else if (delta >= 2) {
        messages.push(`Incremento importante de temperatura (${delta.toFixed(1)}°C sobre el promedio histórico).`);
      } else if (delta > 0.5) {
        messages.push(`Incremento moderado de temperatura (${delta.toFixed(1)}°C sobre el promedio histórico).`);
      } else if (delta > 0) {
        messages.push('Leve incremento de temperatura proyectado respecto al histórico.');
      } else {
        messages.push('Sin cambios significativos de temperatura proyectados.');
      }
    }

    if (hist.avg_precip != null && period.avg_precip != null && hist.avg_precip > 0) {
      const deltaPct = ((period.avg_precip - hist.avg_precip) / hist.avg_precip) * 100;
      if (deltaPct >= 20) {
        messages.push(`Lluvias más intensas proyectadas (+${deltaPct.toFixed(0)}% sobre el histórico).`);
      } else if (deltaPct <= -20) {
        messages.push(`Posible reducción de lluvias y escasez hídrica (${Math.abs(deltaPct).toFixed(0)}% por debajo del histórico).`);
      } else {
        messages.push('Sin cambios extremos de precipitación proyectados.');
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
