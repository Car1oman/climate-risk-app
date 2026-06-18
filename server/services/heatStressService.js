/**
 * Heat Stress Service
 * Calcula WBGT (Wet Bulb Globe Temperature) y AQI compuesto
 * usando NASA POWER (T2M, RH2M) y WeatherAPI (PM2.5, PM10, O3, NO2).
 *
 * WBGT = 0.567×T + 0.393×e + 3.94   (Stull 2011, forma psicrométrica simplificada)
 *   e = presión de vapor actual = (RH/100) × 6.112 × exp(17.67×T / (T + 243.5))
 *
 * AQI_compuesto = max(EPA_PM25, EPA_PM10, EPA_O3, EPA_NO2) × factor_temperatura(WBGT)
 */
import { logger } from '../utils/logger.js';

/**
 * Calcula presión de vapor actual (hPa) — ecuación de Magnus.
 * @param {number} t  - Temperatura seca (°C)
 * @param {number} rh - Humedad relativa (%)
 * @returns {number} e en hPa
 */
function vaporPressure(t, rh) {
  const es = 6.112 * Math.exp((17.67 * t) / (t + 243.5));
  return (rh / 100) * es;
}

/**
 * Calcula el índice WBGT usando la fórmula psicrométrica simplificada de Stull (2011).
 * WBGT = 0.567×T + 0.393×e + 3.94
 * @param {Object} nasaPower - { recent: { T2M, RH2M } }
 * @returns {Object|null} { wbgt, e, category } o null
 */
export function computeWbgt(nasaPower) {
  if (!nasaPower?.recent) return null;

  const t  = nasaPower.recent.T2M?.value;
  const rh = nasaPower.recent.RH2M?.value;

  if (t == null || rh == null) return null;

  const e    = vaporPressure(t, rh);
  const wbgt = 0.567 * t + 0.393 * e + 3.94;

  let category = 'bajo';
  if (wbgt >= 32) category = 'extremo';
  else if (wbgt >= 28) category = 'alto';
  else if (wbgt >= 25) category = 'moderado';

  return { wbgt: Math.round(wbgt * 10) / 10, e: Math.round(e * 100) / 100, category };
}

/**
 * Calcula el factor de amplificación por temperatura según WBGT.
 * @param {number} wbgt
 * @returns {number} Factor multiplicador (1.0 = neutro, hasta 1.5)
 */
function temperatureFactor(wbgt) {
  if (wbgt >= 32) return 1.5;
  if (wbgt >= 28) return 1.3;
  if (wbgt >= 25) return 1.15;
  return 1.0;
}

/**
 * Calcula el AQI compuesto: max(PM2.5, PM10, O3, NO2) × factor WBGT.
 * @param {Object} weatherApi - Datos de WeatherAPI con air_quality
 * @param {number} wbgt - WBGT calculado
 * @returns {Object|null} { rawMax, adjusted, factor, dominant, pollutants }
 */
export function computeCompositeAqi(weatherApi, wbgt) {
  const pm25 = weatherApi?.pm2_5;
  const pm10 = weatherApi?.pm10;
  const o3   = weatherApi?.o3;
  const no2  = weatherApi?.no2;

  if (pm25 == null && pm10 == null && o3 == null && no2 == null) return null;

  const values = [];
  if (pm25 != null) values.push({ pollutant: 'PM2.5', value: pm25 });
  if (pm10 != null) values.push({ pollutant: 'PM10',  value: pm10 });
  if (o3   != null) values.push({ pollutant: 'O3',    value: o3 });
  if (no2  != null) values.push({ pollutant: 'NO2',   value: no2 });

  const dominant = values.reduce((a, b) => (a.value > b.value ? a : b));
  const factor   = temperatureFactor(wbgt ?? 0);

  return {
    rawMax:           dominant.value,
    adjusted:         Math.round(dominant.value * factor * 10) / 10,
    factor,
    dominantPollutant: dominant.pollutant,
    pollutants:       Object.fromEntries(values.map(v => [v.pollutant, v.value])),
    wbgtUsed:         wbgt ?? null,
  };
}

/**
 * Punto de entrada para Layer1.
 * Recibe nasaPowerData y (opcionalmente) weatherData, retorna índices compuestos.
 * @param {Object} nasaPowerData - Salida de getNasaPowerData()
 * @param {Object} [weatherData] - Opcional, datos de WeatherAPI con AQI
 * @returns {Object}
 */
export function computeHeatStressIndex(nasaPowerData, weatherData) {
  const wbgtResult = computeWbgt(nasaPowerData);
  const wbgt = wbgtResult?.wbgt ?? null;

  const aqi = weatherData
    ? computeCompositeAqi(weatherData, wbgt)
    : null;

  const result = { wbgt: wbgtResult, aqi };

  logger.info('heatStressService', 'Heat stress index computed', {
    hasWbgt: !!wbgtResult,
    hasAqi: !!aqi,
    wbgt,
  });

  return result;
}
