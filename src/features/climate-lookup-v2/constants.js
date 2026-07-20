// Auditoría de brecha funcional (D1 §4, hallazgo crítico): el selector de
// sector de ClimateRiskLookupV2.jsx importaba SECTORS de
// "@/features/climate-lookup/constants" (V1) — {retail, salud, educacion,
// entretenimiento, otros} — que NO coincide con los sectores reales del
// motor de negocio V2 (pipeline/config/sector-profiles.json: {retail,
// agriculture, finance, energy, infrastructure}). 4 de esas 5 opciones caían
// silenciosamente en el perfil "default" (sensibilidad física genérica,
// sin medidas de adaptación sector-específicas, sin riesgos de transición
// configurados) sin que la UI lo indicara.
//
// Esta lista se limita deliberadamente a los 5 sectores que sí tienen perfil
// real en sector-profiles.json — no se fabrican perfiles nuevos para
// salud/educación/entretenimiento (eso requeriría valores de
// physical_sensitivity/transition_sensitivity y un catálogo de medidas de
// adaptación que no existen hoy; inventarlos sería exactamente el tipo de
// fabricación que la auditoría de transformación de datos advierte).
export const SECTORS_V2 = [
  { value: "retail", label: "Retail / Comercio" },
  { value: "agriculture", label: "Agricultura" },
  { value: "finance", label: "Finanzas / Seguros" },
  { value: "energy", label: "Energía" },
  { value: "infrastructure", label: "Infraestructura" },
];

// Debe coincidir con pipeline/shared/types.js SUPPORTED_SCENARIOS/SCENARIO_LABELS.
// Solo 2 — no una elección de UI, sino los únicos 2 escenarios para los que
// existe una fuente de datos real (supabase_climate_cells, bloques
// ensemble-all-ssp{245,585}_*). Ver auditoría de transformación de datos,
// hallazgo P2.
export const SCENARIOS_V2 = [
  { value: "ssp245", label: "Emisiones moderadas" },
  { value: "ssp585", label: "Altas emisiones" },
];
