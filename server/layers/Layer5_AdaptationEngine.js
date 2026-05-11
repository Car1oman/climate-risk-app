/**
 * Layer 5 — Adaptation Engine
 * Mapea cada riesgo priorizado a medidas de adaptación concretas
 * basadas en el catálogo documental de Intercorp Retail.
 */

// ─── Catálogo de medidas de adaptación por tipo de riesgo ────────────────────
// Basado en: IPCC AR6 WG2 Chapter 17 (adaptation options),
// TCFD Guidance for Retail Sector, y catálogo documental Intercorp
const ADAPTATION_CATALOG = {
  extreme_heat: [
    {
      nombre:                    'Climatización eficiente',
      descripcion:               'Instalación o modernización de sistemas HVAC con tecnología de alta eficiencia energética (COP ≥ 4.0)',
      donde_impacta:             'Tiendas, almacenes, oficinas',
      horizonte_implementacion:  'corto',   // < 2 años
      costo_estimado_rango:      { min_usd: 20_000, max_usd: 80_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Monitoreo de temperatura en tiempo real',
      descripcion:               'Sensores IoT conectados a dashboard de alertas para cadena frío y confort operativo',
      donde_impacta:             'Cadena frío, almacenes refrigerados',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 20_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Protocolos de calor extremo para personal',
      descripcion:               'Procedimientos operativos para días con temperatura > 35°C: rotación de turnos, hidratación, zonas de descanso climatizadas',
      donde_impacta:             'Recursos humanos, operaciones',
      horizonte_implementacion:  'inmediato',
      costo_estimado_rango:      { min_usd: 1_000, max_usd: 5_000 },
      efectividad:               'media',
    },
    {
      nombre:                    'Techos y fachadas reflectantes (cool roofs)',
      descripcion:               'Aplicación de pinturas o materiales reflectantes para reducir absorción de calor solar en edificaciones',
      donde_impacta:             'Infraestructura física',
      horizonte_implementacion:  'mediano',  // 2–5 años
      costo_estimado_rango:      { min_usd: 15_000, max_usd: 60_000 },
      efectividad:               'media',
    },
  ],

  severe_heat: [
    {
      nombre:                    'Plan de continuidad operativa por calor extremo',
      descripcion:               'Protocolo de activación para días con temperatura > 40°C: reducción de horarios, cierre preventivo, comunicación a clientes',
      donde_impacta:             'Operaciones, comunicaciones',
      horizonte_implementacion:  'inmediato',
      costo_estimado_rango:      { min_usd: 2_000, max_usd: 8_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Redundancia en cadena frío crítica',
      descripcion:               'Equipos de refrigeración de respaldo con generadores autónomos para productos de alta criticidad',
      donde_impacta:             'Cadena frío, farmacia, alimentos',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 30_000, max_usd: 100_000 },
      efectividad:               'alta',
    },
  ],

  drought: [
    {
      nombre:                    'Sistemas de riego eficiente',
      descripcion:               'Instalación de riego por goteo o aspersión de precisión en áreas verdes y zonas de mantenimiento',
      donde_impacta:             'Áreas verdes, mantenimiento',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 25_000 },
      efectividad:               'media',
    },
    {
      nombre:                    'Captación y reutilización de agua de lluvia',
      descripcion:               'Sistemas de recolección en techos para uso en limpieza, riego y servicios no potables',
      donde_impacta:             'Operaciones, mantenimiento',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 10_000, max_usd: 40_000 },
      efectividad:               'media',
    },
    {
      nombre:                    'Auditoría y reducción de consumo hídrico',
      descripcion:               'Diagnóstico de puntos de consumo, instalación de dispositivos ahorradores y metas de reducción del 20–30%',
      donde_impacta:             'Operaciones, servicios sanitarios',
      horizonte_implementacion:  'inmediato',
      costo_estimado_rango:      { min_usd: 3_000, max_usd: 12_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Diversificación de proveedores ante estrés hídrico',
      descripcion:               'Identificar proveedores alternativos en zonas con menor exposición a sequía para productos agrícolas clave',
      donde_impacta:             'Cadena de suministro',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 20_000 },
      efectividad:               'alta',
    },
  ],

  extreme_rain: [
    {
      nombre:                    'Mejora de sistemas de drenaje',
      descripcion:               'Ampliación de capacidad de drenaje pluvial en estacionamientos, accesos y áreas de carga',
      donde_impacta:             'Infraestructura, accesos',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 20_000, max_usd: 80_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Barreras temporales contra inundación',
      descripcion:               'Adquisición de barreras modulares desplegables para proteger accesos y áreas críticas ante eventos de lluvia extrema',
      donde_impacta:             'Infraestructura, almacenes',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 20_000 },
      efectividad:               'media',
    },
    {
      nombre:                    'Elevación de equipos críticos',
      descripcion:               'Reubicar servidores, tableros eléctricos y equipos de alto valor a niveles superiores al piso',
      donde_impacta:             'Infraestructura tecnológica, eléctrica',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 8_000, max_usd: 30_000 },
      efectividad:               'alta',
    },
  ],

  temp_increase: [
    {
      nombre:                    'Transición a energías renovables',
      descripcion:               'Instalación de paneles solares para reducir dependencia de red eléctrica y costos energéticos crecientes',
      donde_impacta:             'Costos operativos, huella de carbono',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 50_000, max_usd: 200_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Eficiencia energética en iluminación y equipos',
      descripcion:               'Reemplazo de iluminación por LED y equipos de bajo consumo para mitigar incremento de costos energéticos',
      donde_impacta:             'Costos operativos',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 10_000, max_usd: 40_000 },
      efectividad:               'alta',
    },
  ],

  flood_risk: [
    {
      nombre:                    'Plan de continuidad de operaciones ante inundación',
      descripcion:               'Protocolo documentado con roles, responsabilidades y procedimientos de evacuación, recuperación y comunicación',
      donde_impacta:             'Operaciones, recursos humanos',
      horizonte_implementacion:  'inmediato',
      costo_estimado_rango:      { min_usd: 3_000, max_usd: 10_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Seguro paramétrico contra inundación',
      descripcion:               'Contratación de seguro con pago automático al superar umbral de precipitación o nivel de agua definido',
      donde_impacta:             'Gestión financiera del riesgo',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 25_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Sistemas de drenaje mejorado',
      descripcion:               'Ampliación de capacidad de drenaje pluvial en estacionamientos, accesos y áreas de carga',
      donde_impacta:             'Infraestructura, accesos',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 20_000, max_usd: 80_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Barreras temporales de inundación',
      descripcion:               'Barreras modulares desplegables para proteger accesos y áreas críticas ante eventos de lluvia extrema',
      donde_impacta:             'Infraestructura, almacenes',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 20_000 },
      efectividad:               'media',
    },
  ],
};

/**
 * Función principal exportada.
 * @param {Object} prioritizationOutput - Output de Layer 4
 * @param {string} sector - Sector del activo
 * @returns {{ adaptations: Array }}
 */
export function getAdaptations(prioritizationOutput, sector) {
  const { prioritized_risks } = prioritizationOutput;

  // Agrupar por tipo de señal para evitar duplicar medidas
  const seenSignalTypes = new Set();
  const adaptations = [];

  for (const risk of prioritized_risks) {
    const signalType = risk.signal?.signalType;
    if (!signalType || seenSignalTypes.has(signalType)) continue;
    seenSignalTypes.add(signalType);

    const measures = ADAPTATION_CATALOG[signalType] ?? [];

    adaptations.push({
      risk_type:       signalType,
      rank:            risk.rank,
      urgency:         risk.urgency,
      composite_score: risk.composite_score,
      measures,
    });
  }

  return { adaptations };
}
