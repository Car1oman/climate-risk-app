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
      "Horizon factor: 1.0 (urgencia máxima). Relevante para decisiones de inversión y operación inmediata. Datos completos SSP2-4.5 y SSP5-8.5.",
  },
  {
    code: "mid_term",
    label: "Mediano plazo",
    period: "2040–2059",
    description:
      "Horizon factor: 0.75 (urgencia alta). Relevante para CAPEX y activos de larga vida. Datos completos SSP2-4.5 y SSP5-8.5.",
  },
  {
    code: "long_term",
    label: "Largo plazo",
    period: "2060–2100",
    description:
      "Horizon factor: 0.50 (urgencia de planificación). Datos extrapolados linealmente desde SSP5-8.5 2040-2059. Incertidumbre mayor.",
  },
];

export const COMPOSITE_SCORE_FORMULA = {
  title: "Score Compuesto Geoespacial (Layer 4)",
  reference: "UNDP Disaster Risk Index + DARA Climate Vulnerability Monitor",
  formula:
    "Score = (Probabilidad × 0.30) + (Intensidad × 0.25) + (Exposición × 0.25) + (Sensibilidad × 0.10) + (Factor temporal × 0.10)",
  scale: "0–100 · convertido desde [0, 1] × 100",
  components: [
    {
      key: "probability",
      label: "Probabilidad",
      weight: "30%",
      description:
        "Probabilidad de ocurrencia del peligro. Fuente: GRI Oxford. alto=0.80, medio=0.60, bajo=0.40.",
    },
    {
      key: "intensity",
      label: "Intensidad",
      weight: "25%",
      description:
        "Magnitud del cambio proyectado vs. histórico (delta normalizado). Fuente: índices CMIP6 (hd35, cdd, rx5day, tas).",
    },
    {
      key: "exposure",
      label: "Exposición",
      weight: "25%",
      description:
        "Nivel de exposición física del sector. Retail/Salud: 1.0 (alto). Educación/Entretenimiento: 0.5 (medio).",
    },
    {
      key: "sensitivity",
      label: "Sensibilidad sectorial",
      weight: "10%",
      description:
        "Calibrada por Layer 3 (BusinessRiskEngine) según impactos históricos observados por sector.",
    },
    {
      key: "horizon_factor",
      label: "Factor temporal",
      weight: "10%",
      description:
        "Urgencia temporal: corto plazo=1.0 (2020-2039), mediano=0.75 (2040-2059), largo=0.50 (2060+).",
    },
  ],
  urgency_levels: [
    {
      level: "crítica",
      threshold: "≥ 75 / 100",
      action: "Acción inmediata. Inversión en adaptación urgente.",
    },
    {
      level: "alta",
      threshold: "≥ 50 / 100",
      action: "Plan de acción en 1–3 años.",
    },
    {
      level: "media",
      threshold: "≥ 25 / 100",
      action: "Monitoreo y planificación a 5 años.",
    },
    {
      level: "baja",
      threshold: "< 25 / 100",
      action: "Revisión periódica. Sin acción urgente.",
    },
  ],
};

export const HXE_FORMULA = {
  title: "Fórmula H×E×I — Portfolio de Activos Registrados",
  reference: "IPCC AR5/AR6 · Risk = f(Hazard, Exposure, Vulnerability)",
  formula: "R = (H × 0.40) + (E × 0.30) + (I × 0.30)",
  scale: "[0, 1]",
  components: [
    {
      key: "H",
      label: "Peligro (Hazard)",
      weight: "40%",
      description:
        "Suma ponderada de peligros. Inundación 30%, El Niño 25%, Sismo 20%, Deslizamiento 15%, Sequía 10%.",
    },
    {
      key: "E",
      label: "Exposición",
      weight: "30%",
      description:
        "Área del activo normalizada por tipo (centro distribución, supermercado grande/mediano, tienda express).",
    },
    {
      key: "I",
      label: "Impacto financiero",
      weight: "30%",
      description:
        "Estimado como: ventas perdidas + personal + logística + rehabilitación física. Normalizado contra USD 20M.",
    },
  ],
};

export const ANALYSIS_LIMITATIONS = [
  "Pesos del composite score son expertos, no calibrados estadísticamente sobre datos históricos de pérdidas.",
  "Fórmula lineal: no modela interacciones no lineales (ej. calor + sequía simultáneos).",
  "No incluye riesgos en cascada (inundación → interrupción logística → recesión).",
  "Datos World Bank son nacionales (Perú); sin desagregación regional o departamental.",
  "SRTM (terreno) de año 2000; no refleja cambios de uso del suelo posteriores.",
  "Open-Meteo cubre hasta ~2049; horizonte long_term (2060+) se extrapola linealmente.",
  "Resolución CMIP6 de ~25 km no captura microclimas urbanos ni efecto de isla de calor.",
  "El score es un valor puntual del ensemble; no expone intervalos de confianza.",
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
