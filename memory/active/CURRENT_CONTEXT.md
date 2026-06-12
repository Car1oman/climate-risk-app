# CURRENT CONTEXT — Climate Risk Platform

**Actualizado:** 2026-05-27  
**Sprint activo:** P0 Fixes — Guardrails, Type Safety, near_term UI

---

## Current Mission

Implementar el Plan Maestro de Refactorización Semántica y Científica definido en `project-memory/MASTER_REFACTOR_PLAN.md`. El sistema actual tiene contratos rotos entre la ciencia CMIP6, el backend y el frontend. La misión es reescribir desde la semántica hacia arriba.

---

## Active Sprint

**P0 Fixes (sin breaking changes)**

Los P0 son fixes de seguridad científica/reputacional que deben hacerse PRIMERO antes de cualquier refactor semántico.

P0.1 ✅ — System prompt en `server/routes/ai.js` (DONE)
P0.2 ✅ — `scientificValidator.js` en `server/ai/` (DONE — archivo .js, no .ts)
P0.3 ✅ — Respuesta demo eliminada de `ai.js` (DONE)
P0.4 — Eliminar `@ts-nocheck` en 3 archivos UI críticos (PENDING)
P0.5 — Fix descripción "Próxima década" en `src/constants/scenarios.ts:58` (DONE ✅)
P0.6 — Agregar `near_term` (corto_plazo) a PERIOD_TABS y filtros (PENDING)  

---

## Current Priorities

**P0 (activos, sin breaking changes):**
- @ts-nocheck en ClimateRiskLookup.jsx, RiskPeriodTabs.jsx, ExecutiveSummaryCard.jsx
- "Próxima década" en scenarios.ts:58 → término prohibido por SEMANTIC_MODEL.md
- near_term data existe pero invisible en UI (bug confirmado)
- AI guardrails ya implementados (system prompt + validator) — riesgo reputacional resuelto

**P1 Sprint siguiente (post-P0):**
- Crear `src/types/temporal.ts` con `ClimateHorizon` + `HORIZON_REGISTRY`
- Migrar `TemporalPeriod` → `ClimateHorizon` en `consolidatedRisk.ts`

---

## Critical Invariants

Ver `CURRENT_INVARIANTS.md` para lista completa. Los más críticos activos:

- I1: Confianza no puede superar el máximo del horizonte (end_century → max 'low')
- I2: end_century siempre con disclaimer visible, no colapsado
- I3: ENSO nunca proyectado en horizontes futuros
- I5: precipitación nunca 'high' confidence en proyecciones
- I6: sin valores financieros en narrativa

---

## Active Architectural Decisions

- `ConsolidatedRiskTimeline` es el modelo actual de agrupación temporal (Sprint 22)
- `selectedPeriod` estado elevado a `ClimateRiskLookup` (Sprint 22)
- `groupByRiskType()` es la función canónica de agrupación temporal
- El sistema narrativo usa `buildOperationalNarrative.ts` como fuente principal
- `sanitizeNarrative.ts` limpia textos raw de Layer9 (sistema paralelo — deuda P1.7)

---

## Files In Scope (P0)

```
src/features/climate-lookup/components/RiskPeriodTabs.jsx   ← P0.4 + P0.6
src/features/climate-lookup/ClimateRiskLookup.jsx           ← P0.4 + P0.6
src/features/climate-lookup/components/ExecutiveSummaryCard.jsx  ← P0.4 + P0.6
src/constants/scenarios.ts                                  ← P0.5
src/domain/buildNarrativeReport.ts                          ← P0.6 (nearTermNarrative)
src/domain/consolidatedRisk.ts                              ← P0.6 (NarrativeReport)
```

---

## Known Risks

1. `@ts-nocheck` en archivos críticos oculta errores de tipo reales (P0.4)
2. `corto_plazo` / `near_term` tiene datos reales pero no se renderiza en UI (P0.6)
3. NarrativeReport no tiene `nearTermNarrative` — si se activa tab, narrativa será undefined (P0.6 gap)
4. `end_century` (2060-2079) no tiene datos CMIP6 reales — solo narrativa hardcodeada
5. `PERIOD_MAPS` inline en `climate.js:417-431` devuelve keys incorrectas (`corto` en lugar de `corto_plazo`)
6. Gemini guardrails ya implementados (system prompt + validator) — riesgo resuelto
7. ~~Periodos huérfanos fallan silenciosamente~~ — **RESUELTO**: invariant checks en 5 archivos
8. ~~AdaptationPanel mezclaba períodos (C3+C4)~~ — **RESUELTO Fase 3B**: guard `!selectedPeriod`, fallback eliminado

---

## Do Not Break

- 641 tests existentes (npm test — regression + frontend) — todos deben seguir PASS
- `useClimateAnalysis.js` — hook bien diseñado, no alterar interfaz pública
- `ConsolidatedRisk` model — tipo canónico actual, migrar con adapter
- `groupByRiskType()` — función exportada con tests
- `buildNarrativeReport.ts` — punto de ensamblado narrativo
- `normalizeRisks()` — función de normalización semántica

---

## Next Actions

1. T4: Agregar `nearTermNarrative` a NarrativeReport + buildNarrativeReport (PRIMERO — gap)
2. Ejecutar P0.4: eliminar `@ts-nocheck` de los 3 archivos
3. Ejecutar P0.5: corregir "Próxima década" en `scenarios.ts:58`
4. Ejecutar P0.6: agregar near_term a PERIOD_TABS + filtros (DESPUÉS de T4)
5. Correr tests — asegurar 770 PASS
6. Iniciar P1.1: crear `src/types/temporal.ts`
