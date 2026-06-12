# AI GUARDRAILS — Sistema de Validación para Gemini

**Fuente de verdad:** `project-memory/MASTER_REFACTOR_PLAN.md` §Fase 4  
**Status:** Especificado, pendiente de implementación (P0.1–P0.3)

---

## Estado Actual (RIESGO ACTIVO)

- `POST /api/ai` en `server/routes/ai.js`
- Sin system prompt — Gemini recibe solo el prompt del usuario
- Sin contexto del pipeline — Gemini no sabe qué señales detectó Layer2
- Sin validación post-generación — texto Gemini va directo al cliente
- Sin rate limiting granular — solo `aiLimiter` genérico
- Respuesta demo hardcodeada (`ai.js:40-54`) usa lenguaje prescriptivo que viola SCIENTIFIC_METHOD.md

---

## Target: scientificValidator.ts

**Archivo:** `server/ai/scientificValidator.ts` (nuevo, P0.2)

### Patrones prohibidos (con auto-fix donde es posible)

| Pattern | Tipo violación | Auto-fixable |
|---------|---------------|-------------|
| `/causará/gi` | DETERMINISTIC_FUTURE | Sí → "podría aumentar la probabilidad de" |
| `/\$[\d,.]+/g` | FINANCIAL_FIGURE | No — rechazar |
| `/S\/\.?\s?[\d,.]+/g` | FINANCIAL_FIGURE_SOLES | No — rechazar |
| `/SSP[1-5]-\d\.\d/g` | RAW_SSP_CODE | Sí → "emisiones moderadas/altas" |
| `/garantiza/gi` | CERTAINTY_LANGUAGE | Sí → "sugiere" |
| `/emergencia climática/gi` | ALARMIST_LANGUAGE | No — rechazar |
| `/catástrofe/gi` | ALARMIST_LANGUAGE | No — rechazar |
| `/inevitablemente/gi` | CERTAINTY_LANGUAGE | No — rechazar |
| `/con certeza/gi` | CERTAINTY_LANGUAGE | No — rechazar |

### Regla de confianza

Si `context.constraints.maxConfidenceForHorizon === 'low'`:
- Rechazar patrones: `"con alta confianza"`, `"es muy probable que"`, `"definitivamente"`

### Fallback

- Violaciones auto-fixables → retornar texto corregido + `validationWarnings[]`
- Violaciones no auto-fixables → `fallbackUsed: true`, usar narrativa original del pipeline
- Gemini falla → `fallbackUsed: true`, enrichment: null

---

## Target: System Prompt (contenido)

Ver MASTER_REFACTOR_PLAN.md §4.1 para el system prompt completo.

Restricciones científicas clave:
1. No afirmaciones determinísticas sobre el futuro
2. Solo números del contexto recibido (no inventar)
3. Solo citar IPCC secciones del contexto (no de memoria)
4. Confianza máxima = la del pipeline
5. Sin estimados financieros
6. Sin lenguaje de emergencia/catástrofe
7. ENSO = solo variabilidad histórica
8. end_century = siempre mencionar naturaleza extrapolada

Formato de respuesta requerido: JSON `{contextualSummary, operationalImplications[], adaptationFraming, disclaimer, confidenceStatement}`

---

## Target: AIEnrichmentContext

La IA recibe contexto estructurado del pipeline (no el prompt crudo del usuario):

```typescript
interface AIEnrichmentContext {
  location: { label, region: 'costa'|'sierra'|'selva', coordinates }
  sector: string
  hazards: Array<{ displayType, horizon, scenario, intensity, confidence, trend, keyMetric, uncertaintyRange }>
  existingNarrative: string
  availableSources: Array<{ id, citation }>
  constraints: { maxConfidenceForHorizon, horizonIsExtrapolated, scenarioContext }
}
```

---

## Target: Nuevo endpoint

```
POST /api/ai/enrich   (reemplaza POST /api/ai)
Body: { context: AIEnrichmentContext, question: string }
Response: { enrichment: AIEnrichmentResponse | null, fallbackUsed: boolean, validationWarnings: string[] }
```

---

## Frases prohibidas en UI (no solo en AI)

```
"causará" → "podría aumentar la probabilidad de"
"Las lluvias aumentarán" → "Los modelos proyectan mayor precipitación extrema"
"Riesgo crítico" (sin datos) → "Alta confianza de incremento"
"Próxima década" (para 2020-2039) → "Horizonte 2020–2039"
"Corto/mediano/largo plazo" → "2020–2039 / 2040–2059 / 2060–2079"
Valores financieros ($, S/., USD + número) → nunca
```
