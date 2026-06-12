# DECISION LOG — Registro de Decisiones Arquitectónicas

Decisiones ya ejecutadas e irrevocables (no confundir con ACTIVE_DECISIONS.md que son decisiones pendientes de implementar).

---

## DL-001 — Eliminar 4 paneles legacy en Sprint 20

**Fecha:** 2026-05-25  
**Decisión:** Eliminar NarrativePanel, SignalsPanel, RisksPanel, GRIThreatsPanel de la UI.  
**Rationale:** Legado del monolito 1088L. Los datos están disponibles vía ConsolidatedRisk y la nueva UI narrativa los supera.  
**Impacto:** No hay rollback — los componentes están eliminados. Sus datos siguen disponibles en la API.

---

## DL-002 — Adoptar ConsolidatedRisk como modelo central (Sprint 14)

**Fecha:** 2026-05-22  
**Decisión:** Deduplicar por `(riskType × period)` — una sola entidad por combinación, no arrays paralelos de signals/risks/gri.  
**Rationale:** El monolito original triplicaba cada riesgo (en signals[], risks[], gri_hazards[]). La deduplicación normaliza a una entidad canónica.  
**Impacto:** `normalizeRisks()` es la función de entrada única. Los 3 arrays raw de la API se consumen internamente.

---

## DL-003 — Elevar selectedPeriod a ClimateRiskLookup (Sprint 22)

**Fecha:** 2026-05-26  
**Decisión:** `selectedPeriod` como estado elevado al orquestador, no local en RiskPeriodTabs.  
**Rationale:** ExecutiveSummaryCard y AdaptationPanel necesitan reaccionar al período activo — state lifting era necesario.  
**Impacto:** Props drilling a 3 componentes (ExecutiveSummaryCard, AdaptationPanel, RiskTimeline).

---

## DL-004 — buildOperationalNarrative como sistema narrativo principal (Sprint 18)

**Fecha:** 2026-05-25  
**Decisión:** Usar `buildOperationalNarrative.ts` (genera texto ejecutivo limpio) en lugar de mostrar textos raw de Layer9.  
**Rationale:** Layer9 genera texto con códigos IPCC, jerga científica. El usuario ejecutivo no los necesita.  
**Impacto:** sanitizeNarrative.ts existe como parche paralelo (deuda DT-05 — resolver en P1.7).

---

## DL-005 — ScientificFooter colapsado (Sprint 18)

**Fecha:** 2026-05-25  
**Decisión:** Mover keyMetrics, fuentes y referencias al ScientificFooter colapsado (muted, secundario).  
**Rationale:** La UI ejecutiva prioriza narrativa operacional sobre métricas técnicas.  
**Impacto:** keyMetric ya NO aparece en ConsolidatedRiskCard ni ExecutiveSummaryCard.

---

## DL-006 — Lazy loading para MapView y chunks grandes (Sprint 17)

**Fecha:** 2026-05-25  
**Decisión:** Lazy load para MapView (155KB), ScientificFooter, AdaptationPanel.  
**Rationale:** MapView es pesado y no es crítico para el primer render.  
**Impacto:** Route splitting activo — no cambiar sin evaluar bundle size.

---

## DL-007 — Desactivar 7 rutas "coming soon" (Sprint 13)

**Fecha:** 2026-05-22  
**Decisión:** Desactivar en App.jsx las 7 rutas de features no implementadas.  
**Rationale:** Reducir superficie de prueba y navegación ambigua.  
**Impacto:** Rutas desactivadas. Reactivar cuando se implementen las features correspondientes.

---

## DL-008 — Auditoría 10 capas como source of truth del estado actual

**Fecha:** 2026-05-26  
**Decisión:** La auditoría en `project-memory/auditoria.md` documenta el estado real del sistema con 10 hallazgos transversales.  
**Rationale:** Antes del refactor semántico, necesitamos un diagnóstico completo.  
**Impacto:** Este documento es la referencia definitiva para entender el sistema PRE-MASTER_REFACTOR_PLAN.
