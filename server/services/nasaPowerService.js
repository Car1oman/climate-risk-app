/**
 * NASA POWER Service — Prediction Of Worldwide Energy Resources
 *
 * Provides meteorology and solar energy data from NASA's POWER project.
 * Data sources: NASA MERRA-2, GEOS-FP, and other NASA reanalysis/models.
 *
 * Available Parameters (subset for climate risk):
 *   T2M: Temperature at 2 Meters (°C)
 *   T2MDEW: Dew/Frost Point at 2 Meters (°C)
 *   T2MWET: Wet Bulb Temperature at 2 Meters (°C)
 *   PRECTOT: Precipitation (mm/day)
 *   PRECSNO: Snowfall (mm/day)
 *   WS2M: Wind Speed at 2 Meters (m/s)
 *   WS10M: Wind Speed at 10 Meters (m/s)
 *   WD2M: Wind Direction at 2 Meters (degrees)
 *   WD10M: Wind Direction at 10 Meters (degrees)
 *   RH2M: Relative Humidity at 2 Meters (%)
 *   PS: Surface Pressure (kPa)
 *   ALLSKY_SFC_SW_DWN: All Sky Surface Shortwave Downward Irradiance (kWh/m²/day)
 *   CLRSKY_SFC_SW_DWN: Clear Sky Surface Shortwave Downward Irradiance (kWh/m²/day)
 *   ALLSKY_SFC_LW_DWN: All Sky Surface Longwave Downward Irradiance (kWh/m²/day)
 *   T2M_RANGE: Temperature at 2 Meters Range (max-min) (°C)
 *   T2M_MAX: Temperature at 2 Meters Maximum (°C)
 *   T2M_MIN: Temperature at 2 Meters Minimum (°C)
 *
 * Data Resolution: 0.5° x 0.5° (~50km at equator)
 * Temporal Resolution: Daily, Monthly, Climatology
 * Coverage: Global (1981-01-01 to present, with near-real-time updates)
 * Source: https://power.larc.nasa.gov/
 *
 * IMPORTANT: Additive and non-blocking. Returns null on failure.
 */

import * as nasaPowerCache from './nasaPowerCache.js';
import { logger } from '../utils/logger.js';

const POWER_BASE_URL = 'https://power.larc.nasa.gov/api/temporal';
const FETCH_TIMEOUT_MS = 15_000; // 15 s — NASA POWER can be slow

// Commonly useful parameter combinations for climate risk assessment
const PARAMETER_SETS = {
  basic: ['T2M', 'PRECTOT', 'WS2M', 'RH2M'],
  energy: ['ALLSKY_SFC_SW_DWN', 'T2M', 'WS2M'],
  detailed: ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOT', 'WS2M', 'RH2M', 'PS'],
  drought: ['PRECTOT', 'T2M', 'WS2M', 'RH2M', 'ALLSKY_SFC_SW_DWN']
};

/**
 * Fetches data from NASA POWER API for a single point.
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @param {Array<string>} parameters - List of POWER parameters to fetch
 * @param {string} startDate - YYYYMMDD format
 * @param {string} endDate - YYYYMMDD format
 * @param {string} community - 'RE' (Renewable Energy), 'AG' (Agroclimatology), 'SB' (Sustainable Buildings)
 * @returns {Promise<Object|null>} Object with parameter data or null on failure
 */
async function fetchPowerData(lat, lon, parameters, startDate, endDate, community = 'RE') {
  const paramString = parameters.join(',');
  const url = `${POWER_BASE_URL}/daily/point?` +
    `parameters=${paramString}&` +
    `community=${community}&` +
    `longitude=${lon}&` +
    `latitude=${lat}&` +
    `start=${startDate}&` +
    `end=${endDate}&` +
    `format=JSON`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`NASA POWER HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();

    // Validate response structure
    if (!data || !data.properties || !data.properties.parameter) {
      throw new Error('NASA POWER returned invalid response structure');
    }

    return data.properties.parameter;
  } catch (err) {
    logger.warn('nasaPowerService', 'Fetch failed', { error: err.message, url, lat, lon });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gets the most recent available data for a set of parameters.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Array<string>} parameters - POWER parameters to fetch
 * @param {string} community - Data community ('RE', 'AG', 'SB')
 * @returns {Promise<Object|null>} Most recent daily values or null
 */
export async function getRecentPowerData(lat, lon, parameters, community = 'RE') {
  // Check cache first
  const cacheKey = `${lat},${lon},${parameters.join(',')},${community}`;
  const cached = nasaPowerCache.get(cacheKey);
  if (cached) {
    logger.debug('nasaPowerService', 'Cache hit', { cacheKey });
    return cached;
  }

  // Calculate date range for last 7 days (to ensure we get data)
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6); // Last 7 days including today

  const formatDate = (date) => {
    return date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  };

  try {
    const data = await fetchPowerData(
      lat, lon, parameters,
      formatDate(startDate),
      formatDate(endDate),
      community
    );

    if (!data) {
      nasaPowerCache.set(cacheKey, null);
      return null;
    }

    // Extract most recent non-null values for each parameter
    const result = {};
    const today = formatDate(endDate);

    for (const param of parameters) {
      const paramData = data[param];
      if (!paramData) {
        result[param] = null;
        continue;
      }

      // Look for most recent date with data (going back up to 7 days)
      let value = null;
      let dateFound = null;

      for (let i = 0; i < 7; i++) {
        const checkDate = new Date(endDate);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = formatDate(checkDate);

        if (paramData[dateStr] !== null && paramData[dateStr] !== undefined) {
          value = paramData[dateStr];
          dateFound = dateStr;
          break;
        }
      }

      result[param] = {
        value: value,
        date: dateFound,
        units: getParameterUnits(param)
      };
    }

    nasaPowerCache.set(cacheKey, result);
    logger.info('nasaPowerService', 'Recent data fetched', { lat, lon, paramsCount: parameters.length });
    return result;
  } catch (err) {
    logger.warn('nasaPowerService', 'getRecentPowerData failed', { error: err.message, lat, lon });
    nasaPowerCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Gets climatological averages (long-term monthly means) for parameters.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Array<string>} parameters - POWER parameters to fetch
 * @returns {Promise<Object|null>} Climatological monthly averages or null
 */
export async function getClimatologyData(lat, lon, parameters) {
  // Check cache first
  const cacheKey = `${lat},${lon},${parameters.join(',')},climatology`;
  const cached = nasaPowerCache.get(cacheKey);
  if (cached) return cached;

  const url = `${POWER_BASE_URL}/climatology/point?` +
    `parameters=${parameters.join(',')}&` +
    `community=RE&` +
    `longitude=${lon}&` +
    `latitude=${lat}&` +
    `format=JSON`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`NASA POWER Climatology HTTP ${response.status}`);
    }
    const data = await response.json();

    if (!data || !data.properties || !data.properties.parameter) {
      throw new Error('NASA POWER Climatology returned invalid response structure');
    }

    // Process climatological data (returns 12 values, one per month)
    const result = {};
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    for (const param of parameters) {
      const paramData = data.properties?.parameter?.[param];
      if (!paramData) {
        result[param] = null;
        continue;
      }

      // Convert array-like object to proper array with month labels
      const monthlyValues = [];
      for (let month = 1; month <= 12; month++) {
        const value = paramData[month.toString()];
        monthlyValues.push({
          month: month,
          monthName: monthNames[month - 1],
          value: value !== null && value !== undefined ? value : null,
          units: getParameterUnits(param)
        });
      }

      result[param] = {
        monthly: monthlyValues,
        annualMean: calculateAnnualMean(monthlyValues.map(m => m.value))
      };
    }

    nasaPowerCache.set(cacheKey, result);
    logger.info('nasaPowerService', 'Climatology data fetched', { lat, lon, paramsCount: parameters.length });
    return result;
  } catch (err) {
    logger.warn('nasaPowerService', 'getClimatologyData failed', { error: err.message, lat, lon });
    nasaPowerCache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Helper function to get units for a POWER parameter.
 * @param {string} parameter - POWER parameter code
 * @returns {string} Unit description
 */
function getParameterUnits(parameter) {
  const unitsMap = {
    'T2M': '°C',
    'T2MMAX': '°C',
    'T2MMIN': '°C',
    'T2M_RANGE': '°C',
    'T2MDEW': '°C',
    'T2MWET': '°C',
    'PRECTOT': 'mm/day',
    'PRECSNO': 'mm/day',
    'WS2M': 'm/s',
    'WS10M': 'm/s',
    'WD2M': 'degrees',
    'WD10M': 'degrees',
    'RH2M': '%',
    'PS': 'kPa',
    'ALLSKY_SFC_SW_DWN': 'kWh/m²/day',
    'CLRSKY_SFC_SW_DWN': 'kWh/m²/day',
    'ALLSKY_SFC_LW_DWN': 'kWh/m²/day'
  };
  return unitsMap[parameter] || 'unitless';
}

/**
 * Calculates annual mean from monthly values (ignoring nulls).
 * @param {Array<number|null>} monthlyValues - Array of 12 monthly values
 * @returns {number|null} Annual mean or null if insufficient data
 */
function calculateAnnualMean(monthlyValues) {
  const validValues = monthlyValues.filter(v => v !== null && v !== undefined);
  if (validValues.length === 0) return null;
  const sum = validValues.reduce((acc, val) => acc + val, 0);
  return sum / validValues.length;
}

/**
 * Builds a narrative sentence for Layer 6 enrichment from POWER data.
 * @param {Object|null} powerData - Output of getRecentPowerData()
 * @returns {string} Narrative sentence or empty string
 */
export function buildPowerNarrative(powerData) {
  if (!powerData) return '';

  const sentences = [];

  // Temperature narrative
  if (powerData.T2M && powerData.T2M.value !== null) {
    const temp = powerData.T2M.value;
    let tempContext = '';
    if (temp > 30) tempContext = ' — extremo calor';
    else if (temp > 25) tempContext = ' — calor moderado';
    else if (temp < 0) tempContext = ' — riesgo de helada';
    else if (temp < 10) tempContext = ' — condiciones frías';

    sentences.push(
      `Temperatura actual: ${temp.toFixed(1)}°C${tempContext} (datos NASA POWER).`
    );
  }

  // Precipitation narrative
  if (powerData.PRECTOT && powerData.PRECTOT.value !== null) {
    const precip = powerData.PRECTOT.value;
    let precipContext = '';
    if (precip > 50) precipContext = ' — lluvia intensa';
    else if (precip > 10) precipContext = ' — lluvia moderada';
    else if (precip < 0.1) precipContext = ' — condiciones secas';

    sentences.push(
      `Precipitación: ${precip.toFixed(1)} mm/día${precipContext} (NASA POWER).`
    );
  }

  // Wind narrative
  if (powerData.WS2M && powerData.WS2M.value !== null) {
    const wind = powerData.WS2M.value;
    let windContext = '';
    if (wind > 10) windContext = ' — vientos fuertes';
    else if (wind > 5) windContext = ' — vientos moderados';

    sentences.push(
      `Viento: ${wind.toFixed(1)} m/s${windContext} (NASA POWER).`
    );
  }

  // Dew point narrative (for humidity/comfort context)
  if (powerData.T2MDEW && powerData.T2MDEW.value !== null) {
    const dew = powerData.T2MDEW.value;
    const spread = powerData.T2M && powerData.T2M.value !== null
      ? (powerData.T2M.value - dew).toFixed(1)
      : null;
    let dewContext = '';
    if (dew > 20) dewContext = ' — muy húmedo, sensación de bochorno';
    else if (dew > 15) dewContext = ' — húmedo';
    else if (dew < 0) dewContext = ' — aire seco';

    const suffix = spread
      ? ` (brecha temp−rocío ${spread}°C)`
      : '';
    sentences.push(
      `Punto de rocío: ${dew.toFixed(1)}°C${dewContext}${suffix} (NASA POWER).`
    );
  }

  // Solar radiation narrative
  if (powerData.ALLSKY_SFC_SW_DWN && powerData.ALLSKY_SFC_SW_DWN.value !== null) {
    const solar = powerData.ALLSKY_SFC_SW_DWN.value;
    let solarContext = '';
    if (solar > 7) solarContext = ' — alta radiación solar';
    else if (solar < 3) solarContext = ' — baja radiación solar';

    sentences.push(
      `Radiación solar: ${solar.toFixed(1)} kWh/m²/día${solarContext} (NASA POWER).`
    );
  }

  return sentences.length > 0 ? sentences.join(' ') : '';
}

/**
 * Consolidated wrapper for Layer1 integration.
 * Fetches recent POWER data + climatology and returns a single structured result.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object|null>} { recent, climatology } or null on failure
 */
export async function getNasaPowerData(lat, lon) {
  const parameters = ['T2M', 'T2M_MAX', 'T2M_MIN', 'T2MDEW', 'PRECTOT', 'WS2M', 'RH2M', 'ALLSKY_SFC_SW_DWN'];
  try {
    const [recent, climatology] = await Promise.allSettled([
      getRecentPowerData(lat, lon, parameters),
      getClimatologyData(lat, lon, parameters),
    ]);
    const recentVal = recent.status === 'fulfilled' ? recent.value : null;
    const climaVal  = climatology.status === 'fulfilled' ? climatology.value : null;
    if (!recentVal && !climaVal) {
      logger.warn('nasaPowerService', 'getNasaPowerData: both recent and climatology returned null', { lat, lon });
      return null;
    }
    logger.info('nasaPowerService', 'Consolidated data retrieved', { lat, lon, hasRecent: !!recentVal, hasClimatology: !!climaVal });
    return { recent: recentVal, climatology: climaVal };
  } catch (err) {
    logger.error('nasaPowerService', 'getNasaPowerData unexpected error', { error: err.message, lat, lon });
    return null;
  }
}
