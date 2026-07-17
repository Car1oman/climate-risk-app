# PASO-1 — Validación de Input

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `validateInput()`, `PresentationInputSchema` |
| **Ubicación** | `pipeline/stages/07-presentation/index.js:111-121`, `pipeline/shared/types.js` (PresentationInputSchema) |
| **Stage** | Stage 07 — Presentation (ID: 7) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación de la validación del input, decisiones de alcance (qué campos causan error vs. degradación), y manejo de errores tipados |

---

## 1. Resumen Ejecutivo

validateInput() parsea el input crudo contra PresentationInputSchema (Zod) y envuelve cualquier fallo en PresentationError (pipeline/shared/errors.js). La validación es deliberadamente selectiva: location es el único campo que causa throw real; sector/assessments/phenomena degradan con gracia en vez de fallar, porque los PASO-2 a PASO-6 ya construyeron y testearon esa degradación.

---

## 2. Schema de Validación

```javascript
validateInput(rawInput) {
  const result = PresentationInputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new PresentationError(
      "INVALID_INPUT",
      `Input inválido para Stage 7 (Presentation): ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      { issues: result.error.issues }
    );
  }
  return result.data;
}
```

**PresentationInputSchema** (pipeline/shared/types.js):

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `location` | LocationSchema | Sí | lat/lon numéricos, location_name string opcional |
| `sector` | string | No | Se valida presencia, no contenido |
| `assessments` | RiskAssessmentSchema[] | No | Array de evaluaciones de Stage 6 |
| `phenomena` | PhenomenonSchema[] | No | Array de fenómenos de Stage 5 |
| `transition_risks` | TransitionRiskSchema[] | No | Array de riesgos de transición |
| `view` | "executive" \| "analyst" | No | Default: "executive" |
| `sources_consulted` | SourceResponseSchema[] | No | Fuentes de Stage 1 |
| `signals` | SignalSchema[] | No | Señales de Stage 4 |
| `execution_id` | string | No | UUID de la ejecución |

---

## 3. Decisiones de Alcance

### 3.1 Location: throw real

**Razón**: Sin location, Stage 7 no puede renderizar nada — ni el nombre de la ubicación ni las coordenadas. Es el campo mínimamente necesario para que el stage produzca un output útil.

**Validación**: LocationSchema (el mismo que PipelineEngine.run() usa en la entrada del pipeline — engine.js). La validación en Stage 7 es redundante en el camino de producción (engine.js ya valida), pero necesaria para cualquier llamada directa a stage.execute() que no pase por el engine.

### 3.2 Sector: degradación elegante

**Razón**: H-7.2 ya construyó y testeó `sector?.trim() || 'no especificado'` en buildExecutiveSummary(). Convertir sector ausente en un error duro habría sido una regresión del trabajo ya hecho.

### 3.3 Assessments/Phenomena: degradación elegante

**Razón**: H-7.3 (buildRecommendations) y H-7.4 (buildConfidenceNote) ya distinguen "sin datos" (assessments null/undefined) de "datos pero todo bajo" (assessments.length > 0, todos bajo). Convertir assessments vacío en error duro habría eliminado esa distinción.

### 3.4 PresentationError: primer uso real

**Nota**: PresentationError (pipeline/shared/errors.js) existía pero ningún stage lo usaba. H-7.9 es su primer uso real. wrapArtifact() (stage-interface.js) ya espera error.code/error.message/error.detail — un TypeError plano no tiene esos campos, lo cual causaría errores en la serialización del output de wrapArtifact().

---

## 4. Error Handling

| Tipo de error | Campo faltante | Comportamiento |
|---------------|---------------|----------------|
| ZodError | location | throw PresentationError("INVALID_INPUT", ...) |
| ZodError | otro campo requerido | throw PresentationError("INVALID_INPUT", ...) |
| TypeError | location undefined | Prevenido por Zod (throw antes de llegar a execute()) |
| Valor inválido | sector, assessments | Degradación elegante (H-7.2/H-7.3/H-7.4) |

---

## 5. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-7.9 (MEDIO): execute() no validaba input | PresentationInputSchema + PresentationError |
| H-7.9 (MEDIO): TypeError genéricos sin code/detail | PresentationError con code/message/detail |
| H-7.9 (MEDIO): primer uso real de PresentationError | wrapArtifact() ahora recibe error estructurado |
