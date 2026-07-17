# Stage 07 — Presentation

**Stage ID**: 7 | **Name**: Presentation

## Input Contract

```typescript
{
  stage_06_output: { assessments: RiskAssessment[], exposure: Exposure[] },
  view: "executive" | "analyst",
  // H-7.13 (documentacion-v2/stage-07, BAJO, RESUELTO): evidence_artifact
  // ELIMINADO de este contrato — es estructuralmente imposible que Stage 7
  // lo reciba. El motor real (pipeline/orchestration/engine.js,
  // PipelineEngine.run()) construye el EvidenceArtifact final con
  // EvidenceArtifactBuilder.build() DESPUÉS de que el loop de los 7 stages
  // termina (engine.js, tras el `for` de sortedStages) — Stage 7 corre
  // DENTRO de ese loop, antes de que build() se invoque. No hay ningún
  // punto en la ejecución real donde Stage 7 pueda recibir el artefacto
  // completo como input: el artefacto que lo contendría a ÉL mismo no
  // existe todavía. Declararlo como input era una referencia circular
  // aspiracional, nunca implementable con esta arquitectura de "un solo
  // paso de stages, artefacto ensamblado al final" — no un campo omitido
  // por descuido.
  //
  // H-7.8 (documentacion-v2/stage-07, MEDIO, RESUELTO): además de
  // stage_06_output, Stage 7 en la práctica recibe TODO el pipelineState
  // acumulado — el motor real de producción aplana el output de cada stage
  // anterior y lo reenvía completo a cada stage siguiente, no solo el del
  // stage inmediato anterior. (pipeline/orchestration/orchestrator.js
  // define una clase equivalente — PipelineOrchestrator — pero nunca se
  // instancia en ningún archivo del repo; es código muerto, no el motor
  // real — ver H-7.9.) En particular, Stage 7 consume directamente:
  sources_consulted: RawSourceResponse[],  // Stage 1 — usado por sources_used Y sources_out_of_coverage
  signals: Signal[],                        // Stage 4 — usado por signal_detail
}
```

## Output Contract

H-7.13 (documentacion-v2/stage-07, BAJO, RESUELTO): este contrato describe
DOS shapes distintos que se confundían en un solo bloque — el valor que
`Stage07Presentation.execute()` retorna directamente, y el artefacto
envuelto que produce `StageInterface.wrapArtifact()` (una capa genérica que
el motor real, `pipeline/orchestration/engine.js` `PipelineEngine.run()`,
aplica a los 7 stages por igual, no algo específico de Stage 7). La versión
original de este documento los presentaba como un solo objeto con `stage`/
`status` al mismo nivel que `view`/`response` — ningún stage del pipeline
(verificado en Stage 5 y Stage 6, mismo patrón) retorna esos 2 campos desde
su propio `execute()`; es boilerplate de spec-kit anterior a la arquitectura
`StageInterface`, no una omisión de Stage 7 específicamente. Corregir todos
los contratos de los 7 stages está fuera del alcance de este hallazgo (BAJO,
sobre Stage 7); aquí se documenta la forma real y la razón, no se agregan
campos redundantes a `execute()` para maquillar el contrato.

**1. `Stage07Presentation.execute()` retorna directamente** (verificado con
test, `tests-new/pipeline/stages/stage-07-presentation.test.js` "execute()
return shape (H-7.13)"):

```typescript
{
  view: "executive" | "analyst",
  response: {
    // --- Executive View ---
    location: { name, coordinates },
    overall_risk: {
      level, label, color, method,
      // H-7.1/H-7.14: level es max-risk (worst-case conservador, COSO ERM
      // 2017 §4.3 + ISO 31000:2018 §6.6 — ver thresholds.json
      // overall_risk_consolidation). risk_composite y risk_count dan el
      // contexto de concentración que un solo max no puede dar por
      // construcción — no reemplazan level, lo complementan.
      risk_composite: { score, level, label },
      risk_count: { bajo: number, medio: number, alto: number, catastrofico: number },
    },
    phenomena: {
      name, status,
      // H-7.7 (documentacion-v2/stage-07, BAJO, RESUELTO): risk_contribution.score
      // nunca se expone sin score_scale — un número crudo (P×I)/CA no es
      // interpretable sin su rango/fórmula. score=null (no 0) cuando el
      // fenómeno no tiene assessment — 0 está fuera del rango real [0.2, 37.5].
      risk_contribution: { level, score: number | null, score_scale: { min, max, formula } },
    }[],
    executive_summary: string,
    recommendations: string[],
    confidence_note: string,
    // --- Analyst View (extends executive) ---
    // H-7.10 (documentacion-v2/stage-07, BAJO, RESUELTO): SourceSummary
    // ahora incluye authority_level/spatial_distance_km/resolution_native/
    // duration_ms (campos reales de RawSourceResponseSchema, antes omitidos)
    // — NO coverage_percentage/last_updated/reliability_score, que ningún
    // stage de este pipeline calcula (habría sido fabricar precisión
    // inexistente). sources_used (coverage_status==='available') y
    // sources_out_of_coverage (H-7.8: todo lo demás) son una partición
    // COMPLETA de sources_consulted — 'partial'/'unknown' (CoverageStatusEnum)
    // nunca aparecen aquí, solo en validated_sources (Stage 02/03), que
    // Stage 7 no consume.
    sources_used?: SourceSummary[],  // SourceSummary = { name, domain, status, authority_level, spatial_distance_km, resolution_native, duration_ms }
    sources_out_of_coverage?: SourceSummary[],  // SourceSummary + reason
    // H-7.8: antes SIEMPRE []. Poblado desde input.signals (Stage 4).
    // contributing_to cruza phenomenon.contributing_signals (Stage 5).
    // NO incluye señales descartadas por Stage 4 (signals_discarded) — esa
    // clave no sobrevive el aplanado del orchestrator hasta Stage 7 (Stage 5
    // no la reenvía en su output); vacío declarado, no fabricado.
    signal_detail?: SignalSummary[],  // SignalSummary = { signal_id, name, type, source_quality, signal_strength, contributing_to }
    risk_calculation?: RiskCalculationSummary,
    trace_id: UUID
  }
}
```

**2. El motor real envuelve ese valor** en `stage.wrapArtifact(input, result, status, error, startTime)`
(`pipeline/shared/stage-interface.js`, llamado genéricamente para los 7
stages desde `engine.js`), produciendo el objeto que realmente termina en
`EvidenceArtifact.stages[]`:

```typescript
{
  stage_id: 7,              // NO "stage": "presentation" — nombre de campo distinto
  stage_name: "Presentation",
  input: object,             // sanitizeInput(stageInput) — response cruda de APIs redactada
  output: { view, response }, // exactamente el retorno de execute() de arriba
  rules_applied: string[],
  duration_ms: number,
  status: "success" | "failed",
  error: { code, message, detail } | null,
}
```

Ni `stage_id`/`stage_name` (wrapArtifact) ni `"presentation"` (el string que
sí usa `PresentationError.stage`, `pipeline/shared/errors.js`) coinciden
literalmente con el `stage: "presentation"` que la v1 de este contrato
declaraba — son 3 representaciones distintas del "stage 7" ya existentes en
el código (id numérico, nombre legible, dominio de error), y unificarlas en
un cuarto campo nuevo dentro de `execute()` habría añadido una CUARTA
representación en vez de resolver la ambigüedad.

## Behavior

1. Si `view = "executive"`, proyectar solo:
   - Semáforos de riesgo: bajo/medio/alto/catastrofico → verde/ámbar/rojo/morado.
     H-7.5 (documentacion-v2/stage-07, BAJO, RESUELTO): el contrato original
     solo cubría 3 niveles pese a que RiskLevelEnum y Stage06Risk (H-6.14)
     emiten 4 — catastrofico colapsaba a "rojo" (mismo color que alto),
     perdiendo distinción visual. Morado (no un rojo más oscuro) por
     precedente ya activo en la UI real de /v2
     (`src/features/climate-lookup-v2/components/riskLevelStyles.js`, purple-500)
     y por accesibilidad (cambio de matiz > cambio de luminosidad para
     deficiencias de visión de color rojo-verde, WCAG 1.4.1) — ver
     `RISK_COLORS` en `pipeline/stages/07-presentation/index.js`.
   - Nombres de fenómenos en lenguaje natural. H-7.6 (documentacion-v2/stage-07,
     BAJO, RESUELTO): los nombres se leen de `phenomenon-definitions.json`
     `display_names` (fuente única de verdad para metadatos de fenómeno),
     no de un mapa hardcodeado en Stage 7 — cubre las 9 entradas de
     `PhenomenonNameEnum`, cada una con su fuente institucional
     (WMO/SENAMHI/NOAA/INDECI/INGEMMET según el fenómeno). El fallback para
     nombres fuera del enum capitaliza cada palabra en vez de devolver
     minúsculas.
   - Resumen ejecutivo generado desde template con variables inyectadas
   - Recomendaciones priorizadas
   - Nota de confianza en una frase. H-7.4 (documentacion-v2/stage-07, MEDIO,
     RESUELTO): "confianza" aquí significa confianza epistémica en la
     evaluación (`phenomenon.confidence.combined` de Stage 05, geometric
     mean de source_quality × signal_strength), NO la probabilidad del
     fenómeno (`assessment.probability.value`, que puede venir de una
     fuente externa sin relación con la calidad de la evaluación — H-6.9).
     Ver `buildConfidenceNote()` para el mapeo confidence.combined→ordinal
     (reutiliza `confidence_to_probability.mapping`, H-6.7) y el colapso a
     3 categorías (mismo criterio que `risk_classification`).
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

0. `overall_risk.level` se deriva por max-risk (worst-case conservador entre
   los assessments recibidos) — elección organizacional explícita según
   ISO 31000:2018 §6.6, alineada con el enfoque de agregación de portafolio
   de COSO ERM (2017) §4.3. Se complementa con `risk_composite` (promedio
   simple, igual-ponderado, de `risk_score_raw`) y `risk_count` (tally por
   nivel) para exponer la concentración del riesgo que max-risk por sí solo
   no distingue (1 fenómeno alto vs. 5 fenómenos altos). Ver
   `thresholds.json` `overall_risk_consolidation` para la comparación con
   las alternativas evaluadas (H-7.1, H-7.14).
1. Todo valor numérico se traduce a categoría semántica antes de mostrar.
2. Toda afirmación en la narrativa ejecutiva tiene un enlace interno al
   artefacto de evidencia (trace_id + señal/fenómeno específico). H-7.2
   (documentacion-v2/stage-07, MEDIO, RESUELTO): `buildExecutiveSummary()`
   ahora implementa el template literal de la sección "Narrative Template"
   abajo, en vez de una narrativa ad-hoc que omitía esta trazabilidad — ver
   esa sección para las decisiones de diseño (fenómeno driver, sector
   validado, evidence_summary con trace_id+phenomenon_id).
3. La respuesta de UI es una proyección, no el artefacto completo.
4. Si se solicita exportación (PDF), el artefacto completo puede incluirse
   como anexo técnico, no en la vista por defecto. H-7.11 (documentacion-v2/stage-07,
   BAJO, RESUELTO parcialmente): esta regla NO está implementada — Stage 7
   no tiene ninguna ruta de exportación PDF (`view` solo acepta
   `"executive"|"analyst"`, `PresentationInputSchema`, H-7.9). Declarado
   explícitamente en `rulesApplied` como GAP DECLARADO en vez de omitirse
   silenciosamente — construir la exportación PDF está fuera del alcance de
   H-7.11 (que trata sobre verificar/alinear las reglas declarativas, no
   sobre construir funcionalidad nueva).
5. `recommendations` se deriva de `pipeline/config/adaptation-measures.json`
   (fuente primaria: Anexo 10.2 Catálogo de Riesgos y Medidas de Adaptación,
   documento interno), personalizada por fenómeno×sector (riesgo físico) y
   tipo×sector (riesgo de transición) — no los 2 textos estáticos anteriores.
   H-7.3 (documentacion-v2/stage-07, MEDIO, RESUELTO): "priorizadas" (Behavior
   §1) es literal — los assessments con `risk_level≠bajo` se ordenan por
   `risk_score_raw` descendente (no solo por la categoría discreta), y los
   riesgos de transición por `signal_strength` descendente; ambas listas se
   capan (3 físicas + 2 de transición) para que la lista no degenere en
   "todas". Cobertura sector-específica del catálogo verificada solo para
   `retail` y `finance` (únicos sectores de este pipeline con equivalente
   directo en el Anexo); `agriculture`/`energy`/`infrastructure` y los
   fenómenos sin fila en el catálogo (`la_nina`, `ola_de_frio`) reciben
   medidas de `generic_measures`/`generic_transition_measures` — filas del
   Anexo etiquetadas "Todas las plataformas", genuinamente sector-agnósticas
   por diseño del documento fuente, no una generalización fabricada por
   Stage 7 — ver `adaptation-measures.json` `_methodology.coverage_gap`.
   "Sin datos" (`assessments` null/undefined) y "datos pero todo bajo"
   (`assessments` no vacío, ningún `risk_level≠bajo`) producen textos
   distintos.

## Narrative Template

```text
{location} presenta exposición {level} a fenómeno {phenomenon_name} {status} en el sector {sector}.
{confidence_note}. {evidence_summary}. {recommendation_intro}
```

Las variables se inyectan desde el artefacto de evidencia. No hay generación
de lenguaje con IA en esta etapa — las narrativas son templates.

H-7.2 (documentacion-v2/stage-07, MEDIO, RESUELTO): decisiones de diseño para
poblar el template cuando Stage 7 recibe N assessments (el template es
singular):
- `{phenomenon_name}` / `{status}` usan el fenómeno "driver" — el mismo
  assessment con `risk_level` máximo que determina `overall_risk.level`
  (H-7.1) — para que el semáforo y el fenómeno nombrado en la narrativa
  nunca diverjan. Expuesto como `driverPhenomenonId` en
  `calculateOverallRisk()`.
- `{sector}` se agregó al template (no estaba en la versión original de este
  documento) porque el hallazgo H-7.2 exige validarlo antes de interpolarlo
  ("para el sector undefined" era el bug reportado) — la corrección
  conserva el contexto de sector en vez de eliminarlo, ahora con
  `sector?.trim() || "no especificado"`.
- `{evidence_summary}` cita explícitamente `trace_id` + `phenomenon_id` del
  driver, cumpliendo Rules Applied §2 (enlace al artefacto de evidencia).
- `{recommendation_intro}` reusa el array `recommendations` ya calculado por
  `buildRecommendations()` (mismo texto, no una segunda narrativa
  independiente que podría divergir).

## Traceability

- `trace_id` en la respuesta permite recuperar el artefacto completo.
- Cada elemento visual tiene un path de trazabilidad interna.
