# PASO-3 — Signal Strength (Confianza Bidimensional: Fortaleza de Señal)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `calculateSignalStrength(variable, allVariables)` + 4 funciones de detector + `computeSignificanceRatio()` |
| **Ubicación** | `pipeline/stages/04-signals/confidence.js:338-629` |
| **Stage** | Stage 04 — Signals (ID: 4) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del cálculo de Signal Strength como la fortaleza de la señal climática detectada, calculada por el detector específico al tipo de variable |

---

## 1. Resumen Ejecutivo

Signal Strength mide la fortaleza de la señal climática detectada. A diferencia de Source Quality (fórmula universal), Signal Strength es **específica del tipo de detector** (stage-04-signals.md Rule 2). Cada tipo de variable tiene su propio conjunto de componentes y metodología de cálculo.

**Score final**: Promedio de los componentes disponibles (no-null) para el detector aplicable. Score = null cuando ningún componente es calculable.

**Label**: `high` / `medium` / `low` / `not_available`, leído de `thresholds.json signal_strength_labels`.

---

## 2. Flujo de Cálculo

```
calculateSignalStrength(variable, allVariables)                // confidence.js:560
  │
  ├── ¿variable.name === "enso_phase"?
  │   └── computeCategoricalDetector(variable)                 // confidence.js:514
  │       ├── anomaly_magnitude = isActive ? 1.0 : 0.0
  │       └── temporal_persistence, projected_change, cross_period = null (no aplica)
  │
  ├── ¿isBaselineOrStaticVariable(variable)?                   // confidence.js:532
  │   └── Todos los componentes = null (es la referencia, no una anomalía)
  │
  ├── ¿variable.source === "openmeteo_cmip6"?
  │   └── computeProjectionDetector(variable, all)             // confidence.js:389
  │       ├── projected_change = significance_ratio(Δ vs histórico)
  │       ├── cross_period_consistency = acuerdo_signo(bandas)
  │       └── anomaly_magnitude, temporal_persistence = null (no aplica)
  │
  ├── ¿Tiene CROSS_SOURCE_BASELINE[source:name]?
  │   └── computeAnomalyDetector(variable, all)                // confidence.js:463
  │       ├── anomaly_magnitude = significance_ratio(Δ vs baseline climatológica)
  │       └── temporal_persistence = null (sin series multi-fecha)
  │
  └── (sin clasificación)
      └── "unclassified" — todos los componentes = null
  │
  └── score = mean(available_values)  // o null si no hay disponibles
      label = score >= 0.70 ? "high" : score >= 0.40 ? "medium" : "low"
```

---

## 3. Descripción Detallada por Detector

### 3.1 ProjectionDetector

**Función**: `computeProjectionDetector(variable, allVariables, thresholdsAnomaly)` — confidence.js:389

**Aplica a**: Variables de openmeteo_cmip6 (proyecciones CMIP6 con horizonte corto/mediano/largo).

**Componentes**:

| Componente | Cálculo | Referencia |
|-----------|---------|------------|
| `projected_change` | `significance_ratio(Δ, baseline, unit, thresholds)` | UNFCCC Art.2.1(a), IPCC AR6 WGI Ch.4, ETCCDI, WMO-TD/1200 |
| `cross_period_consistency` | `majority_sign_agreement(bandDeltas)` | Stage-04-signals.md: "consistencia entre modelos" |
| `anomaly_magnitude` | null (no aplica: no es observación) | — |
| `temporal_persistence` | null (no aplica: no es observación) | — |

**`projected_change`**: Δ = `variable.value - historico.value`. Normalizado por `computeSignificanceRatio()`:
- Temperatura (°C): `|Δ| / 2.0°C` (UNFCCC/IPCC)
- Precipitación (mm): `|Δ%| / 25%` (ETCCDI/SENAMHI)
- Viento (km/h): `|Δ%| / 30%` (WMO-TD/1203)

**`cross_period_consistency`**: De las bandas disponibles (corto/mediano/largo), cuántas coinciden en el signo de Δ vs histórico. `majority / total_signs`.

**anomaly_value**: Δ físico crudo (valor_actual - histórico) en la unidad propia de la variable.

### 3.2 AnomalyDetector

**Función**: `computeAnomalyDetector(variable, allVariables, thresholdsAnomaly)` — confidence.js:463

**Aplica a**: Variables con línea base climatológica independiente:
- `weatherapi:air_temperature_current` vs `supabase_climate_cells:cc_tas`
- `nasa_power:precipitation_sum` vs `supabase_climate_cells:cc_pr`

**Componentes**:

| Componente | Cálculo | Referencia |
|-----------|---------|------------|
| `anomaly_magnitude` | `significance_ratio(Δ, baseline, unit, thresholds)` | WMO-No.1203 1991-2020 baseline |
| `temporal_persistence` | null (sin observaciones multi-fecha) | — |
| `projected_change` | null (no es proyección CMIP6) | — |
| `cross_period_consistency` | null (no es proyección CMIP6) | — |

**anomaly_value**: Δ físico crudo (valor_actual - baseline climatológica).

### 3.3 CategoricalDetector

**Función**: `computeCategoricalDetector(variable)` — confidence.js:514

**Aplica a**: `enso_phase`

**Componentes**:

| Componente | Cálculo | Referencia |
|-----------|---------|------------|
| `anomaly_magnitude` | isActive ? 1.0 : 0.0 | Trenberth 1997, NOAA CPC: ≥5 trimestres ONI ≥±0.5°C |
| `temporal_persistence` | null (precondición binaria de la clasificación) | — |
| `projected_change` | null (no es proyección) | — |
| `cross_period_consistency` | null (no es proyección) | — |

### 3.4 baseline_or_static

**Variables**: elevation, cc_*, *_historico, indicadores socioeconómicos.

**Todos los componentes = null**: Estas variables son la **referencia** contra la que otras se comparan. No son anomalías, tendencias ni proyecciones.

### 3.5 unclassified

**Variables**: relative_humidity, wind_speed, surface_pressure (sin línea base pareada).

**Todos los componentes = null**: Sin metodología de signal_strength aplicable. Se descarta con razón explícita.

---

## 4. computeSignificanceRatio()

**Función**: `computeSignificanceRatio(delta, baselineValue, unit, thresholdsAnomaly)` — confidence.js:345

Convierte un Δ físico en un ratio de significancia 0-1 usando los umbrales **ya citados** de thresholds.json `anomaly`:

| Unidad | Fórmula | Umbral | Referencia |
|--------|---------|--------|------------|
| °C | `|Δ| / 2.0` | temperature_delta_c = 2.0 | UNFCCC Art.2.1(a), IPCC AR6 WGI Ch.4 |
| mm | `|Δ%| / 25` | precipitation_delta_pct = 25 | ETCCDI/WMO-TD-1200, SENAMHI |
| km/h | `|Δ%| / 30` | wind_speed_delta_pct = 30 | WMO-TD/1203, Vose et al. 2014 |

**Resultado**: `min(1, ratio)` — una anomalía que excede el umbral significativo llega a 1.0.

---

## 5. Label de Signal Strength

```javascript
// confidence.js:623-627
const labelBands = getThresholds().signal_activation.signal_strength_labels;
const label = score == null ? "not_available"
  : score >= labelBands.medium_max ? "high"      // >= 0.70
  : score >= labelBands.low_max ? "medium"        // >= 0.40
  : "low";                                         // < 0.40
```

| Label | Rango | Significado |
|-------|-------|-------------|
| `high` | [0.70, 1.0] | Señal fuerte, alta confianza |
| `medium` | [0.40, 0.70) | Señal moderada |
| `low` | [0, 0.40) | Señal débil (descartada en Stage 04) |
| `not_available` | score = null | Sin metodología aplicable |

**H-10**: `low_max = min_signal_strength` (0.40) por diseño — una señal "low" es exactamente la que Stage 04 descarta. `medium_max = 0.70` = punto medio de [0.40, 1.0] (Laplace).

---

## 6. anomaly_value

**Campo**: `signalStrength.anomaly_value` (number|null)

**Significado**: Δ físico crudo en la unidad propia de la variable (ej: °C, mm). No el ratio normalizado 0-1 de signal_strength.

**Disponibilidad**:
| Detector | anomaly_value | Razón |
|----------|--------------|-------|
| ProjectionDetector | Δ = valor - histórico | Calculado internamente para projected_change |
| AnomalyDetector | Δ = valor - baseline | Calculado internamente para anomaly_magnitude |
| CategoricalDetector | null | Estado categórico, sin Δ numérico |
| baseline_or_static | null | Es la referencia |
| unclassified | null | Sin línea base pareada |

---

## 7. Trazabilidad

| Referencia | Hallazgo | Resolución |
|------------|----------|------------|
| H-02 (CRÍTICO) | Solo 1/4 componentes (|value|/|range_max|) | 4 componentes por detector, con metodología específica |
| H-03 (CRÍTICO) | Recibía TODAS las variables | Ahora recibe 1 variable + array para localizar baseline |
| H-05 (CRÍTICO) | Output no cumplía schema | Output alineado con SignalStrengthSchema |
| H-08 (ALTO) | anomaly_value siempre null | Calculado en AnomalyDetector y ProjectionDetector |
| H-10 (ALTO) | Label thresholds hardcodeados | Movidos a thresholds.json signal_strength_labels |
| H-12 (MEDIO) | Normalización no era anomalía | computeSignificanceRatio usa umbrales thresholds.json |
