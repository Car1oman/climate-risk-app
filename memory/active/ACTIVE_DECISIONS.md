# ACTIVE DECISIONS

Decisiones arquitectónicas vigentes. No tomar decisiones que contradigan estas sin revisión explícita.

---

## AD-001 — Temporal Model: ClimateHorizon como tipo canónico

**Fecha:** 2026-05-26  
**Contexto:** El sistema tiene 3 modelos temporales contradictorios: backend usa `corto/mediano`, frontend usa `corto_plazo/mediano_plazo`, ciencia CMIP6 usa `near-term/mid-term`. El MASTER_REFACTOR_PLAN unifica en `ClimateHorizon`.  
**Decisión:** Adoptar `ClimateHorizon` = `'baseline' | 'near_term' | 'mid_century' | 'end_century'` como tipo canónico en todo el sistema.  
**Rationale científico:** CMIP6 produce medias multi-modelo de períodos de 20 años. "Corto plazo" para 2020-2039 (19 años, parcialmente en el pasado) es científicamente engañoso.  
**Impacto frontend:** Migrar `TemporalPeriod` → `ClimateHorizon` en `consolidatedRisk.ts`. Adapter `LEGACY_HORIZON_ADAPTER` para compatibilidad.  
**Impacto backend:** Unificar `PERIOD_MAPS` en `climate.js:417-431` con `HORIZON_REGISTRY`.  
**Impacto IA:** `end_century` → `allowedMaxConfidence: 'low'` → la IA no puede afirmar alta confianza.  
**Breaking changes:** Sí — migrar consumers de `TemporalPeriod`. Requiere adapter layer.  
**Status:** APROBADA, pendiente de implementación (P1.1–P1.4)  
**Owner:** MASTER_REFACTOR_PLAN Fase 1

---

## AD-002 — Ontología: separar HazardId de RiskDisplayType

**Fecha:** 2026-05-26  
**Contexto:** El sistema actual colapsa señales físicas y categorías UX en la misma entidad `risk`. Esto mezcla 4 fenómenos distintos bajo `calor_extremo` y confunde `inundacion` con `lluvias_extremas`.  
**Decisión:** Adoptar 3 niveles de granularidad: `ClimateVariableId` → `HazardId` → `RiskDisplayType`. Los impactos operacionales se calculan a nivel `HazardId`, no `RiskDisplayType`.  
**Rationale científico:** `riverine_flood` (desborde fluvial) y `extreme_precipitation` son causas distintas. `enso_el_nino` es observacional, no proyectable. `tropical_nights` afecta cadena de frío distinto a calor diurno.  
**Impacto frontend:** Cards UX siguen usando `RiskDisplayType` (no cambia para el usuario).  
**Impacto backend:** `normalizeRisks.ts` debe propagar `HazardId` granular internamente.  
**Breaking changes:** Sí para `normalizeRisks.ts` y adaptadores GRI.  
**Status:** APROBADA, pendiente de implementación (P2.1–P2.6)  
**Owner:** MASTER_REFACTOR_PLAN Fase 2

---

## AD-003 — AI: Gemini con system prompt + validador obligatorio

**Fecha:** 2026-05-26  
**Contexto:** El endpoint `POST /api/ai` envía el prompt del usuario directamente a Gemini sin system prompt, sin contexto del pipeline, sin validación post-generación. Riesgo reputacional activo.  
**Decisión:** Gemini SIEMPRE recibe: (a) system prompt con restricciones científicas, (b) contexto completo del pipeline (`AIEnrichmentContext`), (c) validación post-generación con `scientificValidator.ts`.  
**Rationale científico:** La IA sin guardrails puede generar proyecciones falsas, citas IPCC inventadas, valores financieros. Viola la política "descriptive, not prescriptive".  
**Impacto frontend:** Nuevo endpoint `/api/ai/enrich`. Respuesta tipada con `fallbackUsed: boolean`.  
**Impacto backend:** Reescribir `server/routes/ai.js`. Nuevo archivo `server/ai/scientificValidator.ts`.  
**Breaking changes:** Sí para el endpoint AI (path y schema cambian).  
**Status:** APROBADA, pendiente de implementación (P0.1–P0.3)  
**Owner:** MASTER_REFACTOR_PLAN Fase 4

---

## AD-004 — Narrativa: buildOperationalNarrative como sistema único

**Fecha:** 2026-05-26  
**Contexto:** Dos sistemas narrativos compiten: `buildOperationalNarrative.ts` genera texto ejecutivo limpio; `sanitizeNarrative.ts` aplica regex sobre textos raw de Layer9. Hay traslape no resuelto.  
**Decisión:** `buildOperationalNarrative.ts` es el sistema canónico para narrativa ejecutiva. `sanitizeNarrative.ts` es un parche temporal que se elimina en P1.7. `Layer9/projection.js` sigue generando texto científico raw que NUNCA llega directo a UI — siempre pasa por el sistema narrativo.  
**Rationale:** Single source of truth para narrativa. Eliminar doble procesamiento.  
**Breaking changes:** Sí — P1.7 puede afectar tests del sanitizador.  
**Status:** APROBADA, pendiente de implementación (P1.7)  
**Owner:** MASTER_REFACTOR_PLAN Fase 3

---

## AD-005 — UI: sin @ts-nocheck en ningún archivo

**Fecha:** 2026-05-26  
**Contexto:** `ClimateRiskLookup.jsx`, `RiskPeriodTabs.jsx`, `ExecutiveSummaryCard.jsx` tienen `@ts-nocheck`. Esto oculta errores de tipo reales y bloquea la migración a `ClimateHorizon`.  
**Decisión:** Eliminar `@ts-nocheck` en P0.4. Tipar correctamente con props contracts. Todos los archivos nuevos tienen TypeScript habilitado.  
**Rationale:** La migración a `ClimateHorizon` requiere type safety para detectar consumers rotos.  
**Breaking changes:** No (solo expone errores ocultos existentes).  
**Status:** APROBADA, pendiente de implementación (P0.4)  
**Owner:** MASTER_REFACTOR_PLAN Fase 5

---

## AD-006 — end_century siempre marcado como extrapolado

**Fecha:** 2026-05-26  
**Contexto:** `largo_plazo` (2060-2079) no tiene datos CMIP6 reales en `climate_cells`. La narrativa es hardcodeada en `projection.js`. La UI no advierte esto.  
**Decisión:** `end_century` SIEMPRE muestra disclaimer visible (no colapsado). `hasRealDBData: false` en `HORIZON_REGISTRY`. Confianza máxima = 'low'. La IA no puede generar narrativas que impliquen datos reales para este horizonte.  
**Rationale científico:** IPCC AR6 long-term es 2081-2100, no 2060-2079. Este horizonte es extrapolación propia de la plataforma.  
**Breaking changes:** No (additive — agrega disclaimer).  
**Status:** APROBADA, pendiente de implementación (P1.5)  
**Owner:** MASTER_REFACTOR_PLAN Fase 1
