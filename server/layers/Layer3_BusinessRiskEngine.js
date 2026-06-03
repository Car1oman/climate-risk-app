/**
 * Layer 3 — Business Risk Engine
 * Mapea señales climáticas a impactos operacionales por sector,
 * calcula exposure_level, sensitivity_level y financial_impact_range.
 */
import { callWithFallback } from '../lib/ai/client.js';
import { validateAIOutput } from '../ai/scientificValidator.js';

// ─── System prompt para Layer3 — guardrails científicos ─────────────────────
const LAYER3_SYSTEM_PROMPT = `Eres un analista de riesgo climático operacional para la plataforma DataRisk Peru.
Tu única función es generar impactos operativos concretos basándote EXCLUSIVAMENTE en los documentos de referencia que recibes.

RESTRICCIONES OBLIGATORIAS:
- Usa SOLO información presente en los documentos. Nunca inventes datos.
- No uses lenguaje determinístico: "causará", "garantiza", "inevitablemente", "con certeza".
- No menciones cifras financieras ($, USD, S/.).
- No uses lenguaje alarmista: "catástrofe", "colapso", "emergencia climática", "sin precedentes".
- Cada impacto debe ser una frase operativa concreta y accionable (máx 15 palabras).
- Responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código.`;

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
  // Deslizamiento: movimiento de masa en ladera — daño estructural, bloqueo de accesos, riesgo geotécnico
  landslide_risk: {
    retail:         ['Riesgo estructural en instalaciones por inestabilidad de ladera', 'Bloqueo de accesos y rutas logísticas', 'Daño a infraestructura por movimiento de masa', 'Riesgo de cierre temporal por inestabilidad del terreno'],
    educacion:      ['Riesgo estructural en instalaciones educativas en zonas de ladera', 'Interrupción prolongada del servicio educativo por daño a infraestructura'],
    salud:          ['Acceso a centros de salud comprometido por bloqueo de vías', 'Daño a infraestructura crítica de salud', 'Riesgo de interrupción de servicios esenciales'],
    entretenimiento:['Cierre preventivo por riesgo geotécnico en instalaciones', 'Daño a infraestructura en zonas de ladera'],
    otros:          ['Riesgo geotécnico para infraestructura en zonas de pendiente', 'Bloqueo de acceso operativo por movimiento de masa'],
  },
  // Huayco (flujo de detritos): lodo y rocas en movimiento — bloqueo de accesos, daño por impacto y arrastre
  huayco_risk: {
    retail:         ['Bloqueo de accesos por depósito de lodo y rocas — interrupción logística severa', 'Daño estructural a instalaciones por impacto y arrastre de flujo de detritos', 'Pérdida de inventario por ingreso de material lodoso', 'Interrupción prolongada de servicios por limpieza y rehabilitación de vías'],
    educacion:      ['Daño a infraestructura educativa por impacto y arrastre de detritos', 'Interrupción prolongada del servicio educativo por bloqueo de accesos y rehabilitación'],
    salud:          ['Acceso a centros de salud bloqueado por depósito de lodo y material sólido', 'Daño a infraestructura crítica por fuerza de impacto del flujo de detritos', 'Interrupción de servicios esenciales por inhabilitación de vías de acceso'],
    entretenimiento:['Cierre preventivo y correctivo por daño de flujo de detritos a instalaciones', 'Bloqueo de accesos al público por depósito de lodo y escombros'],
    otros:          ['Interrupción operativa por bloqueo de acceso ante flujo de detritos', 'Daño a infraestructura por arrastre de material sólido y lodoso'],
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
  // Reparación geotécnica + estructural supera costos de inundación; rangos ~20% sobre flood_risk
  landslide_risk: {
    retail:         { min_usd: 120_000, max_usd: 550_000 },
    educacion:      { min_usd: 60_000,  max_usd: 220_000 },
    salud:          { min_usd: 180_000, max_usd: 650_000 },
    entretenimiento:{ min_usd: 90_000,  max_usd: 330_000 },
    otros:          { min_usd: 50_000,  max_usd: 180_000 },
  },
  // Huayco supera costos de landslide (~10-15%) por limpieza de lodo+rocas y rehabilitación de vías bloqueadas
  huayco_risk: {
    retail:         { min_usd: 130_000, max_usd: 600_000 },
    educacion:      { min_usd: 65_000,  max_usd: 240_000 },
    salud:          { min_usd: 200_000, max_usd: 700_000 },
    entretenimiento:{ min_usd: 100_000, max_usd: 360_000 },
    otros:          { min_usd: 55_000,  max_usd: 200_000 },
  },
  tropical_nights: {
    retail:         { min_usd: 25_000,  max_usd: 80_000  },
    educacion:      { min_usd: 8_000,   max_usd: 25_000  },
    salud:          { min_usd: 20_000,  max_usd: 70_000  },
    entretenimiento:{ min_usd: 15_000,  max_usd: 50_000  },
    otros:          { min_usd: 5_000,   max_usd: 20_000  },
  },
};

// ─── Impactos de riesgos compuestos (co-ocurrencia de señales) ───────────────
// Claves en orden lexicográfico (sort) para lookup determinístico.
// Solo las combinaciones más comunes y con sinergia real de impactos.
const COMPOUND_RISK_MAP = {
  'drought|extreme_heat': {
    retail:         ['Doble presión: HVAC sobrecargado por calor + restricción hídrica simultánea', 'Riesgo crítico en cadena frío: temperatura extrema y escasez de agua para enfriamiento', 'Presión sobre proveedores agrícolas vía dos vectores independientes (temperatura + déficit hídrico)'],
    salud:          ['Cadena frío crítica bajo estrés combinado: calor extremo + restricción hídrica para refrigeración', 'Presión amplificada sobre pacientes vulnerables por calor y posible escasez de agua potable'],
    educacion:      ['Condiciones de aprendizaje degradadas por calor + posible restricción de servicios sanitarios'],
    entretenimiento:['Cancelación forzada de operaciones por confluencia de calor extremo y restricción hídrica'],
    otros:          ['Doble presión operativa energética (calor) e hídrica (sequía) con demanda pico simultánea'],
  },
  'extreme_rain|flood_risk': {
    retail:         ['Convergencia de riesgo: probabilidad de inundación base alta + evento de lluvia extrema superpuesto', 'Interrupción logística compuesta: accesos bloqueados por lluvia sobre sitio ya expuesto a inundación', 'Daño acumulado probable: lluvia extrema actúa sobre activo con exposición de inundación preexistente'],
    salud:          ['Interrupción crítica de servicios de salud amplificada por confluencia de lluvia extrema e inundación'],
    otros:          ['Riesgo de inundación amplificado por co-ocurrencia de evento de lluvia extrema sobre sitio con exposición base alta'],
  },
  'extreme_heat|flood_risk': {
    retail:         ['Estrés operativo cruzado: personal afectado por calor extremo mientras instalaciones enfrentan riesgo de inundación', 'HVAC bajo presión térmica máxima mientras drenaje e infraestructura enfrentan probabilidad de inundación'],
    otros:          ['Exposición compuesta: calor extremo y riesgo de inundación actúan simultáneamente sobre el mismo activo'],
  },
  'drought|flood_risk': {
    retail:         ['Variabilidad hídrica extrema: riesgo de inundación estacional + períodos de sequía → cadena de suministro inestable'],
    otros:          ['Régimen hídrico inestable: alternancia entre eventos de inundación y períodos de sequía amplifica la incertidumbre operativa'],
  },
};

/**
 * Retorna impactos compuestos para una combinación de señales co-ocurrentes.
 * Itera sobre todos los pares posibles y devuelve el primero con match en el catálogo.
 */
function getCompoundRiskImpact(signalTypes, sectorKey) {
  const sorted = [...signalTypes].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const key = `${sorted[i]}|${sorted[j]}`;
      const entry = COMPOUND_RISK_MAP[key];
      if (entry) {
        const impacts = entry[sectorKey] ?? entry.otros;
        if (impacts) return { key, impacts };
      }
    }
  }
  return null;
}

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
    let ai_used = false;
    let ai_fallback_reason = null;

    if (hasDocs) {
      try {
        const aiResult = await generateImpactsViaAI(signal, sectorKey, docContext);
        impacts = aiResult.impacts;
        provenanceLabel = aiResult.provenance;
        ai_used = true;
      } catch (err) {
        impacts = OPERATIONAL_IMPACTS[signal.signalType]?.[sectorKey]
               ?? OPERATIONAL_IMPACTS[signal.signalType]?.otros
               ?? ['Impacto operacional no especificado'];
        ai_fallback_reason = err?.message ?? 'AI generation failed';
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
      ai_used,
      ...(ai_fallback_reason && { ai_fallback_reason }),
    });
  }

  // Síntesis de riesgo compuesto cuando hay 2+ señales co-ocurrentes
  if (signals.length >= 2) {
    const compound = getCompoundRiskImpact(signals.map(s => s.signalType), sectorKey);
    if (compound) {
      risks.push({
        signal:                 { signalType: 'compound', compound_signals: signals.map(s => s.signalType) },
        source_traceability:    null,
        operational_impacts:    compound.impacts,
        exposure_level:         'alto',
        sensitivity_level:      calcSensitivityLevel(sectorKey, asset_type),
        financial_impact_range: { min_usd: 0, max_usd: 0 },
        provenance:             `Síntesis de riesgo compuesto: combinación ${compound.key.replace('|', ' + ')}`,
        ai_used:                false,
        is_compound:            true,
      });
    }
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
  const deltaDesc   = signal.delta != null ? ` (delta: +${signal.delta.toFixed(1)})` : '';
  const docSection  = docContext?.ai_context ?? '';

  const prompt = `Basándote exclusivamente en los documentos de referencia disponibles, genera impactos operativos concretos para el sector "${sectorKey}" ante la señal climática "${signalLabel}"${deltaDesc} (horizonte: ${horizon}).

Documentos de referencia:
${docSection}

Responde ÚNICAMENTE con este JSON (sin markdown):
{
  "impacts": ["impacto 1", "impacto 2", "impacto 3"],
  "provenance": "Generado a partir de documentos de referencia: [nombre_docs]"
}

Máximo 4 impactos. Cada impacto: frase operativa específica y accionable.`;

  const { content: rawContent } = await callWithFallback(
    [{ role: 'user', content: prompt }],
    LAYER3_SYSTEM_PROMPT,
    1024,
  );
  const rawText = rawContent || '{}';

  // Strip potential markdown fencing (```json ... ```)
  const text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  const validation = validateAIOutput(text);
  if (!validation.passed && !validation.autoFixable) {
    throw new Error(`AI output violates guardrails: ${validation.violations.map(v => v.type).join(', ')}`);
  }
  const safeText = validation.autoFixable ? (validation.sanitizedText ?? text) : text;

  let parsed;
  try {
    parsed = JSON.parse(safeText);
  } catch {
    throw new Error('AI returned non-parseable JSON');
  }

  if (!Array.isArray(parsed.impacts) || parsed.impacts.length === 0) throw new Error('AI returned empty impacts');

  return {
    impacts:    parsed.impacts.slice(0, 4),
    provenance: parsed.provenance ?? 'Generado con IA a partir de documentos de referencia',
  };
}
