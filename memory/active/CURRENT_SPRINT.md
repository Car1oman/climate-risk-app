# CURRENT SPRINT — P0 Fixes

**Sprint:** P0 — Seguridad Científica y Reputacional  
**Inicio:** 2026-05-26  
**Objetivo:** Fixes de seguridad sin breaking changes antes del refactor semántico P1

---

## Sprint Goal

Eliminar los riesgos P0 activos restantes (UI sin type safety, datos fantasma near_term, término prohibido) sin introducir breaking changes. AI guardrails ya implementados (P0.1-P0.3 ✅).

---

## Tasks

| ID | Tarea | Archivo | Estado |
|----|-------|---------|--------|
| P0.1 | System prompt maestro en Gemini endpoint | `server/routes/ai.js` | ✅ DONE |
| P0.2 | Validador post-generación IA | `server/ai/scientificValidator.js` | ✅ DONE (.js, no .ts) |
| P0.3 | Eliminar respuesta demo que viola política | `server/routes/ai.js:40-54` | ✅ DONE |
| P0.4 | Eliminar @ts-nocheck en 3 archivos | ClimateRiskLookup, RiskPeriodTabs, ExecutiveSummaryCard | PENDING |
| P0.5 | Corregir "Próxima década" | `src/constants/scenarios.ts:58` | PENDING |
| P0.6 | Agregar near_term a PERIOD_TABS y filtros | `RiskPeriodTabs.jsx`, `ClimateRiskLookup.jsx` | PENDING (blocked by T4) |

---

## Success Criteria

- [x] Gemini no puede retornar texto sin pasar validación científica (P0.1-P0.3 ✅)
- [ ] No hay `@ts-nocheck` en los 3 archivos críticos (P0.4)
- [ ] near_term aparece como tab y tiene datos renderizados (P0.6)
- [ ] `nearTermNarrative` agregado a NarrativeReport + buildNarrativeReport (T4)
- [ ] Descripción "Próxima década" eliminada o corregida (P0.5)
- [ ] 770 tests siguen PASS (no regresiones)
- [ ] Build verde

---

## Sprint Siguiente (P1 Sprint 1)

Una vez P0 completo:

1. Crear `src/types/temporal.ts` — `ClimateHorizon`, `HORIZON_REGISTRY`, `LEGACY_HORIZON_ADAPTER`
2. Crear `LEGACY_HORIZON_ADAPTER` y `toClimateHorizon()`
3. Migrar `TemporalPeriod` → `ClimateHorizon` en `consolidatedRisk.ts`
4. Unificar `PERIOD_MAPS` en `climate.js` con `HORIZON_REGISTRY`
5. Agregar `HorizonDisclaimer` obligatorio para `end_century`
6. Eliminar `buildExecutiveSummary` @deprecated
7. Resolver traslape `sanitizeNarrative` vs `buildOperationalNarrative`

---

## Test Baseline

**641 tests (npm test actual):**
- Regression + frontend suites
- Deprecated tests no incluidos en suite por defecto

Objetivo: mantener 641+ PASS al completar P0.
