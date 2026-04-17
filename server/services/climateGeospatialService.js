/**
 * Servicio de datos climáticos geoespaciales
 * Consulta la tabla climate_cells usando PostGIS para búsquedas por proximidad
 */
import { supabase } from "../supabaseClient.js";

/**
 * Obtener datos climáticos del punto más cercano
 * @param {number} lat - Latitud
 * @param {number} lon - Longitud
 * @returns {Promise<Object>} Datos climáticos completos
 */
const getClimateByLocation = async (lat, lon) => {
  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
    throw new Error("Coordenadas inválidas");
  }

  if (latNum < -90 || latNum > 90) {
    throw new Error("Latitud fuera de rango [-90, 90]");
  }

  if (lonNum < -180 || lonNum > 180) {
    throw new Error("Longitud fuera de rango [-180, 180]");
  }

  try {
    // Consulta geoespacial: encontrar el punto más cercano
    const { data, error } = await supabase
      .from("climate_cells")
      .select("id, lat, lon, data")
      .order("geom", {
        ascending: true,
        foreignTable: null,
      })
      .limit(1)
      .rpc("get_nearest_climate_cell", { p_lat: latNum, p_lon: lonNum });

    if (error) {
      console.error("Error en consulta geoespacial:", error.message);
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn(`No hay datos climáticos para coordenadas: ${latNum}, ${lonNum}`);
      return null;
    }

    const cell = data[0];
    return {
      location: {
        lat: cell.lat,
        lon: cell.lon,
      },
      climate: transformClimateData(cell.data),
    };
  } catch (error) {
    console.error("❌ Error en getClimateByLocation:", error.message);
    throw error;
  }
};

/**
 * Transformar datos climáticos del formato de Supabase al formato amigable
 * Mapeo de horizontes temporales:
 * - historical → past
 * - ensemble-all-ssp245_2020-2039 → short_term
 * - ensemble-all-ssp245_2040-2059 → mid_term
 * - ensemble-all-ssp585_* → worst_case
 */
const transformClimateData = (rawData) => {
  if (!rawData || typeof rawData !== "object") {
    return {};
  }

  const transformed = {};

  // Mapeo de períodos
  const periodMapping = {
    historical: "past",
    "ensemble-all-ssp245_2020-2039": "short_term",
    "ensemble-all-ssp245_2040-2059": "mid_term",
  };

  // Procesar cada período
  Object.entries(rawData).forEach(([period, data]) => {
    let mappedPeriod = period;

    // Mapear período conocido
    if (periodMapping[period]) {
      mappedPeriod = periodMapping[period];
    }

    // Si es SSP585, mapear a worst_case
    if (period.includes("ssp585")) {
      mappedPeriod = "worst_case";
    }

    // Transformar variables si existen datos
    if (data && typeof data === "object") {
      transformed[mappedPeriod] = transformVariables(data);
    }
  });

  return transformed;
};

/**
 * Transformar variables climáticas individuales con interpretación
 * Variable mapping:
 * - txx → temperatura extrema máxima
 * - tnn → temperatura extrema mínima
 * - hd35 → días con temp > 35°C
 * - rx1day → precipitación máxima en 1 día
 * - etc.
 */
const transformVariables = (variables) => {
  const variableDescriptions = {
    txx: {
      name: "Temperatura Máxima Extrema",
      unit: "°C",
      description: "Temperatura máxima extrema del período",
    },
    tnn: {
      name: "Temperatura Mínima Extrema",
      unit: "°C",
      description: "Temperatura mínima extrema del período",
    },
    hd35: {
      name: "Días Extremadamente Calurosos",
      unit: "días/año",
      description: "Número de días con temperatura > 35°C",
    },
    hd40: {
      name: "Días Críticos de Calor",
      unit: "días/año",
      description: "Número de días con temperatura > 40°C",
    },
    rx1day: {
      name: "Lluvia Extrema (1 día)",
      unit: "mm",
      description: "Máxima precipitación en un día del período",
    },
    rx5day: {
      name: "Lluvia Extrema (5 días)",
      unit: "mm",
      description: "Máxima precipitación en 5 días consecutivos",
    },
    cdd: {
      name: "Días Secos Consecutivos",
      unit: "días",
      description: "Máxima secuencia de días sin precipitación",
    },
    cwd: {
      name: "Días Lluviosos Consecutivos",
      unit: "días",
      description: "Máxima secuencia de días con precipitación",
    },
    pr: {
      name: "Precipitación Anual",
      unit: "mm",
      description: "Precipitación total acumulada",
    },
    tas: {
      name: "Temperatura Media",
      unit: "°C",
      description: "Temperatura media del período",
    },
  };

  const transformed = {};

  Object.entries(variables).forEach(([key, value]) => {
    const description = variableDescriptions[key] || {
      name: key.toUpperCase(),
      unit: "unidad desconocida",
      description: `Variable climática: ${key}`,
    };

    transformed[key] = {
      ...description,
      value: value,
    };
  });

  return transformed;
};

/**
 * Generar interpretación legible de cambios climáticos
 * @param {Object} past - Datos del período histórico
 * @param {Object} future - Datos del período futuro
 * @returns {Array} Array de interpretaciones textuales
 */
const generateClimateInsights = (past, future) => {
  const insights = [];

  if (!past || !future) {
    return insights;
  }

  // Comparar temperatura extrema máxima
  if (past.txx && future.txx && past.txx.value !== null && future.txx.value !== null) {
    const delta = (future.txx.value - past.txx.value).toFixed(1);
    const direction = delta > 0 ? "aumenta" : "disminuye";
    insights.push({
      variable: "txx",
      type: "temperature_change",
      text: `La temperatura máxima extrema ${direction} de ${past.txx.value}°C a ${future.txx.value}°C (cambio: ${Math.abs(delta)}°C)`,
      severity: Math.abs(delta) > 2 ? "high" : Math.abs(delta) > 1 ? "medium" : "low",
    });
  }

  // Comparar días extremadamente calurosos
  if (past.hd35 && future.hd35 && past.hd35.value !== null && future.hd35.value !== null) {
    const delta = future.hd35.value - past.hd35.value;
    const direction = delta > 0 ? "aumentan" : "disminuyen";
    if (Math.abs(delta) > 0) {
      insights.push({
        variable: "hd35",
        type: "extreme_heat_days",
        text: `Los días con temperatura > 35°C ${direction} de ${past.hd35.value} a ${future.hd35.value} días/año`,
        severity: Math.abs(delta) > 30 ? "high" : Math.abs(delta) > 10 ? "medium" : "low",
      });
    }
  }

  // Comparar lluvia extrema
  if (past.rx1day && future.rx1day && past.rx1day.value !== null && future.rx1day.value !== null) {
    const delta = (future.rx1day.value - past.rx1day.value).toFixed(1);
    const direction = delta > 0 ? "aumenta" : "disminuye";
    insights.push({
      variable: "rx1day",
      type: "extreme_precipitation",
      text: `La lluvia extrema en 1 día ${direction} de ${past.rx1day.value}mm a ${future.rx1day.value}mm`,
      severity: Math.abs(delta) > 20 ? "high" : Math.abs(delta) > 10 ? "medium" : "low",
    });
  }

  // Comparar días secos consecutivos
  if (past.cdd && future.cdd && past.cdd.value !== null && future.cdd.value !== null) {
    const delta = future.cdd.value - past.cdd.value;
    if (Math.abs(delta) > 0) {
      const direction = delta > 0 ? "prolongan" : "acortan";
      insights.push({
        variable: "cdd",
        type: "drought_risk",
        text: `Los períodos secos se ${direction}: ${Math.abs(delta)} días adicionales`,
        severity: delta > 15 ? "high" : delta > 5 ? "medium" : "low",
      });
    }
  }

  return insights;
};

/**
 * Obtener riesgos climáticos basados en datos de múltiples horizontes
 */
const interpretClimateRisks = (climateData) => {
  if (!climateData || !climateData.climate) {
    return [];
  }

  const risks = [];
  const { past, short_term, mid_term, worst_case } = climateData.climate;

  // Comparar pasado vs corto plazo
  if (past && short_term) {
    const shortTermInsights = generateClimateInsights(past, short_term);
    risks.push({
      horizon: "short_term",
      period: "Corto Plazo (2020-2039)",
      insights: shortTermInsights,
    });
  }

  // Comparar pasado vs mediano plazo
  if (past && mid_term) {
    const midTermInsights = generateClimateInsights(past, mid_term);
    risks.push({
      horizon: "mid_term",
      period: "Mediano Plazo (2040-2059)",
      insights: midTermInsights,
    });
  }

  // Comparar pasado vs peor escenario
  if (past && worst_case) {
    const worstCaseInsights = generateClimateInsights(past, worst_case);
    risks.push({
      horizon: "worst_case",
      period: "Escenario Crítico",
      insights: worstCaseInsights,
    });
  }

  return risks;
};

export {
  getClimateByLocation,
  transformClimateData,
  transformVariables,
  generateClimateInsights,
  interpretClimateRisks,
};
