/**
 * Layer 5 — Adaptation Engine
 * Mapea cada señal contextual a medidas de adaptación concretas
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

  landslide_risk: [
    {
      nombre:                    'Plan de evacuación y rutas alternativas de acceso',
      descripcion:               'Protocolo documentado con rutas de evacuación alternativas, roles y responsabilidades para activación ante alerta de deslizamiento o bloqueo de vías',
      donde_impacta:             'Operaciones, logística, recursos humanos',
      horizonte_implementacion:  'inmediato',
      costo_estimado_rango:      { min_usd: 2_000, max_usd: 8_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Monitoreo geotécnico de taludes críticos',
      descripcion:               'Instalación de inclinómetros y piezómetros en taludes adyacentes a la instalación para detección temprana de movimiento de terreno',
      donde_impacta:             'Infraestructura, seguridad operativa',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 15_000, max_usd: 60_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Gestión de drenaje superficial en ladera',
      descripcion:               'Construcción de cunetas de coronación y zanjas interceptoras para desviar escorrentía que satura laderas y reduce la cohesión del suelo',
      donde_impacta:             'Infraestructura, accesos, taludes adyacentes',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 20_000, max_usd: 80_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Revegetación y bioestabilización de taludes',
      descripcion:               'Plantación de especies nativas de raíz profunda y mantas vegetales para incrementar cohesión del suelo y reducir erosión superficial en laderas',
      donde_impacta:             'Perímetro del predio, taludes de acceso',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 10_000, max_usd: 40_000 },
      efectividad:               'media',
    },
  ],

  huayco_risk: [
    {
      nombre:                    'Sistema de alerta temprana por flujo de detritos',
      descripcion:               'Instalación de pluviómetros y sensores de nivel en quebradas aguas arriba para detectar umbrales críticos de lluvia y activar alertas de evacuación antes de que el flujo alcance la instalación',
      donde_impacta:             'Operaciones, seguridad del personal, logística',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 8_000, max_usd: 30_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Barreras de retención de material de arrastre',
      descripcion:               'Construcción de diques de gaviones o muros de concreto ciclópeo en la salida de quebradas para retener rocas, lodo y debris antes de que impacten la infraestructura del activo',
      donde_impacta:             'Infraestructura perimetral, accesos, estacionamientos',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 40_000, max_usd: 150_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Encauzamiento y canalización de flujos de detritos',
      descripcion:               'Diseño y construcción de canales de derivación que redirijan flujos de detritos y lodo hacia zonas de disposición segura, evitando que el material arrastrado alcance la instalación',
      donde_impacta:             'Infraestructura, accesos, perímetro del predio',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 60_000, max_usd: 200_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Limpieza preventiva de quebradas y control de material arrastrado',
      descripcion:               'Programa anual de remoción de sedimentos, rocas y vegetación acumulada en quebradas adyacentes durante temporada seca, reduciendo el volumen de material disponible para movilización en eventos de lluvia intensa',
      donde_impacta:             'Perímetro del predio, rutas de acceso',
      horizonte_implementacion:  'inmediato',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 20_000 },
      efectividad:               'media',
    },
  ],

  tropical_nights: [
    {
      nombre:                    'Climatización nocturna eficiente',
      descripcion:               'Programación horaria de HVAC para corte de temperatura nocturno; reducción de hasta 30% en costo energético nocturno',
      donde_impacta:             'Cadena frío, almacenes, tiendas',
      horizonte_implementacion:  'inmediato',
      costo_estimado_rango:      { min_usd: 2_000, max_usd: 8_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Monitoreo de cadena frío 24/7',
      descripcion:               'Sensores IoT con alertas automáticas para detectar rupturas de cadena frío durante horas nocturnas de alta temperatura',
      donde_impacta:             'Cadena frío, almacenes refrigerados, farmacias',
      horizonte_implementacion:  'corto',
      costo_estimado_rango:      { min_usd: 5_000, max_usd: 18_000 },
      efectividad:               'alta',
    },
    {
      nombre:                    'Ventilación natural y diseño bioclimático',
      descripcion:               'Auditoría de ventilación en instalaciones para aprovechar flujo de aire natural y reducir carga térmica nocturna',
      donde_impacta:             'Infraestructura física, confort laboral',
      horizonte_implementacion:  'mediano',
      costo_estimado_rango:      { min_usd: 8_000, max_usd: 30_000 },
      efectividad:               'media',
    },
  ],
};

import { callWithFallback } from '../lib/ai/client.js';
import { validateAIOutput } from '../ai/scientificValidator.js';

const LAYER5_SYSTEM_PROMPT = `Eres un experto en adaptación al cambio climático para operaciones empresariales en Perú.
Tu tarea es proponer medidas de adaptación adicionales basadas EXCLUSIVAMENTE en los documentos de referencia que recibes.

REGLAS OBLIGATORIAS:
- Solo usa información presente en los documentos. No inventes datos.
- No menciones cifras financieras exactas sin respaldo documental ($, USD, S/.).
- No uses lenguaje determinístico ni alarmista.
- Responde ÚNICAMENTE con JSON válido (sin markdown, sin bloques de código).
- Las medidas deben ser concretas, accionables y específicas al sector.`;

/**
 * Enriquece el catálogo de adaptaciones con 1-2 medidas contextuales generadas por IA
 * basadas en los documentos de referencia disponibles. No bloqueante: si falla, retorna
 * el catálogo original sin modificar.
 *
 * @param {Object} adaptationOutput - Salida de getAdaptations()
 * @param {Object} signalOutput     - Salida de detectSignals()
 * @param {string} sector           - Sector del activo
 * @param {Object} docContext       - Contexto documental con ai_context
 * @returns {Promise<Object>}
 */
export async function enrichAdaptationsWithAI(adaptationOutput, signalOutput, sector, docContext) {
  if (!process.env.ANTHROPIC_API_KEY || !docContext?.ai_context) return adaptationOutput;
  const signals = signalOutput?.signals ?? [];
  if (signals.length === 0) return adaptationOutput;

  const signalDesc = signals
    .slice(0, 3)
    .map(s => `${s.signalType}${s.delta != null ? ` (delta +${s.delta.toFixed(1)})` : ''} en ${s.horizon ?? 'corto_plazo'}`)
    .join(', ');

  const prompt = `Sector: "${sector}". Señales climáticas detectadas: ${signalDesc}.

Documentos de referencia disponibles:
${docContext.ai_context}

Propón 2 medidas de adaptación adicionales específicas al contexto documental.
Responde ÚNICAMENTE con JSON (sin markdown):
{
  "measures": [
    {
      "nombre": "Nombre concreto de la medida",
      "descripcion": "Descripción operativa de 1-2 oraciones",
      "donde_impacta": "Área o proceso afectado",
      "horizonte_implementacion": "inmediato|corto|mediano|largo",
      "efectividad": "alta|media|baja",
      "is_ai_generated": true,
      "provenance": "generado desde documentos de referencia"
    }
  ]
}`;

  try {
    const { content: rawContent } = await callWithFallback(
      [{ role: 'user', content: prompt }],
      LAYER5_SYSTEM_PROMPT,
      800,
    );
    const rawText = rawContent || '{}';
    const text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    const validation = validateAIOutput(text);
    if (!validation.passed && !validation.autoFixable) return adaptationOutput;
    const safeText = validation.autoFixable ? (validation.sanitizedText ?? text) : text;

    const parsed = JSON.parse(safeText);
    if (!Array.isArray(parsed.measures) || parsed.measures.length === 0) return adaptationOutput;

    const newMeasures = parsed.measures.slice(0, 2);
    const enriched = { ...adaptationOutput };
    if (enriched.adaptations.length > 0) {
      enriched.adaptations = [
        { ...enriched.adaptations[0], measures: [...enriched.adaptations[0].measures, ...newMeasures] },
        ...enriched.adaptations.slice(1),
      ];
    }
    return enriched;
  } catch {
    return adaptationOutput;
  }
}

/**
 * Función principal exportada.
 * @param {Object} contextualRiskOutput - Output descriptivo de interpretacion contextual
 * @param {string} sector - Sector del activo
 * @returns {{ adaptations: Array }}
 */
export function getAdaptations(contextualRiskOutput, sector) {
  const risks = contextualRiskOutput?.risks ?? [];

  // Agrupar por tipo de señal para evitar duplicar medidas
  const seenSignalTypes = new Set();
  const adaptations = [];

  for (const risk of risks) {
    const signalType = risk.signal?.signalType;
    if (!signalType || seenSignalTypes.has(signalType)) continue;
    seenSignalTypes.add(signalType);

    const measures = ADAPTATION_CATALOG[signalType] ?? [];

    adaptations.push({
      risk_type:       signalType,
      confidence:      risk.confidence ?? risk.signal?.confidence ?? 'low',
      evidence:        risk.evidence ?? null,
      scenario:        risk.scenario ?? null,
      provenance:      risk.provenance ?? null,
      uncertainty:     risk.uncertainty ?? null,
      measures,
    });
  }

  return { adaptations };
}
