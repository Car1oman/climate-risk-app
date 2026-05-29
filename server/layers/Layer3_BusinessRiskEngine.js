/**
 * Layer 3 — Business Risk Engine
 * Mapea señales climáticas a impactos operacionales por sector,
 * calcula exposure_level, sensitivity_level y financial_impact_range.
 */
import Anthropic from '@anthropic-ai/sdk';

let _anthropic = null;
function getAnthropicClient() {
  if (_anthropic) return _anthropic;
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY };
  if (process.env.ANTHROPIC_BASE_URL) opts.baseURL = process.env.ANTHROPIC_BASE_URL;
  _anthropic = new Anthropic(opts);
  return _anthropic;
}

// ─── Tabla de impactos operacionales por señal × sector ─────────────────────
// Basada en catálogo documental de análisis de riesgo climático para Intercorp Retail
const OPERATIONAL_IMPACTS = {
  extreme_heat: {
    retail:         ['↑ consumo energético refrigeración', 'Riesgo productos perecederos', 'Confort cliente reducido', 'Presión sobre HVAC'],
    educacion:      ['Confort aulas comprometido', 'Cancelación de clases', 'Riesgo salud estudiantes'],
    salud:          ['Presión cadena frío medicamentos', 'Riesgo para pacientes vulnerables', '↑ demanda servicios de urgencia'],
    entretenimiento:['Reducción afluencia en espacios abiertos', '↑ costos climatización', 'Cancelación de eventos'],
    otros:          ['↑ costos operativos energéticos', 'Riesgo confort y productividad laboral'],
  },
  severe_heat: {
    retail:         ['Riesgo crítico cadena frío', 'Posible cierre temporal por normativa', '↑ costos energéticos extremos'],
    educacion:      ['Suspensión de clases obligatoria', 'Riesgo salud crítico para menores'],
    salud:          ['Colapso potencial cadena frío crítica', 'Incremento mortalidad pacientes de riesgo'],
    entretenimiento:['Cierre de instalaciones al aire libre', 'Cancelación masiva de eventos'],
    otros:          ['Riesgo laboral crítico', 'Posible paralización operativa'],
  },
  drought: {
    retail:         ['Presión hídrica en operaciones', 'Riesgo cadena suministro agrícola', '↑ costos insumos alimentarios'],
    educacion:      ['Restricción uso de agua en instalaciones', 'Impacto en servicios sanitarios'],
    salud:          ['Riesgo esterilización y limpieza clínica', 'Presión sobre suministro de agua potable'],
    entretenimiento:['Restricción uso de agua en instalaciones recreativas', 'Impacto en áreas verdes'],
    otros:          ['Restricción hídrica operativa', 'Riesgo en procesos que requieren agua'],
  },
  extreme_rain: {
    retail:         ['Inundación de almacenes y tiendas', 'Interrupción logística', 'Daño a inventario', 'Daños estructurales más frecuentes y costosos'],
    educacion:      ['Daño a infraestructura educativa', 'Suspensión de clases', 'Riesgo acceso a instalaciones'],
    salud:          ['Interrupción acceso a centros de salud', 'Daño a equipos médicos', 'Riesgo contaminación'],
    entretenimiento:['Cancelación de eventos', 'Daño a instalaciones', 'Riesgo para visitantes'],
    otros:          ['Interrupción operativa por lluvia extrema', 'Daño a infraestructura'],
  },
  temp_increase: {
    retail:         ['↑ costos energéticos sostenidos', 'Cambio en patrones de consumo', 'Presión sobre cadena frío'],
    educacion:      ['Necesidad de climatización permanente', '↑ costos operativos'],
    salud:          ['↑ demanda servicios por enfermedades relacionadas al calor', 'Presión sobre cadena frío'],
    entretenimiento:['Cambio en temporadas de demanda', '↑ costos climatización'],
    otros:          ['↑ costos energéticos estructurales', 'Adaptación de procesos operativos'],
  },
  flood_risk: {
    retail:         ['Interrupción operativa por inundación', 'Daño a infraestructura y equipos', 'Riesgo logístico y de acceso', 'Daños estructurales más frecuentes y costosos'],
    educacion:      ['Daño estructural a instalaciones', 'Interrupción del servicio educativo'],
    salud:          ['Interrupción crítica de servicios de salud', 'Daño a equipos médicos de alto valor'],
    entretenimiento:['Daño a instalaciones recreativas', 'Cancelación prolongada de operaciones'],
    otros:          ['Interrupción operativa', 'Daño a infraestructura', 'Riesgo logístico'],
  },
  // Noches tropicales: afectan confort nocturno, cadena frío y productividad laboral
  tropical_nights: {
    retail:         ['↑ carga HVAC nocturna y costos energéticos', 'Riesgo cadena frío en horario nocturno', 'Disminución confort del personal'],
    educacion:      ['Disminución calidad del sueño y rendimiento estudiantil', '↑ costos climatización nocturna'],
    salud:          ['Riesgo para pacientes hospitalizados durante la noche', '↑ demanda de urgencias por estrés térmico'],
    entretenimiento:['Reducción de afluencia en eventos nocturnos', '↑ costos climatización instalaciones'],
    otros:          ['↑ costos energéticos nocturnos', 'Disminución productividad laboral por calor acumulado'],
  },
};

// ─── Rangos de impacto financiero (USD/año) por señal × sector ───────────────
// Estimaciones basadas en benchmarks de riesgo climático para retail latinoamericano
// Fuente: TCFD Guidance for Retail Sector + análisis interno Intercorp
const FINANCIAL_RANGES = {
  extreme_heat: {
    retail:         { min_usd: 85_000,  max_usd: 210_000 },
    educacion:      { min_usd: 20_000,  max_usd: 60_000  },
    salud:          { min_usd: 50_000,  max_usd: 150_000 },
    entretenimiento:{ min_usd: 30_000,  max_usd: 90_000  },
    otros:          { min_usd: 15_000,  max_usd: 50_000  },
  },
  severe_heat: {
    retail:         { min_usd: 150_000, max_usd: 400_000 },
    educacion:      { min_usd: 40_000,  max_usd: 100_000 },
    salud:          { min_usd: 100_000, max_usd: 300_000 },
    entretenimiento:{ min_usd: 60_000,  max_usd: 180_000 },
    otros:          { min_usd: 30_000,  max_usd: 100_000 },
  },
  drought: {
    retail:         { min_usd: 40_000,  max_usd: 120_000 },
    educacion:      { min_usd: 10_000,  max_usd: 30_000  },
    salud:          { min_usd: 30_000,  max_usd: 80_000  },
    entretenimiento:{ min_usd: 15_000,  max_usd: 45_000  },
    otros:          { min_usd: 10_000,  max_usd: 35_000  },
  },
  extreme_rain: {
    retail:         { min_usd: 60_000,  max_usd: 200_000 },
    educacion:      { min_usd: 25_000,  max_usd: 80_000  },
    salud:          { min_usd: 80_000,  max_usd: 250_000 },
    entretenimiento:{ min_usd: 40_000,  max_usd: 120_000 },
    otros:          { min_usd: 20_000,  max_usd: 70_000  },
  },
  temp_increase: {
    retail:         { min_usd: 30_000,  max_usd: 90_000  },
    educacion:      { min_usd: 10_000,  max_usd: 30_000  },
    salud:          { min_usd: 20_000,  max_usd: 60_000  },
    entretenimiento:{ min_usd: 15_000,  max_usd: 45_000  },
    otros:          { min_usd: 8_000,   max_usd: 25_000  },
  },
  flood_risk: {
    retail:         { min_usd: 100_000, max_usd: 500_000 },
    educacion:      { min_usd: 50_000,  max_usd: 200_000 },
    salud:          { min_usd: 150_000, max_usd: 600_000 },
    entretenimiento:{ min_usd: 80_000,  max_usd: 300_000 },
    otros:          { min_usd: 40_000,  max_usd: 150_000 },
  },
  tropical_nights: {
    retail:         { min_usd: 25_000,  max_usd: 80_000  },
    educacion:      { min_usd: 8_000,   max_usd: 25_000  },
    salud:          { min_usd: 20_000,  max_usd: 70_000  },
    entretenimiento:{ min_usd: 15_000,  max_usd: 50_000  },
    otros:          { min_usd: 5_000,   max_usd: 20_000  },
  },
};

// ─── Sensibilidad por sector ─────────────────────────────────────────────────
// Refleja cuán dependiente es el sector de condiciones climáticas estables
const SECTOR_SENSITIVITY = {
  retail:         'alto',    // cadena frío, logística, confort cliente
  salud:          'alto',    // cadena frío crítica, pacientes vulnerables
  educacion:      'medio',   // confort, acceso, infraestructura
  entretenimiento:'medio',   // afluencia, eventos al aire libre
  otros:          'bajo',
};

// ─── Sensibilidad adicional por tipo de activo ───────────────────────────────
const ASSET_TYPE_SENSITIVITY_BOOST = {
  supermercado:   'alto',
  farmacia:       'alto',
  hospital:       'alto',
  clinica:        'alto',
  almacen:        'medio',
  tienda:         'medio',
  colegio:        'medio',
  universidad:    'medio',
  cine:           'bajo',
  restaurante:    'medio',
};

/**
 * Normaliza el nombre del sector a una clave interna.
 */
function normalizeSector(sector) {
  const s = (sector || '').toLowerCase().trim();
  if (s.includes('retail') || s.includes('supermercado') || s.includes('tienda')) return 'retail';
  if (s.includes('salud') || s.includes('hospital') || s.includes('clinica') || s.includes('farmacia')) return 'salud';
  if (s.includes('educ') || s.includes('colegio') || s.includes('universidad')) return 'educacion';
  if (s.includes('entret') || s.includes('cine') || s.includes('recreac')) return 'entretenimiento';
  return 'otros';
}

/**
 * Calcula exposure_level basado en cantidad y tipo de señales detectadas.
 */
function calcExposureLevel(signals) {
  const criticalSignals = ['severe_heat', 'flood_risk'];
  const hasCritical = signals.some(s => criticalSignals.includes(s.signalType));
  if (hasCritical || signals.length >= 3) return 'alto';
  if (signals.length >= 1) return 'medio';
  return 'bajo';
}

/**
 * Calcula sensitivity_level combinando sector y asset_type.
 */
function calcSensitivityLevel(sectorKey, asset_type) {
  const sectorSens = SECTOR_SENSITIVITY[sectorKey] ?? 'bajo';
  const assetSens  = ASSET_TYPE_SENSITIVITY_BOOST[(asset_type || '').toLowerCase()] ?? null;

  // Si el activo tiene sensibilidad 'alto', prevalece
  if (assetSens === 'alto') return 'alto';
  return sectorSens;
}

/**
 * Función principal exportada.
 * @param {Object} signalOutput - Output de Layer 2
 * @param {Object} params - { sector, asset_type?, docContext? }
 * @returns {Promise<{ risks: Array, overall_exposure: string }>}
 */
export async function assessBusinessRisk(signalOutput, { sector, asset_type = null, docContext = null }) {
  const { signals } = signalOutput;
  const sectorKey = normalizeSector(sector);

  const hasDocs = docContext?.by_category?.impacto?.length > 0
               || docContext?.by_category?.riesgo?.length > 0;

  const risks = [];
  for (const signal of signals) {
    let impacts;
    let provenanceLabel = 'Catálogo interno de referencia';

    if (hasDocs) {
      try {
        const aiResult = await generateImpactsViaAI(signal, sectorKey, docContext);
        impacts = aiResult.impacts;
        provenanceLabel = aiResult.provenance;
      } catch {
        impacts = OPERATIONAL_IMPACTS[signal.signalType]?.[sectorKey]
               ?? OPERATIONAL_IMPACTS[signal.signalType]?.otros
               ?? ['Impacto operacional no especificado'];
      }
    } else {
      impacts = OPERATIONAL_IMPACTS[signal.signalType]?.[sectorKey]
             ?? OPERATIONAL_IMPACTS[signal.signalType]?.otros
             ?? ['Impacto operacional no especificado'];
    }

    const financialRange = FINANCIAL_RANGES[signal.signalType]?.[sectorKey]
      ?? FINANCIAL_RANGES[signal.signalType]?.otros
      ?? { min_usd: 0, max_usd: 0 };

    risks.push({
      signal,
      source_traceability:    signal.source_traceability ?? null,
      operational_impacts:    impacts,
      exposure_level:         calcExposureLevel([signal]),
      sensitivity_level:      calcSensitivityLevel(sectorKey, asset_type),
      financial_impact_range: financialRange,
      provenance:             provenanceLabel,
    });
  }

  return {
    risks,
    overall_exposure: calcExposureLevel(signals),
    sector_key:       sectorKey,
  };
}

async function generateImpactsViaAI(signal, sectorKey, docContext) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const signalType  = signal.signalType  ?? 'unknown';
  const signalLabel = signal.signalLabel ?? signalType;
  const horizon     = signal.horizon     ?? 'corto_plazo';
  const docSection  = docContext?.ai_context ?? '';

  const prompt = `Eres un analista de riesgos climáticos. Basándote exclusivamente en los documentos de referencia disponibles, genera impactos operativos concretos para el sector "${sectorKey}" ante la señal climática "${signalLabel}" (horizonte: ${horizon}).
Documentos de referencia:
${docSection}
Formato de respuesta (JSON válido):
{
  "impacts": ["impacto 1", "impacto 2", "impacto 3"],
  "provenance": "Generado a partir de documentos de referencia: [nombre_docs]"
}
Responde SOLO con el JSON. Máximo 4 impactos. Cada impacto debe ser una frase específica y accionable, sin jerga técnica científica.`;

  const client = getAnthropicClient();
  const model  = process.env.AI_MODEL || 'openrouter/free';

  const result = await client.messages.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 512,
  });

  const text = result.content.find(b => b.type === 'text')?.text ?? '{}';
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed.impacts) || parsed.impacts.length === 0) throw new Error('AI returned empty impacts');

  return {
    impacts:    parsed.impacts.slice(0, 4),
    provenance: parsed.provenance ?? 'Generado con IA a partir de documentos de referencia',
  };
}
