export const TILE_LAYERS = {
  osm: {
    label: "Calles", icon: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  topo: {
    label: "Topográfico", icon: "🌄",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
  },
  satellite: {
    label: "Satélite", icon: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
  },
};

export const SECTORS = [
  { value: "retail",          label: "Retail / Supermercados" },
  { value: "salud",           label: "Salud / Clínicas" },
  { value: "educacion",       label: "Educación" },
  { value: "entretenimiento", label: "Entretenimiento" },
  { value: "otros",           label: "Otro sector" },
];

/**
 * Unidades de negocio — mapeadas al catálogo businessProfiles.js del backend.
 * Cada entrada tiene sector sugerido y taxonomía operativa.
 * Al seleccionar una unidad, el sector se ajusta automáticamente.
 */
export const BUSINESS_UNITS = [
  // ── Financiero ──────────────────────────────────────────────────────────
  { id: "interbank",          label: "Interbank",          plataforma: "Financiera",   taxonomia: "banco",             sectorSugerido: "otros" },
  { id: "inteligo",           label: "Inteligo",           plataforma: "Financiera",   taxonomia: "banco_inversiones", sectorSugerido: "otros" },
  { id: "izipay",             label: "Izipay",              plataforma: "Financiera",   taxonomia: "procesadora_pagos", sectorSugerido: "otros" },
  { id: "interseguro",        label: "Interseguro",         plataforma: "Financiera",   taxonomia: "seguros",           sectorSugerido: "otros" },
  { id: "infinance_xp",       label: "InFinance XP",        plataforma: "Retail",       taxonomia: "financiera",        sectorSugerido: "otros" },
  // ── Retail ──────────────────────────────────────────────────────────────
  { id: "spsa",               label: "Supermercados Peruanos", plataforma: "Retail",    taxonomia: "supermercado",     sectorSugerido: "retail" },
  { id: "farmacias_peruanas", label: "Farmacias Peruanas",   plataforma: "Retail",      taxonomia: "farmacia",          sectorSugerido: "retail" },
  { id: "oechsle",            label: "Oechsle",             plataforma: "Retail",       taxonomia: "tienda_departamentos", sectorSugerido: "retail" },
  { id: "real_plaza",         label: "Real Plaza",          plataforma: "Retail",       taxonomia: "centro_comercial",  sectorSugerido: "retail" },
  { id: "promart",            label: "Promart",             plataforma: "Retail",       taxonomia: "homecenter",        sectorSugerido: "retail" },
  // ── Educación ───────────────────────────────────────────────────────────
  { id: "innova_schools",     label: "Innova Schools",      plataforma: "Educación",    taxonomia: "colegio",           sectorSugerido: "educacion" },
  { id: "utp",                label: "UTP",                 plataforma: "Educación",    taxonomia: "universidad",       sectorSugerido: "educacion" },
  { id: "inlearning",         label: "InLearning",          plataforma: "Educación",    taxonomia: "instituto",         sectorSugerido: "educacion" },
  // ── Entretenimiento ─────────────────────────────────────────────────────
  { id: "la_tinka",           label: "La Tinka",            plataforma: "Entretenimiento", taxonomia: "juegos_azar",     sectorSugerido: "entretenimiento" },
  { id: "ngr",                label: "NGR",                 plataforma: "Entretenimiento", taxonomia: "restaurante",      sectorSugerido: "entretenimiento" },
  { id: "casa_andina",        label: "Casa Andina",         plataforma: "Entretenimiento", taxonomia: "hotel",            sectorSugerido: "entretenimiento" },
  { id: "cineplanet",         label: "Cineplanet",          plataforma: "Entretenimiento", taxonomia: "cine",             sectorSugerido: "entretenimiento" },
  // ── Salud ───────────────────────────────────────────────────────────────
  { id: "clinica_aviva",      label: "Clínica Aviva",       plataforma: "Salud",        taxonomia: "hospital",          sectorSugerido: "salud" },
  { id: "smi",                label: "SMI",                 plataforma: "Industrial",   taxonomia: "planta_industrial", sectorSugerido: "otros" },
];

export const SIGNAL_META = {
  extreme_heat:    { icon: "🌡️", label: "Calor extremo (>35°C)",    unit: "días/año"    },
  severe_heat:     { icon: "🔥", label: "Calor severo (>40°C)",      unit: "días/año"    },
  tropical_nights: { icon: "🌙", label: "Noches tropicales (>20°C)", unit: "noches/año"  },
  drought:         { icon: "☀️", label: "Sequía / estrés hídrico",   unit: "días"        },
  extreme_rain:    { icon: "🌧️", label: "Lluvia extrema",            unit: "mm"          },
  temp_increase:   { icon: "📈", label: "Aumento temperatura media", unit: "°C"          },
  flood_risk:      { icon: "🌊", label: "Riesgo de inundación",      unit: "%"           },
  heat_stress:     { icon: "🌡️", label: "Estrés térmico (WBGT+AQI)", unit: "índice"     },
  drought_composite: { icon: "🏜️", label: "Índice compuesto sequía",  unit: "0-1"        },
  conditional_enso_risk: { icon: "🌊", label: "Riesgo condicional ENSO", unit: "señales" },
  exposure:        { icon: "🎯", label: "Exposición multi-amenaza",   unit: "0-1"        },
  vulnerability:   { icon: "🛡️", label: "Vulnerabilidad GRI",        unit: "0-1"        },
  calibrated_risk: { icon: "📊", label: "Riesgo calibrado (P×I/CA)", unit: "puntos"     },
  adaptive_capacity: { icon: "📶", label: "Capacidad adaptativa",    unit: "0-1"        },
};

export const HORIZON_LABEL = {
  short_term: "2020–2039 (corto plazo)",
  mid_term:   "2040–2059 (mediano plazo)",
  long_term:  "2060+ (largo plazo)",
};

export const GRI_ICONS = {
  flood: "🌊", fluvial: "🏞️", coastal: "🌊", pluvial: "🌧️",
  drought: "☀️", heat: "🌡️", extreme_heat: "🌡️", landslide: "⛰️",
};

export const GRI_BADGE = {
  alto:       "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/60 dark:text-red-200 dark:border-red-700",
  medio:      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700",
  bajo:       "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700",
  "sin data": "bg-slate-100 text-slate-600 border-slate-200 dark:bg-secondary dark:text-secondary-foreground dark:border-border",
};

export const CONFIDENCE_BADGE = {
  high:   "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700",
  medium: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700",
  low:    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-secondary dark:text-secondary-foreground dark:border-border",
};
