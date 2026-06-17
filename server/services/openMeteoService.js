import * as openMeteoCache from './openMeteoCache.js';

const OPEN_METEO_URL = 'https://climate-api.open-meteo.com/v1/climate';

// Modelos CMIP6 de alta resolución con cobertura para Perú
const MODELS = ['CMCC_CM2_VHR4', 'FGOALS_f3_H', 'HiRAM_SIT_HR', 'MRI_AGCM3_2_S'];

// Períodos climáticos definidos por IPCC AR6
// end_date se mantiene en 2049 porque los modelos PRIMAVERA tienen cobertura hasta ~2050
const PERIODS = {
  historical: { from: 1980, to: 2014 },
  short_term: { from: 2020, to: 2039 },
  mid_term:   { from: 2040, to: 2049 }, // hasta donde los modelos tienen datos
};

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
      latitude:   lat,
      longitude:  lon,
      start_date: '1980-01-01',
      end_date:   '2049-12-31',
      models:     model,
      daily:      'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m,wind_speed_10m,cloud_cover,shortwave_radiation_sum,surface_pressure,soil_moisture_0_to_10cm',
    });
    try {
      const res = await fetchWithTimeout(`${OPEN_METEO_URL}?${params}`, 45000);
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.daily?.time?.length > 100) return json; // al menos 100 días de datos
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`No se pudo obtener datos de Open-Meteo: ${lastError?.message}`);
}

// ── Cómputo de índices climáticos extremos ────────────────────────────────────

/**
 * Calcula el máximo de una ventana deslizante de N días.
 * Usado para rx5day (máxima precipitación acumulada en 5 días).
 */
function rollingMax(arr, window) {
  if (arr.length < window) return null;
  let max = -Infinity;
  let current = arr.slice(0, window).reduce((s, v) => s + (v ?? 0), 0);
  max = current;
  for (let i = window; i < arr.length; i++) {
    current += (arr[i] ?? 0) - (arr[i - window] ?? 0);
    if (current > max) max = current;
  }
  return max;
}

/**
 * Calcula índices climáticos extremos para un conjunto de registros diarios.
 * @param {Array<{tmean, tmax, precip}>} records
 * @returns {Object} Índices promediados sobre los años del período
 */
function computeExtremeIndices(records) {
  if (!records.length) return null;

  // Agrupar por año
  const byYear = {};
  for (const r of records) {
    const y = r.year;
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(r);
  }

  const yearStats = Object.values(byYear)
    .filter(days => days.length >= 30)
    .map(days => {
      const tmaxVals     = days.map(d => d.tmax).filter(v => v != null);
      const tmeanVals    = days.map(d => d.tmean).filter(v => v != null);
      const tminVals     = days.map(d => d.tmin).filter(v => v != null);
      const precipVals   = days.map(d => d.precip).filter(v => v != null);
      const humVals      = days.map(d => d.humidity).filter(v => v != null);
      const windVals     = days.map(d => d.wind).filter(v => v != null);
      const cloudVals    = days.map(d => d.cloud_cover).filter(v => v != null);
      const radVals      = days.map(d => d.radiation).filter(v => v != null);
      const pressVals    = days.map(d => d.pressure).filter(v => v != null);
      const soilMVals    = days.map(d => d.soil_moisture).filter(v => v != null);

      // Días calurosos (requieren tmax; null si no disponible)
      const hd35 = tmaxVals.length ? tmaxVals.filter(t => t > 35).length : null;
      const hd40 = tmaxVals.length ? tmaxVals.filter(t => t > 40).length : null;
      const txx  = tmaxVals.length ? Math.max(...tmaxVals)              : null;

      // Temperatura media anual
      const tas = tmeanVals.length
        ? tmeanVals.reduce((s, v) => s + v, 0) / tmeanVals.length
        : null;

      // Temperatura mínima anual (tnn)
      const tnn = tminVals.length ? Math.min(...tminVals) : null;

      // Precipitación anual total
      const pr = precipVals.length ? precipVals.reduce((s, v) => s + v, 0) : null;

      // Precipitación máxima diaria (Rx1day)
      const rx1day = precipVals.length ? Math.max(...precipVals) : null;

      // Precipitación máxima en 5 días consecutivos (Rx5day)
      const rx5day = precipVals.length >= 5 ? rollingMax(precipVals, 5) : null;

      // Días secos consecutivos (CDD)
      let cdd = 0, run = 0;
      for (const p of precipVals) {
        if (p < 1) { run++; if (run > cdd) cdd = run; }
        else run = 0;
      }

      // Días húmedos consecutivos (CWD)
      let cwd = 0;
      run = 0;
      for (const p of precipVals) {
        if (p >= 1) { run++; if (run > cwd) cwd = run; }
        else run = 0;
      }

      const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

      return {
        hd35, hd40, tas, txx, tnn,
        pr, rx1day, rx5day,
        cdd: precipVals.length ? cdd : null,
        cwd: precipVals.length ? cwd : null,
        avg_humidity:      avg(humVals),
        avg_wind:          avg(windVals),
        avg_cloud_cover:   avg(cloudVals),
        avg_radiation:     avg(radVals),
        avg_pressure:      avg(pressVals),
        avg_soil_moisture: avg(soilMVals),
      };
    });

  if (!yearStats.length) return null;

  // Promedio de cada índice sobre los años válidos del período
  const avgOf = (fn) => {
    const vals = yearStats.map(fn).filter(v => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  return {
    hd35:   avgOf(y => y.hd35),
    hd40:   avgOf(y => y.hd40),
    tas:    avgOf(y => y.tas),
    txx:    avgOf(y => y.txx),
    tnn:    avgOf(y => y.tnn),
    pr:     avgOf(y => y.pr),
    rx1day: avgOf(y => y.rx1day),
    rx5day: avgOf(y => y.rx5day),
    cdd:    avgOf(y => y.cdd),
    cwd:    avgOf(y => y.cwd),
    avg_humidity:      avgOf(y => y.avg_humidity),
    avg_wind:          avgOf(y => y.avg_wind),
    avg_cloud_cover:   avgOf(y => y.avg_cloud_cover),
    avg_radiation:     avgOf(y => y.avg_radiation),
    avg_pressure:      avgOf(y => y.avg_pressure),
    avg_soil_moisture: avgOf(y => y.avg_soil_moisture),
  };
}

/**
 * Procesa los datos diarios de Open-Meteo y genera:
 * - `meteo`: objeto de tendencias para narrativa (compatibilidad existente)
 * - `climateIndices`: índices extremos por período, compatibles con Layer 2
 */
function processData(data) {
  const daily     = data.daily || {};
  const dates     = daily.time                          || [];
  const tmeans    = daily.temperature_2m_mean           || [];
  const tmaxs     = daily.temperature_2m_max            || [];
  const tmins     = daily.temperature_2m_min            || [];
  const precips   = daily.precipitation_sum             || [];
  const humidities = daily.relative_humidity_2m         || [];
  const winds     = daily.wind_speed_10m                || [];
  const clouds    = daily.cloud_cover                   || [];
  const radiations = daily.shortwave_radiation_sum      || [];
  const pressures  = daily.surface_pressure             || [];
  const soilMoist  = daily.soil_moisture_0_to_10cm      || [];

  // Agrupar registros por período IPCC
  const buckets = {
    historical: [],
    short_term: [],
    mid_term:   [],
  };

  dates.forEach((date, i) => {
    const year   = parseInt(date.slice(0, 4), 10);
    const record = {
      year, tmean: tmeans[i], tmax: tmaxs[i], tmin: tmins[i], precip: precips[i],
      humidity: humidities[i], wind: winds[i], cloud_cover: clouds[i],
      radiation: radiations[i], pressure: pressures[i], soil_moisture: soilMoist[i],
    };

    if (year >= PERIODS.historical.from && year <= PERIODS.historical.to) {
      buckets.historical.push(record);
    } else if (year >= PERIODS.short_term.from && year <= PERIODS.short_term.to) {
      buckets.short_term.push(record);
    } else if (year >= PERIODS.mid_term.from && year <= PERIODS.mid_term.to) {
      buckets.mid_term.push(record);
    }
  });

  // Computar índices extremos por período
  const climateIndices = {
    historical: computeExtremeIndices(buckets.historical),
    short_term: computeExtremeIndices(buckets.short_term),
    mid_term:   computeExtremeIndices(buckets.mid_term),
  };

  // ── Mantener estructura `meteo` para compatibilidad con narrativa ─────────
  const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  const histTmean = avg(buckets.historical.map(r => r.tmean).filter(v => v != null));
  const histPrecip = avg(buckets.historical.map(r => r.precip).filter(v => v != null));

  function buildMetePeriod(records) {
    const temps   = records.map(r => r.tmean).filter(v => v != null);
    const precips = records.map(r => r.precip).filter(v => v != null);
    const avg_temp   = avg(temps);
    const avg_precip = avg(precips);
    const delta_temp = (histTmean != null && avg_temp != null) ? avg_temp - histTmean : null;
    const delta_precip_pct =
      (histPrecip != null && histPrecip > 0 && avg_precip != null)
        ? ((avg_precip - histPrecip) / histPrecip) * 100
        : null;
    return {
      avg_temp,
      avg_precip,
      delta_temp,
      delta_precip_pct,
      temp_trend:   delta_temp        != null ? classifyTempDelta(delta_temp)         : null,
      precip_trend: delta_precip_pct  != null ? classifyPrecipDelta(delta_precip_pct) : null,
    };
  }

  const meteo = {
    historical:  { avg_temp: histTmean, avg_precip: histPrecip },
    short_term:  buildMetePeriod(buckets.short_term),
    medium_term: buildMetePeriod(buckets.mid_term),
  };

  return { meteo, climateIndices };
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
    { key: 'medium_term', label: 'Mediano plazo (2040–2059)' },
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
  const cached = openMeteoCache.get(lat, lon);
  if (cached) {
    console.log(`[OpenMeteo] Cache HIT (${lat}, ${lon})`);
    return cached;
  }

  console.log(`[OpenMeteo] Cache MISS — fetching (${lat}, ${lon})`);
  const data      = await fetchOpenMeteo(lat, lon);
  const { meteo, climateIndices } = processData(data);
  const narrative = buildNarrative(meteo);
  const result    = { meteo, climateIndices, narrative };

  openMeteoCache.set(lat, lon, result);
  return result;
}
