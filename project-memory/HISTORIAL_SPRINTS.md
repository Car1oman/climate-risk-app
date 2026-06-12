# Historial de Sprints — Climate Risk App

> Consolidación de sprints 12–22. Cada sprint está completo; el código actual refleja todos los cambios descritos.

---

## Sprint 22 — Interactive Timeline UI (2026-05-26)
**Conexión del modelo temporal `ConsolidatedRiskTimeline` con la UI interactiva real.**
- Estado `selectedPeriod` elevado a `ClimateRiskLookup`; tabs controlados externamente
- `ExecutiveSummaryCard`, `AdaptationPanel`, `RiskTimeline` reaccionan al período activo
- `timelineRisks` computado via `groupByRiskType()` en `useClimateAnalysis`
- 61 tests nuevos; 770 total (245 frontend + 525 backend)

## Sprint 21 — Temporal & Narrative Unification (2026-05-26)
**Sanitización narrativa Layer9 y modelo timeline derivado.**
- `sanitizeNarrative.ts`: 40+ patrones de reemplazo técnico→ejecutivo
- `ConsolidatedRiskTimeline` como vista agrupada por riesgo con todos los períodos
- `groupByRiskType()` función exportada y tipada
- `buildExecutiveNarrative()` sanitiza textos Layer9 antes de renderizar
- 68 tests sanitizador + 15 tests groupByRiskType; 709 total

## Sprint 20 — Executive Product (2025-05-25)
**Cierre ejecutivo: eliminación de legado, briefing ejecutivo, consolidación UX.**
- Eliminados: `NarrativePanel`, `SignalsPanel`, `RisksPanel`, `GRIThreatsPanel`
- `RiskPeriodTabs`: tabs histórico/mediano/largo plazo (reduce scroll ~60%)
- `AdaptationPanel` reescrito: fuente `consolidatedRisks` en lugar de raw API
- `ExecutiveSummaryCard` responde 4 preguntas ejecutivas
- Empty states: inicial, sin riesgos, baja confianza
- 626 tests PASS

## Sprint 19 — Temporal Experience & Scenario Toggle (2025-05-25)
**Toggle de escenarios funcional (no decorativo) y evolución temporal.**
- `ScenarioVariant` model: cada `ConsolidatedRisk` tiene ambos escenarios pre-calculados
- `RiskTimeline`: evolución histórico → 2050 → 2070 con narrativa diferenciada
- `HIGH_EMISSION_EXTRA_IMPACTS`: impactos adicionales bajo altas emisiones
- `buildTemporalEvolutionSentence`: oración de evolución por tipo de riesgo
- 626 tests PASS (525 backend + 101 frontend)

## Sprint 18 — Narrative Refinement (2025-05-25)
**Eliminación de lenguaje científico crudo de la experiencia principal.**
- `buildOperationalNarrative.ts`: narrativas operativas sin métricas técnicas
- Reglas N1–N6: sin IPCC, deduplicación, keyMetric solo en ScientificFooter
- `ConsolidatedRiskCard` sin keyMetric visible; "Respaldado por N fuentes"
- `ScientificFooter` visualmente secundario (colapsado, muted)
- ~627 tests PASS

## Sprint 15 — Hook Architecture (2025-05-25)
**Separación completa de lógica climática y UI.**
- `useClimateAnalysis.js`: único hook para fetch, normalización y narrativa
- `ClimateRiskLookup.jsx` reducido a solo estado UI (145 líneas)
- `NarrativeReport` extendido con `historicalNarrative`, `midTermNarrative`, `longTermNarrative`
- Layer9 conectado al backend (`buildProjectionContext` en `server/routes/climate.js`)
- `PROJ_DATA` hardcodeado eliminado de `ProjectionScenarioCard`
- 617 tests PASS (525 backend + 92 frontend)

## Sprint 14 — Normalization Layer (2026-05-22)
**Capa de normalización semántica: un fenómeno → una tarjeta.**
- `ConsolidatedRisk` model: 7 RiskTypeSlug canónicos, deduplicación por `${riskType}_${period}`
- `normalizeRisks()`: consolida signals[] + risks[] + gri_hazards[]
- `RISK_TYPE_DISPLAY`, `METRIC_DISPLAY`, `SCENARIO_DISPLAY` en `src/constants/`
- Preview no destructivo en panel verde (paneles legacy intactos)
- 558 tests PASS (525 backend + 33 frontend)

## Sprint 13 — Cleanup & Extraction (2026-05-22)
**Refactorización Fase 1: ClimateRiskLookup.jsx 1088 → 155 líneas.**
- Subcomponentes extraídos a `src/features/climate-lookup/components/`
- Constantes movidas a `constants.js`, helpers a `utils.js`
- 7 rutas "coming soon" desactivadas en App.jsx
- `TechnicalDetailModal.jsx` eliminado (stub vacío)
- Build verde, tests sin regresiones

## Sprint 12 — Refactoring Audit (2026-05-22)
**Auditoría y plan de refactorización hacia plataforma narrativa ejecutiva.**
- Diagnóstico de 8 problemas arquitectónicos (monolito 1088 líneas, triplicación de riesgos, PROJ_DATA hardcodeado, etc.)
- Propuesta de nueva arquitectura: dominio canónico, capa de normalización, UI temporal
- Plan en 4 fases (limpieza → normalización → UI narrativa → optimización)

---

*Los sprints 16 y 17 no tienen documentos independientes; sus cambios están reflejados en los sprints posteriores que los extendieron.*
