# TASK QUEUE — Cola de Tareas

**Actualizado:** 2026-05-27

---

## P0 — Semana actual (sin breaking changes)

| ID | Tarea | Archivos | Estado |
|----|-------|---------|--------|
| P0.1 | System prompt en `ai.js` | `server/routes/ai.js` | ✅ DONE |
| P0.2 | Crear `scientificValidator` | `server/ai/scientificValidator.js` | ✅ DONE (.js, no .ts) |
| P0.3 | Eliminar respuesta demo `ai.js:40-54` | `server/routes/ai.js` | ✅ DONE |
| P0.4 | Eliminar @ts-nocheck × 3 archivos | `ClimateRiskLookup.jsx`, `RiskPeriodTabs.jsx`, `ExecutiveSummaryCard.jsx` | PENDING |
| P0.5 | Corregir "Próxima década" | `src/constants/scenarios.ts:58` | PENDING |
| P0.6 | Agregar near_term a PERIOD_TABS + filtros | `RiskPeriodTabs.jsx`, `ClimateRiskLookup.jsx:113-124`, `ExecutiveSummaryCard.jsx:11-15` | PENDING (blocked by T4) |
| T4 | nearTermNarrative en NarrativeReport | `consolidatedRisk.ts`, `buildNarrativeReport.ts` | PENDING (prerequisite) |

---

## P1 Sprint 1 — Semántica Temporal (post-P0)

| ID | Tarea | Breaking | Dependencia |
|----|-------|---------|------------|
| P1.1 | Crear `src/types/temporal.ts` | No | — |
| P1.2 | Crear `LEGACY_HORIZON_ADAPTER` + `toClimateHorizon()` | No | P1.1 |
| P1.3 | Migrar `TemporalPeriod` → `ClimateHorizon` | Sí | P1.1, P0.4 |
| P1.4 | Unificar `PERIOD_MAPS` en `climate.js` con `HORIZON_REGISTRY` | Sí | P1.1 |
| P1.5 | `HorizonDisclaimer` obligatorio para `end_century` | No | P1.1 |
| P1.6 | Eliminar `buildExecutiveSummary` @deprecated | No | verificar tests |
| P1.7 | Resolver traslape `sanitizeNarrative` vs `buildOperationalNarrative` | Sí | — |

---

## P1 Sprint 2 — Ontología de Riesgo

| ID | Tarea | Breaking | Dependencia |
|----|-------|---------|------------|
| P2.1 | Crear `src/types/ontology.ts` | No | — |
| P2.2 | `HAZARD_REGISTRY` completo | No | P2.1 |
| P2.3 | Separar `riverine_flood` de `extreme_precipitation` | Sí | P2.1 |
| P2.4 | `enso_el_nino/la_nina` como `observational_only` | Sí | P2.1 |
| P2.5 | `LEGACY_SLUG_TO_HAZARD` adapter | No | P2.1 |
| P2.6 | Mostrar p10/p90 en HazardCard | No | P1.3 |

---

## P2 Sprint 3 — Refactor Científico

| ID | Tarea | Breaking | Dependencia |
|----|-------|---------|------------|
| P3.1 | Umbrales de helada (Tmin) en Layer2 | No (additive) | — |
| P3.2 | Regionalizar umbrales costa/sierra/selva | Sí | LocationContext model |
| P3.3 | Unificar `classifyRiskLevel` (eliminar duplicado) | Sí | P2.1 |
| P3.4 | Confidence propagation correcta (precipitation=low) | Sí | ConfidenceEngine |
| P3.5 | Vulnerability stubs en H×E×I | No | nueva entidad |

---

## Backlog P3 (roadmap a largo plazo)

- P4.1: Multi-asset model (facility_id, portfolio)
- P4.2: Multi-tenant auth en todos endpoints
- P4.3: DCPP evaluation (0-10 años decadal)
- P4.4: Integración SENAMHI para validación observacional
- P4.5: Segmentación regional CMIP6 (costa/sierra/selva)
