# Contraste y Unificación de Auditorías — Pipeline V2

**Documentos contrastados:**
- `AUDITORIA-E2E-PIPELINE-V2.md` (este equipo, 2026-07-17) — verificado línea por línea contra el código fuente real.
- `AUDITORIA-ADICIONAL-PIPELINE-V2.md` (segundo punto de vista, 2026-07-17).

**Método:** cada afirmación divergente del documento adicional se verificó de nuevo contra el código fuente actual (no contra ninguno de los dos documentos). Se usa evidencia directa: `wc -l`, `grep` sobre el código real, lectura de archivos completos ya hecha en la auditoría E2E.

---

## 1. Hallazgos del documento adicional que SE CORROBORAN (evidencia directa confirma)

| Hallazgo adicional | Verificación | Ya estaba en E2E como |
|---|---|---|
| Dos orquestadores, `orchestrator.js` es código muerto | Confirmado — `grep "new PipelineOrchestrator"` sin resultados en todo el repo | Hallazgo Transversal #2 / G8 |
| Artefactos solo en memoria (`Map`), se pierden al reiniciar | Confirmado en `engine.js` (`this.artifacts = new Map()`, sin persistencia a disco) | §6.1 / G6 |
| `Object.assign` mezcla claves entre stages sin aislamiento | Confirmado — `pipelineState` se fusiona plano tras cada stage | §1.3 |
| Stage 03: ponderación 50/50 completeness/proximity sin resolver | **Corrección posterior (2026-07-17):** al ejecutar el plan de remediación se encontró que esto era falso — `_scoreSources()` ya fue reescrita (framework de 3 dimensiones con activación dinámica, authority gate explícito, desempate determinista). Ambos documentos (E2E y adicional) coincidían en un hallazgo que resultó estar desactualizado — mismo patrón de desincronización doc↔código que ambos ya habían señalado para otros stages, aplicado aquí sin que ninguno lo detectara hasta la ejecución | §8 / G4, cerrado en `AUDITORIA-E2E-PIPELINE-V2.md` |
| Documentación de Stage 06 y 07 desincronizada del código | Confirmado — verificado línea por línea, ambos documentos describen bugs ya corregidos | Hallazgo Transversal #1 / G5 |
| Jerarquía de errores (`shared/errors.js`) solo la usa Stage 07 | Confirmado — ningún otro `index.js` de stage referencia `AcquisitionError`/`ValidationError`/etc. | §5 / G7 |
| Stage 02 (1051 líneas) y Stage 03 (1301 líneas) son los más extensos/complejos | Confirmado con `wc -l` exacto: 1051 y 1301 líneas respectivamente | Nuevo detalle cuantitativo, se incorpora |

## 2. Hallazgos del documento adicional que SE CONTRADICEN (la evidencia directa los desmiente)

| Afirmación del documento adicional | Evidencia real | Veredicto |
|---|---|---|
| `PipelineEngine.execute(bbox, runOptions)`; "Timeout por stage: 5 minutos"; "Reintentos: 2 por stage" | `engine.js` no tiene ningún `setTimeout`, `Promise.race`, ni lógica de reintento (`grep` sin resultados). El método real es `run(input)` con `input = {coordinates, sector, view}` | **Fabricado** — no existe en el código |
| "Módulos: CommonJS (`require`/`module.exports`)" | 100% del pipeline usa ES Modules (`import`/`export`, `import.meta.url`) — verificado en los 7 stages, orquestación y shared | **Incorrecto** |
| "Tests: No determinado (no se encontraron tests en la exploración)" | 18 archivos `*.test.js` existen en `tests-new/pipeline/` (confirmado con `find`), y las auditorías por stage ya citan sus resultados (p. ej. "105 tests totales" en stage-05) | **Incorrecto / exploración incompleta** |
| "G1: `evaluation_coverage` no se propaga del **Stage 04** al Stage 07" | `evaluation_coverage` se calcula en **Stage 06** (`computeEvaluationCoverage()`, `06-risk/index.js`), no en Stage 04. El hallazgo de fondo (no llega a Stage 07) es correcto, pero la etapa de origen está mal atribuida | **Parcialmente correcto, mal atribuido** — coincide con G1 de la auditoría E2E una vez corregida la etapa de origen |
| Tabla §8.2: Stage 04 "valida entrada ✅"; Stage 07 "valida entrada ⚠️, valida salida ❌" | `grep "safeParse|validateInput"` en los 7 `index.js`: **solo Stage 07** tiene validación de input (`PresentationInputSchema.safeParse` + `throw PresentationError`), y es completa, no parcial. Stage 04 no valida su input con ningún schema | **Invertido** — la tabla asigna la validación al stage que no la tiene y subestima la del que sí la tiene |
| "H3.2: `calculateDistance()` usa fórmula simplificada (no Haversine)" | No existe ninguna función `calculateDistance` ni referencia a Haversine en `pipeline/` (`grep` sin resultados en todo el árbol) | **Fabricado** — no corresponde a ningún código de este pipeline |
| Fallos silenciosos: "Stage 06: Risk scores sin datos se setean en 0" | Verificado: `caScore = adaptiveCapacity.score ?? thresholds.adaptive_capacity?.default ?? 3` — el fallback documentado es **3** (punto medio de la escala, máxima entropía), nunca 0 | **Incorrecto** |
| Fallos silenciosos: "Stage 07: Errores de render se atrapan y devuelven parcial" | Verificado: Stage 07 **lanza** `PresentationError` (vía `validateInput()`) cuando `location` falta o es inválido — no atrapa y degrada silenciosamente | **Incorrecto** |
| Encabezado "STAGE顺序" (Sección 1) | Artefacto de codificación / corrupción de texto en el propio documento | Indicador de baja fiabilidad general del documento |

## 3. Hallazgos del documento adicional NO VERIFICABLES / demasiado vagos para actuar

- H1.1 ("`adapter.parse()` no valida estructura JSON"), H1.2 ("logging excesivo"), H2.3 ("falta validación de coordenadas contra bbox de Perú" — **de hecho ya existe**, en `LocationSchema` de `shared/types.js`, aplicada por `engine.js` antes de que corra ningún stage), H2.4 ("algunos campos se marcan warning cuando deberían ser error", sin ubicación específica), H3.3 ("manejo de valores faltantes inconsistente entre substage"): ninguno cita archivo/línea concreta, y varios contradicen código ya verificado (H2.3). Se descartan como hallazgos accionables; no se incorporan a la lista unificada.

## 4. Veredicto sobre la fiabilidad relativa de ambos documentos

El documento adicional acierta en las conclusiones estructurales de más alto nivel (orquestador muerto, persistencia débil, docs desincronizadas, ponderación 50/50 sin resolver, errores tipados subutilizados) — es decir, converge con la auditoría E2E en el diagnóstico general. Sin embargo, contiene **múltiples afirmaciones específicas fabricadas o contradichas por el código real** (timeouts/reintentos inexistentes, CommonJS en un proyecto 100% ESM, ausencia de tests que sí existen, una función Haversine que no existe, atribución de stage incorrecta). Esto es consistente con un documento generado con menor verificación directa de código (posiblemente por patrones/heurísticas o por lectura parcial) en lugar de lectura línea por línea. **Para esta unificación se descartan todas las afirmaciones de la sección 2 y 3, y se conservan solo las de la sección 1.**

## 5. Lista unificada de riesgos globales (reemplaza la tabla §9 de `AUDITORIA-E2E-PIPELINE-V2.md`)

Sin cambios de fondo respecto al documento E2E original — el contraste no aportó ningún riesgo nuevo válido, solo corroboró G3/G4/G5/G6/G7/G8 y afinó G1 con una etapa de origen ya correcta en el documento E2E. La tabla de riesgos priorizados de `AUDITORIA-E2E-PIPELINE-V2.md` §9 (G1-G10) se mantiene como la lista de referencia única y vigente.

---

*A partir de este documento se inicia la ejecución del plan de remediación (Sección 10 de `AUDITORIA-E2E-PIPELINE-V2.md`), comenzando por los ítems de Fase 1/Prioridad Alta que no requieren decisiones de producto o científicas pendientes.*
