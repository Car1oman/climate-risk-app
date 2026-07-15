# Stage 07 — Presentation

**Stage ID**: 7 | **Name**: Presentation

## Input Contract

```typescript
{
  stage_06_output: { assessments: RiskAssessment[], exposure: Exposure[] },
  view: "executive" | "analyst",
  evidence_artifact: EvidenceArtifact  // referencia, no contenido completo
}
```

## Output Contract

```typescript
{
  stage: "presentation",
  status: "success",
  view: "executive" | "analyst",
  response: {
    // --- Executive View ---
    location: { name, coordinates },
    overall_risk: { level, label },
    phenomena: { name, status, risk_contribution }[],
    executive_summary: string,
    recommendations: string[],
    confidence_note: string,
    // --- Analyst View (extends executive) ---
    sources_used?: SourceSummary[],
    sources_out_of_coverage?: string[],
    signal_detail?: SignalSummary[],
    risk_calculation?: RiskCalculationSummary,
    trace_id: UUID
  }
}
```

## Behavior

1. Si `view = "executive"`, proyectar solo:
   - Semáforos de riesgo (bajo/medio/alto → verde/ámbar/rojo)
   - Nombres de fenómenos en lenguaje natural
   - Resumen ejecutivo generado desde template con variables inyectadas
   - Recomendaciones priorizadas
   - Nota de confianza en una frase
2. Si `view = "analyst"`, extender con:
   - Fuentes consultadas y su estado
   - Señales con source_quality y signal_strength
   - Cálculo de riesgo paso a paso
   - Reglas aplicadas
3. NUNCA exponer:
   - JSON crudo de APIs externas
   - Códigos de variable (T2M, PRECTOTCORR, etc.)
   - Errores técnicos (stack traces)
   - Notación científica

## Rules Applied

1. Todo valor numérico se traduce a categoría semántica antes de mostrar.
2. Toda afirmación en la narrativa ejecutiva tiene un enlace interno al
   artefacto de evidencia (trace_id + señal/fenómeno específico).
3. La respuesta de UI es una proyección, no el artefacto completo.
4. Si se solicita exportación (PDF), el artefacto completo puede incluirse
   como anexo técnico, no en la vista por defecto.

## Narrative Template

```text
{location} presenta exposición {level} a fenómeno {phenomenon_name} {status}.
{confidence_note}. {evidence_summary}. {recommendation_intro}
```

Las variables se inyectan desde el artefacto de evidencia. No hay generación
de lenguaje con IA en esta etapa — las narrativas son templates.

## Traceability

- `trace_id` en la respuesta permite recuperar el artefacto completo.
- Cada elemento visual tiene un path de trazabilidad interna.
