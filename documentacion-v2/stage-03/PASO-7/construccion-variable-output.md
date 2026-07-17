# PASO-7 — Construcción de Variable y Output

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `_buildVariable()`, `_buildSpatialInfo()`, `_buildMethodology()`, `_buildSourceDecisions()`, `_buildOutput()` |
| **Ubicación** | `pipeline/stages/03-normalization/index.js` (líneas 942-1112, 1174-1298) |
| **Stage** | Stage 03 — Normalization (ID: 3) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del séptimo paso de Stage 03: construcción del objeto Variable canónico y ensamblaje del output final |

---

## 1. Resumen Ejecutivo

PASO-7 ensambla el objeto Variable canónico a partir de los resultados de PASO-4 (extracción), PASO-5 (agregación) y PASO-6 (cobertura espacial). Incluye:

1. **`_buildVariable()`**: Ensambla el objeto Variable con toda la metadata necesaria
2. **`_buildSpatialInfo()`**: Deriva información espacial (lat, lon, confidence, distance, resolution)
3. **`_buildMethodology()`**: Construye la sección de metodología con assumptions, references, y test results
4. **`_buildSourceDecisions()`**: Documenta las decisiones de selección de fuentes por dominio
5. **`_buildOutput()`**: Ensambla el paquete final para Stage 04

**Pre-condición**: PASO-4, PASO-5 y PASO-6 deben haber completado la extracción, agregación y cobertura espacial.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
_extractVariablesFromSource(...)                                     // PASO 4
  │
  ├── _aggregateCompletenessAware(...)                               // PASO 5
  ├── _deriveCoverageAction(...)                                     // PASO 6
  │
  ├── _buildVariable(canonicalName, value, source, dataTimeRange, aggregationInfo, coverageDecision)
  │     ├── getCanonicalInfo(canonicalName)
  │     ├── _deriveCoverageAction(source, coverageDecision, canonicalName)
  │     ├── _buildSpatialInfo(source)
  │     └── _buildMethodology(variableName, completenessRatio, method, aggregationInfo)
  │
  └── return variable

_buildSourceDecisions(domain, domainSources, scored, validationMap, coverageMap)
  │
  └── return decisions[]

_buildOutput(variables, sourceDecisions, spatialCoverage, metadata)
  │
  └── return { variables, source_decisions, spatial_coverage, metadata }
```

### 2.2 Flujo de datos

```
variable (PASO 4 output)
  │
  ├── _buildVariable()
  │     ├── name: canonicalName
  │     ├── unit: info.unit (from CANONICAL_VARIABLES)
  │     ├── value: aggregated value
  │     ├── source: source.source_name
  │     ├── source_authority: source.authority_level
  │     ├── coverage_action: "direct" | "nearest_neighbor" | "out_of_coverage"
  │     ├── coverage_reason: reason string
  │     ├── spatial_info: { lat_used, lon_used, spatial_trace_confidence, distance_km, resolution }
  │     ├── data_time_range: { start, end }
  │     ├── processing_timestamp: ISO-8601
  │     └── methodology: { computation_method, scientific_rationale, references, assumptions, completeness_ratio, ... }
  │
  └── variable → canonical_variables[]

sourceDecisions[]
  │
  ├── domain: "precipitation"
  ├── selected_source: "senamhi_daily"
  ├── selection_score: 0.739
  ├── selection_components: { completeness, proximity, resolution_score }
  ├── selection_rationale: "authority_gate: primary completeness=0.85 >= 0.75"
  ├── gated: true
  ├── sensitivity: { applicable, dimensions_used, vertices, winner_stable, interpretation }
  ├── authority_level: "primary"
  ├── completeness_pct: 0.85
  ├── coverage_status: "in_coverage"
  ├── spatial_distance_km: 50
  ├── resolution_native: "0.25°"
  ├── total_sources_evaluated: 3
  └── discarded_sources: [...]
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `_buildVariable()` (index.js:942-967)

```javascript
_buildVariable(canonicalName, value, source, dataTimeRange, aggregationInfo, coverageDecision) {
  const info = getCanonicalInfo(canonicalName);
  const { action: coverageAction, reason: coverageReason } = this._deriveCoverageAction(source, coverageDecision, canonicalName);
  const now = new Date();

  const spatialInfo = this._buildSpatialInfo(source);

  return {
    name: canonicalName,
    unit: info.unit,
    value,
    source: source.source_name,
    source_authority: source.authority_level,
    coverage_action: coverageAction,
    coverage_reason: coverageReason,
    spatial_info: spatialInfo,
    data_time_range: dataTimeRange || null,
    processing_timestamp: now.toISOString(),
    methodology: this._buildMethodology(
      canonicalName,
      aggregationInfo.completeness,
      aggregationInfo.method,
      aggregationInfo
    ),
  };
}
```

### 3.2 `_buildSpatialInfo()` (index.js:969-990)

```javascript
_buildSpatialInfo(source) {
  const requestLat = source.request?.params?.lat;
  const requestLon = source.request?.params?.lon;

  if (requestLat != null && requestLon != null) {
    return {
      lat_used: requestLat,
      lon_used: requestLon,
      spatial_trace_confidence: "exact",
      distance_km: source.spatial_distance_km ?? null,
      resolution: source.resolution_native ?? null,
    };
  }

  return {
    lat_used: null,
    lon_used: null,
    spatial_trace_confidence: "unavailable",
    distance_km: source.spatial_distance_km ?? null,
    resolution: source.resolution_native ?? null,
  };
}
```

**`spatial_trace_confidence`**:
- `"exact"`: Coordenadas exactas del punto de interés
- `"unavailable"`: Coordenadas no disponibles

### 3.3 `_buildMethodology()` (index.js:992-1112)

Construye la sección de metodología con:

| Campo | Descripción |
|-------|-------------|
| `computation_method` | Método de cálculo (ej. `completeness_weighted_sum`, `completeness_weighted_mean`, `direct_read`) |
| `scientific_rationale` | Justificación científica del método |
| `references` | Referencias bibliográficas (WMO, GCOS, Wald-Wolfowitz, etc.) |
| `assumptions` | Supuestos y advertencias (MCAR, fill values, threshold adaptativo, etc.) |
| `completeness_ratio` | Proporción de valores válidos |
| `completeness_threshold` | Umbral aplicado |
| `completeness_threshold_reference` | Referencia del umbral (construido dinámicamente) |
| `completeness_threshold_status` | `"passed"` o `"degraded"` |
| `correction_applied` | Si se aplicó corrección por sesgo |
| `mcar_test` | Resultado del test de Wald-Wolfowitz |
| `ensemble_weighting_comparison` | Comparación de esquemas de ponderación (CMIP6) |
| `fill_values_source_registered` | Si la fuente tiene fill values documentados |
| `reference_status` | `"peer_reviewed_or_industry_standard"` o `"provisional"` |

### 3.4 `_buildSourceDecisions()` (index.js:1174-1296)

```javascript
_buildSourceDecisions(domain, domainSources, scored, validationMap, coverageMap) {
  const decisions = [];
  const best = scored[0];

  if (!best) {
    return [{
      domain,
      status: "no_source_available",
      message: `No hay fuentes disponibles para el dominio ${domain}`,
    }];
  }

  // ... build decision for best source ...
  // ... build discardedSources array ...

  decisions.push({
    domain,
    selected_source: best.source.source_name,
    selection_score: best.score,
    selection_components: best.components,
    selection_rationale: selectionRationale,
    gated: best.gated === true,
    sensitivity: this._computeSensitivity(scored),
    authority_level: best.source.authority_level,
    completeness_pct: bestValidation?.summary?.completeness_pct ?? null,
    coverage_status: bestCoverage?.coverage_status ?? best.source.coverage_status,
    spatial_distance_km: best.source.spatial_distance_km ?? null,
    resolution_native: best.source.resolution_native ?? null,
    total_sources_evaluated: scored.length,
    discarded_sources: discardedSources,
  });

  return decisions;
}
```

### 3.5 `_buildOutput()` (index.js)

Función que ensambla el paquete final:

```javascript
_buildOutput(variables, sourceDecisions, spatialCoverage, metadata) {
  return {
    canonical_variables: variables,
    source_decisions: sourceDecisions,
    spatial_coverage: spatialCoverage,
    metadata: {
      timestamp: new Date().toISOString(),
      stage: "03-normalization",
      total_variables: variables.length,
      departments: metadata.departments,
      districts: metadata.districts,
      stations: metadata.stations,
    },
  };
}
```

---

## 4. Estructura del Output

### 4.1 Objeto Variable canónico

```javascript
{
  name: "precipitation_sum",                    // Nombre canónico
  unit: "mm",                                   // Unidad SI
  value: 1234.56,                               // Valor agregado
  source: "senamhi_daily",                      // Fuente seleccionada
  source_authority: "primary",                  // Nivel de autoridad
  coverage_action: "nearest_neighbor",          // Acción de cobertura
  coverage_reason: "distance_50km_within_max_138km",
  spatial_info: {
    lat_used: -16.5,
    lon_used: -68.15,
    spatial_trace_confidence: "exact",
    distance_km: 50,
    resolution: "0.25°"
  },
  data_time_range: {
    start: "2020-01-01",
    end: "2025-12-31"
  },
  processing_timestamp: "2026-07-15T12:30:00.000Z",
  methodology: {
    computation_method: "completeness_weighted_sum",
    scientific_rationale: "Suma ponderada por completitud para acumulación temporal.",
    references: ["WMO No. 100", "GCOS-245", "Wald & Wolfowitz (1940)"],
    assumptions: [
      "Corrección por completitud aplicada: factor 1.250 (expected/valid).",
      "Test de rachas (Wald-Wolfowitz) no rechaza aleatoriedad..."
    ],
    completeness_ratio: 0.80,
    completeness_threshold: 0.75,
    completeness_threshold_reference: "GCOS-245 acceptable (Carro-Calvo et al. 2020)",
    completeness_threshold_status: "passed",
    correction_applied: true,
    mcar_test: {
      tested: true,
      runs: 15,
      expected_runs: 14.2,
      z: 0.21,
      p_value: 0.8337,
      pattern: "consistent_with_random"
    },
    fill_values_source_registered: true,
    reference_status: "peer_reviewed_or_industry_standard"
  }
}
```

### 4.2 Source decision

```javascript
{
  domain: "precipitation",
  selected_source: "senamhi_daily",
  selection_score: 0.739,
  selection_components: {
    completeness: 0.85,
    proximity: 0.368,
    resolution_m: 27750,
    resolution_score: 1.0
  },
  selection_rationale: "authority_gate: primary completeness=0.850 >= 0.750 and no complementary source dominates on every active dimension (completeness, proximity, resolution)",
  gated: true,
  sensitivity: {
    applicable: true,
    dimensions_used: ["completeness", "proximity", "resolution_score"],
    weight_scheme: "equal (1/3 each)",
    vertices: [
      { dimension: "completeness", winner: "chirps_daily", value: 0.92 },
      { dimension: "proximity", winner: "senamhi_daily", value: 0.368 },
      { dimension: "resolution_score", winner: "era5_land_daily", value: 1.0 }
    ],
    winner_stable: false,
    interpretation: "La selección SÍ depende de la ponderación elegida: completeness→chirps_daily, proximity→senamhi_daily, resolution_score→era5_land_daily"
  },
  authority_level: "primary",
  completeness_pct: 0.85,
  coverage_status: "in_coverage",
  spatial_distance_km: 50,
  resolution_native: "0.25°",
  total_sources_evaluated: 3,
  discarded_sources: [
    {
      source: "chirps_daily",
      score: 0.646,
      reasons: ["authority_gate_override(primary completeness=0.850 selected directly)"],
      authority_level: "complementary",
      completeness_pct: 0.92,
      coverage_status: "in_coverage",
      resolution_m: 5550
    },
    {
      source: "era5_land_daily",
      score: 0.577,
      reasons: ["authority_gate_override(primary completeness=0.850 selected directly)"],
      authority_level: "complementary",
      completeness_pct: 0.98,
      coverage_status: "in_coverage",
      resolution_m: 11100
    }
  ]
}
```

---

## 5. Tabla de Impacto

| Componente | Tipo de cambio | Riesgo si falla | Dependencia |
|------------|---------------|-----------------|-------------|
| `_buildVariable()` | Core assembly | Variable incompleta o mal formada | PASO 4, 5, 6 |
| `_buildSpatialInfo()` | Spatial metadata | Información espacial perdida | `source.request.params` |
| `_buildMethodology()` | Documentation | Methodology vacía o incompleta | PASO 5 (aggregationInfo) |
| `_buildSourceDecisions()` | Decision log | Decisiones no documentadas | PASO 3 (scored) |
| `_buildOutput()` | Output assembly | Output mal formado para Stage 04 | PASO 4, 5, 6, 7 |

---

## 6. Supuestos y Limitaciones

1. **`getCanonicalInfo()` es la fuente de verdad para unit y methodology**: Si una variable no está en `CANONICAL_VARIABLES`, se usan defaults genéricos.

2. **`_buildMethodology()` es la sección más larga del output**: Incluye assumptions, references, test results, y comparaciones de ensemble weighting. Esto es intencional — la trazabilidad metodológica es crítica para la auditoría.

3. **`_buildSourceDecisions()` documenta tanto la selección como los descartes**: Cada fuente descartada incluye la razón de descarte, para que un auditor pueda reconstruir la decisión.

4. **`_computeSensitivity()` se incluye en cada source_decision**: Permite verificar si la selección es invariante a la ponderación de pesos.

5. **`fill_values_source_registered` se propaga desde PASO 5**: Indica si la fuente tiene fill values documentados o si se usó el fallback genérico.

---

## 7. Trazabilidad

| Referencia | Ubicación |
|------------|-----------|
| H-4.1 (Sensitivity analysis) | Auditoría Stage 03, hallazgo 4.1 — RESUELTO: `_computeSensitivity()` |
| H-4.2 (fill_values_source_registered) | Auditoría Stage 03, hallazgo 4.2 — RESUELTO: se propaga en methodology |
| H-3.3 (MCAR test) | Auditoría Stage 03, hallazgo 3.3 — RESUELTO: se incluye en methodology.mcar_test |
| H-3.5 (Ensemble weighting) | Auditoría Stage 03, hallazgo 3.5 — RESUELTO: comparación reportada |
| H-7 (Coverage per variable) | Auditoría Stage 03, hallazgo 7 — RESUELTO: coverage_action por variable |
| H-8 (Dominio desconocido) | Auditoría Stage 03, hallazgo 8 — `"unknown"` se trata como `"out_of_coverage"` |
| WMO No. 100 | §2.3.2: mean is unbiased if MCAR |
| GCOS-245 | Carro-Calvo et al. (2020) — completeness thresholds |
| Wald-Wolfowitz | Wald & Wolfowitz (1940), Ann. Math. Statist. |
