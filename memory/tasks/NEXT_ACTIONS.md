# NEXT ACTIONS — Próximas Acciones Inmediatas

**Actualizado:** 2026-05-27  
**Contexto:** P0.1-P0.3 ✅ (AI guardrails implementados). Restan P0.4-P0.6.

---

## Acción 0 — P0.1 + P0.2 + P0.3: AI Guardrails ✅ DONE

System prompt, scientificValidator, y demo removal ya implementados en `server/routes/ai.js` y `server/ai/scientificValidator.js`.
No requiere acción.

---

## Acción 2 — P0.4: Eliminar @ts-nocheck

```
Archivos a modificar:
  src/features/climate-lookup/ClimateRiskLookup.jsx
  src/features/climate-lookup/components/RiskPeriodTabs.jsx
  src/features/climate-lookup/components/ExecutiveSummaryCard.jsx

Por cada archivo:
1. Leer el archivo
2. Eliminar la línea @ts-nocheck
3. Correr build — ver errores de tipo expuestos
4. Corregir errores mínimos (NO refactorizar — solo tipar lo necesario)
5. Build verde
```

---

## Acción 1 — T4: nearTermNarrative gap (PRIMERO — prerequisite para P0.6)

ANTES de habilitar el tab near_term en UI, la narrativa debe existir en el modelo:

```
Archivos a modificar:
  src/domain/consolidatedRisk.ts    → agregar nearTermNarrative a NarrativeReport
  src/domain/buildNarrativeReport.ts → agregar nearTermNarrative al builder

Verificar que:
  buildOperationalPeriodNarrative(risks, 'corto_plazo') ya existe en buildOperationalNarrative.ts
  → Solo conectarlo
```

---

## Acción 2 — P0.5 + P0.6: UI fixes

```
P0.5:
1. Leer src/constants/scenarios.ts
2. Localizar línea 58 con "Próxima década"
3. Cambiar por "Horizonte 2020–2039 (período en curso)"

P0.6 (después de T4):
1. Leer RiskPeriodTabs.jsx — localizar PERIOD_TABS array
2. Agregar { key: 'corto_plazo', label: 'Corto plazo', period: '2020–2039' }
3. Leer ClimateRiskLookup.jsx:113-124 — agregar filtro para corto_plazo
4. Leer ExecutiveSummaryCard.jsx:11-15 — agregar PERIOD_NARRATIVE_KEY para corto_plazo
5. Correr tests — verificar que near_term data es visible
```

---

## Validación final de P0

```
npm test          ← debe mostrar 770+ PASS, 0 FAIL
npm run build     ← debe compilar sin errores
```

---

## Después de P0 — Inicio P1.1

```
Crear src/types/temporal.ts con:
  - type ClimateHorizon
  - interface HorizonMetadata
  - const HORIZON_REGISTRY
  - const LEGACY_HORIZON_ADAPTER
  - function toClimateHorizon()

Contenido exacto: MASTER_REFACTOR_PLAN.md §1.3
No modificar archivos existentes en este primer paso (additive).
Agregar tests para HORIZON_REGISTRY y toClimateHorizon().
```
