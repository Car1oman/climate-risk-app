# MIGRATION HISTORY — Historial de Migraciones

Registro de migraciones de modelos, contratos y APIs.

---

## MIG-001 — PROJ_DATA eliminado (Sprint 15)

**Antes:** `PROJ_DATA` hardcodeado en `ProjectionScenarioCard` con proyecciones ficticias de fallback.  
**Después:** Layer9 conectado al backend real (`buildProjectionContext` en `server/routes/climate.js`).  
**Estado:** Completo. No hay rollback.

---

## MIG-002 — ClimateRiskLookup.jsx 1088 → 155 líneas (Sprint 13)

**Antes:** Monolito de 1088 líneas con todo mezclado (fetch, lógica, UI, constantes, helpers).  
**Después:** 155 líneas de orquestador + 11 subcomponentes en `src/features/climate-lookup/`.  
**Estado:** Completo. No hay rollback.

---

## MIG-003 — TechnicalDetailModal eliminado (Sprint 13)

**Antes:** Modal de detalle técnico con terminología IPCC cruda.  
**Después:** Eliminado. Información técnica movida a ScientificFooter.  
**Estado:** Completo.

---

## MIG-004 — 3 arrays raw → ConsolidatedRisk (Sprint 14)

**Antes:** UI consumía `signals[]`, `risks[]`, `gri_hazards[]` por separado → triplicación.  
**Después:** `normalizeRisks()` consolida los 3 en `ConsolidatedRisk[]` deduplicado.  
**Estado:** Completo. Los 3 arrays siguen llegando de la API pero se consumen en normalizeRisks.

---

## MIG-005 — Panels legados → ConsolidatedRisk UI (Sprint 20)

**Antes:** NarrativePanel, SignalsPanel, RisksPanel, GRIThreatsPanel activos.  
**Después:** Eliminados. Reemplazados por ExecutiveSummaryCard + RiskPeriodTabs + ConsolidatedRiskCard.  
**Estado:** Completo. No hay rollback.

---

## Migraciones pendientes (del MASTER_REFACTOR_PLAN)

| ID | Migración | Sprint | Breaking |
|----|-----------|--------|---------|
| MIG-P0 | POST /api/ai → POST /api/ai/enrich con guardrails | P0 | Sí (path+schema) |
| MIG-P1.1 | crear src/types/temporal.ts | P1 | No (additive) |
| MIG-P1.3 | TemporalPeriod → ClimateHorizon | P1 | Sí — consumers |
| MIG-P1.4 | PERIOD_MAPS inline → HORIZON_REGISTRY | P1 | Sí — API keys |
| MIG-P1.6 | Eliminar buildExecutiveSummary @deprecated | P1 | No (verificar tests) |
| MIG-P1.7 | Unificar sanitizeNarrative + buildOperationalNarrative | P1 | Sí — tests sanitizador |
| MIG-P2.1 | crear src/types/ontology.ts | P2 | No (additive) |
| MIG-P2.3 | Separar riverine_flood de extreme_precipitation | P2 | Sí — normalizeRisks |
| MIG-P2.4 | ENSO → observational_only en pipeline | P2 | Sí |
