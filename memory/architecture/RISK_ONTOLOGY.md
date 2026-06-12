# RISK ONTOLOGY — Taxonomía de Riesgo Canónica

**Fuente de verdad:** `project-memory/MASTER_REFACTOR_PLAN.md` §Fase 2  
**Status:** Especificado, pendiente de implementación (P2.1–P2.6)

---

## Capas Ontológicas (no mezclar)

```
ClimateVariable  ← qué cambia físicamente (CMIP6 variable names)
      ↓
HazardId         ← fenómeno peligroso (granular, científico)
      ↓
RiskDisplayType  ← categoría UX (agregación para ejecutivo)
      ↓
OperationalImpact ← consecuencia para el negocio
      ↓
Adaptation        ← medida que reduce exposure o vulnerability
```

---

## RiskDisplayType (actual y futuro — 7 tipos)

| RiskDisplayType | Legacy slug | Descripción UX |
|-----------------|-------------|----------------|
| `heat_stress` | `calor_extremo` | Estrés por Calor |
| `extreme_precipitation` | `lluvias_extremas` | Precipitación Extrema |
| `drought` | `sequia` | Sequía |
| `mass_movement` | `deslizamiento` | Deslizamiento |
| `frost` | `heladas` | Heladas |
| `enso_variability` | `fenomeno_enso` | Variabilidad ENSO |
| `flooding` | `inundacion` | Inundación |

---

## HazardId → RiskDisplayType (granularidad interna)

```
extreme_heat_day     → heat_stress
heat_wave            → heat_stress
tropical_nights      → heat_stress
extreme_precipitation → extreme_precipitation
enso_modulated_rain  → extreme_precipitation
prolonged_drought    → drought
compound_heat_drought → drought
frost_event          → frost
enso_el_nino         → enso_variability  ← SOLO baseline
enso_la_nina         → enso_variability  ← SOLO baseline
mass_movement_trigger → mass_movement
riverine_flood       → flooding
coastal_flood        → flooding
```

---

## Conflictos ontológicos resueltos

### flood_risk vs lluvias_extremas (RESUELTO en spec)
- `extreme_precipitation` = causa física (lluvia)
- `riverine_flood` = hazard resultante (desborde fluvial)
- `coastal_flood` = hazard distinto (marejada + nivel del mar)
- GRI `fluvial` → `riverine_flood` → display `flooding`

### ENSO observacional vs proyectado (RESUELTO en spec)
- `enso_el_nino` / `enso_la_nina` → SOLO horizonte `baseline`
- `enso_modulated_rain` → horizontes `near_term` / `mid_century`
- Invariante I3: ENSO nunca proyectado

### calor_extremo fusiona 4 fenómenos (RESUELTO en spec)
- Preservar granularidad en `HazardId` para impactos operacionales específicos
- Agregar solo para display UX en `RiskDisplayType: heat_stress`

---

## Estado actual (legacy normalizeRisks.ts)

```typescript
// Mapeo actual en normalizeRisks.ts (SIGNAL_TO_CONSOLIDATED)
// Convierte señales → RiskTypeSlug (equivalente a RiskDisplayType legacy)
'extreme_heat' | 'severe_heat' | 'tropical_nights' | 'temp_increase' → 'calor_extremo'
'extreme_rainfall' | 'flood_risk' → 'lluvias_extremas'  ← semánticamente incorrecto
'fluvial' | 'coastal' → 'inundacion'
'drought' → 'sequia'
'landslide' → 'deslizamiento'
'frost' → 'heladas'
'el_nino' | 'la_nina' → 'fenomeno_enso'
```

---

## heladas — Problema sin resolver (P3.1)

`frost` / `heladas` existe en el display y en el ontology pero:
- Layer2 no tiene umbrales de temperatura mínima (Tmin / `fd` variable)
- Nunca se genera como señal activa
- `HAZARD_REGISTRY.frost_event` pendiente de definir umbrales

---

## Archivos a crear/modificar en P2

```
src/types/ontology.ts        ← nuevo (HazardId, RiskDisplayType, HAZARD_REGISTRY)
src/adapters/riskAdapter.ts  ← nuevo (LEGACY_SLUG_TO_HAZARD, LEGACY_RISK_TYPE_TO_DISPLAY)
src/utils/normalizeRisks.ts  ← migrar a usar HazardId internamente
server/layers/Layer2_...js   ← separar riverine_flood de extreme_precipitation
```
