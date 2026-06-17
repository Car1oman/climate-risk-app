/**
 * Heat Stress Service
 * Calcula WBGT (Wet Bulb Globe Temperature) y AQI compuesto
 * usando NASA POWER (T2M, RH2M, ALLSKY_SFC_SW_DWN) y WeatherAPI (PM2.5, O3).
 *
 * WBGT = 0.7 × Tw + 0.2 × Tg + 0.1 × T
 *   Tw = temperatura bulbo húmedo (derivada de T2M + RH2M)
 *   Tg = temperatura globo (proxy: T2M + radiación solar)
 *   T  = temperatura seca
 *
 * AQI_compuesto = max(EPA_PM25, EPA_O3) × factor_temperatura(WBGT)
 */
import { logger } from '../utils/logger.js';

/**
 * Calcula la temperatura de bulbo húmedo (Tw) usando la fórmula de Stull (2011).
 * @param {number} t - Temperatura seca (°C)
 * @param {number} rh - Humedad relativa (%)
 * @returns {number} Tw en °C
 */
function wetBulbStull(t, rh) {
  const tw = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(t + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035;
  return tw;
}

/**
 * Calcula la temperatura de globo (Tg) como proxy de radiación.
 * @param {number} t - Temperatura seca (°C)
 * @param {number} solarRadiation - ALLSKY_SFC_SW_DWN (kWh/m²/day)
 * @returns {number} Tg en °C
 */
function globeTemperature(t, solarRadiation) {
  return t + (solarRadiation * 2.5);
}

/**
 * Calcula el índice WBGT a partir de datos NASA POWER.
 * @param {Object} nasaPower - { recent: { T2M, RH2M, ALLSKY_SFC_SW_DWN } }
 * @returns {Object|null} { wbgt, tw, tg, category } o null
 */
export function computeWbgt(nasaPower) {
  if (!nasaPower?.recent) return null;

  const t   = nasaPower.recent.T2M?.value;
  const rh  = nasaPower.recent.RH2M?.value;
  const rad = nasaPower.recent.ALLSKY_SFC_SW_DWN?.value;

  if (t == null || rh == null) return null;

  const tw = wetBulbStull(t, rh);
  const tg = rad != null ? globeTemperature(t, rad) : t + 5;
  const wbgt = 0.7 * tw + 0.2 * tg + 0.1 * t;

  let category = 'bajo';
  if (wbgt >= 32) category = 'extremo';
  else if (wbgt >= 28) category = 'alto';
  else if (wbgt >= 25) category = 'moderado';

  return { wbgt: Math.round(wbgt * 10) / 10, tw, tg, category };
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
 * Calcula el AQI compuesto: max(PM2.5, O3) × factor WBGT.
 * @param {Object} weatherApi - Datos de WeatherAPI con air_quality
 * @param {number} wbgt - WBGT calculado
 * @returns {Object|null} { rawMax, adjusted, factor, dominant }
 */
export function computeCompositeAqi(weatherApi, wbgt) {
  const pm25 = weatherApi?.pm2_5;
  const o3   = weatherApi?.o3;

  if (pm25 == null && o3 == null) return null;

  const values = [];
  if (pm25 != null) values.push({ pollutant: 'PM2.5', value: pm25 });
  if (o3 != null)   values.push({ pollutant: 'O3', value: o3 });

  const dominant = values.reduce((a, b) => (a.value > b.value ? a : b));
  const factor = temperatureFactor(wbgt ?? 0);

  return {
    rawMax: dominant.value,
    adjusted: Math.round(dominant.value * factor * 10) / 10,
    factor,
    dominantPollutant: dominant.pollutant,
    wbgtUsed: wbgt ?? null,
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
