import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter }   from '../middleware/rateLimiter.js';
import { validate }    from '../middleware/validate.js';
import { aiPromptSchema } from '../validators/ai.js';
import { validateAIOutput } from '../ai/scientificValidator.js';
import { callWithFallback, streamWithFallback } from '../lib/ai/client.js';
import { getPhenomenonDefinitions } from '../../pipeline/orchestration/config-loader.js';

const router = express.Router();

// Master system prompt — enforces scientific guardrails on every Claude call.
const SCIENTIFIC_SYSTEM_PROMPT = `SYSTEM PROMPT — DataRisk Climate Intelligence Platform v2.0

Eres un analista de riesgo climático científico para la plataforma DataRisk Peru.
Tu función es contextualizar y enriquecer análisis de riesgo climático para tomadores
de decisiones ejecutivos, basándote EXCLUSIVAMENTE en los datos del pipeline que recibes.

═══════════════════════════════════════════════════════════════
RESTRICCIONES CIENTÍFICAS (OBLIGATORIAS — no tienen excepciones)
═══════════════════════════════════════════════════════════════

1. PROYECCIONES: Nunca hagas afirmaciones determinísticas sobre el futuro climático.
   ✗ INCORRECTO: "La temperatura subirá 2°C en 2050"
   ✓ CORRECTO: "Bajo SSP5-8.5, los modelos CMIP6 proyectan un incremento de temperatura
     de [valor del pipeline] con confianza [nivel del pipeline]"

2. VALORES NUMÉRICOS: Solo usa números que estén explícitamente en el contexto que recibes.
   ✗ INCORRECTO: inventar pérdidas económicas, porcentajes de reducción de rendimiento
   ✓ CORRECTO: referenciar valores del input context con sus unidades y fuentes

3. CITAS IPCC: Solo cita secciones IPCC incluidas en el contexto. Nunca cites de memoria.
   ✗ INCORRECTO: citar secciones IPCC sin que estén en el contexto
   ✓ CORRECTO: "Según [referencia incluida en el análisis]..."

4. CERTEZA: El nivel de confianza máximo que puedes expresar es el del pipeline.
   Si el pipeline dice confianza 'low', tu texto debe reflejar alta incertidumbre.
   Si el pipeline dice 'high', puedes ser más afirmativo sobre la dirección.

5. FINANZAS: Nunca generes estimados de impacto financiero (pérdidas, costos, ROI).
   ✗ INCORRECTO: "Esto podría costar S/. X millones"
   ✓ CORRECTO: "Esto aumenta la probabilidad de interrupción operacional"

6. EMERGENCY LANGUAGE: No uses lenguaje de emergencia/catástrofe para proyecciones.
   ✗ INCORRECTO: "crisis climática", "catástrofe inminente", "colapso de X"
   ✓ CORRECTO: "riesgo elevado", "mayor probabilidad de", "tendencia al aumento"

7. ENSO: No proyectes ENSO como fenómeno futuro. Solo descríbelo como variabilidad
   histórica observada que modula los riesgos proyectados.

8. END-CENTURY: Si el horizonte es 2060-2079, siempre menciona que son estimaciones
   extrapoladas sin datos CMIP6 directos en la base de datos de la plataforma.

═══════════════════════════════════════════════════════════════
FRASES PROHIBIDAS (validación regex aplicado post-generación)
═══════════════════════════════════════════════════════════════

- "causará" / "will cause"
- "garantiza" / "guarantee"
- "inevitablemente" / "inevitably"
- "con certeza" / "certainly"
- "$[número]" o "S/. [número]" o "USD [número]"
- "SSP[n]-[n.n]" (usar "emisiones moderadas/altas" en su lugar)
- "emergencia climática"
- "sin precedentes" (salvo eventos observados específicos con fecha y fuente)
- "colapso de"
- "catástrofe"

═══════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════════════════════════════

Tu respuesta DEBE ser un JSON con esta estructura:
{
  "contextualSummary": "string — 2-3 oraciones de contexto",
  "operationalImplications": ["bullet 1", "bullet 2", "bullet 3"],
  "adaptationFraming": "string — párrafo sobre dirección de adaptación",
  "disclaimer": "string — nota científica sobre limitaciones del análisis",
  "confidenceStatement": "string — declaración explícita de confianza"
}

No retornes markdown libre. Siempre retorna JSON válido.`;

function userFriendlyError(err) {
  const raw = err?.message ?? String(err);
  if (raw.includes('529') || raw.includes('overloaded') || raw.includes('quota') || raw.includes('402')) {
    return 'OpenRouter: cuota gratuita agotada o sobrecarga. Reintenta más tarde o cambia de modelo.';
  }
  if (raw.includes('401') || raw.includes('invalid') || raw.includes('auth') || raw.includes('permission')) {
    return 'API key de OpenRouter inválida. Genera una nueva en https://openrouter.ai/keys y actualiza ANTHROPIC_API_KEY en .env';
  }
  if (raw.includes('404') || raw.includes('not_found')) {
    return 'Modelo no disponible en OpenRouter. Revisa https://openrouter.ai/models para ver modelos gratuitos.';
  }
  return 'Error al procesar la solicitud de IA. Revisa la consola del servidor para más detalles.';
}

/**
 * Construye el prompt de análisis a partir de datos estructurados del pipeline.
 * Centraliza la lógica en el backend para que el frontend solo envíe datos.
 */
function buildAnalysisPrompt({ narrative, risks, signals, metadata, docContext }) {
  const sector   = metadata?.sector ?? 'retail';
  const summary  = narrative?.executive_summary ?? '';
  const sigCount = signals?.signals_count ?? 0;
  const aiUsed   = (risks ?? []).some(r => r.ai_used) ? ' (impactos enriquecidos con IA)' : '';
  const topRisks = (risks ?? [])
    .filter(r => !r.is_compound)
    .slice(0, 3)
    .map(r => `- ${r.signal?.signalType ?? 'señal'}: ${(r.operational_impacts ?? []).slice(0, 2).join(', ')}`)
    .join('\n');
  const compound = (risks ?? []).find(r => r.is_compound);
  const compoundLine = compound
    ? `\nRiesgo compuesto detectado: ${compound.operational_impacts?.[0] ?? ''}`
    : '';
  const docSection = docContext?.ai_context
    ? `\nDocumentos de referencia disponibles:\n${docContext.ai_context}\n`
    : '';

  return `Sector: ${sector}. Señales climáticas detectadas: ${sigCount}${aiUsed}.

Resumen ejecutivo del pipeline:
${summary}

Riesgos principales:
${topRisks || 'Sin riesgos detectados'}${compoundLine}
${docSection}
Elabora un análisis ejecutivo breve con:
1. Perfil de riesgo compuesto (2-3 oraciones que sinteticen todas las señales, no solo la dominante)
2. Impactos operacionales más probables para el sector (máx. 4 puntos concretos)
3. Acciones de adaptación prioritarias${docContext?.ai_context ? ' — mencionando documentos de referencia si aplica' : ''} (máx. 3 puntos)
Responde en español. Lenguaje ejecutivo claro. No inventes datos fuera del contexto.`;
}

// Auditoría de brecha funcional (D1 §6) + plan de implementación, Fase 6:
// construye el prompt de recomendaciones para el pipeline V2 (server-new/
// routes/climate-v2.js → Stage07Presentation), una forma de datos distinta
// de la de V1 (narrative/risks/signals — Layer3/Layer6) que
// buildAnalysisPrompt() de arriba no puede consumir. Reusa el MISMO
// SCIENTIFIC_SYSTEM_PROMPT, la misma cascada de modelos (callWithFallback) y
// el mismo validador post-generación (validateAIOutput) — la integración es
// de datos, no de guardrails nuevos.
//
// Contrato de "no inventar": este prompt solo incluye texto ya calculado por
// el pipeline (executive_summary, cada phenomenon con su horizon/scenario/
// risk_contribution/recommendation YA resueltos por Stage 07 — ver
// pipeline/stages/07-presentation/index.js) más 1-2 líneas de referencia
// científica por fenómeno (phenomenon-definitions.json scientific_reference)
// para que la IA cite terminología y metodología del propio proyecto en vez
// de inventarla. Nunca se envían canonical_variables crudas ni cálculos
// intermedios — el mismo principio de "la IA ve resultados, no fabrica
// resultados" que ya aplica buildAnalysisPrompt() para V1.
function buildV2AnalysisPrompt({ location, sector, scenarioLabel, executiveSummary, confidenceNote, overallRisk, phenomena, phenomenaNotDetected, recommendations }) {
  const phenomenaLines = (phenomena || []).map(p => {
    const ref = getPhenomenonDefinitionReference(p.name);
    const parts = [
      `- ${p.name} (${p.status}${p.horizon_label ? `, ${p.horizon_label}` : ''}${p.scenario_label ? `, ${p.scenario_label}` : ''}): riesgo ${p.risk_contribution?.level ?? 'no evaluado'}${p.confidence_label ? `, confianza ${p.confidence_label}` : ''}.`,
      p.recommendation?.text ? `  Medida de catálogo: ${p.recommendation.text}` : null,
      ref ? `  Referencia: ${ref}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n');

  const notDetectedLines = (phenomenaNotDetected || [])
    .map(p => `- ${p.name}: ${p.reason}`)
    .join('\n');

  const recsLines = (recommendations || []).map(r => `- ${r}`).join('\n');

  return `Contexto del negocio: sector "${sector || 'no especificado'}", ubicación "${location?.name || 'no especificada'}", escenario climático analizado: ${scenarioLabel}.

Resumen ejecutivo del pipeline (ya calculado, no reinterpretar los valores):
${executiveSummary || 'No disponible.'}

Nota de confianza del pipeline: ${confidenceNote || 'No disponible.'}

Nivel de riesgo general: ${overallRisk?.label ?? 'no evaluado'}.

Fenómenos evaluados con evidencia suficiente:
${phenomenaLines || 'Ninguno.'}

Fenómenos evaluados SIN evidencia suficiente para activarse (no confundir con "riesgo bajo confirmado"):
${notDetectedLines || 'Ninguno registrado.'}

Recomendaciones ya calculadas por el catálogo del pipeline (fenómeno×sector):
${recsLines || 'Ninguna.'}

Con base EXCLUSIVAMENTE en lo anterior, redacta:
1. Un resumen contextual breve (contextualSummary) que conecte los fenómenos detectados con el sector y la ubicación del negocio.
2. Implicancias operacionales (operationalImplications, máx. 4 puntos) — SIEMPRE distinguiendo explícitamente qué es un dato observado por el pipeline, qué es una inferencia razonable, y qué requeriría validación experta específica del activo. No afirmes un impacto real del negocio sin esa distinción.
3. Un párrafo de dirección de adaptación (adaptationFraming) que priorice las medidas de catálogo ya listadas, sin inventar medidas nuevas.
4. Un disclaimer que mencione explícitamente la necesidad de validación con el equipo técnico/experto del negocio, y cualquier fenómeno de la lista "SIN evidencia suficiente" que sea relevante mencionar como incertidumbre, no como ausencia de riesgo.
5. Una declaración de confianza (confidenceStatement) que nunca exceda la confianza ya declarada por el pipeline arriba.

Si la información anterior es insuficiente para generar una recomendación defendible (ej. ningún fenómeno con evidencia suficiente y ningún dato de contexto), dilo explícitamente en contextualSummary en vez de fabricar una recomendación genérica.`;
}

function getPhenomenonDefinitionReference(displayName) {
  try {
    const { phenomena: defs } = getPhenomenonDefinitions();
    // p.name en la respuesta de Stage 07 ya está formateado para presentación
    // (ej. "Ola de calor"), no es la clave interna (ej. "ola_de_calor") — se
    // compara de forma laxa (minúsculas, sin tildes básicas) en vez de
    // mantener un segundo mapeo display→clave que podría desincronizarse de
    // phenomenon-definitions.json display_names.
    const normalized = displayName?.toLowerCase();
    const match = (defs || []).find(d => {
      const label = d.name.replace(/_/g, ' ');
      return normalized?.includes(label) || label.includes(normalized || ' ');
    });
    return match?.scientific_reference || null;
  } catch {
    return null;
  }
}

// POST /api/ai — prompt libre → respuesta JSON validada (no streaming)
router.post('/', requireAuth, aiLimiter, validate(aiPromptSchema), async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt es requerido' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: 'El análisis IA requiere ANTHROPIC_API_KEY configurada. El análisis científico del pipeline está disponible sin necesidad de IA.',
      });
    }

    try {
      const { content: text, model, tier } = await callWithFallback(
        [{ role: 'user', content: prompt }],
        SCIENTIFIC_SYSTEM_PROMPT,
        4096,
      );

      if (!text) {
        console.error('[ai] Respuesta sin texto (tier %d, model %s)', tier, model);
        return res.status(500).json({ error: 'El modelo no generó contenido.' });
      }

      const validation = validateAIOutput(text);

      if (validation.passed) {
        console.log(`[ai] OK — tier ${tier} (${model})`);
        return res.json({ response: text });
      }

      if (validation.autoFixable) {
        console.warn(`[ai] auto-fix (${validation.violations.map(v => v.type).join(', ')}) — tier ${tier}`);
        return res.json({ response: validation.sanitizedText, fallbackUsed: true });
      }

      console.error('[ai] Violaciones no corregibles:', validation.violations.map(v => v.type));
      return res.status(422).json({
        error: 'La respuesta generada no cumple los estándares científicos de la plataforma. Intenta reformular la consulta.',
        violations: validation.violations.map(v => v.type),
      });

    } catch (err) {
      console.error('[ai] Cascade falló:', err?.message?.slice(0, 200));
      return res.status(500).json({ error: userFriendlyError(err) });
    }

  } catch (error) {
    console.error('[ai] Error inesperado:', error?.message ?? error);
    return res.status(500).json({ error: userFriendlyError(error) });
  }
});

// POST /api/ai/analyze — datos estructurados del pipeline → respuesta JSON validada
// Construye el prompt en el backend (evita lógica de prompt en el frontend).
router.post('/analyze', requireAuth, aiLimiter, async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: 'El análisis IA requiere ANTHROPIC_API_KEY. El análisis científico del pipeline está disponible sin IA.',
      });
    }

    const { narrative, risks, signals, metadata, docContext } = req.body;
    if (!narrative && !risks && !signals) {
      return res.status(400).json({ error: 'Se requiere al menos narrative, risks o signals' });
    }

    const prompt = buildAnalysisPrompt({ narrative, risks, signals, metadata, docContext });

    const { content: text, model, tier } = await callWithFallback(
      [{ role: 'user', content: prompt }],
      SCIENTIFIC_SYSTEM_PROMPT,
      4096,
    );

    if (!text) {
      console.error('[ai/analyze] Respuesta sin texto (tier %d, model %s)', tier, model);
      return res.status(500).json({ error: 'El modelo no generó contenido.' });
    }

    const validation = validateAIOutput(text);
    if (validation.passed) return res.json({ response: text });
    if (validation.autoFixable) {
      return res.json({ response: validation.sanitizedText, fallbackUsed: true });
    }
    return res.status(422).json({
      error: 'La respuesta no cumple los estándares científicos. Intenta reformular.',
      violations: validation.violations.map(v => v.type),
    });

  } catch (err) {
    console.error('[ai/analyze] Error:', err?.message?.slice(0, 200));
    return res.status(500).json({ error: userFriendlyError(err) });
  }
});

// POST /api/ai/stream — datos estructurados → respuesta streaming (text/plain chunked)
// El frontend lee con response.body.getReader() y muestra el texto progresivamente.
router.post('/stream', requireAuth, aiLimiter, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'El análisis IA requiere ANTHROPIC_API_KEY configurada.',
    });
  }

  const { narrative, risks, signals, metadata, docContext } = req.body;
  if (!narrative && !risks && !signals) {
    return res.status(400).json({ error: 'Se requiere al menos narrative, risks o signals' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // desactiva buffering en nginx/proxies
  res.flushHeaders();

  try {
    const prompt = buildAnalysisPrompt({ narrative, risks, signals, metadata, docContext });

    await streamWithFallback(
      [{ role: 'user', content: prompt }],
      SCIENTIFIC_SYSTEM_PROMPT,
      4096,
      text => { if (!res.writableEnded) res.write(text); },
    );

    if (!res.writableEnded) res.end();

  } catch (err) {
    console.error('[ai/stream] Error:', err?.message?.slice(0, 200));
    if (!res.writableEnded) res.end();
  }
});

// POST /api/ai/analyze-v2 — respuesta estructurada del pipeline V2
// (Stage07Presentation) → recomendaciones JSON validadas (no streaming).
// Auditoría de brecha funcional (D1 §6): antes de esta ruta, el sistema de
// IA con guardrails (system prompt + validateAIOutput, ya usado por V1)
// existía pero no tenía forma de consumir la respuesta de V2 — 0
// referencias desde climate-lookup-v2/. Esta ruta cierra exactamente esa
// brecha, sin modificar ningún guardrail existente.
router.post('/analyze-v2', requireAuth, aiLimiter, async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: 'El análisis IA requiere ANTHROPIC_API_KEY. El análisis del pipeline V2 está disponible sin IA (executive_summary, recommendations del catálogo).',
      });
    }

    const { location, sector, scenarioLabel, executiveSummary, confidenceNote, overallRisk, phenomena, phenomenaNotDetected, recommendations } = req.body || {};

    // Fase 6, regla explícita: "si no existe suficiente contexto para
    // generar recomendaciones defendibles, no inventes una recomendación —
    // implementa un estado adecuado de información insuficiente." Sin
    // ningún fenómeno evaluado (con o sin evidencia) ni resumen ejecutivo,
    // no hay nada que un LLM pueda contextualizar sin fabricar — se
    // responde 422 con un estado explícito en vez de invocar el modelo.
    const hasContext = !!(executiveSummary || (phenomena && phenomena.length > 0) || (phenomenaNotDetected && phenomenaNotDetected.length > 0));
    if (!hasContext) {
      return res.status(422).json({
        error: 'INSUFFICIENT_CONTEXT',
        message: 'No hay resultados de análisis climático suficientes para generar una recomendación defendible. Ejecuta primero una consulta con resultados antes de solicitar recomendaciones de IA.',
      });
    }

    const prompt = buildV2AnalysisPrompt({ location, sector, scenarioLabel, executiveSummary, confidenceNote, overallRisk, phenomena, phenomenaNotDetected, recommendations });

    const { content: text, model, tier } = await callWithFallback(
      [{ role: 'user', content: prompt }],
      SCIENTIFIC_SYSTEM_PROMPT,
      4096,
    );

    if (!text) {
      console.error('[ai/analyze-v2] Respuesta sin texto (tier %d, model %s)', tier, model);
      return res.status(500).json({ error: 'El modelo no generó contenido.' });
    }

    const validation = validateAIOutput(text);
    if (validation.passed) return res.json({ response: text });
    if (validation.autoFixable) {
      return res.json({ response: validation.sanitizedText, fallbackUsed: true });
    }
    return res.status(422).json({
      error: 'La respuesta no cumple los estándares científicos. Intenta reformular.',
      violations: validation.violations.map(v => v.type),
    });

  } catch (err) {
    console.error('[ai/analyze-v2] Error:', err?.message?.slice(0, 200));
    return res.status(500).json({ error: userFriendlyError(err) });
  }
});

export default router;
