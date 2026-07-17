# PASO-1 — Carga de Configuración

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `getThresholds()`, `getSignalTaxonomy()`, `getDecorrelatonConfig()`, `getResolutionProfiles()`, `getTemporalCoverageProfiles()`, `getSourceQualityWeights()` |
| **Ubicación** | `pipeline/orchestration/config-loader.js` (funciones), consumidas por `pipeline/stages/04-signals/index.js` y `pipeline/stages/04-signals/confidence.js` |
| **Stage** | Stage 04 — Signals (ID: 4) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la carga de configuración que sustenta Source Quality, Signal Strength, clasificación de señales y detección de riesgos de transición |

---

## 1. Resumen Ejecutivo

PASO-1 carga y cachea siete archivos de configuración que definen: pesos de source quality, umbrales de activación de señales, taxonomía de señales, modelo de decorrelación espacial, perfiles de cobertura temporal, perfiles de resolución por sector, y rangos físicos de validación. El cache de `config-loader.js` (TTL 60s) evita I/O redundante.

**Pre-condición obligatoria**: Sin configuración válida, Stage 04 no puede calcular source quality ni signal strength y falla con error.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
PipelineEngine.run(input)                                              // engine.js
  │
  └── Stage04Signals.execute(input)                                    // index.js:22
        │
        ├── getThresholds()                                            // ← PASO 1: thresholds.json
        ├── getSignalTaxonomy()                                        // ← PASO 1: signal-taxonomy.json
        │
        ├── Por cada canonical_variable:
        │   ├── classifySignal(v)                                      // ← PASO 4 (usa taxonomy)
        │   ├── calculateSourceQuality(sourceInput, sector)            // ← PASO 2
        │   │   ├── getDecorrelatonConfig()                            // ← PASO 1: spatial-decorrelation.json
        │   │   ├── getResolutionProfiles()                            // ← PASO 1: resolution-profiles.json
        │   │   ├── getTemporalCoverageProfiles()                      // ← PASO 1: temporal-coverage-profiles.json
        │   │   ├── getSourceQualityWeights()                          // ← PASO 1: thresholds.json source_quality_weights
        │   │   └── getThresholds()                                    // ← PASO 1: thresholds.json spatial_coverage
        │   ├── calculateSignalStrength(v, canonical_variables)        // ← PASO 3
        │   └── Filtro min_signal_strength                             // ← PASO 6
        │
        └── Ensamblar output                                           // ← PASO 6
```

### 2.2 Flujo de datos

```
config/ (disco)
  │
  ├── thresholds.json ─────────────────→ source_quality_weights (30/20/20/20/10)
  │                                      signal_activation (min_signal_strength, min_source_quality)
  │                                      signal_strength_labels (low_max, medium_max)
  │                                      anomaly (temperature_delta_c, precipitation_delta_pct, etc.)
  │                                      spatial_coverage (max distances por tipo de fuente)
  │
  ├── signal-taxonomy.json ───────────→ variables{} → {signal_name, signal_type, overrides_by_source}
  │
  ├── spatial-decorrelation.json ─────→ variables{} → decorrelation_length_km
  │                                      non_stochastic{} → elevation, population, oni_index, etc.
  │
  ├── temporal-coverage-profiles.json → point_in_time_sources, climate_normal_sources,
  │                                      fixed_window_sources, horizon_projection_sources
  │
  ├── resolution-profiles.json ───────→ sectors{} → required_resolution_meters
  │                                      decay_alpha, variable_overrides.samples_per_decorrelation_length
  │                                      native_resolution_parse (string → metros)
  │
  ├── validation-profiles.json ───────→ physical_ranges{} → valid_range por variable
  │                                      (usado por computeSignificanceRatio)
  │
  └── sector-profiles.json ───────────→ sectors{} → transition_risks[], transition_sensitivity
                                         default → fallback profile
```

---

## 3. Archivos de Configuración

### 3.1 `thresholds.json`

**Responsabilidad**: Pesos de source quality, umbrales de activación, umbrales de anomalía, cobertura espacial.

**Campos consumidos por Stage 04**:

| Sección | Campo | Valor | Descripción |
|---------|-------|-------|-------------|
| `source_quality_weights` | `coverage_spatial` | 0.30 | Peso del componente de cobertura espacial |
| `source_quality_weights` | `coverage_temporal` | 0.20 | Peso del componente de cobertura temporal |
| `source_quality_weights` | `completeness` | 0.20 | Peso del componente de completitud |
| `source_quality_weights` | `resolution` | 0.20 | Peso del componente de resolución |
| `source_quality_weights` | `proximity` | 0.10 | Peso del componente de proximidad |
| `signal_activation` | `min_signal_strength` | 0.40 | Umbral mínimo para conservar una señal |
| `signal_activation` | `signal_strength_labels.low_max` | 0.40 | Límite superior del label "low" (= min_signal_strength) |
| `signal_activation` | `signal_strength_labels.medium_max` | 0.70 | Límite superior del label "medium" (punto medio de [0.40, 1.0]) |
| `anomaly` | `temperature_delta_c` | 2.0 | Umbral de significancia para anomalía de temperatura (°C) |
| `anomaly` | `precipitation_delta_pct` | 25 | Umbral de significancia para anomalía de precipitación (%) |
| `anomaly` | `wind_speed_delta_pct` | 30 | Umbral de significancia para anomalía de viento (%) |
| `spatial_coverage` | `observation_max_km` | 25 | Radio de proximidad para observaciones in-situ |
| `spatial_coverage` | `grid_projection_max_km` | 25 | Radio de proximidad para proyecciones CMIP6 |
| `spatial_coverage` | `enso_max_km` | null | ONI sin límite de representatividad local |

### 3.2 `signal-taxonomy.json`

**Responsabilidad**: Mapeo declarativo variable canónica → {signal_name, signal_type}. H-07: reemplaza la heurística basada en substrings.

**Estructura**:
```json
{
  "variables": {
    "air_temperature_current": {
      "signal_name": "temperatura_actual_anomaly",
      "signal_type": "anomaly"
    },
    "precipitation_sum": {
      "signal_name": "precipitacion_projection",
      "signal_type": "projected",
      "signal_type_overrides_by_source": { "nasa_power": "anomaly" }
    }
  }
}
```

**Tipos de señal**: `anomaly`, `projected`, `categorical`, `static`.

### 3.3 `spatial-decorrelation.json`

**Responsabilidad**: Longitudes de decorrelación espacial por variable climática y reglas para variables no estocásticas.

**Campos consumidos**:
- `variables.{varname}.decorrelation_length_km`: Longitud L para modelo `exp(-d/L)`
- `non_stochastic.{varname}.rule`: Regla especial (`always_1`, `resolution_ratio`, `categorical`)

### 3.4 `temporal-coverage-profiles.json`

**Responsabilidad**: Metodología del componente `coverage_temporal` de Source Quality.

**Clasificación de fuentes**:
- `point_in_time_sources`: Lectura instantánea → coverage_temporal = 1.0
- `climate_normal_sources`: Estadísticas OMM 1991-2020 → coverage_temporal = 1.0
- `fixed_window_sources`: Ventana fija conocida (nasa_power: 365 días) → ratio actual/requerido
- `horizon_projection_sources`: Proyecciones CMIP6 → ratio basado en horizonte (horizons.js)
- `unclassified_fallback`: Fuente sin metodología → excluida del promedio

### 3.5 `resolution-profiles.json`

**Responsabilidad**: Modelo de decaimiento continuo para el componente `resolution` de Source Quality.

**Fórmula**: `exp(-alpha × max(0, ratio - 1))` donde `ratio = native_m / required_m`.

**Campos clave**:
- `sectors.{sector}.required_resolution_meters`: Resolución requerida por sector
- `decay_alpha`: 0.3 (CEOS WGCV 2019)
- `variable_overrides.samples_per_decorrelation_length`: 2 (Nyquist mínimo)

### 3.6 `sector-profiles.json`

**Responsabilidad**: Perfiles sectoriales para riesgos de transición.

**Campos consumidos**:
- `sectors.{sector}.transition_risks[]`: Lista de riesgos (type, description, timeframe, severity)
- `sectors.{sector}.transition_sensitivity`: Sensibilidad del sector a la transición (0-1)
- `default`: Perfil por defecto para sectores no registrados

---

## 4. Funciones de Config-Loader

| Función | Archivo cargado | Usado por |
|---------|----------------|-----------|
| `getThresholds()` | `thresholds.json` | source_quality_weights, signal_activation, anomaly, spatial_coverage |
| `getSignalTaxonomy()` | `signal-taxonomy.json` | classifySignal() |
| `getDecorrelatonConfig()` | `spatial-decorrelation.json` | computeCoverageSpatial() |
| `getResolutionProfiles()` | `resolution-profiles.json` | computeResolution() |
| `getTemporalCoverageProfiles()` | `temporal-coverage-profiles.json` | computeCoverageTemporal() |
| `getSourceQualityWeights()` | `thresholds.json` (source_quality_weights) | calculateSourceQuality() |
| `getValidationProfiles()` | `validation-profiles.json` | computeSignificanceRatio() |

---

## 5. Trazabilidad

| Referencia | Hallazgo | Resolución |
|------------|----------|------------|
| H-01 (CRÍTICO) | Source Quality solo implementaba 2/5 componentes | Ahora implementa 5 componentes con pesos de thresholds.json |
| H-07 (ALTO) | signalName/signalType usaba substrings | Reemplazado por signal-taxonomy.json declarativo |
| H-10 (ALTO) | Label thresholds hardcodeados | Movidos a thresholds.json signal_strength_labels |
| H-14 (MEDIO) | Promedio redundante de 1 source | Llamada directa a calculateSourceQuality |
