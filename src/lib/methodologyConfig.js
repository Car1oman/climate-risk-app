// Centralized methodology configuration for Sprint 2 — MethodologyPanel

export const DATA_SOURCES = {
  climate_cells: {
    id: "climate_cells",
    label: "CMIP6 / Supabase",
    description:
      "Datos climáticos precomputados del Coupled Model Intercomparison Project Phase 6. Incluye índices históricos (1980–2014) y proyecciones SSP2-4.5/SSP5-8.5 para 2020–2059. Resolución ~25 km espacial.",
    institution: "World Climate Research Programme (WCRP) — 49+ centros climáticos",
    url: "https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6",
    confidence: "Alto (Tier 1)",
    confidenceLevel: "high",
    icon: "🌍",
  },
  gri: {
    id: "gri",
    label: "GRI Oxford",
    description:
      "Global Infrastructure Resilience — probabilidades de peligros: inundación (WRI Aqueduct), sequía (ISIMIP), calor extremo, deslizamiento, inundación costera. Resolución ~1 km.",
    institution: "Oxford University — Oxford Programme for Sustainable Infrastructure Systems",
    url: "https://global.infrastructureresilience.org",
    confidence: "Alto-Medio (Tier 1-2)",
    confidenceLevel: "high",
    icon: "🏛️",
  },
  open_meteo: {
    id: "open_meteo",
    label: "Open-Meteo",
    description:
      "API climática derivada de modelos CMIP6. Activa como fallback cuando la celda Supabase más cercana supera el umbral de distancia aceptable. Licencia CC BY 4.0.",
    institution: "Open-Meteo.com",
    url: "https://open-meteo.com",
    confidence: "Alto (Tier 1) — derivado CMIP6",
    confidenceLevel: "high",
    icon: "🌤️",
  },
  world_bank: {
    id: "world_bank",
    label: "Banco Mundial",
    description:
      "Indicadores socioeconómicos de Perú: pobreza, urbanización, acceso a agua, PIB per cápita. Calibran sensibilidad sectorial y generan contexto territorial.",
    institution: "World Bank — Development Data Group",
    url: "https://data.worldbank.org",
    confidence: "Alto (Tier 1)",
    confidenceLevel: "high",
    icon: "🏦",
  },
  enso: {
    id: "enso",
    label: "NOAA / ENSO",
    description:
      "Oceanic Niño Index (ONI) — anomalías de temperatura superficial del mar para determinar fases El Niño / La Niña. Dato en tiempo casi-real; enriquece la narrativa ejecutiva.",
    institution: "NOAA National Centers for Environmental Prediction (NCEP)",
    url: "https://www.cpc.ncep.noaa.gov",
    confidence: "Alto (Tier 1) — estado actual",
    confidenceLevel: "high",
    icon: "🌊",
  },
  terrain: {
    id: "terrain",
    label: "OpenTopoData / SRTM",
    description:
      "Datos de elevación y pendiente de la NASA Shuttle Radar Topography Mission (2000). Resolución ~30 m. Calcula susceptibilidad a huaycos y deslizamientos por pendiente.",
    institution: "NASA / OpenTopoData",
    url: "https://www.opentopodata.org",
    confidence: "Medio (Tier 2)",
    confidenceLevel: "medium",
    icon: "⛰️",
  },
  ssp245: {
    id: "ssp245",
    label: "SSP2-4.5",
    description: "Escenario moderado — emisiones intermedias, +2.1°C a +3.5°C hacia 2100.",
    confidenceLevel: "high",
    icon: "📊",
    type: "scenario",
  },
  ssp585: {
    id: "ssp585",
    label: "SSP5-8.5",
    description: "Escenario pesimista — emisiones altas, +3.3°C a +5.7°C hacia 2100.",
    confidenceLevel: "medium",
    icon: "🔥",
    type: "scenario",
  },
};

export const SSP_SCENARIOS = {
  ssp245: {
    code: "SSP2-4.5",
    name: "Moderado",
    nickname: '"Middle of the Road"',
    forcing: "4.5 W/m²",
    temp_range: "+2.1°C – +3.5°C",
    co2_2100: "~600 ppm",
    description:
      "Tendencias actuales continúan. Progreso moderado en sostenibilidad. Desigualdad persistente. No se alcanzan emisiones netas cero en este siglo.",
    peru_impacts: [
      "Temperatura en costa +1.2°C a +1.8°C hacia 2050",
      "+8 a +15 días/año de Tmax > 35°C en costa norte",
      "Precipitación en Andes −5% a −10% anual hacia 2050",
      "Nivel del mar en Callao/Lima: +20–35 cm hacia 2100",
    ],
  },
  ssp585: {
    code: "SSP5-8.5",
    name: "Pesimista",
    nickname: '"Fossil-fueled Development"',
    forcing: "8.5 W/m²",
    temp_range: "+3.3°C – +5.7°C",
    co2_2100: "~1.100 ppm",
    description:
      "Desarrollo intensivo en combustibles fósiles. Alto crecimiento económico sin acción climática efectiva. Escenario de mayor impacto — usado como default conservador por IPCC AR6.",
    peru_impacts: [
      "Temperatura en costa +2.5°C a +4.0°C hacia 2050",
      "+20 a +40 días/año de Tmax > 35°C en costa norte",
      "Precipitación en Andes −10% a −20% anual hacia 2050",
      "Nivel del mar en Callao/Lima: +50–80 cm hacia 2100",
      "Riesgo colapso glaciares andinos: muy alto hacia 2080",
    ],
  },
};

export const TEMPORAL_HORIZONS = [
  {
    code: "historical",
    label: "Histórico",
    period: "1980–2014",
    description:
      "Baseline de calibración. Los modelos CMIP6 son validados contra observaciones de este período. Todos los deltas se calculan como proyectado − histórico.",
  },
  {
    code: "short_term",
    label: "Corto plazo",
    period: "2020–2039",
    description:
      "Horizonte cercano para decisiones de inversion y operacion inmediata. Datos completos SSP2-4.5 y SSP5-8.5.",
  },
  {
    code: "mid_term",
    label: "Mediano plazo",
    period: "2040–2059",
    description:
      "Horizonte intermedio para CAPEX y activos de larga vida. Datos completos SSP2-4.5 y SSP5-8.5.",
  },
  {
    code: "long_term",
    label: "Largo plazo",
    period: "2060–2100",
    description:
      "Horizonte de planificacion. Datos extrapolados linealmente desde SSP5-8.5 2040-2059. Incertidumbre mayor.",
  },
];

export const ANALYSIS_LIMITATIONS = [
  "La plataforma describe señales y tendencias; no calcula prioridad, ranking ni puntaje agregado.",
  "La interpretación contextual no modela interacciones no lineales (ej. calor + sequía simultáneos).",
  "No incluye riesgos en cascada (inundación → interrupción logística → recesión).",
  "Datos World Bank son nacionales (Perú); sin desagregación regional o departamental.",
  "SRTM (terreno) de año 2000; no refleja cambios de uso del suelo posteriores.",
  "Open-Meteo cubre hasta ~2049; horizonte long_term (2060+) se extrapola linealmente.",
  "Resolución CMIP6 de ~25 km no captura microclimas urbanos ni efecto de isla de calor.",
  "La confianza se reporta como metadato cualitativo según fuente y disponibilidad; no equivale a probabilidad de pérdida.",
];

export const RESPONSIBLE_INSTITUTIONS = [
  {
    name: "WCRP / CMIP6",
    role: "Modelos climáticos globales",
    url: "https://www.wcrp-climate.org",
  },
  {
    name: "Oxford SAIS / GRI",
    role: "Resiliencia de infraestructura y peligros",
    url: "https://global.infrastructureresilience.org",
  },
  {
    name: "Banco Mundial",
    role: "Indicadores socioeconómicos",
    url: "https://data.worldbank.org",
  },
  {
    name: "NOAA NCEP / CPC",
    role: "Índice ONI / ENSO",
    url: "https://www.cpc.ncep.noaa.gov",
  },
  {
    name: "NASA / OpenTopoData",
    role: "Datos de elevación SRTM",
    url: "https://www.opentopodata.org",
  },
  {
    name: "Open-Meteo",
    role: "API climática CMIP6 (fallback)",
    url: "https://open-meteo.com",
  },
];

// Maps raw backend data_sources strings to DATA_SOURCES keys
export function resolveSourceKey(rawSource) {
  const s = (rawSource ?? "").toLowerCase().replace(/[-\s]/g, "_");
  if (s.includes("climate_cell") || s.includes("cmip6") || s.includes("supabase")) return "climate_cells";
  if (s.includes("gri") || s.includes("oxford")) return "gri";
  if (s.includes("open_meteo") || s.includes("openmeteo")) return "open_meteo";
  if (s.includes("world_bank") || s.includes("banco") || s.includes("worldbank")) return "world_bank";
  if (s.includes("enso") || s.includes("noaa") || s.includes("oni")) return "enso";
  if (s.includes("terrain") || s.includes("srtm") || s.includes("topo")) return "terrain";
  return null;
}
