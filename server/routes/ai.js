import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter }   from '../middleware/rateLimiter.js';
import { validate }    from '../middleware/validate.js';
import { aiPromptSchema } from '../validators/ai.js';
import { validateAIOutput } from '../ai/scientificValidator.js';

const router = express.Router();

let anthropic = null;

// Modelo gratuito vía OpenRouter — ruteo automático al mejor modelo free disponible.
// Cambia a un slug específico (e.g. 'qwen/qwen3-coder:free') si prefieres uno fijo.
const MODEL = 'openrouter/free';

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

    if (!anthropic) {
      anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    try {
      const result = await anthropic.messages.create({
        model: MODEL,
        system: SCIENTIFIC_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      });

      const text = result.content[0].text;

      if (!text) {
        console.error('[ai] Claude devolvió respuesta sin texto');
        return res.status(500).json({ error: 'El modelo no generó contenido.' });
      }

      const validation = validateAIOutput(text);

      if (validation.passed) {
        console.log('[ai] Respuesta generada con Claude — validación OK');
        return res.json({ response: text });
      }

      if (validation.autoFixable) {
        console.warn(`[ai] Claude — auto-fix aplicado (${validation.violations.map(v => v.type).join(', ')})`);
        return res.json({ response: validation.sanitizedText, fallbackUsed: true });
      }

      console.error('[ai] Claude — violaciones no auto-corregibles:', validation.violations.map(v => v.type));
      return res.status(422).json({
        error: 'La respuesta generada no cumple los estándares científicos de la plataforma. Intenta reformular la consulta.',
        violations: validation.violations.map(v => v.type),
      });

    } catch (err) {
      console.error('[ai] Claude falló:', err?.message?.slice(0, 200));
      return res.status(500).json({ error: userFriendlyError(err) });
    }

  } catch (error) {
    console.error('[ai] Error inesperado:', error?.message ?? error);
    return res.status(500).json({ error: userFriendlyError(error) });
  }
});

export default router;
