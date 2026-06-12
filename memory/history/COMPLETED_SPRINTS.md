# COMPLETED SPRINTS — Resumen de Sprints Completados

**Fuente detallada:** `project-memory/HISTORIAL_SPRINTS.md`  
**Tests al finalizar Sprint 22:** 770 (245 frontend + 525 backend) — todos PASS

---

## Sprint 22 — Interactive Timeline UI (2026-05-26)
**Conexión del modelo temporal `ConsolidatedRiskTimeline` con la UI interactiva real.**
- `selectedPeriod` elevado a `ClimateRiskLookup`; tabs controlados externamente
- `ExecutiveSummaryCard`, `AdaptationPanel`, `RiskTimeline` reactivos al período activo
- `timelineRisks` computado via `groupByRiskType()` en `useClimateAnalysis`
- 61 tests nuevos; **770 total**

## Sprint 21 — Temporal & Narrative Unification (2026-05-26)
- `sanitizeNarrative.ts`: 40+ patrones técnico→ejecutivo
- `ConsolidatedRiskTimeline` model + `groupByRiskType()` exportada
- 709 total

## Sprint 20 — Executive Product (2026-05-25)
- Eliminados 4 paneles legacy (NarrativePanel, SignalsPanel, RisksPanel, GRIThreatsPanel)
- `RiskPeriodTabs` con tabs histórico/mediano/largo plazo
- `AdaptationPanel` → fuente `consolidatedRisks`
- 626 total

## Sprint 19 — Temporal Experience & Scenario Toggle (2026-05-25)
- `ScenarioVariant` model: `ConsolidatedRisk` tiene ambos escenarios pre-calculados
- `RiskTimeline` con evolución histórico→2050→2070
- Toggle de escenarios funcional (no decorativo)
- 626 total

## Sprint 18 — Narrative Refinement (2026-05-25)
- `buildOperationalNarrative.ts`: narrativas sin métricas técnicas
- Reglas N1–N6 aplicadas
- `ScientificFooter` visualmente secundario (colapsado)
- ~627 total

## Sprint 17 — Finalization (2026-05-25)
- Lazy loading (MapView 155KB, ScientificFooter, AdaptationPanel)
- `useMemo` para filtros de período
- Barrel limpio; 66 tests frontend nuevos
- 591 total

## Sprint 16 — Narrative UI (2026-05-25)
- UI narrativa ejecutiva completa
- `ExecutiveSummaryCard` (hero), `ConsolidatedRiskCard`, `RiskPeriodSection`
- `ScientificFooter` colapsado

## Sprint 15 — Hook Architecture (2026-05-25)
- `useClimateAnalysis.js`: único hook para fetch + normalización + narrativa
- `ClimateRiskLookup.jsx` reducido a 145 líneas (solo estado UI)
- `PROJ_DATA` hardcodeado eliminado
- 617 total

## Sprint 14 — Normalization Layer (2026-05-22)
- `ConsolidatedRisk` model: 7 RiskTypeSlug, deduplicación por `${riskType}_${period}`
- `normalizeRisks()`: consolida signals[] + risks[] + gri_hazards[]
- 558 total

## Sprint 13 — Cleanup & Extraction (2026-05-22)
- `ClimateRiskLookup.jsx` 1088 → 155 líneas
- 11 subcomponentes extraídos a `src/features/climate-lookup/`
- `TechnicalDetailModal.jsx` eliminado

## Sprints 1–12 (pre-refactor)
- Sprints 1-11: construcción del motor científico backend (9 capas)
- Sprint 12: auditoría de refactorización (diagnóstico del monolito 1088L)
- Tests backend: 525 (invariantes científicos, narrative engine, governance, historical, projection)

---

## Deuda técnica heredada de sprints anteriores

| ID | Descripción | Sprint origen | Fix sprint |
|----|-------------|--------------|-----------|
| DT-01 | @ts-nocheck en 3 archivos UI | Pre-13 | P0.4 |
| DT-02 | Gemini sin guardrails | Pre-15 | P0.1-P0.3 |
| DT-03 | near_term invisible en UI | 14 (normaliza pero no renderiza) | P0.6 |
| DT-04 | 3 modelos temporales contradictorios | Pre-13 | P1.1-P1.4 |
| DT-05 | Dos sistemas narrativos compitiendo | 18+21 | P1.7 |
| DT-06 | PERIOD_MAPS inline en climate.js | Pre-13 | P1.4 |
| DT-07 | classifyRiskLevel duplicado | Pre-13 | P3.3 |
| DT-08 | buildExecutiveSummary @deprecated presente | 14 | P1.6 |
| DT-09 | flood_risk→lluvias_extremas semánticamente incorrecto | 14 | P2.3 |
| DT-10 | heladas sin detección Layer2 | Pre-13 | P3.1 |
