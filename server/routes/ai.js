import express from 'express';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();

// Lazy-initialized at request time so dotenv has already run.
let ai = null;

// Models to try in order — first available wins.
const MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash'];

function userFriendlyError(err) {
  const raw = err?.message ?? String(err);
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota')) {
    return 'Cuota de la API de Gemini agotada. Verifica el billing en https://aistudio.google.com o reemplaza GEMINI_API_KEY en .env con una nueva clave gratuita.';
  }
  if (raw.includes('403') || raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return 'API key de Gemini inválida o sin permisos. Genera una nueva en https://aistudio.google.com y actualiza GEMINI_API_KEY en .env';
  }
  if (raw.includes('404') || raw.includes('not found') || raw.includes('MODEL_NOT_FOUND')) {
    return 'Modelo de IA no disponible para esta API key. Verifica el acceso en Google AI Studio.';
  }
  return 'Error al procesar la solicitud de IA. Revisa la consola del servidor para más detalles.';
}

router.post('/', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt es requerido' });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn('[ai] GEMINI_API_KEY no configurada — respuesta de demostración');
      return res.json({
        response: `**Modo demostración** — Para análisis real, agrega GEMINI_API_KEY en .env (obtén una gratis en https://aistudio.google.com).

**Perfil de riesgo:** Esta ubicación presenta señales climáticas relevantes. Las proyecciones CMIP6 bajo SSP5-8.5 indican incrementos en días de calor extremo y variabilidad en precipitación hacia 2040–2059.

**Impactos operacionales más probables:**
- Mayor consumo energético por refrigeración y climatización (HVAC)
- Disrupciones en cadena de suministro durante eventos de precipitación extrema
- Presión sobre trabajadores en turnos sin climatización adecuada
- Mayor frecuencia de cierres preventivos por eventos climáticos extremos

**Acciones recomendadas:**
- Auditar eficiencia energética de instalaciones HVAC actuales
- Implementar protocolo de continuidad operativa para eventos climáticos
- Evaluar cobertura de seguro paramétrico climático`,
      });
    }

    if (!ai) {
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    let lastError = null;

    for (const model of MODELS) {
      try {
        const result = await ai.models.generateContent({ model, contents: prompt });
        const text = result.text;

        if (!text) {
          console.error(`[ai] ${model} devolvió respuesta sin texto`);
          continue;
        }

        console.log(`[ai] Respuesta generada con ${model}`);
        return res.json({ response: text });

      } catch (err) {
        console.warn(`[ai] ${model} falló:`, err?.message?.slice(0, 120));
        lastError = err;
        // Only retry on quota/model errors — propagate auth errors immediately.
        const msg = err?.message ?? '';
        if (msg.includes('403') || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
          break;
        }
      }
    }

    console.error('[ai] Todos los modelos fallaron. Último error:', lastError?.message?.slice(0, 200));
    return res.status(500).json({ error: userFriendlyError(lastError) });

  } catch (error) {
    console.error('[ai] Error inesperado:', error?.message ?? error);
    return res.status(500).json({ error: userFriendlyError(error) });
  }
});

export default router;
