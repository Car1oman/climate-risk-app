# TEMPORAL MODEL — Semántica Temporal Canónica

**Fuente de verdad:** `project-memory/MASTER_REFACTOR_PLAN.md` §Fase 1  
**Status:** Especificado, pendiente de implementación (P1.1–P1.4)

---

## Modelo Canónico Objetivo

```
ClimateHorizon → HorizonMetadata → UI Label
────────────────────────────────────────────
baseline    → 1981–2014, observado CMIP6     → "Línea Base 1981–2014"
near_term   → 2020–2039, CMIP6 ensemble      → "Horizonte 2020–2039"
mid_century → 2040–2059, CMIP6 ensemble      → "Horizonte 2040–2059"
end_century → 2060–2079, extrapolado IPCC    → "Horizonte 2060–2079 ⚠"
```

---

## Estado Actual (legacy — a migrar)

| Sistema | Key | Problema |
|---------|-----|---------|
| Frontend (consolidatedRisk) | `historico`, `corto_plazo`, `mediano_plazo`, `largo_plazo` | Nomenclatura no científica |
| Backend climate.js:417-431 | `historico`, `corto`, `mediano` | Sin `_plazo`, incompleto |
| Backend scenarios.ts | `corto_plazo`, `mediano_plazo`, `largo_plazo` | "Próxima década" incorrecto |
| CMIP6 real | `near-term`, `mid-term`, `long-term` | No usado directamente |

---

## HORIZON_REGISTRY (spec — aún no implementado)

```typescript
// Target: src/types/temporal.ts
export type ClimateHorizon = 'baseline' | 'near_term' | 'mid_century' | 'end_century';

export const HORIZON_REGISTRY: Record<ClimateHorizon, HorizonMetadata> = {
  baseline:    { yearRange: [1981, 2014], hasRealDBData: true,  allowedMaxConfidence: 'high', dataSource: 'cmip6_observed' },
  near_term:   { yearRange: [2020, 2039], hasRealDBData: true,  allowedMaxConfidence: 'high', dataSource: 'cmip6_ensemble' },
  mid_century: { yearRange: [2040, 2059], hasRealDBData: true,  allowedMaxConfidence: 'high', dataSource: 'cmip6_ensemble' },
  end_century: { yearRange: [2060, 2079], hasRealDBData: false, allowedMaxConfidence: 'low',  dataSource: 'ipcc_ar6_extrapolated' },
};
```

---

## LEGACY_HORIZON_ADAPTER (spec)

```typescript
// Mapeo bidireccional de todas las keys del sistema anterior
export const LEGACY_HORIZON_ADAPTER: Record<string, ClimateHorizon> = {
  'historico':     'baseline',
  'corto_plazo':   'near_term',
  'mediano_plazo': 'mid_century',
  'largo_plazo':   'end_century',
  'historical':    'baseline',
  'short_term':    'near_term',
  'corto':         'near_term',
  'mid_term':      'mid_century',
  'mediano':       'mid_century',
  'long_term':     'end_century',
  // idempotente para keys nuevas
  'baseline':      'baseline',
  'near_term':     'near_term',
  'mid_century':   'mid_century',
  'end_century':   'end_century',
};
```

---

## Datos en DB por horizonte

| Horizonte | En climate_cells DB | Escenarios disponibles |
|-----------|---------------------|----------------------|
| baseline | Sí (1981-2014) | N/A (observado) |
| near_term | Sí (2020-2039) | SSP245, SSP585 |
| mid_century | Sí (2040-2059) | SSP245, SSP585 |
| end_century | NO — narrativa hardcodeada en projection.js | N/A |

---

## Archivos a migrar en P1

```
src/types/consolidatedRisk.ts          ← TemporalPeriod → ClimateHorizon
src/constants/scenarios.ts             ← corregir descripciones
src/features/climate-lookup/           ← filtros por período
server/routes/climate.js:417-431       ← PERIOD_MAPS inline
server/layers/Layer1_...js             ← buildHorizonMap
```

---

## Reglas de visualización (obligatorias post-P1)

1. `baseline`: siempre visible, color azul neutro, label "Observado (1981–2014)"
2. `near_term`: nota "Período parcialmente transcurrido"
3. `mid_century`: no disclaimer especial
4. `end_century`: disclaimer VISIBLE no colapsado + badge "Estimación extrapolada"
