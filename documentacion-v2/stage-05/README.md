# Stage 05 — Phenomena Consolidation

## Propósito

Consolidar señales climáticas en fenómenos de interés (ola de calor, ola de frío, sequía, inundación, El Niño, La Niña) con confianza bidimensional combinada (source quality × signal strength). Cada fenómeno se activa según su tipo (categórico, direccional o numérico), se infiere su estado (active/projected/not_detected), horizonte temporal y escenario, y se produce evidencia negativa explícita para fenómenos no detectados.

## Arquitectura del stage

```
index.js (Stage05Phenomena)
│
├─ async execute(input)
│   ├─ PASO 1: Validación de entrada          → validateSignal(), filtrado de malformadas
│   ├─ PASO 2: Carga de configuración         → phenomenon-definitions.json, thresholds.json
│   ├─ PASO 3: Consolidación por fenómeno
│   │   ├─ PASO 3a: Coincidencia de señales   → required + optional signals matching
│   │   ├─ PASO 3b: Agregación de scores      → aggregateSignals() [4 métodos]
│   │   └─ PASO 3c: Combinación de confianza  → combineConfidence() [3 métodos]
│   ├─ PASO 4: Inferencia de metadatos        → inferStatus(), inferHorizon(), inferScenario()
│   ├─ PASO 5: Activación                     → categórica / direccional / numérica
│   └─ PASO 6: Ensamblar output               → phenomena[], phenomena_not_detected[]
│
├─ Aggregate signals (aggregate-signals.js)
│   └─ aggregateSignals(signals, roles, method, dimension, weights)
│       ├─ arithmetic_mean                     → media simple
│       ├─ geometric_mean                      → penaliza desequilibrios (OECD/JRC §6.3)
│       ├─ required_first                      → required×1.0 + optional×0.5
│       └─ type_weighted                       → anomaly=1.0, categorical=0.8, projected=0.5
│
├─ Combine confidence (combine-confidence.js)
│   └─ combineConfidence(sq, ss, method, weights)
│       ├─ geometric_mean                      → √(sq × ss) — default
│       ├─ min                                 → min(sq, ss)
│       └─ weighted                            → w1×sq + w2×ss
│
├─ Signal metadata (signal-metadata.js)
│   ├─ SIGNAL_METADATA                         → mapping nombre→{type, horizon, scenario}
│   ├─ inferHorizon(signalNames)               → largo > mediano > corto | null
│   ├─ inferStatus(signalNames)                → active | projected
│   └─ inferScenario(signalNames)              → string | null
│
├─ Config files (pipeline/config/):
│   ├─ phenomenon-definitions.json   ← definición de fenómenos con scientific_reference
│   └─ thresholds.json               ← umbrales de activación, métodos, pesos
│
└─ Shared modules (pipeline/shared/):
    └─ types.js                      ← ClimatePhenomenonSchema, PhenomenonNameEnum
```

## Dependencias de entrada

| Origen | Campo | Descripción |
|--------|-------|-------------|
| Stage 04 | `signals[]` | Señales climáticas con source_quality y signal_strength calculados |
| Stage 04 | `signals[].name` | Nombre canónico de la señal (mapeado desde signal-taxonomy.json) |
| Stage 04 | `signals[].source_quality.score` | Calidad de fuente [0,1] o null (componentes excluidos) |
| Stage 04 | `signals[].signal_strength.score` | Fortaleza de señal [0,1] |
| Stage 04 | `signals[].value` | Valor crudo (para activación categórica: "el_nino"/"la_nina") |
| Stage 04 | `signals[].anomaly_value` | Δ físico crudo en unidad original (para activación direccional) |
| Config | `phenomenon-definitions.json` | Definiciones de fenómenos: required_signals, optional_signals, sign, matchValue |
| Config | `thresholds.json` | min_source_quality, min_phenomenon_activation, confidence_combination, signal_aggregation |

## Output

El stage produce un objeto con esta estructura:

```javascript
{
  phenomena: [
    {
      phenomenon_id: UUID,
      name: "ola_de_calor" | "ola_de_frio" | "sequia" | "inundacion" | "el_nino" | "la_nina",
      status: "active" | "projected" | "not_detected",
      confidence: {
        source_quality: number,    // promedio de SQ de señales contribuyentes [0,1]
        signal_strength: number,   // promedio de SS de señales contribuyentes [0,1]
        combined: number,          // combinación según confidence_combination [0,1]
      },
      contributing_signals: UUID[],
      scenario: string | null,     // inferido de señales (hoy siempre null)
      horizon: "corto" | "mediano" | "largo" | null,  // inferido de señales
    }
  ],
  phenomena_not_detected: [
    {
      name: string,                // nombre del fenómeno o "señal_malformada"
      reason: string,              // razón específica del no-detección
      evidence: string,            // evidencia cuantitativa para auditoría
    }
  ]
}
```

## Resumen de los 6 pasos

| Paso | Nombre | Responsabilidad clave |
|------|--------|----------------------|
| 1 | Validación de entrada | Filtrar señales malformadas, validar campos requeridos |
| 2 | Carga de configuración | Cargar phenomenon-definitions.json y thresholds.json |
| 3 | Consolidación | Coincidencia de señales, agregación de scores, combinación de confianza |
| 4 | Inferencia de metadatos | Inferir status (active/projected), horizon (corto/mediano/largo), scenario |
| 5 | Activación | Categórica (matchValue), direccional (sign + anomaly_value), numérica (SS ≥ umbral) |
| 6 | Ensamblaje | Generar phenomena[] y phenomena_not_detected[] con evidencia |

## Fenómenos soportados

| Fenómeno | Señales requeridas | Tipo activación | Fundamento |
|----------|-------------------|-----------------|------------|
| ola_de_calor | temperatura_actual_anomaly, temperatura_max_projection* | Direccional (sign: positive) | IPCC AR6 WGI Ch.11, WMO-No.1090 §2.3 |
| ola_de_frio | temperatura_actual_anomaly, temperatura_min_projection* | Direccional (sign: negative) | IPCC AR6 WGI Ch.11, SENAMHI heladas |
| sequia | precipitacion_projection* | Direccional (sign: negative) | Trenberth et al. 2014, Sheffield & Wood 2012 |
| inundacion | precipitacion_projection* | Direccional (sign: positive) | IPCC AR6 WGI Ch.11, WRI Aqueduct 4.0 |
| el_nino | enso_phase_categorical | Categórica (matchValue: "el_nino") | NOAA CPC, Trenberth 1997 |
| la_nina | enso_phase_categorical | Categórica (matchValue: "la_nina") | NOAA CPC, Trenberth 1997 |

\* Incluye variantes con sufijo de horizonte (_corto, _mediano, _largo).

## Fenómenos excluidos (documentados)

| Fenómeno | Razón | Revisar cuando |
|----------|-------|----------------|
| vientos_fuertes | wind_anomaly siempre se descarta en Stage 04 (sin línea base cc_*) | Stage 04 agregue cc_wind o CMIP6 wind_speed |
| deslizamiento | Requiere pendiente + susceptibilidad (no disponibles) | Se ingiera DEM slope + INGEMMET 2021 |
| huayco | Requiere convergencia de drenaje + pendiente | Se ingiera flow accumulation + slope |

## Métodos de agregación y combinación

### Agregación de scores (SQ/SS sobre señales)

| Método | Fórmula | Cuándo usar |
|--------|---------|-------------|
| arithmetic_mean | (s1 + s2 + ... + sn) / n | Default — todas las señales pesan igual |
| geometric_mean | (s1 × s2 × ... × sn)^(1/n) | Penaliza desequilibrios entre señales |
| required_first | (w_r × Σ required + w_o × Σ optional) / (w_r×n_r + w_o×n_o) | Required pesa más que optional |
| type_weighted | Σ(w_type × s) / Σ(w_type) | Anomaly > categorical > projected |

### Combinación de confianza (SQ × SS)

| Método | Fórmula | Propiedad |
|--------|---------|-----------|
| geometric_mean | √(sq × ss) | Penaliza desequilibrios (OECD/JRC §6.3) |
| min | min(sq, ss) | Conservador — piso absoluto |
| weighted | (w1×sq + w2×ss) / (w1+w2) | Sin penalización, ponderación controlada |

## Auditorías

Ver `AUDITORIA-stage-05-phenomena.md` para hallazgos de calidad y su resolución (20 hallazgos, todos cerrados).
