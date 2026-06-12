# RUNTIME ENTRY PROTOCOL — Climate Risk Platform

**Sistema:** DataRisk Peru — Climate Risk Intelligence Platform  
**Sprint activo:** P0 Fixes (P0.1-P0.3 ✅, P0.4-P0.6 pending)  
**Tests baseline:** 641 PASS (npm test — regression + frontend)  
**Última actualización:** 2026-05-27

---

## REGLA DE ORO

**CodeGraph-first navigation.** No leer archivos completos sin antes localizar símbolos vía grafo.

---

## FASE 1 — CARGAR MEMORIA (mínimo)

| # | Acción | Por qué |
|---|--------|---------|
| 1 | `Read active/CURRENT_CONTEXT.md` | Estado operativo, riesgos, do-not-break |
| 2 | `Read active/CURRENT_SPRINT.md` | Tasks del sprint, success criteria |
| 3 | `Read active/CURRENT_INVARIANTS.md` | Solo invariantes activos del sprint (ligero) |

NO leer SCIENTIFIC_INVARIANTS.md ni archivos de /architecture/ a menos que la tarea lo requiera.

---

## FASE 2 — NAVEGACIÓN SEMÁNTICA (CodeGraph)

| # | Acción | Cuándo |
|---|--------|--------|
| 4 | `codegraph_context(task="<desc>")` | SIEMPRE primero — entry points + related symbols |
| 5 | `codegraph_impact(symbol=<target>)` | ANTES de cambiar cualquier símbolo |
| 6 | `codegraph_trace(from=<entry>, to=<target>)` | Cuando necesitas entender el flujo completo |
| 7 | `codegraph_callees(symbol=<target>)` | Para entender dependencias downstream |

**NO** hacer grep/glob/scaneo de carpetas si el símbolo está en el grafo.

---

## FASE 3 — LECTURA PRECISA (mínimo contexto)

| # | Acción | Cuándo |
|---|--------|--------|
| 8 | `codegraph_node(symbol=<target>, includeCode=true)` | Para leer source de símbolos específicos |
| 9 | `codegraph_explore(query="<symbols relacionados>")` | Para leer varios símbolos en una llamada |
| 10 | `Read(file)` | SOLO si el archivo tiene staleness banner en codegraph_status |

**NO** cargar archivos completos innecesariamente. Confiar en codegraph_node + explore.

---

## FASE 4 — EJECUCIÓN

| # | Acción |
|---|--------|
| 11 | `edit()` — cambios quirúrgicos, mínimo diff |
| 12 | `codegraph_impact(symbol=<target>)` post-cambio — verificar blast radius |

---

## FASE 5 — VALIDACIÓN

| # | Acción |
|---|--------|
| 13 | Verificar invariantes I1-I8 afectados contra CURRENT_INVARIANTS.md |
| 14 | `npm test` (esperar 770+ PASS) |
| 15 | `npm run build` (esperar build verde) |

---

## FASE 6 — ACTUALIZAR MEMORIA (mínimo)

| # | Acción |
|---|--------|
| 16 | `edit active/CURRENT_CONTEXT.md` — riesgos, files in scope, next actions |
| 17 | `edit active/CURRENT_SPRINT.md` — task → DONE |
| 18 | `edit tasks/TASK_QUEUE.md` si completaste algo de la cola |

**NO** expandir documentación. **NO** crear nuevos archivos.

---

## Referencias (no leer sin necesidad)

| Archivo | Propósito | Cuándo leer |
|---------|-----------|-------------|
| `active/ACTIVE_DECISIONS.md` | Decisiones arquitectónicas vigentes | Cuando tu cambio toca modelo temporal/ontológico/AI |
| `active/OPEN_QUESTIONS.md` | Preguntas sin resolver | Cuando tu cambio depende de una decisión pendiente |
| `architecture/SCIENTIFIC_INVARIANTS.md` | Especificación completa I1-I8 | Solo si CURRENT_INVARIANTS.md no es suficiente |
| `architecture/SEMANTIC_MODEL.md` | Vocabulario canónico | Cuando modificas tipos o naming |
| `architecture/PIPELINE_ARCHITECTURE.md` | 9 capas del pipeline | Cuando modificas server/layers/ |
| `tasks/TASK_QUEUE.md` | Cola completa P0→P1→P2 | Para planificar sprints |
| `tasks/NEXT_ACTIONS.md` | Instrucciones concretas próximas | Antes de ejecutar |

---

## Anti-patterns prohibidos

| # | Anti-pattern | Alternativa |
|---|-------------|-------------|
| AP-1 | Leer archivos completos "por si acaso" | `codegraph_node` + `codegraph_explore` |
| AP-2 | grep/glob cuando el símbolo está en el grafo | `codegraph_search` |
| AP-3 | Leer CURRENT_INVARIANTS.md Y SCIENTIFIC_INVARIANTS.md | Solo CURRENT (ligero) |
| AP-4 | Cambiar sin `codegraph_impact` | Calcular blast radius primero |
| AP-5 | Asumir memoria actualizada | Verificar contra código real (drift detectado) |
| AP-6 | Leer MASTER_REFACTOR_PLAN.md completo | Solo secciones relevantes |
| AP-7 | Escanear server/layers/ completo | `codegraph_context` para entry points |
| AP-8 | Crear documentación nueva | Consolidar, no expandir |

---

## Estado de prioridades P0

```
P0.1 — AI system prompt      DONE     ✅
P0.2 — scientificValidator   DONE     ✅ (scientificValidator.js)
P0.3 — Eliminar demo AI      DONE     ✅
P0.4 — Eliminar @ts-nocheck  PENDING  → 3 archivos UI
P0.5 — Corregir "Próxima d." PENDING  → src/constants/scenarios.ts:58
P0.6 — Agregar near_term UI  PENDING  → RiskPeriodTabs + ClimateRiskLookup + ExecutiveSummaryCard
                                       ⚠ blocked by T4 (nearTermNarrative)
T4   — nearTermNarrative     PENDING  → consolidatedRisk.ts + buildNarrativeReport.ts
```
