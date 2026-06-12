# Plan Maestro de Refactorización Semántica y Científica
## Climate Risk Intelligence Platform — DataRisk Peru

**Versión:** 1.0  
**Fecha:** 2026-05-26  
**Autor:** Principal Climate Platform Architect  
**Estado:** ESPECIFICACIÓN APROBADA PARA IMPLEMENTACIÓN

---

## Preámbulo: El Problema Central

El sistema tiene un contrato implícito roto: la ciencia dice "probabilidades multi-decadales bajo escenarios de emisiones", el backend dice "corto/mediano/largo plazo", el frontend muestra "próxima década" para un período de 19 años, y la IA genera texto sin guardrails. El usuario ejecutivo recibe señales contradictorias sin saberlo.

Este plan no parcha esos problemas. Los reescribe desde la semántica hacia arriba.

**Principio rector:** La ciencia climática tiene prioridad sobre toda decisión de naming, UX, o compatibilidad legacy.

---

# FASE 1 — NUEVA SEMÁNTICA TEMPORAL

## 1.1 Por qué "corto plazo" es científicamente incorrecto

CMIP6 produce **medias multi-modelo de períodos de 20 años**, no predicciones año a año. Un período 2020–2039 no es "corto plazo" bajo ningún estándar:

| Estándar | Corto plazo | Mediano plazo | Largo plazo |
|---|---|---|---|
| IPCC AR6 | 2021–2040 (near-term) | 2041–2060 (mid-term) | 2081–2100 (long-term) |
| Finanzas corporativas | 0–1 año | 1–5 años | 5–10 años |
| Planeamiento urbano | 5–10 años | 10–25 años | 25–50 años |
| Sistema actual | 2020–2039 (19 años) | 2040–2059 (19 años) | 2060–2079 (extrapolado) |

Llamar "corto plazo" a 2020–2039 engaña al ejecutivo: sugiere que puede actuar sin urgencia. En realidad, 2020–2039 está **parcialmente en el pasado** (2026 ya es el año 6 del período). La ventana de decisión para ese horizonte ya comenzó.

## 1.2 Nuevo modelo temporal canónico

```
ClimateHorizon (backend key) → HorizonMetadata → UI Label
─────────────────────────────────────────────────────────
baseline   → 1981–2014, observado          → "Línea Base 1981–2014"
near_term  → 2020–2039, CMIP6 ensemble     → "Horizonte 2020–2039"
mid_century → 2040–2059, CMIP6 ensemble    → "Horizonte 2040–2059"
end_century → 2060–2079, extrapolado IPCC  → "Horizonte 2060–2079 ⚠"
```

### Reglas de visualización obligatorias

1. **baseline**: Mostrar siempre. Label: "Observado (1981–2014)". Color: azul neutro.
2. **near_term**: Mostrar. Label: "2020–2039". Nota: "Período parcialmente transcurrido — proyecciones CMIP6 ensemble".
3. **mid_century**: Mostrar. Label: "2040–2059". Nota: "Proyecciones multi-modelo CMIP6".
4. **end_century**: Mostrar **con disclaimer obligatorio** visible, no colapsado. Label: "2060–2079". Nota: "⚠ Extrapolación — no hay datos CMIP6 en base de datos. Estimación basada en IPCC AR6 WGI región SAM."

### Regla para horizontes sin datos

```
Si horizon.hasRealDBData === false:
  → Mostrar advertencia inline, no ocultar el horizonte
  → Badge: "Estimación extrapolada"
  → No permitir que la IA genere narrativas como si fueran proyecciones reales
  → Confidence máxima permitida: 'low'
```

## 1.3 Contratos TypeScript — Temporal Model

```typescript
// src/types/temporal.ts

export type ClimateHorizon =
  | 'baseline'     // 1981-2014, datos observados CMIP6 historical run
  | 'near_term'    // 2020-2039, CMIP6 ensemble SSP245/SSP585
  | 'mid_century'  // 2040-2059, CMIP6 ensemble SSP245/SSP585
  | 'end_century'; // 2060-2079, extrapolación IPCC AR6, SIN datos en DB

export type DataSource =
  | 'cmip6_observed'    // baseline histórico
  | 'cmip6_ensemble'    // proyecciones con datos reales en DB
  | 'ipcc_ar6_extrapolated' // far_term, sin DB data
  | 'open_meteo_proxy'  // fallback degradado
  | 'gri_oxford';       // GRI Oxford ~1km

export interface HorizonMetadata {
  id: ClimateHorizon;
  yearRange: [number, number];
  dataSource: DataSource;
  hasRealDBData: boolean;       // false → end_century siempre
  ipccReference: string;        // "IPCC AR6 WGI near-term: 2021-2040"
  uiLabel: string;              // "Horizonte 2020–2039"
  uiDescription: string;        // "Proyecciones multi-modelo CMIP6 (SSP2-4.5 / SSP5-8.5)"
  disclaimer: string | null;    // non-null para end_century y open_meteo_proxy
  allowedMaxConfidence: ConfidenceLevel; // 'high' | 'medium' | 'low'
}

export const HORIZON_REGISTRY: Record<ClimateHorizon, HorizonMetadata> = {
  baseline: {
    id: 'baseline',
    yearRange: [1981, 2014],
    dataSource: 'cmip6_observed',
    hasRealDBData: true,
    ipccReference: 'CMIP6 historical run — baseline 1981–2014',
    uiLabel: 'Línea Base 1981–2014',
    uiDescription: 'Período de referencia observado. Datos del ensamble histórico CMIP6.',
    disclaimer: null,
    allowedMaxConfidence: 'high',
  },
  near_term: {
    id: 'near_term',
    yearRange: [2020, 2039],
    dataSource: 'cmip6_ensemble',
    hasRealDBData: true,
    ipccReference: 'IPCC AR6 WGI near-term: 2021-2040 (alineación aproximada)',
    uiLabel: 'Horizonte 2020–2039',
    uiDescription: 'Proyecciones CMIP6 ensemble. Período parcialmente transcurrido.',
    disclaimer: 'Nota: 2020–2039 está parcialmente en el pasado. Las proyecciones representan la media del ensamble multi-modelo para el período completo.',
    allowedMaxConfidence: 'high',
  },
  mid_century: {
    id: 'mid_century',
    yearRange: [2040, 2059],
    dataSource: 'cmip6_ensemble',
    hasRealDBData: true,
    ipccReference: 'IPCC AR6 WGI mid-term: 2041-2060 (alineación aproximada)',
    uiLabel: 'Horizonte 2040–2059',
    uiDescription: 'Proyecciones CMIP6 ensemble bajo SSP2-4.5 y SSP5-8.5.',
    disclaimer: null,
    allowedMaxConfidence: 'high',
  },
  end_century: {
    id: 'end_century',
    yearRange: [2060, 2079],
    dataSource: 'ipcc_ar6_extrapolated',
    hasRealDBData: false,    // CRÍTICO: no hay datos en climate_cells
    ipccReference: 'IPCC AR6 WGI — extrapolación para 2060-2079 (no estándar IPCC)',
    uiLabel: 'Horizonte 2060–2079',
    uiDescription: 'Estimación extrapolada basada en tendencias IPCC AR6. Sin datos CMIP6 en base de datos.',
    disclaimer: '⚠ Extrapolación: Este horizonte no cuenta con datos CMIP6 en la base de datos de la plataforma. Las narrativas se basan en tendencias IPCC AR6 WGI para la región SAM y deben interpretarse con precaución.',
    allowedMaxConfidence: 'low',
  },
};

// Adapter legacy: mapea keys del sistema anterior al nuevo
export const LEGACY_HORIZON_ADAPTER: Record<string, ClimateHorizon> = {
  // keys del frontend anterior
  'historico':     'baseline',
  'corto_plazo':   'near_term',
  'mediano_plazo': 'mid_century',
  'largo_plazo':   'end_century',
  // keys del backend anterior
  'historical':    'baseline',
  'short_term':    'near_term',
  'corto':         'near_term',
  'mid_term':      'mid_century',
  'mediano':       'mid_century',
  'long_term':     'end_century',
  // nuevos keys (idempotente)
  'baseline':      'baseline',
  'near_term':     'near_term',
  'mid_century':   'mid_century',
  'end_century':   'end_century',
};

export function toClimateHorizon(raw: string | null | undefined): ClimateHorizon {
  if (!raw) return 'mid_century'; // fallback conservador
  return LEGACY_HORIZON_ADAPTER[raw.trim()] ?? 'mid_century';
}
```

## 1.4 Labels UX correctos y disclaimers

| Situación | Label incorrecto | Label correcto |
|---|---|---|
| 2020–2039 | "Próxima década" | "Horizonte 2020–2039 (período en curso)" |
| 2040–2059 | "Próximos 15–35 años" | "Horizonte 2040–2059 — proyecciones CMIP6" |
| 2060–2079 | "Próximos 35–55 años" | "Horizonte 2060–2079 ⚠ Extrapolado" |
| near_term sin escenario | "Corto plazo" | "2020–2039 — Línea base de cambio" |
| Proyección genérica | "Las temperaturas subirán" | "Los modelos proyectan un aumento de temperatura bajo SSP2-4.5" |

---

# FASE 2 — NUEVA ONTOLOGÍA DE RIESGO

## 2.1 Separación de capas ontológicas

El sistema actual colapsa estas capas en una sola entidad `risk`. Son conceptos distintos:

```
ClimateVariable       ← qué cambia físicamente (temperatura, precipitación)
      ↓
Hazard                ← fenómeno peligroso resultante (calor extremo, inundación)
      ↓
Exposure              ← quién o qué está en el camino del hazard (activo + sector)
      ↓
Vulnerability         ← cuán susceptible es el activo al hazard
      ↓
OperationalImpact     ← consecuencia para la operación del negocio
      ↓
Adaptation            ← medida que reduce exposure o vulnerability
```

**Cada capa tiene un dueño semántico diferente. Nunca mezclarlas.**

## 2.2 Taxonomía completa de hazards

```typescript
// src/types/ontology.ts

// Nivel 1: Variable climática física (CMIP6 variable names)
export type ClimateVariableId =
  | 'tas'       // temperatura media del aire (°C)
  | 'tasmax'    // temperatura máxima diaria (°C)
  | 'tasmin'    // temperatura mínima diaria (°C)
  | 'pr'        // precipitación total (mm/día)
  | 'rx1day'    // máximo de precipitación en 1 día (mm)
  | 'cdd'       // días consecutivos secos (días)
  | 'cwd'       // días consecutivos húmedos (días)
  | 'fd'        // días de helada (días con tasmin < 0°C)
  | 'tr'        // noches tropicales (días con tasmin > 20°C)
  | 'wsdi'      // índice de duración de ola de calor
  | 'zos';      // nivel del mar (m) — futuro

// Nivel 2: Hazard (fenómeno físico peligroso)
export type HazardId =
  | 'extreme_heat_day'       // tasmax supera umbral por ≥N días
  | 'heat_wave'              // WSDI ≥ 6 días consecutivos
  | 'tropical_nights'        // tasmin ≥ 20°C (noches sin enfriamiento)
  | 'extreme_precipitation'  // rx1day supera umbral
  | 'prolonged_drought'      // CDD supera umbral
  | 'compound_heat_drought'  // calor + sequía simultáneos
  | 'frost_event'            // tasmin < 0°C (helada)
  | 'enso_el_nino'           // fase positiva ENSO (observacional)
  | 'enso_la_nina'           // fase negativa ENSO (observacional)
  | 'enso_modulated_rain'    // lluvia extrema modulada por ENSO (proyectado)
  | 'mass_movement_trigger'  // deslizamiento inducido por lluvia + pendiente
  | 'riverine_flood'         // inundación fluvial (lluvia → desborde)
  | 'coastal_flood';         // inundación costera (nivel del mar + tormenta)

// Nivel 3: Tipo de display UX (agregación para el usuario ejecutivo)
// Mapea N hazards granulares → 1 categoría comprensible
export type RiskDisplayType =
  | 'heat_stress'            // extreme_heat_day + heat_wave + tropical_nights
  | 'extreme_precipitation'  // extreme_precipitation + enso_modulated_rain
  | 'drought'                // prolonged_drought + compound_heat_drought
  | 'mass_movement'          // mass_movement_trigger
  | 'frost'                  // frost_event
  | 'enso_variability'       // enso_el_nino + enso_la_nina
  | 'flooding';              // riverine_flood + coastal_flood

// Mapeo granular → display (bidireccional)
export const HAZARD_TO_DISPLAY: Record<HazardId, RiskDisplayType> = {
  extreme_heat_day:      'heat_stress',
  heat_wave:             'heat_stress',
  tropical_nights:       'heat_stress',
  extreme_precipitation: 'extreme_precipitation',
  enso_modulated_rain:   'extreme_precipitation',
  prolonged_drought:     'drought',
  compound_heat_drought: 'drought',
  frost_event:           'frost',
  enso_el_nino:          'enso_variability',
  enso_la_nina:          'enso_variability',
  mass_movement_trigger: 'mass_movement',
  riverine_flood:        'flooding',
  coastal_flood:         'flooding',
};

// Inverso: qué hazards componen cada display type
export const DISPLAY_TO_HAZARDS: Record<RiskDisplayType, HazardId[]> = {
  heat_stress:           ['extreme_heat_day', 'heat_wave', 'tropical_nights'],
  extreme_precipitation: ['extreme_precipitation', 'enso_modulated_rain'],
  drought:               ['prolonged_drought', 'compound_heat_drought'],
  mass_movement:         ['mass_movement_trigger'],
  frost:                 ['frost_event'],
  enso_variability:      ['enso_el_nino', 'enso_la_nina'],
  flooding:              ['riverine_flood', 'coastal_flood'],
};
```

## 2.3 Resolución de conflictos ontológicos críticos

### Problema 1: inundacion vs lluvias_extremas

**Situación actual:** `flood_risk` de GRI mapea a `lluvias_extremas`. `inundacion` es otra entidad. Semántica rota.

**Resolución:**
- `extreme_precipitation` → causa física (lluvia)
- `riverine_flood` → hazard resultante (desborde de ríos)
- `coastal_flood` → hazard distinto (nivel del mar + marejada)

GRI `fluvial` → `riverine_flood` → display: `flooding`  
GRI `flood_risk` genérico → inferir por ubicación costera vs interior

### Problema 2: ENSO observacional vs proyectado

**Situación actual:** `fenomeno_enso` mezcla observaciones pasadas con proyecciones.

**Resolución:**
- `enso_el_nino` + `enso_la_nina` → horizonte `baseline` únicamente (observacional)
- `enso_modulated_rain` → horizonte `near_term`/`mid_century` (efecto proyectado sobre lluvia)
- **Regla invariante:** ENSO como fenómeno **no es proyectable** con los datos CMIP6 actuales. Solo se proyectan sus efectos sobre otras variables.

### Problema 3: calor_extremo fusiona 4 fenómenos distintos

**Situación actual:** `extreme_heat`, `severe_heat`, `tropical_nights`, `temp_increase` → `calor_extremo`. Borra distinciones importantes (cadena de frío vs trabajadores nocturnos).

**Resolución:** Preservar granularidad interna (`HazardId`), agregar solo para display ejecutivo (`RiskDisplayType`). Los impactos operacionales deben ser specificos al `HazardId`, no al `RiskDisplayType`.

## 2.4 Ontology Registry — Canonical Risk IDs

```typescript
// src/types/ontology.ts (continuación)

export interface HazardDefinition {
  id: HazardId;
  displayType: RiskDisplayType;
  climateVariables: ClimateVariableId[];
  description: string;              // descripción técnica
  thresholdType: 'absolute' | 'percentile' | 'duration' | 'composite';
  isObservationalOnly: boolean;     // true → solo horizonte baseline
  isProjectable: boolean;           // false → no generar proyecciones
  uncertaintyNote: string | null;   // nota de incertidumbre específica
  ipccReference: string | null;
}

export const HAZARD_REGISTRY: Record<HazardId, HazardDefinition> = {
  extreme_heat_day: {
    id: 'extreme_heat_day',
    displayType: 'heat_stress',
    climateVariables: ['tasmax'],
    description: 'Días con temperatura máxima superior al umbral de calor extremo local',
    thresholdType: 'absolute',
    isObservationalOnly: false,
    isProjectable: true,
    uncertaintyNote: null,
    ipccReference: 'IPCC AR6 WGI Cap. 11 — Extremos de temperatura',
  },
  tropical_nights: {
    id: 'tropical_nights',
    displayType: 'heat_stress',
    climateVariables: ['tasmin'],
    description: 'Noches con temperatura mínima ≥ 20°C impidiendo recuperación térmica',
    thresholdType: 'absolute',
    isObservationalOnly: false,
    isProjectable: true,
    uncertaintyNote: 'Impacto diferencial en cadena de frío y trabajadores en turno nocturno',
    ipccReference: 'IPCC AR6 WGI Cap. 11 — Índice TR20',
  },
  enso_el_nino: {
    id: 'enso_el_nino',
    displayType: 'enso_variability',
    climateVariables: ['pr', 'tas'],
    description: 'Fase positiva ENSO con anomalías de precipitación y temperatura observadas',
    thresholdType: 'composite',
    isObservationalOnly: true,    // SOLO histórico
    isProjectable: false,         // ENSO no proyectable con CMIP6 actual
    uncertaintyNote: 'ENSO como fenómeno no es directamente proyectable con CMIP6. Solo se proyectan efectos sobre precipitación y temperatura.',
    ipccReference: 'IPCC AR6 WGI Cap. 4 — Variabilidad natural y cambio climático',
  },
  // ... resto del registry
};
```

## 2.5 Translation Layer — legacy slugs → new IDs

```typescript
// src/adapters/riskAdapter.ts

// Mapeo desde el sistema anterior (no eliminar hasta migración completa)
export const LEGACY_SLUG_TO_HAZARD: Record<string, HazardId[]> = {
  // Señales Layer2
  'extreme_heat':      ['extreme_heat_day'],
  'severe_heat':       ['heat_wave'],
  'tropical_nights':   ['tropical_nights'],
  'temp_increase':     ['extreme_heat_day'],    // revisar: puede ser tendencia, no hazard
  'extreme_rainfall':  ['extreme_precipitation'],
  'flood_risk':        ['riverine_flood'],
  'fluvial':           ['riverine_flood'],
  'coastal':           ['coastal_flood'],
  'drought':           ['prolonged_drought'],
  'landslide':         ['mass_movement_trigger'],
  'frost':             ['frost_event'],
  'el_nino':           ['enso_el_nino'],
  'la_nina':           ['enso_la_nina'],
  // GRI hazards
  'heat':              ['extreme_heat_day', 'heat_wave'],
  'precipitation':     ['extreme_precipitation'],
};

// Mapeo desde RiskTypeSlug anterior → RiskDisplayType nuevo
export const LEGACY_RISK_TYPE_TO_DISPLAY: Record<string, RiskDisplayType> = {
  'lluvias_extremas': 'extreme_precipitation',
  'calor_extremo':    'heat_stress',
  'sequia':           'drought',
  'deslizamiento':    'mass_movement',
  'heladas':          'frost',
  'fenomeno_enso':    'enso_variability',
  'inundacion':       'flooding',
};
```

---

# FASE 3 — NUEVO PIPELINE SEMÁNTICO

## 3.1 Diagrama del pipeline completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│ INGESTION LAYER                                                         │
│                                                                         │
│  climate_cells (Supabase)     GRI Oxford API      Open-Meteo (fallback)│
│  CMIP6: baseline, 2020-2039,  ~1km resolution     Live indices, degraded│
│  2040-2059 (SSP245/SSP585)    qualitative scores  confidence: low       │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: CLIMATE SIGNAL DETECTION                                       │
│ Owner: Layer1_ClimateDataFusion.js + Layer2_SignalEngine.js             │
│                                                                         │
│ Input:  Raw climate cell data (CMIP6 variables per horizon)             │
│ Output: ClimateSignal[] {                                               │
│           hazardId: HazardId,                                           │
│           horizon: ClimateHorizon,                                      │
│           scenario: SSPScenario | null,                                 │
│           value: number,                                                │
│           unit: string,                                                 │
│           p10: number | null,                                           │
│           p90: number | null,                                           │
│           nModels: number | null,                                       │
│           rawConfidence: ConfidenceLevel,                               │
│           dataSource: DataSource,                                       │
│         }                                                               │
│                                                                         │
│ REGLA: Esta capa solo detecta señales físicas.                          │
│        NO interpreta impactos. NO conoce sectores.                      │
│        NO genera texto. NO inventa valores.                             │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: HAZARD CLASSIFICATION                                          │
│ Owner: nuevo HazardClassifier (reemplaza parte de Layer3)               │
│                                                                         │
│ Input:  ClimateSignal[] + LocationContext {coast|sierra|selva}          │
│ Output: ClassifiedHazard[] {                                            │
│           hazardId: HazardId,                                           │
│           displayType: RiskDisplayType,                                 │
│           horizon: ClimateHorizon,                                      │
│           scenario: SSPScenario | null,                                 │
│           intensity: 'low' | 'moderate' | 'high' | 'very_high',        │
│           frequency: 'rare' | 'occasional' | 'frequent' | 'persistent', │
│           trendDirection: 'increasing' | 'decreasing' | 'stable',      │
│           signals: ClimateSignal[],        ← trazabilidad               │
│         }                                                               │
│                                                                         │
│ REGLA: Esta capa clasifica y agrupa. NO produce texto ejecutivo.        │
│        Aplica compound detection (calor + sequía simultáneos).          │
│        Aplica umbrales diferenciados por región (costa/sierra/selva).   │
│        SINGLE SOURCE OF TRUTH para clasificación de intensidad.         │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: CONFIDENCE ATTRIBUTION                                         │
│ Owner: nuevo ConfidenceEngine (extrae de governance.js)                 │
│                                                                         │
│ Input:  ClassifiedHazard[] + HorizonMetadata                            │
│ Output: AnnotatedHazard[] { ...ClassifiedHazard,                        │
│           confidence: ConfidenceLevel,                                  │
│           confidenceRationale: string,    ← por qué esa confianza       │
│           uncertaintyRange: string | null, ← "±0.3°C" o "varianza alta"│
│           sources: EvidenceSource[],                                    │
│         }                                                               │
│                                                                         │
│ REGLAS DE CONFIANZA (no negociables):                                  │
│  - baseline observado → 'high' siempre                                  │
│  - temperatura near/mid_century → 'high' (35 modelos, baja varianza)   │
│  - precipitación near/mid_century → 'low' (alta varianza inter-modelo) │
│  - end_century cualquier variable → max 'low' (extrapolación)           │
│  - Open-Meteo proxy → max 'low' sin excepción                          │
│  - Compound hazards → confianza del componente más bajo                 │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: TEMPORAL ORGANIZATION                                          │
│ Owner: TemporalOrganizer (nuevo, reemplaza HORIZON_TO_PERIOD mappings)  │
│                                                                         │
│ Input:  AnnotatedHazard[] + HORIZON_REGISTRY                            │
│ Output: HazardTimeline {                                                │
│           baseline: AnnotatedHazard[],                                  │
│           near_term: {                                                  │
│             ssp245: AnnotatedHazard[],                                  │
│             ssp585: AnnotatedHazard[],                                  │
│           },                                                            │
│           mid_century: { ssp245, ssp585 },                              │
│           end_century: { ssp245, ssp585, isExtrapolated: true },        │
│         }                                                               │
│                                                                         │
│ REGLA: Esta capa organiza. NO genera narrativa.                         │
│        SINGLE SOURCE OF TRUTH para estructura temporal.                 │
│        Reemplaza PERIOD_MAPS en climate.js y scenarios.ts.             │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: SECTOR EXPOSURE MAPPING                                        │
│ Owner: Layer3_BusinessRiskEngine.js (renombrado a ExposureMapper)       │
│                                                                         │
│ Input:  HazardTimeline + SectorProfile {id, characteristics}            │
│ Output: ExposureMatrix[] {                                              │
│           hazardId: HazardId,                                           │
│           displayType: RiskDisplayType,                                 │
│           horizon: ClimateHorizon,                                      │
│           scenario: SSPScenario | null,                                 │
│           exposureType: 'direct' | 'supply_chain' | 'workforce',        │
│           impactDomain: 'operational' | 'physical' | 'human',           │
│           impactDescription: string,    ← sin valores financieros       │
│           sectorTags: string[],                                         │
│           confidence: ConfidenceLevel,  ← heredado de AnnotatedHazard  │
│         }                                                               │
│                                                                         │
│ REGLA: Esta capa conecta hazards con sectores.                          │
│        NO inventa umbrales. NO genera proyecciones.                     │
│        Los impactos son descriptivos, no cuantitativos en dinero.       │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 6: OPERATIONAL IMPACT INTERPRETATION                              │
│ Owner: Layer5_AdaptationEngine.js + buildOperationalNarrative.ts        │
│                                                                         │
│ Input:  ExposureMatrix[] + AdaptationCatalog                            │
│ Output: OperationalImpact[] {                                           │
│           displayType: RiskDisplayType,                                 │
│           horizon: ClimateHorizon,                                      │
│           scenario: SSPScenario | null,                                 │
│           narrativeText: string,       ← sin jerga técnica              │
│           impactBullets: string[],                                      │
│           adaptationMeasures: AdaptationSummary[],                      │
│           confidence: ConfidenceLevel,                                  │
│           scenarioVariants: { ssp245: ..., ssp585: ... },               │
│         }                                                               │
│                                                                         │
│ REGLA: SINGLE NARRATIVE SYSTEM. Reemplaza tanto sanitizeNarrative       │
│        como buildOperationalNarrative que compiten actualmente.         │
│        El texto ejecutivo se genera aquí y solo aquí.                   │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 7: EXECUTIVE NARRATIVE ASSEMBLY                                   │
│ Owner: buildNarrativeReport.ts (refactorizado)                          │
│                                                                         │
│ Input:  OperationalImpact[] + HorizonMetadata[] + NarrativeConfig       │
│ Output: ExecutiveNarrative {                                            │
│           locationLabel: string,                                        │
│           executiveSummary: string,    ← 2-3 oraciones hero             │
│           horizons: {                                                   │
│             baseline: HorizonNarrative,                                 │
│             near_term: HorizonNarrative,                                │
│             mid_century: HorizonNarrative,                              │
│             end_century: HorizonNarrative & { extrapolationWarning },   │
│           },                                                            │
│           primaryHazards: RiskDisplayType[],   ← ordenados por severidad│
│           scenarioDelta: ScenarioDeltaSummary, ← qué cambia entre SSPs  │
│           confidence: ConfidenceLevel,                                  │
│           governanceMetadata: GovernanceMetadata,                       │
│         }                                                               │
│                                                                         │
│ REGLA: Esta capa ensambla. NO interpreta datos climáticos.              │
│        NO convierte unidades. NO inventa textos.                        │
│        Resultado: legible por ejecutivo sin conocimiento climático.     │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 8: AI ENRICHMENT (Opcional, con guardrails)                       │
│ Owner: server/routes/ai.js (reescrito con system prompt + validator)    │
│                                                                         │
│ Input:  ExecutiveNarrative + HazardTimeline + AIEnrichmentRequest       │
│ Output: EnrichedNarrative | ExecutiveNarrative (si AI falla validación) │
│                                                                         │
│ REGLA: La IA recibe el contexto completo del pipeline.                  │
│        La IA NO puede contradecir los confidence levels del pipeline.   │
│        La IA NO puede inventar valores numéricos.                       │
│        Si la validación post-generación falla → usar texto original.    │
│        Fallback seguro: siempre retornar texto del pipeline si AI falla.│
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 9: UI RENDERING                                                   │
│ Owner: src/features/climate-lookup/ (componentes)                       │
│                                                                         │
│ Input:  EnrichedNarrative (typed props)                                 │
│ Output: React component tree                                            │
│                                                                         │
│ REGLA ABSOLUTA: Componentes NO hacen transformación de datos.           │
│                 Componentes NO conocen SSP codes.                       │
│                 Componentes NO tienen lógica de negocio.                │
│                 Props = typed display data, no raw API responses.       │
│                 Todos los archivos con TypeScript habilitado.           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3.2 Ownership semántico por capa (tabla de responsabilidades)

| Capa | Hace | NO hace |
|---|---|---|
| Signal Detection | Detecta señales físicas con umbrales | Interpreta, genera texto, conoce sectores |
| Hazard Classification | Clasifica y agrupa por HazardId | Produce narrativa, asigna confianza final |
| Confidence Attribution | Asigna confianza según reglas científicas | Usa juicio subjetivo, promedios incorrectos |
| Temporal Organization | Organiza por ClimateHorizon | Genera texto, normaliza slugs |
| Exposure Mapping | Conecta hazards con sectores | Inventa impactos sin evidencia |
| Impact Interpretation | Traduce a lenguaje operacional | Genera números financieros, usa jerga |
| Narrative Assembly | Ensambla texto ejecutivo | Accede a datos raw, hace cálculos |
| AI Enrichment | Contextualiza y enriquece | Contradice pipeline, inventa datos |
| UI Rendering | Muestra, interactúa | Transforma datos, tiene lógica de negocio |

---

# FASE 4 — ARQUITECTURA IA CIENTÍFICAMENTE SEGURA

## 4.1 System prompt maestro

```
SYSTEM PROMPT — DataRisk Climate Intelligence Platform v2.0

Eres un analista de riesgo climático científico para la plataforma DataRisk Peru.
Tu función es contextualizar y enriquecer análisis de riesgo climático para tomadores
de decisiones ejecutivos, basándote EXCLUSIVAMENTE en los datos del pipeline que recibes.

═══════════════════════════════════════════════════════════════
RESTRICCIONES CIENTÍFICAS (OBLIGATORIAS — no tienen excepciones)
═══════════════════════════════════════════════════════════════

1. PROYECCIONES: Nunca hagas afirmaciones determinísticas sobre el futuro climático.
   ✗ INCORRECTO: "La temperatura subirá 2°C en 2050"
   ✓ CORRECTO: "Bajo SSP5-8.5, los modelos CMIP6 proyectan un incremento de temperatura
     de [valor del pipeline] con confianza [nivel del pipeline]"

2. VALORES NUMÉRICOS: Solo usa números que estén explícitamente en el contexto que recibes.
   ✗ INCORRECTO: inventar pérdidas económicas, porcentajes de reducción de rendimiento
   ✓ CORRECTO: referenciar valores del input context con sus unidades y fuentes

3. CITAS IPCC: Solo cita secciones IPCC incluidas en el contexto. Nunca cites de memoria.
   ✗ INCORRECTO: citar secciones IPCC sin que estén en el contexto
   ✓ CORRECTO: "Según [referencia incluida en el análisis]..."

4. CERTEZA: El nivel de confianza máximo que puedes expresar es el del pipeline.
   Si el pipeline dice confianza 'low', tu texto debe reflejar alta incertidumbre.
   Si el pipeline dice 'high', puedes ser más afirmativo sobre la dirección.

5. FINANZAS: Nunca generes estimados de impacto financiero (pérdidas, costos, ROI).
   ✗ INCORRECTO: "Esto podría costar S/. X millones"
   ✓ CORRECTO: "Esto aumenta la probabilidad de interrupción operacional"

6. EMERGENCY LANGUAGE: No uses lenguaje de emergencia/catástrofe para proyecciones.
   ✗ INCORRECTO: "crisis climática", "catástrofe inminente", "colapso de X"
   ✓ CORRECTO: "riesgo elevado", "mayor probabilidad de", "tendencia al aumento"

7. ENSO: No proyectes ENSO como fenómeno futuro. Solo descríbelo como variabilidad
   histórica observada que modula los riesgos proyectados.

8. END-CENTURY: Si el horizonte es 2060-2079, siempre menciona que son estimaciones
   extrapoladas sin datos CMIP6 directos en la base de datos de la plataforma.

═══════════════════════════════════════════════════════════════
FRASES PROHIBIDAS (regex validation aplicado post-generación)
═══════════════════════════════════════════════════════════════

- "causará" / "will cause"
- "garantiza" / "guarantee"
- "inevitablemente" / "inevitably"
- "con certeza" / "certainly"
- "$[número]" o "S/. [número]" o "USD [número]"
- "SSP[0-9]-[0-9].[0-9]" (usar "emisiones moderadas/altas" en su lugar)
- "emergencia climática"
- "sin precedentes" (salvo eventos observados específicos con fecha y fuente)
- "colapso de"
- "catástrofe"

═══════════════════════════════════════════════════════════════
PATRONES REQUERIDOS (al menos uno por respuesta)
═══════════════════════════════════════════════════════════════

- Para proyecciones: mencionar escenario de emisiones
- Para incertidumbre: mencionar nivel de confianza
- Para cifras: incluir rango o intervalo cuando esté disponible
- Para horizonte end_century: mencionar naturaleza extrapolada

═══════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════════════════════════════

Tu respuesta DEBE ser un JSON con esta estructura:
{
  "contextualSummary": "string — 2-3 oraciones de contexto",
  "operationalImplications": ["bullet 1", "bullet 2", "bullet 3"],
  "adaptationFraming": "string — párrafo sobre dirección de adaptación",
  "disclaimer": "string — nota científica sobre limitaciones del análisis",
  "confidenceStatement": "string — declaración explícita de confianza"
}

No retornes markdown libre. Siempre retorna JSON válido.
```

## 4.2 Context injection — qué recibe la IA

```typescript
interface AIEnrichmentContext {
  // Contexto del activo
  location: {
    label: string;        // "Lima, Perú"
    region: 'costa' | 'sierra' | 'selva';
    coordinates: [number, number];
  };
  sector: string;         // "retail"

  // Resultados del pipeline (no raw API)
  hazards: Array<{
    displayType: RiskDisplayType;
    horizon: ClimateHorizon;
    scenario: 'ssp245' | 'ssp585' | null;
    intensity: string;
    confidence: ConfidenceLevel;
    trend: 'increasing' | 'decreasing' | 'stable';
    keyMetric: string | null;  // "1.4°C sobre baseline"
    uncertaintyRange: string | null; // "±0.4°C (p10–p90)"
  }>;

  // Narrativa ya generada (para enriquecer, no reemplazar)
  existingNarrative: string;

  // Metadatos científicos disponibles para citación
  availableSources: Array<{
    id: string;
    citation: string;
  }>;

  // Restricciones para este request específico
  constraints: {
    maxConfidenceForHorizon: ConfidenceLevel; // del HORIZON_REGISTRY
    horizonIsExtrapolated: boolean;
    scenarioContext: string; // "bajo emisiones moderadas (SSP2-4.5)"
  };
}
```

## 4.3 Validation pipeline post-generación

```typescript
// server/ai/scientificValidator.ts

interface AIValidationResult {
  passed: boolean;
  violations: AIViolation[];
  autoFixable: boolean;
  sanitizedText?: string; // si se pudo auto-corregir
}

const FORBIDDEN_PATTERNS: Array<{pattern: RegExp; violation: string; autoFix?: (s: string) => string}> = [
  {
    pattern: /causará/gi,
    violation: 'DETERMINISTIC_FUTURE',
    autoFix: s => s.replace(/causará/gi, 'podría aumentar la probabilidad de'),
  },
  {
    pattern: /\$[\s]?[\d,.]+/g,
    violation: 'FINANCIAL_FIGURE',
    autoFix: undefined, // no auto-fixable — rechazar
  },
  {
    pattern: /S\/\.?\s?[\d,.]+/g,
    violation: 'FINANCIAL_FIGURE_SOLES',
    autoFix: undefined,
  },
  {
    pattern: /SSP[1-5]-\d\.\d/g,
    violation: 'RAW_SSP_CODE',
    autoFix: s => s
      .replace(/SSP2-4\.5/gi, 'escenario de emisiones moderadas')
      .replace(/SSP5-8\.5/gi, 'escenario de altas emisiones'),
  },
  {
    pattern: /garantiza/gi,
    violation: 'CERTAINTY_LANGUAGE',
    autoFix: s => s.replace(/garantiza/gi, 'sugiere'),
  },
  {
    pattern: /emergencia climática/gi,
    violation: 'ALARMIST_LANGUAGE',
    autoFix: undefined,
  },
  {
    pattern: /catástrofe/gi,
    violation: 'ALARMIST_LANGUAGE',
    autoFix: undefined,
  },
];

// Si hay violaciones no auto-fixable → retornar narrativa original del pipeline
// Si hay violaciones auto-fixable → retornar texto corregido con log de correcciones
// Si pasa validación → retornar texto IA

export function validateAIOutput(text: string, context: AIEnrichmentContext): AIValidationResult {
  const violations: AIViolation[] = [];
  let sanitized = text;
  let autoFixable = true;

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(text)) {
      violations.push({ type: rule.violation, found: text.match(rule.pattern)?.[0] });
      if (!rule.autoFix) {
        autoFixable = false;
      } else {
        sanitized = rule.autoFix(sanitized);
      }
    }
  }

  // Validar confianza máxima permitida
  if (context.constraints.maxConfidenceForHorizon === 'low') {
    const highConfidencePatterns = [/con alta confianza/gi, /es muy probable que/gi, /definitivamente/gi];
    for (const p of highConfidencePatterns) {
      if (p.test(text)) {
        violations.push({ type: 'CONFIDENCE_OVERSTATED' });
        autoFixable = false;
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    autoFixable: violations.length > 0 && autoFixable,
    sanitizedText: violations.length > 0 && autoFixable ? sanitized : undefined,
  };
}
```

## 4.4 AI endpoint reescrito (contrato)

```
POST /api/ai/enrich
Auth: requireAuth
Rate limit: aiLimiter (diferenciado por plan en futuro)

Request body:
  {
    "context": AIEnrichmentContext,
    "question": string  // pregunta específica del usuario
  }

Response:
  {
    "enrichment": AIEnrichmentResponse | null,
    "fallbackUsed": boolean,    // true si se usó narrativa del pipeline
    "validationWarnings": string[]
  }

Nunca retorna texto sin validar.
Si Gemini falla → fallbackUsed: true, enrichment: null
Si validación falla → fallbackUsed: true, enrichment: null
Si auto-fix → validationWarnings incluye qué se corrigió
```

---

# FASE 5 — NUEVA UX CIENTÍFICA

## 5.1 Jerarquía de componentes objetivo

```
ClimateRiskLookup (orquestador)
├── ExecutiveSummaryCard          ← Hero: 2-3 oraciones, riesgos principales
├── HorizonNavigator              ← Tabs: Línea Base | 2020-39 | 2040-59 | 2060-79⚠
│   ├── ScenarioToggle            ← Emisiones moderadas | Altas emisiones
│   └── HorizonContent
│       ├── HazardGrid            ← Cards por RiskDisplayType
│       │   └── HazardCard        ← Hazard + intensidad + confianza + impactos
│       └── HorizonDisclaimer     ← Visible para end_century, no colapsado
├── UncertaintyBanner             ← Permanente: "Proyecciones multi-decadales, no predicciones"
├── RiskTimeline                  ← Visual histórico→2039→2059→2079
│   └── RiskTimelineRow (por displayType)
│       └── TimelineNode (por horizonte)
├── AdaptationPanel               ← Medidas de adaptación por risk type
└── ScientificFooter              ← Colapsado: fuentes, metodología, limitaciones
```

## 5.2 Comunicación de incertidumbre — reglas de visualización

**Regla 1: Siempre mostrar rangos, no solo medianas**
```
✗ "Temperatura: +1.4°C"
✓ "Temperatura: +1.4°C (rango: +1.1°C a +1.8°C, 35 modelos CMIP6)"
```

**Regla 2: Confianza diferenciada por variable**
```
Temperatura media/máxima: "Alta confianza (35 modelos, baja varianza entre modelos)"
Precipitación: "Confianza baja (alta variabilidad entre modelos CMIP6)"
Horizonte extrapolado: "Confianza baja — extrapolación sin datos directos"
```

**Regla 3: Banner permanente de contexto científico**
```
┌──────────────────────────────────────────────────────────────────┐
│ ℹ Las proyecciones CMIP6 representan promedios multi-decadales   │
│   de ensambles de modelos, no predicciones año a año.            │
│   La incertidumbre aumenta con el horizonte temporal.            │
└──────────────────────────────────────────────────────────────────┘
```

**Regla 4: Tabs temporales con etiquetas correctas**
```
[Línea Base 1981–2014]  [2020–2039]  [2040–2059]  [2060–2079 ⚠]

No: [Histórico] [Corto plazo] [Mediano plazo] [Largo plazo]
```

**Regla 5: Comparación de escenarios siempre disponible**
```
En tabs de proyección (2020-2039, 2040-2059, 2060-2079):
Toggle visible: [Emisiones moderadas SSP2-4.5] | [Altas emisiones SSP5-8.5]
Delta visual: "Bajo altas emisiones, el riesgo de calor extremo es [X]% más frecuente"
```

**Regla 6: HazardCard — estructura estandarizada**
```
┌──────────────────────────────────────────┐
│ 🌡 Estrés por Calor                      │
│                                          │
│ Intensidad: Alta  Confianza: Alta        │
│                                          │
│ Tendencia histórica: ↑ creciente         │
│ Proyección 2040-59: +1.4°C (±0.4°C)     │
│                                          │
│ Impactos sectoriales:                    │
│ • Mayor demanda energética (HVAC)        │
│ • Riesgo de estrés térmico en personal   │
│                                          │
│ Fuente: CMIP6 CCKP — 35 modelos         │
└──────────────────────────────────────────┘
```

## 5.3 Lenguaje prohibido en UI

| Prohibido | Correcto |
|---|---|
| "Las lluvias aumentarán" | "Los modelos proyectan mayor precipitación extrema" |
| "Riesgo crítico" (sin datos) | "Alta confianza de incremento — alta variabilidad de modelos" |
| "Próxima década" para 2020-2039 | "Horizonte 2020–2039" |
| "Corto/mediano/largo plazo" | "2020–2039 / 2040–2059 / 2060–2079" |
| "100% probable" | No usar probabilidades absolutas para proyecciones |
| Mostrar solo mediana | Mostrar mediana + rango p10-p90 |

---

# FASE 6 — PLAN DE MIGRACIÓN

## 6.1 Matriz de prioridades

### P0 — Semana 1 (fixes de seguridad, sin breaking changes)

| # | Tarea | Archivo | Riesgo si no se hace |
|---|---|---|---|
| P0.1 | Agregar system prompt a ai.js | server/routes/ai.js | Reputacional: alucinaciones climáticas |
| P0.2 | Agregar validación post-generación AI | server/ai/scientificValidator.ts (nuevo) | Reputacional: valores financieros falsos |
| P0.3 | Eliminar respuesta demo que viola política | server/routes/ai.js:40-54 | Inconsistencia científica |
| P0.4 | Eliminar @ts-nocheck en 3 archivos | ClimateRiskLookup.jsx, RiskPeriodTabs.jsx, ExecutiveSummaryCard.jsx | Sin type safety en UI crítica |
| P0.5 | Fix descripción "Próxima década" | src/constants/scenarios.ts:58 | Engañoso para usuarios |
| P0.6 | Agregar near_term a PERIOD_TABS | src/features/climate-lookup/ | near_term datos existen pero son invisibles |

### P1 — Sprint 1 (refactor semántico temporal)

| # | Tarea | Impacto | Breaking change |
|---|---|---|---|
| P1.1 | Crear src/types/temporal.ts con ClimateHorizon + HORIZON_REGISTRY | Base de todo | No (additive) |
| P1.2 | Crear LEGACY_HORIZON_ADAPTER y toClimateHorizon() | Compatibilidad | No |
| P1.3 | Migrar TemporalPeriod → ClimateHorizon en consolidatedRisk.ts | Modelo principal | Sí — migrar consumers |
| P1.4 | Unificar PERIOD_MAPS en climate.js con HORIZON_REGISTRY | Backend consistency | Sí |
| P1.5 | Agregar HorizonDisclaimer obligatorio para end_century | UX científica | No |
| P1.6 | Eliminar buildExecutiveSummary @deprecated | Dead code | No (verificar tests) |
| P1.7 | Resolver traslape sanitizeNarrative vs buildOperationalNarrative | Single narrative system | Sí |

### P1 — Sprint 2 (refactor ontológico)

| # | Tarea | Impacto | Breaking change |
|---|---|---|---|
| P2.1 | Crear src/types/ontology.ts con HazardId + RiskDisplayType | Ontología base | No (additive) |
| P2.2 | Crear HAZARD_REGISTRY con HazardDefinition completo | Registry canónico | No |
| P2.3 | Separar riverine_flood de extreme_precipitation en pipeline | Semántica correcta | Sí — normalizeRisks.ts |
| P2.4 | Separar enso_el_nino/la_nina como observational_only | ENSO correcto | Sí |
| P2.5 | Agregar LEGACY_SLUG_TO_HAZARD adapter | Compatibilidad | No |
| P2.6 | Mostrar p10/p90 en HazardCard | Incertidumbre visible | No (additive) |

### P2 — Sprint 3 (refactor científico)

| # | Tarea | Impacto | Dependencias |
|---|---|---|---|
| P3.1 | Agregar umbrales de helada (tasmin) en Layer2 | frost activo en detección | Layer2 thresholds |
| P3.2 | Regionalizar umbrales por costa/sierra/selva | Precisión regional | LocationContext model |
| P3.3 | Unificar classifyRiskLevel (eliminar duplicado climate.js:74-87) | Single source of truth | Migrar callers |
| P3.4 | Agregar confidence propagation correcta (low precipitation) | No mostrar 'media' para lluvia | ConfidenceEngine |
| P3.5 | Agregar vulnerability stubs en modelo H×E×I | Preparación arquitectónica | Nueva entidad |

### P3 — Sprint 4+ (refactor arquitectónico)

| # | Tarea | Valor | Complejidad |
|---|---|---|---|
| P4.1 | Multi-asset model (facility_id, portfolio) | Escalabilidad | Alta |
| P4.2 | Multi-tenant auth en todos endpoints | Seguridad | Media |
| P4.3 | DCPP evaluation (0-10 años decadal) | Completitud temporal | Muy alta |
| P4.4 | Integración SENAMHI para validación | Precisión observacional | Alta |
| P4.5 | Segmentación regional CMIP6 (costa/sierra/selva) | Precisión espacial | Alta |

## 6.2 Dependencias críticas entre sprints

```
P0 (fixes) → independiente, ejecutar primero
P1.1 (temporal.ts) → bloquea P1.3, P1.4
P1.3 (ClimateHorizon) → bloquea P2.3, P2.4
P2.1 (ontology.ts) → bloquea P2.3, P2.4, P3.1
P3.2 (regionalización) → requiere LocationContext → bloquea P3.1
P0.4 (@ts-nocheck) → habilita P1.3 migration sin errores ocultos
```

## 6.3 Riesgo técnico y científico por sprint

| Sprint | Riesgo técnico | Riesgo científico | Mitigación |
|---|---|---|---|
| P0 | Bajo (fixes aislados) | Bajo | Tests existentes |
| P1 Sprint 1 | Medio (breaking TemporalPeriod) | Bajo | Adapter layer + regression tests |
| P1 Sprint 2 | Medio (breaking normalizeRisks) | Medio (separar hazards) | Contrastar con auditoría |
| P2 Sprint 3 | Medio (Layer2 thresholds) | Alto (umbrales incorrectos → señales falsas) | Validar vs SENAMHI |
| P3 Sprint 4+ | Alto (multi-tenant) | Medio | Arquitectura incremental |

---

# FASE 7 — ARQUITECTURA OBJETIVO COMPLETA

## 7.1 Domain Model — Diagrama de entidades

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SCIENTIFIC DOMAIN                                                       │
│                                                                         │
│  ClimateCell          ClimateSignal        AnnotatedHazard              │
│  ─────────────        ────────────         ───────────────              │
│  lat, lon             hazardId             hazardId                     │
│  horizon              horizon              displayType                  │
│  scenario             scenario             horizon                      │
│  variable: tas|pr|..  value                scenario                     │
│  value                unit                 intensity                    │
│  p10, p90             p10, p90             confidence      ←──────┐    │
│  n_models             n_models             confidenceRationale    │    │
│  data_source          dataSource           uncertaintyRange       │    │
│                       rawConfidence        sources[]              │    │
│                                                                   │    │
│  HorizonMetadata      HazardDefinition     ConfidenceRules        │    │
│  ───────────────      ───────────────      ───────────────────────┘    │
│  id: ClimateHorizon   id: HazardId         precipitation → 'low'       │
│  yearRange            climateVariables     temperature → 'high'         │
│  dataSource           thresholdType        extrapolated → 'low'         │
│  hasRealDBData        isProjectable        open_meteo → 'low'           │
│  allowedMaxConfidence uncertaintyNote                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ BUSINESS DOMAIN                                                         │
│                                                                         │
│  SectorProfile        ExposureEntry        OperationalImpact            │
│  ─────────────        ─────────────        ─────────────────            │
│  id: sector           hazardId             displayType                  │
│  characteristics      displayType          horizon                      │
│  vulnerabilities*     horizon              scenario                     │
│                       scenario             narrativeText                │
│  AdaptationMeasure    exposureType         impactBullets[]              │
│  ───────────────────  impactDomain         adaptations[]                │
│  id                   impactDescription    confidence                   │
│  name                 confidence           scenarioVariants             │
│  timeframe                                                              │
│  effectiveness                                                          │
│  sectorTags                                                             │
│  evidenceSource                                                         │
│                                                                         │
│  * vulnerability: stub vacío hasta P3.5                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ NARRATIVE DOMAIN                                                        │
│                                                                         │
│  ExecutiveNarrative   HorizonNarrative     GovernanceMetadata           │
│  ──────────────────   ────────────────     ──────────────────           │
│  locationLabel        horizon              sources[]                    │
│  executiveSummary     hazardSummaries[]    analysisDate                 │
│  horizons{}           scenarioVariants     methodology                  │
│  primaryHazards[]     disclaimer           limitations[]                │
│  scenarioDelta        confidence                                        │
│  confidence                                                             │
│  governanceMetadata                                                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ AI DOMAIN                                                               │
│                                                                         │
│  AIEnrichmentContext  AIEnrichmentResponse  AIValidationResult          │
│  ───────────────────  ───────────────────   ─────────────────           │
│  location             contextualSummary     passed: boolean             │
│  sector               operationalImplications violations[]              │
│  hazards[]            adaptationFraming     autoFixable                 │
│  existingNarrative    disclaimer            sanitizedText?              │
│  constraints          confidenceStatement                               │
│  availableSources[]                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 7.2 Invariantes científicos — reglas que nunca se pueden violar

Estas reglas deben estar validadas en tests y documentadas en SCIENTIFIC_METHOD.md:

```typescript
// server/scientific/invariants.ts

export const SCIENTIFIC_INVARIANTS = {

  // I1: Confianza no puede superar el máximo del horizonte
  confidenceBoundedByHorizon: (confidence: ConfidenceLevel, horizon: ClimateHorizon) => {
    const max = HORIZON_REGISTRY[horizon].allowedMaxConfidence;
    return CONFIDENCE_RANK[confidence] <= CONFIDENCE_RANK[max];
  },

  // I2: end_century siempre con disclaimer visible
  endCenturyAlwaysDisclaimed: (horizon: ClimateHorizon, hasDisclaimer: boolean) => {
    if (horizon === 'end_century') return hasDisclaimer === true;
    return true;
  },

  // I3: ENSO nunca proyectado en horizontes futuros
  ensoNotProjected: (hazardId: HazardId, horizon: ClimateHorizon) => {
    const ensoHazards: HazardId[] = ['enso_el_nino', 'enso_la_nina'];
    if (ensoHazards.includes(hazardId)) return horizon === 'baseline';
    return true;
  },

  // I4: AI output siempre validado antes de UI
  aiOutputAlwaysValidated: (output: AIEnrichmentResponse, validated: boolean) => validated,

  // I5: precipitación nunca 'high' confidence para proyecciones
  precipitationConfidenceNotHigh: (variable: ClimateVariableId, confidence: ConfidenceLevel, horizon: ClimateHorizon) => {
    if (variable === 'pr' && horizon !== 'baseline') return confidence !== 'high';
    return true;
  },

  // I6: sin valores financieros en ninguna capa de narrativa
  noFinancialValues: (text: string) => {
    return !/\$[\d,.]|S\/\.?\s?[\d,.]|USD\s?[\d,.]/.test(text);
  },

  // I7: historical y projected siempre distinguidos en narrativa
  historicalDistinctFromProjected: (narrative: string) => {
    // verificar que narrativa no mezcla lenguaje observacional con proyectado sin aclaración
    return true; // implementar con pattern matching
  },

  // I8: keyMetric siempre tiene source o es null
  keyMetricTraced: (metric: string | null, source: string | null) => {
    if (metric !== null) return source !== null;
    return true;
  },
} as const;
```

## 7.3 Frontend contracts — Props API para UI components

```typescript
// src/types/ui-contracts.ts

// Contrato de HazardCard — no recibe ClimateSignal raw
export interface HazardCardProps {
  displayType: RiskDisplayType;
  displayName: string;
  icon: string;
  horizon: ClimateHorizon;
  horizonLabel: string;      // "Horizonte 2040–2059"
  intensity: 'low' | 'moderate' | 'high' | 'very_high';
  confidence: ConfidenceLevel;
  confidenceLabel: string;   // "Alta confianza (temperatura)"
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  keyMetric: string | null;  // "1.4°C (±0.4°C) sobre baseline"
  narrativeText: string;
  impactBullets: string[];
  adaptationMeasures: AdaptationSummary[];
  disclaimer: string | null; // visible si horizon === 'end_century'
}

// Contrato de HorizonNavigator
export interface HorizonNavigatorProps {
  availableHorizons: ClimateHorizon[];
  activeHorizon: ClimateHorizon;
  onHorizonChange: (h: ClimateHorizon) => void;
  activeScenario: 'ssp245' | 'ssp585';
  onScenarioChange: (s: 'ssp245' | 'ssp585') => void;
}

// Contrato de ExecutiveSummaryCard
export interface ExecutiveSummaryCardProps {
  locationLabel: string;
  executiveSummary: string;
  primaryHazards: Array<{ displayType: RiskDisplayType; displayName: string; icon: string }>;
  confidence: ConfidenceLevel;
  scenarioDelta: string | null; // "Bajo altas emisiones, el riesgo de calor es significativamente mayor"
  analysisDate: string;
}

// Regla: ningún componente recibe `any`, `object`, o `Record<string, unknown>`
// Regla: ningún componente importa desde server/
// Regla: todos los archivos tienen TypeScript habilitado (sin @ts-nocheck)
```

## 7.4 Backend contracts — API Response Schema

```typescript
// server/types/api-contracts.ts

// Respuesta canónica del endpoint principal
export interface ClimateAnalysisResponse {
  meta: {
    requestId: string;
    analysisDate: string;
    location: { lat: number; lon: number; label: string; region: 'costa' | 'sierra' | 'selva' };
    sector: string;
    dataAvailability: Record<ClimateHorizon, boolean>;
  };

  // Hazards organizados por horizonte (reemplaza signals[] + risks[] flat)
  timeline: {
    baseline: ClassifiedHazard[];
    near_term: { ssp245: ClassifiedHazard[]; ssp585: ClassifiedHazard[] };
    mid_century: { ssp245: ClassifiedHazard[]; ssp585: ClassifiedHazard[] };
    end_century: {
      ssp245: ClassifiedHazard[];
      ssp585: ClassifiedHazard[];
      isExtrapolated: true;   // siempre true — invariante I2
      disclaimer: string;
    };
  };

  narrative: ExecutiveNarrative;
  governance: GovernanceMetadata;
}

// Eliminar: señales flat, risks flat, proyecciones hardcodeadas en narrative
// Mantener: GRI Oxford como fuente adicional que alimenta ClassifiedHazard
```

## 7.5 Deuda técnica acumulada y orden de liquidación

```
Deuda técnica actual (ordenada por impacto):

1. [CRÍTICA] @ts-nocheck en 3 archivos UI → P0.4
2. [CRÍTICA] Gemini sin system prompt ni validación → P0.1 + P0.2
3. [ALTA] 3 modelos temporales contradictorios → P1.1–P1.4
4. [ALTA] Dos sistemas de narrativa compitiendo → P1.7
5. [ALTA] PERIOD_MAPS inline en climate.js → P1.4
6. [MEDIA] classifyRiskLevel duplicado → P3.3
7. [MEDIA] buildExecutiveSummary deprecated presente → P1.6
8. [MEDIA] flood_risk → lluvias_extremas semánticamente incorrecto → P2.3
9. [MEDIA] heladas sin detección en Layer2 → P3.1
10. [BAJA] GRI_HAZARD_LABELS duplica RISK_TYPE_DISPLAY → P2
11. [BAJA] SAM region para todo Perú → P4.5
12. [BAJA] near_term datos fantasma en UI → P0.6 (trivial fix)
```

---

## Apéndice A — Reglas de naming definitivas

| Concepto | Key técnica (backend) | Key canónica (TS) | Label UI |
|---|---|---|---|
| Observaciones 1981-2014 | `historical` | `baseline` | "Línea Base 1981–2014" |
| Proyección 2020-2039 | `near_term` | `near_term` | "Horizonte 2020–2039" |
| Proyección 2040-2059 | `mid_term` | `mid_century` | "Horizonte 2040–2059" |
| Proyección 2060-2079 | `long_term` | `end_century` | "Horizonte 2060–2079 ⚠" |
| SSP2-4.5 | `ssp245` | `ssp245` | "Emisiones moderadas" |
| SSP5-8.5 | `ssp585` | `ssp585` | "Altas emisiones" |
| Calor extremo | `extreme_heat` | `heat_stress` | "Estrés por Calor" |
| Lluvia extrema | `extreme_rainfall` | `extreme_precipitation` | "Precipitación Extrema" |
| Inundación | `flood_risk` | `flooding` | "Inundación" |
| Deslizamiento | `landslide` | `mass_movement` | "Deslizamiento" |
| Sequía | `drought` | `drought` | "Sequía" |
| Heladas | `frost` | `frost` | "Heladas" |
| ENSO | `el_nino`/`la_nina` | `enso_variability` | "Variabilidad ENSO" |

## Apéndice B — Checklist de validación científica pre-release

Antes de hacer release de cualquier sprint, verificar:

- [ ] No hay frases determinísticas sobre el futuro sin qualifier de escenario
- [ ] No hay valores p10/p90 de precipitación mostrados con 'high' confidence
- [ ] end_century siempre muestra disclaimer visible (no colapsado)
- [ ] Gemini no puede bypasear el validador
- [ ] No hay financial figures en ningún texto generado
- [ ] ENSO no aparece en horizontes futuros como hazard proyectado
- [ ] Tests de invariantes científicas pasan (I1–I8)
- [ ] No hay @ts-nocheck en archivos nuevos o modificados
- [ ] Labels temporales no dicen "corto/mediano/largo plazo"
- [ ] Fuente de datos visible para cada metric en HazardCard

---

*Este documento es la especificación maestra. Los sprints de implementación deben referenciar las secciones correspondientes. Cualquier decisión que contradiga esta especificación requiere revisión explícita de esta sección y actualización del documento.*
