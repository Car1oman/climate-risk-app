# Auditoría Técnica End-to-End — Pipeline Climate Risk V2

**Alcance:** `pipeline/` completo (7 stages, orquestación, configuración) + puntos de montaje en `server/` + contratos en `specs/001-climate-risk-pipeline-rebuild/`.
**Fecha de cierre de esta auditoría:** 2026-07-17.
**Método:** lectura completa de código fuente actual (no solo documentación), verificación cruzada contra las 7 auditorías por stage ya existentes en `documentacion-v2/stage-0{1..7}/`, verificación de qué código está realmente commiteado vs. en working tree (`git status`), y trazado manual del flujo de datos stage-a-stage.
**Postura:** auditor independiente. No se asume que el pipeline es correcto porque produce resultados — cada hallazgo previo se re-verificó contra el código real, no contra su propia documentación.

> **Nota de método importante, y hallazgo en sí misma:** las 7 auditorías por stage ya existentes (`documentacion-v2/stage-0N/AUDITORIA-*.md`) fueron escritas en momentos distintos (2026-07-14 a 2026-07-17) y **no todas reflejan el estado actual del código**. Se verificó directamente contra el código fuente cuáles hallazgos siguen abiertos y cuáles ya fueron corregidos. Esto se documenta en la Sección 4 y es en sí mismo el **Hallazgo Transversal #1**.

---

## Índice

1. Arquitectura End-to-End del Pipeline V2
2. Descripción detallada de cada Stage (resumen — detalle completo en documentos por stage)
3. Mapa completo del flujo de datos
4. Auditoría de consistencia entre etapas (estado real del código vs. documentación)
5. Auditoría de fallos silenciosos (transversal)
6. Auditoría de trazabilidad
7. Auditoría de mantenibilidad
8. Auditoría de defendibilidad técnica
9. Riesgos globales del pipeline (priorizados)
10. Plan de remediación

---

## 1. Arquitectura End-to-End del Pipeline V2

### 1.1 Punto de entrada real (verificado, no supuesto)

```
HTTP POST /api/v2/climate-risk
  → server/server.js (Express app, puerto producción)
  → server/climate-v2.js: mountV2(app)
       instancia UN SOLO PipelineEngine (pipeline/orchestration/engine.js)
       con los 7 stages en orden fijo (Stage01..Stage07)
  → server-new/routes/climate-v2.js: createClimateRouter(engine)
       router.post("/climate-risk", ...) → engine.run({ coordinates, sector, view })
```

Este es el **único** camino de producción verificado (`grep "new PipelineEngine"` y `"new PipelineOrchestrator"` en todo el repo). Endpoints adicionales del mismo router:
- `GET /api/v2/climate-risk/:traceId/trace` — expone el artefacto de evidencia por `execution_id` o `artifact_id` (guardado en memoria de proceso, `engine.artifacts` — ver §6.3 para el riesgo de esto).
- `GET /api/v2/climate-risk/health`.

### 1.2 Hallazgo Transversal #2 — Existen DOS orquestadores; uno es código muerto sin marcar

`pipeline/orchestration/engine.js` (`PipelineEngine`) es el que usa producción. `pipeline/orchestration/orchestrator.js` (`PipelineOrchestrator`) implementa una lógica de orquestación **distinta pero solapada** y **nunca se instancia en ningún archivo del repositorio** (verificado con grep exhaustivo: la única ocurrencia de `new PipelineOrchestrator` no existe; la clase solo aparece en su propia definición).

Diferencias funcionales entre ambos, que importan si alguien migra a `orchestrator.js` por error o lo reactiva sin auditar:

| Aspecto | `engine.js` (real) | `orchestrator.js` (muerto) |
|---|---|---|
| Validación de stage al registrar | Solo exige `stageId` + `execute()` | Exige `instanceof StageInterface` |
| Propagación de estado entre stages | `Object.assign(pipelineState, result)` — **fusión plana acumulativa** de TODOS los outputs anteriores | `pipelineState = {...pipelineState, ...result}` **más** una clave namespaced `stage_0N_output` solo del stage inmediatamente anterior — dos mecanismos redundantes y parcialmente distintos |
| Manejo de fallo de un stage | Corta el loop, retorna `success:false` sin `setFinalResult`/`setNarratives` (quedan en su default vacío) | Corta el loop, construye igualmente el artefacto completo vía `buildEvidenceArtifact` |
| Artefacto final | `EvidenceArtifactBuilder` (clase separada, `pipeline/artifact/builder.js`) | Método interno `buildEvidenceArtifact()`, **duplica la misma lógica** de `passed/partial/failed` que ya vive en `EvidenceArtifactBuilder.build()` |

Este es código muerto real (no solo "no se usa por ahora"): dos implementaciones de la misma responsabilidad, sin test que las compare, sin comentario `@deprecated`, sin plan de eliminación. El propio código de Stage 7 (comentarios H-7.8/H-7.9) tuvo que verificarlo por grep para poder documentar correctamente cuál es "el motor real" — es decir, la ambigüedad ya causó fricción de auditoría real dentro del propio proyecto.

**Riesgo:** MEDIO (mantenibilidad/confusión), no funcional hoy — pero cualquier persona nueva en el proyecto, o cualquier LLM asistente futuro, tiene 50% de probabilidad de leer primero el archivo equivocado y documentar/modificar el orquestador que no se ejecuta nunca.

### 1.3 Mecanismo real de propagación de estado (`engine.js`)

```js
const pipelineState = { location, sector: validatedSector, view, execution_id };
for (const [id, stage] of sortedStages) {           // orden = stageId numérico 1..7
  const stageInput = { ...pipelineState };          // TODO lo acumulado hasta ahora
  const result = await stage.execute(stageInput);
  builder.addStage(stage.wrapArtifact(stageInput, result, "success", null, stageStart));
  Object.assign(pipelineState, result);             // fusión plana, sin namespacing
}
```

Esto es una decisión de arquitectura real con dos implicaciones auditables que **ningún documento de spec-kit menciona explícitamente**:

1. **No hay aislamiento entre stages.** Cada stage recibe el **objeto acumulado completo** de todos los stages anteriores, no solo su input declarado en el contrato. Stage 7 depende de esto explícitamente y lo documenta (H-7.8: lee `input.sources_consulted` de Stage 1 y `input.signals` de Stage 4 directamente, "saltándose" a Stage 2/3/5/6). Esto **funciona hoy** porque se verificó manualmente que ninguna clave se colisiona entre los 7 stages, pero **no hay ningún schema ni test que garantice que esto siga siendo cierto** si un stage futuro reutiliza un nombre de campo ya usado aguas arriba — una colisión silenciosa sobrescribiría datos de un stage anterior sin error visible.
2. **Los "Input Contracts" de `specs/.../contracts/stage-0N-*.md`** (que declaran inputs específicos y acotados por stage) **no describen el comportamiento real**: el input real de cada stage (excepto Stage 1) es "todo lo que produjo el pipeline hasta ahora", no el subconjunto declarado en el contrato. Esto no es necesariamente incorrecto, pero es una discrepancia contrato↔implementación transversal a los 7 stages que ningún documento consolida (cada auditoría por stage la nota solo localmente).

### 1.4 Orden real de ejecución (verificado por `stageId`)

```
1. Acquisition    (pipeline/stages/01-acquisition)   — fetch a 9 fuentes externas en paralelo
2. Validation     (pipeline/stages/02-validation)    — QC de cada fuente cruda
3. Normalization  (pipeline/stages/03-normalization) — selección de fuente + variables canónicas
4. Signals        (pipeline/stages/04-signals)       — source_quality + signal_strength por variable
5. Phenomena      (pipeline/stages/05-phenomena)      — consolidación de señales en fenómenos
6. Risk           (pipeline/stages/06-risk)           — P × I / CA, clasificación de riesgo
7. Presentation   (pipeline/stages/07-presentation)   — proyección para UI (executive/analyst)
```

El orden se determina por `[...this.stages.entries()].sort(([a],[b]) => a-b)` sobre `stageId` (entero 1-7, verificado en cada `constructor()` — `super(N, "Nombre")`). Es un orden fijo, no configurable, no paralelo entre stages (sí hay paralelismo interno en Stage 1 entre fuentes).

### 1.5 Componentes transversales (no auditados individualmente por ningún documento previo)

| Componente | Archivo | Rol | Hallazgo |
|---|---|---|---|
| `PipelineEngine` | `orchestration/engine.js` | Orquestador real | §1.2, §1.3 |
| `PipelineOrchestrator` | `orchestration/orchestrator.js` | Código muerto | §1.2 |
| `EvidenceArtifactBuilder` | `artifact/builder.js` | Ensambla el artefacto de auditoría final | §6.1 |
| `StageInterface` | `shared/stage-interface.js` | Contrato base (`execute`, `wrapArtifact`) | §6.2 |
| `config-loader.js` | `orchestration/config-loader.js` | Carga y cachea los 11 JSON de `pipeline/config/` | §7.3 |
| `errors.js` | `shared/errors.js` | Jerarquía de errores por stage | §5.4 |

---

## 2. Descripción de cada Stage (resumen ejecutivo — detalle exhaustivo ya existe por stage)

El detalle completo (objetivo, entradas, salidas, motores, transformaciones, decisiones, supuestos, validaciones, manejo de errores, hallazgos) de cada stage **ya está documentado exhaustivamente** en:

- `documentacion-v2/stage-01/` (7 PASO + `AUDITORIA-supuestos-calculos-heuristics.md`, 8 hallazgos)
- `documentacion-v2/stage-02/` (7 PASO + `AUDITORIA-supuestos-calculos-heuristics.md`, 36 hallazgos)
- `documentacion-v2/stage-03/` (7 PASO + `AUDITORIA-stage-03-normalization.md`, 10 hallazgos + 47 elementos evaluados)
- `documentacion-v2/stage-04/` (6 PASO + `AUDITORIA-stage-04-signals.md`, 20 hallazgos)
- `documentacion-v2/stage-05/` (6 PASO + `AUDITORIA-stage-05-phenomena.md`, 20 hallazgos, **todos cerrados**)
- `documentacion-v2/stage-06/` (6 PASO + `AUDITORIA-stage-06-risk.md`, 18 hallazgos — **documento desactualizado, ver §4**)
- `documentacion-v2/stage-07/` (7 PASO + `AUDITORIA-stage-07-presentation.md`, 14 hallazgos — **documento desactualizado, ver §4**)

No se repite ese contenido aquí. Esta sección resume solo lo necesario para el análisis end-to-end.

| Stage | Objetivo | Entrada real (acumulada) | Salida propia | Motor/decisión central | Estado de remediación verificado en código (2026-07-17) |
|---|---|---|---|---|---|
| **01 Acquisition** | Obtener datos crudos de 9 fuentes externas en paralelo | `{location, sector}` | `sources_consulted[]` (`RawSourceResponseSchema[]`) | Registry de 9 adapters, dedupe in-flight, timeouts, elevation enrichment | **Mayormente corregido**. `worldbank.js` ahora documenta y justifica el hardcode a "PE" como decisión de producto (PERU_BBOX en `LocationSchema`), no un bug. Resto de hallazgos (H-2 a H-8, interpretación Nyquist, buffer 0.5°, rango fechas CMIP6) **sin verificar cambio de código** — `index.js`/adapters no aparecen en el diff de esta sesión salvo `worldbank.js`. |
| **02 Validation** | QC por fuente: schema, fill values, rangos físicos, completitud, consistencia temporal, cobertura espacial | `sources_consulted[]` | `validated_sources[]`, `coverage_decisions[]` | 6 validadores independientes por fuente | **El archivo `index.js` no fue tocado en esta sesión** (no aparece en `git status`). El mapeo `PRECTOTCORR` (antes `PRECTOT`) **sí se corrigió, pero en el adapter** (`nasa-power.js`, ver §4.2) — el bug de fondo (mismatch) está cerrado por una vía distinta a la que la auditoría de Stage 02 recomendó. HALLAZGO-2 (wildcard `resolvePath` roto) probablemente cerrado por cambio de **configuración** (`validation-profiles.json` ahora usa `results[0].elevation`, no `results[*].elevation` — verificado por grep), no por fix del propio `resolvePath()`. HALLAZGO-3 (falsos positivos de fecha en frontera de mes) y HALLAZGO-4 (paths de GRI Oxford sin verificar contra API real) **permanecen sin evidencia de corrección** — el código que los contiene no cambió. |
| **03 Normalization** | Seleccionar la mejor fuente por variable×dominio, extraer variables canónicas, agregación completeness-aware | `validated_sources[]`, `coverage_decisions[]` | `canonical_variables[]`, `excluded_variables[]`, `source_decisions[]` | Scoring completeness/proximity (50/50), decorrelación espacial exp(-d/L), agregación MCAR-aware | **Parcialmente corregido**: `GLOBAL_FILL_VALUES` ampliado (H-A06 cerrado, ver evidencia directa en código §4.2). Ponderación 50/50 completeness/proximity (H-A02, hallazgo CRÍTICO de la propia auditoría de Stage 03) **sigue sin resolver** — no hay framework AHP ni análisis de sensibilidad en el código actual. |
| **04 Signals** | Calcular `source_quality` (5 componentes) y `signal_strength` (por detector específico de tipo) por variable canónica | `canonical_variables[]` | `signals[]`, `signals_discarded[]`, `source_quality_summary` | `calculateSourceQuality` (5 componentes ponderados 30/20/20/20/10), `calculateSignalStrength` (detectores: categorical/projection/anomaly/baseline_or_static/unclassified) | **Totalmente reescrito y verificado directamente contra el código actual** — los 5 hallazgos CRÍTICOS originales (H-01 a H-05: solo 2/5 componentes de SQ, solo 1/4 de SS, `calculateSignalStrength` recibiendo TODAS las variables en vez de una, sin filtro `min_signal_strength`, output no conforme al schema) **están cerrados en el código real** (`confidence.js`, `index.js` leídos completos línea por línea). Este es el cambio más significativo del pipeline completo: pasó de "score no discriminante e inconforme al schema" a una implementación con metodología por variable, componentes excluidos honestos (`null` con razón, nunca fabricados) y filtrado real. |
| **05 Phenomena** | Consolidar señales en fenómenos climáticos (9 tipos), inferir horizon/scenario/status | `signals[]` | `phenomena[]`, `phenomena_not_detected[]` | `PHENOMENA_MAP` externalizado a `phenomenon-definitions.json`, `aggregate-signals.js` (4 métodos de combinación), `combine-confidence.js`, `signal-metadata.js` (infiere horizon/scenario/status) | **Único stage con auditoría propia marcada explícitamente como "TODOS LOS HALLAZGOS CERRADOS"** (fecha 2026-07-15) y verificado: los 3 archivos nuevos (`aggregate-signals.js`, `combine-confidence.js`, `signal-metadata.js`) existen y están wireados desde `index.js`. |
| **06 Risk** | `probability`, `impact`, `adaptive_capacity` → `risk_score_raw = (P×I)/CA`, clasificación bajo/medio/alto/catastrófico | `phenomena[]`, `canonical_variables[]`, `sector` | `assessments[]`, `exposure[]`, `adaptive_capacity`, `transition_risks[]` | Fórmula ISO 31000 §6.6, CA desde `canonical_variables` (H-6.2), probabilidad externa GRI Oxford con fallback a `confidence.combined` (H-6.9/H-5.13), impacto = media geométrica real exposición×sensibilidad (H-6.3/H-5.14), `catastrophic_multiplier` activado (H-6.14), `evaluation_coverage` que declara honestamente 1/2 escenarios y 1/3 horizontes (H-6.10) | **Verificado directamente: los 18 hallazgos de su propia auditoría (incluido el CRÍTICO H-6.2, CA=null→NaN) están resueltos en el código actual**, con comentarios inline extensísimos citando cada H-6.x. El documento `AUDITORIA-stage-06-risk.md` **no refleja este estado** — ver Hallazgo Transversal #1 (§4.1). |
| **07 Presentation** | Proyección para UI: `overall_risk`, narrativa ejecutiva, recomendaciones, nota de confianza | `assessments[]`, `phenomena[]`, `transition_risks[]`, `location`, `sector`, `view` | `{view, response}` (executive/analyst) | `calculateOverallRisk` (max-risk + `risk_composite` + `risk_count`), `buildExecutiveSummary` (template del contrato con `driver_phenomenon_id`), `buildRecommendations` (matriz `adaptation-measures.json` fenómeno×sector), `buildConfidenceNote` (usa `confidence.combined`, no `probability.value`) | **Verificado directamente: los 14 hallazgos de su propia auditoría están resueltos en el código actual**, incluida validación de input con Zod (`PresentationInputSchema`) y manejo de errores tipado (`PresentationError`) — el primer uso real de la jerarquía de `errors.js` en todo el pipeline. Documento `AUDITORIA-stage-07-presentation.md` tampoco refleja este estado. |

**Conclusión de esta sección:** el pipeline no está uniformemente maduro. Existe un **gradiente de remediación claro y verificable**: 04→05→06→07 están fuertemente endurecidos (con trazabilidad ejemplar, cada decisión documentada inline citando su propio hallazgo H-N.M); 01 y 03 están parcialmente corregidos; **02 es hoy el eslabón más débil verificado** — su archivo fuente no muestra evidencia de cambio desde que se documentaron 3 bugs CRÍTICOS (mismatch de parámetro, wildcard roto, falsos positivos de fecha).

---

## 3. Mapa completo del flujo de datos

### 3.1 Trazado de un dato real: `air_temperature_current` (Lima, sector retail)

```
1. ACQUISITION
   weatherapi.js  → response.current.temp_c = 22.5
   nasa_power.js  → response.properties.parameter.T2M["20240115"] = 21.8 (serie diaria)
   supabase.js    → cc_tas (climatología 1991-2020, vía RPC get_nearest_climate_cell)
   [3 fuentes candidatas para la misma variable física]

2. VALIDATION
   Cada fuente pasa por 6 validadores independientes (schema, fill values,
   rango físico [-90,60]°C, completitud, consistencia temporal, cobertura espacial)
   → validated_sources: [{source:"weatherapi", is_valid:true, ...}, {source:"nasa_power", ...}, ...]
   coverage_decisions: evaluateCoverage() por fuente (Math.max entre variables — H-A02/H-7 stage-02)

3. NORMALIZATION (decisión que determina TODO lo que sigue)
   _scoreSources(): weatherapi vs nasa_power vs supabase_climate_cells
     score = completeness (primary) | (completeness+proximity)/2 (complementary)
   → GANADOR ÚNICO se selecciona (source_decisions[] registra el ranking completo,
     incluidos los descartados — trazabilidad correcta aquí)
   → canonical_variables: [{name:"air_temperature_current", source:"weatherapi", value:22.5, ...}]
   [Las OTRAS 2 fuentes NO se pierden del artefacto (siguen en validated_sources del
    stage 2, visible en el trace), pero SÍ dejan de participar en el cálculo]

4. SIGNALS
   calculateSourceQuality(variable_ganadora, sector) → 5 componentes (30/20/20/20/10)
   calculateSignalStrength(variable_ganadora, TODAS_las_canonical_variables)
     → detector "anomaly" (weatherapi:air_temperature_current tiene línea base
       cross-source en cc_tas, CROSS_SOURCE_BASELINE) → Δ = 22.5 - cc_tas
   → signals: [{name:"temperatura_actual_anomaly", signal_strength:{score, anomaly_value:Δ}, ...}]
   [si SS < min_signal_strength=0.40 → descartada aquí, con razón, nunca llega a Stage 5]

5. PHENOMENA
   PHENOMENA_MAP (ahora en phenomenon-definitions.json): "ola_de_calor" requiere
   ["temperatura_actual_anomaly", "temperatura_max_projection"]
   aggregate-signals.js combina SQ y SS de las señales que matchean (4 métodos configurables)
   combine-confidence.js → confidence.combined = √(SQ×SS) (media geométrica real)
   signal-metadata.js → infiere status/horizon/scenario del fenómeno
   → phenomena: [{name:"ola_de_calor", confidence:{combined:0.72}, status:"active", ...}]

6. RISK
   calculateProbability(fenomeno) → busca gri_extreme_heat_occurrence en canonical_variables
     (NO existe hoy — Stage 03 no lo extrae, HALLAZGO H-6.9/HALLAZGO-4 stage-02, ver §4.3)
     → fallback a confidence.combined=0.72 → P=4 (tabla confidence_to_probability)
   calculateImpact(fenomeno, "retail", CA) → sensibilidad retail=0.6 → Likert 3-4,
     exposure banda "active"=[4,5] según combined → impact=round(√(exposure×sensitivity))
   riskScoreRaw = (P × I) / CA
   → assessments: [{phenomenon_id, risk_score_raw, risk_level:"alto", ...}]

7. PRESENTATION
   calculateOverallRisk(assessments) → max-risk + risk_composite + risk_count
   buildExecutiveSummary() → cita literal trace_id + phenomenon_id driver
   → { view:"executive", response:{overall_risk, phenomena[], executive_summary, ...} }
```

### 3.2 Qué datos se calculan pero nunca se consumen (verificado)

| Dato | Se calcula en | Se pierde en / nunca se consume por | Evidencia |
|---|---|---|---|
| `signal_strength.components.temporal_persistence` (siempre `null` con razón) | Stage 04 | No hay ningún consumidor downstream que lo necesite hoy — declarado honestamente ausente, no fabricado | `confidence.js` — todas las ramas de detector devuelven `null` para este componente |
| Datos de las fuentes **no ganadoras** en Stage 03 (`nasa_power`, `supabase_climate_cells` para `air_temperature_current` en el ejemplo de §3.1) | Stage 01/02 | Siguen en el artefacto (`validated_sources`) pero no participan en ningún cálculo aguas abajo de Stage 03 | `source_decisions[]` registra el ranking, pero solo 1 valor por variable llega a `canonical_variables` |
| `gri_flood_occurrence`, `gri_drought_occurrence`, `gri_extreme_heat_occurrence` | **Nunca se calculan** — Stage 06 está *cableado* para consumirlas (`PHENOMENON_TO_EXTERNAL_PROBABILITY`, H-6.9) pero Stage 03 **no las extrae** de la respuesta cruda de GRI Oxford (solo extrae `traveltime_healthcare`) | Stage 06 (`getExternalProbability()` siempre retorna `null` en la práctica actual) | Declarado explícitamente en el propio comentario de `06-risk/index.js` H-6.9 — ver §4.3, este es el hallazgo de cascada más importante del pipeline completo |
| `signals_discarded` (Stage 04, señales descartadas por `min_signal_strength` o no-calculables) | Stage 04 | Stage 05 nunca las ve (correcto, por diseño); Stage 07's `signal_detail` (vista analyst) **tampoco las incluye** — declarado como límite conocido en H-7.8, no fabricado | `07-presentation/index.js` comentario H-7.8: "signals_discarded... no se incluye en signal_detail" |
| `context_variables_used` en `exposure_detail` (Stage 06) | Se declara siempre `[]`, honestamente — la exposición no usa `canonical_variables`, solo `status` + `confidence.combined` | N/A (declarado, no es una pérdida real sino una limitación de diseño documentada) | H-6.15 |

### 3.3 Qué datos se usan sin haber sido validados explícitamente antes de usarse

- **`phenomenon.confidence.combined`** en Stage 06 (`calculateImpact`): se protege con `Number.isFinite(...)` (H-6.11) antes de usarse en aritmética — correcto.
- **`canonical_variables`** en Stage 06 (`getIndicatorValue`, `getExternalProbability`): se accede con `.find()` + chequeo de `!= null` — correcto, fail-open a `null` documentado.
- **`sector`** en Stage 07 (`buildExecutiveSummary`): validado con `sector?.trim() || "no especificado"` (H-7.2) — correcto.
- **`location`** en Stage 07: es el único campo que causa `throw` real si falta (`PresentationInputSchema`, H-7.9) — correcto y documentado como la única validación "dura".
- **Stage 02 → Stage 03**: `canonical_variables` de Stage 03 depende de que `validated_sources` de Stage 02 sea correcto. Si el mismatch `PRECTOT`/`PRECTOTCORR` (§4.2) o el wildcard roto de `resolvePath` (§4.2) aún afectaran alguna fuente sin que se haya verificado, Stage 03 consumiría datos que Stage 02 **reporta como validados pero que en realidad nunca pasaron por la regla que debía validarlos** — un fallo silencioso de validación, no de cómputo. Esto es la razón por la que el estado real de `02-validation/index.js` (§4.2) es el hallazgo más importante pendiente de verificar en profundidad.

---

## 4. Auditoría de consistencia entre etapas

### 4.1 Hallazgo Transversal #1 — Desincronización documentación↔código (CRÍTICO para la auditabilidad del propio proceso de auditoría)

Evidencia directa:

| Documento | Fecha | Afirma sobre hallazgos críticos | Estado real verificado en código (2026-07-17) |
|---|---|---|---|
| `stage-05/AUDITORIA-stage-05-phenomena.md` | 2026-07-15 | Tabla explícita "Estado de Resolución — TODOS LOS HALLAZGOS CERRADOS" | **Coincide** con el código actual |
| `stage-06/AUDITORIA-stage-06-risk.md` | 2026-07-16 | H-6.2 "CA nunca se calcula" listado como **CRÍTICO, sin resolver**; H-6.10/H-6.9/H-6.14 como "ALTO, no implementado" | **El código actual (`06-risk/index.js`, leído completo) tiene los 18 hallazgos resueltos**, con comentarios inline que citan explícitamente "H-6.2 ... YA RESUELTO" — el documento de auditoría quedó desactualizado por el trabajo de remediación posterior a su fecha de escritura |
| `stage-07/AUDITORIA-stage-07-presentation.md` | 2026-07-17 (**hoy**) | 8 hallazgos MEDIO listados como abiertos (template narrativo no implementado, `sources_out_of_coverage` siempre vacío, sin validación de input) | **El código actual tiene los 14 hallazgos resueltos**, incluyendo el template narrativo literal, `PresentationInputSchema`, `getSourcesOutOfCoverage()` |

**Por qué esto es un hallazgo, no solo una nota administrativa:** el objetivo explícito del usuario es "garantizar que el sistema sea completamente... auditable". Un documento de auditoría que describe un estado que el código ya superó **rompe la cadena de trazabilidad de la auditoría misma** — un auditor externo que lea solo `AUDITORIA-stage-06-risk.md` concluiría erróneamente que el sistema tiene un bug crítico activo (CA=null→NaN en toda ejecución), cuando en realidad fue corregido. Esto no invalida el hallazgo original (fue real en su momento), pero exige que **cada documento de auditoría lleve una sección de estado de resolución actualizada al momento del commit del fix**, exactamente como ya hace `stage-05`. Los documentos de stage-01 a 04 tienen el mismo riesgo en sentido inverso: como no tienen sección de resolución, no hay forma de distinguir sin leer el código si sus hallazgos siguen abiertos.

**Recomendación:** antes de cualquier entrega a un comité externo, actualizar `stage-01/02/03/04/06/07` con la misma sección "Estado de Resolución" que ya tiene `stage-05`, o generar esa sección automáticamente a partir de los comentarios `H-N.M` que ya existen inline en el código (son suficientemente ricos para reconstruirla).

### 4.2 Verificación directa de los 3 hallazgos CRÍTICOS de Stage 02

| Hallazgo original | Verificación actual |
|---|---|
| **HALLAZGO-1**: adapter pide `PRECTOT`, validación espera `PRECTOTCORR` → validación de precipitación de NASA POWER nunca se ejecuta | **Cerrado por cambio de adapter**: `nasa-power.js` ahora solicita `PRECTOTCORR` (`PARAMETERS` array, línea 4), coincide con `SOURCE_FIELD_MAP` de `02-validation/index.js:25` y con `03-normalization/index.js:410-417`. El mismatch ya no existe en ningún punto de la cadena. |
| **HALLAZGO-2**: wildcard `results[*].elevation` nunca resuelve en `resolvePath()` | **Indicios de cierre por cambio de configuración, no de código**: `validation-profiles.json` usa hoy `results[0].elevation` (verificado por grep, líneas 40 y 45), no `results[*].elevation`. Esto evita el wildcard roto usando el path que sí funciona (índice numérico), consistente con la "Mitigación parcial" que la propia auditoría ya señalaba como funcional. **No verificado**: si la metadata sigue reportando el fill value como "rango físico" en vez de "fill value" (el defecto secundario que la auditoría también señalaba). |
| **HALLAZGO-3**: comparación de fechas como enteros `YYYYMMDD` produce falsos positivos en cada cambio de mes (~11/año) para NASA POWER | **Sin evidencia de corrección** — `02-validation/index.js` no aparece en el diff de esta sesión ni se encontró código de comparación de fechas corregido. Se recomienda verificación puntual antes de confiar en `validated_sources[].validation_results` para series de NASA POWER. |
| **HALLAZGO-4**: estructura de paths de GRI Oxford incierta, nunca verificada contra la API real | **Sin evidencia de corrección**, y **confirmado como bloqueante activo** por el propio código de Stage 06 (comentario H-6.9): "Stage 03 ... actualmente NO extrae gri_flood_occurrence/gri_drought_occurrence/gri_extreme_heat_occurrence ... esta es la MISMA incertidumbre ya documentada en HALLAZGO-4 ... SIN RESOLVER". Este es el ejemplo más claro y ya auto-documentado por el propio equipo de una **cascada de hallazgo entre etapas no adyacentes** (Stage 02 → Stage 06, saltándose 03/04/05). |

### 4.3 Cascadas de hallazgos entre etapas (la pregunta explícita del usuario: "contradicciones entre motores", "dependencias ocultas")

**Cascada A — Ausencia de dimensión de escenario SSP (la más importante del pipeline):**
```
HALLAZGO-8 (stage-02, sobre openmeteo.js):
  Open-Meteo CMIP6 solo expone el ensemble HighResMIP (~RCP8.5),
  sin parámetro de escenario SSP en ningún punto de la API
        ↓
Stage 03: canonical_variables nunca lleva un campo "scenario" real
        ↓
Stage 05 (H-5.11, cerrado): scenario del fenómeno queda null / se infiere
  de forma limitada — no hay verdadero soporte multi-escenario
        ↓
Stage 06 (H-6.10, cerrado — pero "cerrado" significa "declarado honestamente
  no implementado", no "implementado"): computeEvaluationCoverage() reporta
  meets_contract=false en TODA ejecución porque el contrato exige 2 escenarios
  y el pipeline estructuralmente solo puede producir 1
        ↓
Stage 07: consume assessments con evaluation_coverage.meets_contract=false
  pero NO lo expone en ninguna vista (ni executive ni analyst) — un usuario
  final nunca ve que el sistema le está diciendo "esto no cumple mi propio contrato"
```
**Este último salto (Stage 06 → Stage 07) es un hallazgo NUEVO de esta auditoría E2E, no capturado por ninguna auditoría individual**: Stage 06 hace el trabajo honesto de declarar `evaluation_coverage.meets_contract=false` por assessment, pero Stage 07 (`response.risk_calculation` en la vista analyst, verificado en `07-presentation/index.js:199-205`) **no incluye ese campo** al proyectar cada assessment — se pierde exactamente el dato que permitiría a un analista ver la brecha declarada por Stage 06. Ver Hallazgo Global #1 en §9.

**Cascada B — GRI Oxford (probabilidad externa autoritativa, nunca activa en la práctica):**
```
HALLAZGO-4 (stage-02): estructura real de la respuesta GRI Oxford nunca
  verificada contra la API en vivo
        ↓
Stage 03: no extrae gri_flood_occurrence / gri_drought_occurrence /
  gri_extreme_heat_occurrence de la respuesta cruda (solo traveltime_healthcare)
        ↓
Stage 06 (H-6.9, "cerrado" en el sentido de estar bien cableado y documentado):
  getExternalProbability() SIEMPRE retorna null en ejecuciones reales
  → probability.source es SIEMPRE "calculated", NUNCA "external", pese a que
    el contrato y el propio rulesApplied de Stage 6 declaran textualmente
    "Probabilidad externa tiene prioridad sobre cálculo interno"
```
Esto significa que una porción entera de la arquitectura de Stage 06 (todo el mecanismo `PHENOMENON_TO_EXTERNAL_PROBABILITY` + `getExternalProbability`) está **construida y probada correctamente pero es código efectivamente inalcanzable en producción hoy**, porque su precondición (Stage 03 extrayendo esos 3 campos) no existe. No es código muerto en el sentido clásico (si Stage 03 se arregla, se activa solo), pero **funcionalmente equivale a código muerto en el estado actual del sistema** — cualquier prueba de que "el sistema prioriza fuentes externas de probabilidad" es falsa en la práctica hoy, aunque el código lo intente.

**Actualización 2026-07-17 (verificación en vivo contra la API real, Lima -12.05/-77.03, HTTP 200):** se investigó qué tan lejos está esta cascada de cerrarse, y el resultado es que **el gap es más profundo de lo que parecía** — no es solo "falta un parseo en Stage 03", es que la API misma no entrega una probabilidad de ocurrencia lista para usar:

- **`isimip`** SÍ tiene `hazard: "drought"` y `hazard: "extreme_heat"` (los 2 hazards que `gri_drought_occurrence`/`gri_extreme_heat_occurrence` necesitarían), pero su `metric` es `"exposure"`, con valores absolutos (`88707.49`, `532244.95` en la muestra) — **no una probabilidad en [0,1]**. Si Stage 03 extrajera este valor tal cual y Stage 06 lo pasara por `Math.max(0, Math.min(1, variable.value))` (como hace hoy `getExternalProbability()`), el resultado se saturaría silenciosamente en `1.0` (100% de probabilidad) para prácticamente cualquier ubicación con exposición no nula — un fallo silencioso peor que no tener el dato.
- **`aqueduct`** SÍ tiene `hazard: "fluvial"` (inundación fluvial) con valores en un rango plausible de probabilidad (`0.0012`, `0.00145`...), pero está indexado por `rp` (período de retorno: 2, 5, 10, 20... años), `rcp`, `epoch` y `gcm` — es una **matriz**, no un escalar. Elegir "la" probabilidad de inundación requiere decidir qué período de retorno, qué RCP/epoch y cómo combinar los GCMs (¿media del ensemble, como ya se hace para CMIP6? ¿un `rp` de referencia, p. ej. 100 años?) — una decisión metodológica real, no una extracción trivial.
- **`jrc_flood`** no tuvo ningún valor no-nulo en la coordenada de prueba (0 de 6) — su cobertura real dentro de Perú no está confirmada.

**Conclusión revisada:** cerrar esta cascada NO es "implementar la extracción en Stage 03" — es primero **decidir la metodología** (qué combinación de `rp`/`rcp`/`epoch`/`gcm` de `aqueduct` representa "la" probabilidad de inundación citable, y si `isimip.exposure` puede transformarse en una probabilidad relativa o si debe descartarse como fuente para sequía/calor extremo). Implementar la extracción sin esa decisión sería fabricar precisión inexistente — exactamente el patrón que H-6.4/H-6.9/H-6.10 ya rechazaron en otros puntos del pipeline. Se documenta el hallazgo empírico aquí; la decisión metodológica queda pendiente y debe tomarla quien tenga criterio científico sobre la elección de período de retorno/escenario, no debe fabricarse en código.

**Cascada C — `min_signal_strength` y su relación con el umbral de activación de fenómenos:**
```
Stage 04: filtra señales con signal_strength.score < 0.40 (min_signal_strength,
  OECD/JRC §5.2) — señal descartada nunca llega a signals[]
        ↓
Stage 05 (H-5.7, cerrado): usa min_phenomenon_activation (separado de
  min_signal_strength, con su propio default) para decidir si el FENÓMENO
  (no la señal individual) está activo
```
Este es un ejemplo de cascada **correctamente resuelta**: la auditoría de Stage 05 identificó que reusar el mismo umbral para dos decisiones conceptualmente distintas (¿la señal es válida? vs. ¿el fenómeno está activo?) era arbitrario, y la corrección introdujo un umbral separado — cerrando la ambigüedad en vez de dejarla implícita. Se documenta aquí como ejemplo positivo de que el patrón de remediación cross-stage sí funciona cuando se aplica.

### 4.4 Contradicciones de nomenclatura y unidades verificadas

- **`RiskLevelEnum`** (`bajo/medio/alto/catastrofico`) es consistente en `types.js`, Stage 06 y Stage 07 — sin contradicción.
- **`SignalTypeEnum`** cambió de 5 a 4 valores (se eliminó `"trend"`, H-18) — el cambio está propagado correctamente a `signal-taxonomy.json` y a Stage 04; no se encontró ningún consumidor huérfano que siga esperando `"trend"`.
- **`PhenomenonNameEnum`** tiene 9 entradas (`types.js:73-76`) pero `phenomenon-definitions.json` — según el propio comentario de Stage 07 (H-7.6) — solo activa 6 (`phenomena` en ese JSON). Los otros 3 (posiblemente `ola_de_frio`, `deslizamiento`, `huayco` en algún estado parcial) existen en el enum y en `display_names` pero **no se verificó si `PHENOMENA_MAP`/`phenomenon-definitions.json` los emite realmente desde Stage 05** — recomendado como verificación puntual (ver Plan de Remediación, ítem P2).

---

## 5. Auditoría de fallos silenciosos (transversal, patrón por patrón)

Se agrupan aquí patrones que aparecen repetidos en múltiples stages, en vez de repetir cada instancia (ya documentada individualmente en cada auditoría de stage).

| Patrón | Dónde aparece | Postura del pipeline (verificada) | Evaluación |
|---|---|---|---|
| **`null` con razón explícita, nunca fabricar un número** | Stage 04 (`components_excluded`), Stage 05 (`signal_metadata.js`), Stage 06 (`getIndicatorValue`, `getExternalProbability`), Stage 07 (`score: null` en fallback de `getRiskContribution`) | Patrón consistente y **defendible**: cuando un dato no existe, el pipeline emite `null` + una razón textual, en vez de `0` o un valor arbitrario. Este es el antídoto correcto al "fallback silencioso" que preocupa al usuario, y está aplicado de forma disciplinada en los stages más nuevos (04-07). | **Positivo** — patrón de diseño recomendado, correctamente generalizado |
| **`?? 0.5` / fallback silencioso a un valor "neutral"** | Aún presente en `getSectorProfiles()` (Stage 06, `if (!existsSync(PROFILES_PATH)) return {sectors:{}, default:{physical_sensitivity:0.5}}`) | Si `sector-profiles.json` no existe físicamente (no si el sector no está en él — eso sí está resuelto con `physical_sensitivity_source`), el sistema opera con sensibilidad 0.5 para TODOS los sectores sin loggear ni alertar. Es un escenario operacional de baja probabilidad (archivo versionado del repo), documentado como "riesgo bajo, respuesta desproporcionada bloquear por esto" en el propio código (H-6.13) | **Aceptado conscientemente, documentado** — riesgo residual bajo, correctamente evaluado |
| **NaN propagándose por aritmética** | Cerrado explícitamente en Stage 06 con guardas `Number.isFinite()` (H-6.11) en el eje `confidence.combined`. **No verificado** en Stage 02 (completitud: `v != null` no excluye `NaN`, HALLAZGO-10/14 de esa auditoría) | Stage 02 sigue teniendo (sin evidencia de fix) el bug clásico de JavaScript `typeof NaN === "number"` que hace que `NaN` pase validaciones de rango y cuente como "presente" en completitud | **Riesgo abierto** — mismo patrón que Stage 06 ya resolvió, pero en Stage 02 no se verificó corrección |
| **Coverage/status colapsado a "medio" por defecto (`catch-all`)** | Stage 06 `classifyRisk` — el `catch-all return "medio"` al final se documentó como **código muerto tras H-6.8** (nunca se alcanza, la partición `≤low_max / ≤medium_max / else alto` es exhaustiva) | Verificado: `classifyRisk` actual ya no tiene ese defecto (simplificado a 3 ramas exhaustivas, sin fallback oculto) | **Cerrado correctamente** |
| **Degradación de "analyst view" con arrays vacíos indistinguibles de "sin datos"** | Cerrado en Stage 07 (H-7.8: `sources_out_of_coverage`/`signal_detail` ahora se pueblan realmente desde `input`, no arrays vacíos fijos) | Verificado en código: `getSourcesOutOfCoverage()`/`getSignalDetail()` existen y leen datos reales | **Cerrado correctamente** |
| **Errores no tipados / `TypeError` genéricos propagándose sin código/detalle estructurado** | Cerrado en Stage 07 (`PresentationError` via `validateInput()`, primer uso real de la jerarquía de `shared/errors.js` en todo el pipeline) | Stages 01-06 **no usan `AcquisitionError`/`ValidationError`/`NormalizationError`/`SignalError`/`RiskError`** pese a que esas clases existen en `shared/errors.js` desde el diseño original — solo Stage 07 las usa hoy | **Riesgo transversal abierto**: la jerarquía de errores tipados existe pero está **subutilizada en 6 de 7 stages**; cualquier excepción no controlada en Acquisition/Validation/Normalization/Signals/Risk se propaga como error JS genérico hacia `engine.js`, que solo extrae `err.code`/`err.message`/`err.detail` (`wrapArtifact`) — si esos campos no existen (porque no es un `StageError`), el artefacto de auditoría queda con `code: undefined` |

**Hallazgo Global nuevo (fallos silenciosos):** `StageInterface.wrapArtifact()` (`shared/stage-interface.js:22`) hace:
```js
error: error ? { code: error.code, message: error.message, detail: error.detail } : null,
```
Si el error lanzado **no** es una instancia de `StageError` (p. ej. un `TypeError` nativo de JS por un campo `undefined` en Stage 02, que no usa `ValidationError` en ningún punto verificado), entonces `error.code` y `error.detail` son `undefined` — el artefacto de auditoría (el mismo artefacto que se expone por `/trace`) registra un fallo con **código `undefined`**, degradando la calidad forense del propio mecanismo de trazabilidad para exactamente el caso que más importa: cuando algo falla de verdad. Esto es distinto del catálogo ya identificado por cada auditoría de stage porque es un fallo del **mecanismo de manejo de errores del orquestador mismo**, no de un cálculo de negocio.

---

## 6. Auditoría de trazabilidad

### 6.1 El artefacto de evidencia (`EvidenceArtifactBuilder`)

Estructura verificada (`pipeline/artifact/builder.js`):
```
{
  artifact_id, execution_id, version: "2.0", created_at,
  pipeline_summary: { total_stages, passed, partial, failed, overall },
  stages: [ { stage_id, stage_name, input, output, rules_applied, duration_ms, status, error } ],
  final_result, narratives: { executive, analyst }, rules_applied  // (Set global, deduplicado)
}
```

**Fortalezas verificadas:**
- Cada stage aporta su propio `rules_applied[]`, y el builder los deduplica en un `Set` global — buen patrón para reconstruir "qué reglas se aplicaron" sin duplicados.
- `sanitizeInput()` en `StageInterface` reemplaza `response` crudo por `"[raw_response]"` antes de guardarlo en el artefacto — evita que el JSON crudo de cada API externa (potencialmente varios MB, y con datos que no deberían persistirse tal cual) infle el artefacto. Correcto y deliberado.
- El endpoint `/trace` expone un resumen liviano (`output_summary: Object.keys(s.output).slice(0,5)`) en vez del artefacto completo — reduce superficie de exposición.

**Debilidades verificadas:**

1. **Persistencia solo en memoria de proceso.** `engine.js`: `this.artifacts.set(...)` es un `Map` en memoria del proceso Node. Si el proceso se reinicia (deploy, crash, restart de PM2/Docker), **todo el historial de trazas desaparece** — el endpoint `/trace/:traceId` para cualquier ejecución anterior al último reinicio retorna 404. No hay persistencia a disco/BD para el artefacto de evidencia completo, solo el `response` final llega al cliente HTTP. Para un sistema cuyo objetivo declarado es la **auditabilidad**, la ausencia de persistencia durable del artefacto de evidencia es una brecha estructural, no un detalle de implementación.
2. **Sin límite de crecimiento del `Map` de artefactos.** `engine.js` nunca purga `this.artifacts` — cada ejecución agrega 2 entradas (`execution_id` y `artifact_id`) que nunca se eliminan. En un proceso de larga duración con tráfico sostenido, esto es una fuga de memoria de crecimiento no acotado. No es un problema de auditabilidad sino de estabilidad operacional, pero **compromete la disponibilidad del propio mecanismo de trazabilidad** en el largo plazo (el proceso eventualmente se reinicia por memoria, perdiendo todo el historial — ver punto 1).
3. **`evaluation_coverage.meets_contract=false` no llega a la vista de presentación** (ya señalado en §4.3, Cascada A) — un dato de trazabilidad genuino, calculado y disponible en Stage 06, se pierde en Stage 07 antes de llegar al analista.
4. **El contrato de Stage 07 (`stage`, `status`, `evidence_artifact` como parte del output de `execute()`)** se investigó y se determinó, correctamente, que esos campos los agrega `wrapArtifact()` en una capa distinta — y se corrigió el **contrato**, no el código, con una justificación explícita de por qué unificarlos en una sola shape sería peor (H-7.13). Este es un ejemplo de remediación de alta calidad: identificar que el problema era el contrato, no la implementación.

### 6.2 Reconstructibilidad de un resultado final (lo que pide explícitamente el usuario en su prompt: "que cada resultado final pueda reconstruirse completamente")

Siguiendo la cadena real para un `risk_level` mostrado en la UI:

```
risk_level (Stage 07, phenomena[].risk_contribution.level)
  ← risk_level (Stage 06, assessments[].risk_level) — trazable: risk_score_raw +
    fórmula expuesta en score_scale.formula (H-7.7)
  ← probability.value + impact.value + adaptive_capacity.score — cada uno con
    su propia `justification` en texto libre citando la fórmula exacta (H-6.9,
    H-6.13, H-6.16 — todas incluyen los valores crudos usados)
  ← phenomenon.confidence.combined (Stage 05) — trazable a source_quality y
    signal_strength de las señales agregadas
  ← signal.source_quality / signal.signal_strength (Stage 04) — trazable a
    componentes individuales con `reason` textual por cada uno (incluidos los null)
  ← canonical_variable.value (Stage 03) — trazable a source_decisions[]
    (qué fuente ganó y por qué score)
  ← source.response (Stage 01/02) — SANITIZADO a "[raw_response]" en el
    artefacto persistido (ver 6.1) — el dato crudo de la API externa NO
    sobrevive en el artefacto de evidencia más allá de la ejecución en memoria
```

**Conclusión de reconstructibilidad:** la cadena es **reconstruible en sus valores numéricos y sus justificaciones textuales de principio a fin** para las etapas 03→07 — este es un logro real y verificado, no una afirmación de marketing del propio código. El eslabón débil es el extremo de Acquisition/Validation (01/02): el dato crudo real de la API externa que originó todo el cálculo **no persiste** en el artefacto (`sanitizeInput` lo reemplaza), y solo existe en el log de proceso o en ningún lado si no hay logging adicional. Para una reconstrucción forense completa ante una auditoría externa real (no solo trazabilidad de fórmulas), sería necesario también persistir — en almacenamiento separado, no en el artefacto ligero — la respuesta cruda de cada fuente por ejecución.

### 6.3 Duración de vida del `trace_id`

Ligado a 6.1 punto 1: el `trace_id` que Stage 07 incluye en `executive_summary` (H-7.2) y que el usuario final podría citar como referencia de auditoría **deja de ser resoluble** en cuanto el proceso Node se reinicia. Esto es una discrepancia entre lo que la narrativa promete ("evidencia completa en trace_id=...") y lo que el sistema puede efectivamente entregar más allá de la vida del proceso.

---

## 7. Auditoría de mantenibilidad

| Dimensión | Evaluación | Evidencia |
|---|---|---|
| **Modularidad** | Alta entre stages (contratos claros, `StageInterface` uniforme desde Stage 04 en adelante — todos `async execute()`), pero **débil dentro de Stage 03**: `_extractVariablesFromSource` sigue siendo un bloque `if (name === "weatherapi")`, `if (name === "nasa_power")`... por fuente (H-A08, sin resolver) — agregar una fuente nueva requiere tocar código de Stage 03, no solo configuración | `03-normalization/index.js` |
| **Acoplamiento** | Bajo entre stages en el diseño declarado (contratos independientes, Stage 07 explícitamente NO importa código de Stage 06 pese a necesitar la misma tabla `confidence_to_probability.mapping` — la duplica deliberadamente como fallback documentado, H-7.4 comentario) — **decisión de diseño correcta y explicada**, no un descuido: mantener los 7 stages "deliberadamente desacoplados" es una decisión de arquitectura de spec-kit citada explícitamente en el código | `07-presentation/index.js` líneas 41-50 |
| **Acoplamiento oculto real** | El mecanismo de fusión plana de `engine.js` (§1.3) es un acoplamiento **implícito** que contradice parcialmente la intención de "stages desacoplados": Stage 07 depende de que Stage 01 y Stage 04 usen exactamente las claves `sources_consulted` y `signals` sin colisión, sin que ningún schema lo garantice | §1.3, H-7.8 |
| **Cohesión** | Alta — cada stage tiene una responsabilidad única y bien definida, verificado en los 7 `index.js` | — |
| **Complejidad** | Concentrada correctamente en Stage 06 (226+ líneas, la lógica analítica más rica) — apropiado dado que es la etapa de mayor responsabilidad de decisión | — |
| **Duplicación de lógica** | `DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING` duplicada literalmente entre Stage 06 y Stage 07 (mismo array, 2 archivos) — **deliberada y documentada** (evitar import cruzado entre stages), no accidental. Riesgo residual: si `thresholds.json` cambia la tabla, **ambos** fallbacks hardcodeados deben actualizarse manualmente en 2 lugares — no hay test que compare ambas copias | `06-risk/index.js:63-69`, `07-presentation/index.js:51-57` |
| **Código muerto** | `pipeline/orchestration/orchestrator.js` completo (§1.2). Además: `classifyRisk` en Stage 06 tenía un catch-all inalcanzable, ya limpiado (H-6.8) | §1.2 |
| **Facilidad de incorporar nuevos componentes** | Buena para nuevos fenómenos/sectores/umbrales (todo externalizado a `pipeline/config/*.json`, cargado vía `config-loader.js` con cache de 60s) — **mala para nuevas fuentes de datos** (requiere tocar Stage 01 adapter + Stage 02 `SOURCE_FIELD_MAP`/`SOURCE_FILL_VALUES` + Stage 03 `_extractVariablesFromSource` + `config-loader.js SOURCE_VARIABLES`, 4 puntos de edición no unificados) | Config-loader.js, múltiples archivos |

**Riesgo de mantenibilidad más alto:** agregar una fuente de datos nueva (p. ej. un servicio meteorológico adicional) toca 4 archivos distintos sin un único punto de registro declarativo — el riesgo de olvidar uno de los 4 (como ya ocurrió históricamente con el mismatch `PRECTOT`/`PRECTOTCORR`, que fue exactamente un desalineamiento entre el adapter de Stage 01 y el `SOURCE_FIELD_MAP` de Stage 02) es estructural, no accidental.

---

## 8. Auditoría de defendibilidad técnica

Síntesis cuantitativa de las 7 auditorías por stage (recuento verificado, no estimado):

| Stage | Elementos evaluados | Completamente fundamentados | Parcialmente fundamentados | Arbitrarios / sin evidencia |
|---|---|---|---|---|
| 01 Acquisition | 8 hallazgos | — | 4 | 4 (2 críticos: país hardcodeado —ya resuelto como decisión de producto—, interpretación Nyquist) |
| 02 Validation | 36 hallazgos | ~13 resueltos con referencia (GCOS-245, ISO 19157, CF Conventions) | ~14 | 3 críticos (bugs de implementación, ver §4.2) |
| 03 Normalization | 47 elementos | 26 (+2 tras corrección 2026-07-17, ver nota) | 16 | 0 críticos — **H-A01/H-A02 cerrados, ver corrección abajo** |
| 04 Signals | ~30 elementos (9 fundamentados originalmente citados + 20 hallazgos) | 9 (decorrelación espacial, rangos WMO, umbrales OECD/JRC) | 4 | 5 críticos — **todos cerrados en código actual** |
| 05 Phenomena | 20 hallazgos | Mayoría con referencia tras remediación | — | 0 — todos cerrados |
| 06 Risk | 18 hallazgos | Mayoría con referencia ISO 31000/IPCC/ND-GAIN tras remediación | Algunos valores de sensibilidad sectorial siguen como "ranking ordinal de juicio experto, no de índice publicado" (declarado honestamente, H-6.4/H-6.12) | 0 críticos abiertos verificados |
| 07 Presentation | 14 hallazgos | Mayoría con referencia (COSO ERM, WCAG, ISO/IEC 25012) tras remediación | Límite editorial no citado en `MAX_PHYSICAL_RECOMMENDATIONS=3` (declarado como tal, H-7.3) | 0 críticos abiertos verificados |

**Corrección (2026-07-17, durante la ejecución del plan de remediación — ver `documentacion-v2/stage-03/AUDITORIA-stage-03-normalization.md`, sección "Estado de Resolución"):** este documento afirmaba que la ponderación 50/50 `completeness`/`proximity` en Stage 03 (`_scoreSources`, H-A01/H-A02) era "el elemento individual más arbitrario que sigue vivo y sin resolver en todo el pipeline". Al ir a implementarle un análisis de sensibilidad (tarea del plan de remediación, G4), se encontró que **`_scoreSources()` ya fue reescrita**: ya no es un peso fijo 50/50 — promedia con igual peso las dimensiones realmente activas para esa decisión (`completeness` + `proximity` siempre, y `resolution_score` como tercera dimensión cuando ≥2 fuentes tienen resolución nativa discriminante), con un `_applyAuthorityGate()` explícito (antes "ficticio", H-A01) y desempate determinista (`_compareScored()`). 32/32 tests de `stage-03-normalization.test.js` pasan. Este era el mismo patrón de desincronización documentación↔código que ya afectaba a stage-02/06/07 (§4.1) — detectado aquí una tercera vez, esta vez durante la ejecución del plan, no en la auditoría inicial.

El elemento individual más arbitrario que **sí** sigue vivo hoy son los valores de `physical_sensitivity`/`transition_sensitivity` por sector en `sector-profiles.json` — ya declarados explícitamente como "ranking ordinal de juicio experto, no de un índice publicado" (H-6.4/H-6.12) con análisis de sensibilidad ±0.2 documentado. Este es el patrón correcto para lo que **no puede** resolverse con datos existentes: declarar el vacío con evidencia de su impacto acotado, en vez de fabricar una fuente inexistente.

---

## 9. Riesgos globales del pipeline (priorizados)

| # | Riesgo | Probabilidad | Impacto | Severidad | Etapa(s) | Prioridad de corrección |
|---|---|---|---|---|---|---|
| G1 | `evaluation_coverage.meets_contract=false` (Stage 06) se calcula pero no llega a ninguna vista de Stage 07 — el sistema sabe que no cumple su propio contrato de cobertura multi-escenario/horizonte y no lo comunica al usuario final ni al analista | Alta (ocurre en el 100% de las ejecuciones hoy, HALLAZGO-8 es estructural) | Medio (no es un error de cálculo, es una omisión de transparencia) | **ALTA** | 06→07 | 1 |
| G2 | Stage 02 (`index.js`) no muestra evidencia de corrección para 2 de sus 3 bugs CRÍTICOS originales (falsos positivos de fecha; estructura GRI Oxford no verificada) mientras 4 stages downstream (03-07) fueron fuertemente endurecidos asumiendo que sus inputs son correctos | Media-Alta (falsos positivos de fecha ocurren ~11 veces/año por fuente NASA POWER, de forma determinística) | Medio (infla warnings, no corrompe valores, pero contamina `source_decisions` con ruido) | **ALTA** | 02 | 1 |
| G3 | GRI Oxford como fuente de probabilidad externa autoritativa (Stage 06) es código correcto pero funcionalmente inalcanzable — Stage 03 no extrae las 3 variables que lo activarían | Alta (100% de las ejecuciones usan el fallback interno, nunca la fuente externa, mientras el `rulesApplied` afirma lo contrario) | Medio (el fallback interno es razonable, pero la afirmación de "prioridad de fuente externa" es falsa en la práctica) | **ALTA** | 02→03→06 | 2 |
| G4 | ~~Ponderación 50/50 completeness/proximity en Stage 03 sin framework de decisión~~ — **CERRADO 2026-07-17**: `_scoreSources()` ya usa activación dinámica de dimensiones (2 o 3, igual peso solo entre las activas) + authority gate explícito + desempate determinista. Ver `documentacion-v2/stage-03/AUDITORIA-stage-03-normalization.md` §Estado de Resolución | — | — | **RESUELTO** | 03 | — |
| G5 | Desincronización documentación↔código en 6 de 7 auditorías por stage (solo Stage 05 tiene sección de resolución actualizada) | Certeza (ya ocurrió, verificado) | Medio (afecta la credibilidad de la auditoría ante terceros, no el sistema en sí) | **MEDIA** | Transversal | 2 |
| G6 | Persistencia del artefacto de evidencia solo en memoria de proceso — todo el historial de trazabilidad se pierde en cada reinicio, y crece sin límite mientras el proceso vive | Alta (todo despliegue reinicia el proceso) | Medio-Alto (compromete el objetivo declarado de auditabilidad para cualquier ejecución anterior a un reinicio) | **MEDIA-ALTA** | Orquestación (`engine.js`) | 2 |
| G7 | Jerarquía de errores tipados (`shared/errors.js`) subutilizada en 6 de 7 stages — errores no controlados llegan al artefacto con `code: undefined` | Media (depende de que ocurra un error real no anticipado) | Medio (degrada la calidad forense justo cuando más se necesita: durante un fallo) | **MEDIA** | 01-06 | 3 |
| G8 | `PipelineOrchestrator` (código muerto) sin marcar como deprecated, con lógica parcialmente distinta a `PipelineEngine` | Baja (requiere que alguien lo reactive por error) | Medio (si se reactiva, el comportamiento de propagación de estado difiere sutilmente) | **BAJA-MEDIA** | Orquestación | 3 |
| G9 | 4 puntos de edición no unificados para agregar una fuente de datos nueva (adapter + `SOURCE_FIELD_MAP` + extracción Stage 03 + `SOURCE_VARIABLES`) — mismo patrón que causó el bug histórico PRECTOT/PRECTOTCORR | Media (cada fuente nueva repite el riesgo) | Medio | **MEDIA** | 01/02/03/config-loader | 3 |
| G10 | Valores de sensibilidad sectorial y pesos de indicadores de CA declarados como "placeholder pendiente de v3/AHP" en múltiples puntos (H-6.4, H-6.12, H-6.16) — riesgo acotado matemáticamente pero real cuando los indicadores divergen mucho entre sí | Media | Bajo-Medio (acotado por análisis de combinación convexa ya documentado) | **BAJA** | 06 | 4 |

---

## 10. Plan de remediación

### Prioridad CRÍTICA / ALTA (antes de cualquier entrega a comité externo o auditoría de terceros)

1. **G2 — Verificar y, si aplica, corregir Stage 02** (`02-validation/index.js`): confirmar si HALLAZGO-3 (comparación de fechas `YYYYMMDD` como enteros) y HALLAZGO-4 (estructura GRI Oxford) siguen presentes tal como se describen en `stage-02/AUDITORIA-...md`. Este es el único stage del pipeline sin ninguna evidencia directa de remediación posterior a su auditoría original — debe pasar por el mismo ciclo que 04→05→06→07 antes de considerar el pipeline uniformemente endurecido.
2. **G1 — Propagar `evaluation_coverage` a Stage 07**: agregar el campo (ya calculado en Stage 06, `assessments[].evaluation_coverage`) a la vista `analyst` de Stage 07 (`risk_calculation[]`, `07-presentation/index.js:199-205`), y considerar un indicador agregado visible incluso en la vista `executive` (p. ej. una nota breve cuando `meets_contract=false` en la mayoría de assessments). Esfuerzo bajo — el dato ya existe, solo falta proyectarlo.
3. **G3 — Cerrar la cascada GRI Oxford**: implementar en Stage 03 la extracción de `gri_flood_occurrence`/`gri_drought_occurrence`/`gri_extreme_heat_occurrence` **solo después de** verificar empíricamente la estructura real de la respuesta de la API GRI Oxford (HALLAZGO-4 de Stage 02 debe resolverse primero — no fabricar el parseo sobre una estructura no confirmada, exactamente como el propio equipo ya decidió correctamente no hacer en H-6.9).
4. ~~**G4 — Stage 03, ponderación de scoring**~~ — **CERRADO 2026-07-17**: verificado que `_scoreSources()` ya implementa exactamente lo que este ítem pedía (framework de 3 dimensiones con activación dinámica de `resolution_score`), sin necesidad de ninguna acción adicional.

### Prioridad MEDIA (antes de la siguiente iteración mayor)

5. **G5 — Actualizar las auditorías desactualizadas**: generar (puede ser semi-automatizado, dado que los comentarios `H-N.M` inline ya son ricos y estructurados) una sección "Estado de Resolución" en `stage-01/02/03/04/06/07/AUDITORIA-*.md`, siguiendo el formato ya usado en `stage-05`.
6. **G6 — Persistencia durable del artefacto de evidencia**: mover `EvidenceArtifactBuilder.build()` output a almacenamiento persistente (tabla en la BD existente de Supabase, o almacenamiento de objetos) en vez de solo `Map` en memoria; agregar TTL/purga explícita en vez de crecimiento no acotado.
7. **G7 — Adoptar la jerarquía de errores tipados en Stages 01-06**: replicar el patrón de Stage 07 (`validateInput()` + error tipado) en los stages restantes, empezando por Stage 02 (el más propenso a fallos de parsing de fuentes externas).
8. **G8 — Eliminar o marcar explícitamente `orchestrator.js` como deprecated**: si no hay plan de uso, eliminarlo (es más seguro que dejarlo como trampa de documentación futura); si hay un plan real de migración, agregar un test que impida que diverja silenciosamente de `engine.js`.
9. **G9 — Unificar el registro de fuentes de datos**: crear un único archivo de configuración declarativo (p. ej. `data-sources-registry.json`) que alimente adapter + `SOURCE_FIELD_MAP` + extracción de Stage 03 + `SOURCE_VARIABLES`, reduciendo de 4 puntos de edición a 1.

### Mejoras recomendadas / controles de calidad y auditoría a incorporar

10. Test de integración que recorra las 7 etapas con un input real de Lima/retail y verifique explícitamente: (a) que `risk_score_raw` nunca es `NaN`; (b) que `evaluation_coverage.meets_contract` se refleja en algún punto del output de Stage 07; (c) que ninguna clave colisiona entre los outputs planos de los 7 stages (protección contra el riesgo de §1.3).
11. Test de contrato (`schema conformance`) que valide el output real de cada `execute()` contra su Zod schema declarado en `shared/types.js` — hoy los schemas existen pero (según lo verificado en varias auditorías por stage) no siempre se aplican en runtime.
12. Snapshot test de `sector-profiles.json`/`adaptive-capacity.json`/`phenomenon-definitions.json` contra los enums de `shared/types.js` (`SUPPORTED_SECTORS`, `PhenomenonNameEnum`) para detectar automáticamente el tipo de desalineamiento que causó H-13 (stage-04) si vuelve a ocurrir.
13. Verificación puntual (no incluida en esta auditoría por alcance) de si los 3 fenómenos adicionales del `PhenomenonNameEnum` (`ola_de_frio`, `deslizamiento`, `huayco`) están realmente activos en `phenomenon-definitions.json` `phenomena[]` o si siguen como entradas de enum sin implementación — ver §4.4.

---

## Conclusión

El Pipeline V2 muestra un patrón de remediación **real, verificado directamente contra el código fuente (no solo contra su propia documentación) y de calidad notablemente alta donde se aplicó**: los stages 04→05→06→07 tienen hoy una disciplina de "declarar el vacío en vez de fabricar precisión" aplicada de forma consistente, con trazabilidad textual excepcional (cada decisión cuantitativa cita su fórmula, su rango y su referencia). Este nivel de rigor es infrecuente y debe reconocerse como tal.

El riesgo real del sistema hoy **no está en los cálculos ya endurecidos**, sino en tres lugares concretos y accionables: (1) el extremo de adquisición/validación (Stage 02) que no recibió el mismo tratamiento y alimenta todo lo demás; (2) una cascada de dependencia entre Stage 02→03→06 (GRI Oxford) que hace que una funcionalidad completa y bien construida sea hoy inalcanzable en la práctica; y (3) la capa de orquestación y persistencia de evidencia, que no fue auditada por ningún documento previo y contiene el hallazgo de mayor impacto estructural para el objetivo de auditabilidad declarado por el usuario: la trazabilidad se pierde en cada reinicio de proceso.

Ninguno de estos tres puntos invalida el pipeline — los tres son corregibles con el mismo patrón de remediación que el propio proyecto ya demostró saber aplicar en Stages 04-07.
