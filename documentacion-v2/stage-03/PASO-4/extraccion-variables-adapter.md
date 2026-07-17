# PASO-4 — Extracción de Variables por Adapter

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `_extractVariablesFromSource()`, `_extractCmip6HorizonSlice()`, `_extractAdaptedVariables()`, `_extractSingleVariable()` |
| **Ubicación** | `pipeline/stages/03-normalization/index.js` (líneas 387-660) |
| **Stage** | Stage 03 — Normalization (ID: 3) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del cuarto paso de Stage 03: extracción y normalización de variables desde la fuente ganadora |

---

## 1. Resumen Ejecutivo

PASO-4 implementa la extracción de variables desde la fuente seleccionada en PASO-3. Cada adaptador tiene su propio lógica de extracción, pero todos siguen el mismo patrón:

1. **Extracción**: Obtener valores crudos del response del adaptador
2. **Filtrado de fill values**: Eliminar sentinelas usando `_getSourceFillValues()`
3. **Agregación completeness-aware**: Completar serie temporal con corrección por sesgo
4. **Prueba MCAR**: Verificar aleatoriedad del patrón de faltantes (Wald-Wolfowitz)
5. **Construcción de variable**: Ensamblar objeto Variable canónico

**Pre-condición**: PASO-3 debe haber seleccionado la fuente ganadora.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
for (const [domain, domainSources] of Object.entries(byDomain)) {
  const scored = this._scoreSources(...);                           // PASO 3
  const bestSource = scored[0];

  if (!bestSource) continue;

  const extracted = this._extractVariablesFromSource(               // ← PASO 4
    bestSource.source,
    validationMap.get(bestSource.source.source_name),
    coverageMap.get(bestSource.source.source_name)
  );

  for (const v of extracted) {
    // Filtrado por cobertura espacial por variable (PASO 5)
    // Deduplicación
  }
}
```

### 2.2 Flujo de datos

```
bestSource.source (PASO 3 output)
  │
  ├── [adapter-specific extraction]
  │     ├── weatherapi → air_temperature_current, relative_humidity, wind_speed, surface_pressure
  │     ├── nasa_power → precipitation_sum
  │     ├── openmeteo_cmip6 → air_temperature_max, air_temperature_min, precipitation_sum (× horizons)
  │     ├── opentopodata_srtm30m → elevation
  │     ├── open_elevation → elevation
  │     ├── world_bank → poverty_rate, gdp_per_capita, water_access
  │     ├── enso_index → enso_index, enso_phase
  │     └── (generic adapted) → variables from adapter response
  │
  ├── [per variable]
  │     ├── _aggregateCompletenessAware()  ← PASO 5
  │     ├── _testMissingnessRandomness()   ← Wald-Wolfowitz MCAR check
  │     ├── _deriveSpatialCoverageForVariable()
  │     └── _buildVariable()
  │
  └── extracted[] → Array de objetos Variable canónicos
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `_extractVariablesFromSource()` (index.js:387-660)

Función principal que despacha la extracción según el nombre del adaptador.

**Adaptadores soportados**:

| Adaptador | Variables extraídas | Método |
|-----------|---------------------|--------|
| `weatherapi` | `air_temperature_current`, `relative_humidity`, `wind_speed`, `surface_pressure` | `direct_read` |
| `nasa_power` | `precipitation_sum` | `completeness_weighted_sum` |
| `openmeteo_cmip6` | `air_temperature_max`, `air_temperature_min`, `precipitation_sum` (× 4 horizons) | `completeness_weighted_mean` |
| `opentopodata_srtm30m` | `elevation` | `direct_read` |
| `open_elevation` | `elevation` | `direct_read` |
| `world_bank` | `poverty_rate`, `gdp_per_capita`, `water_access` | `direct_read` |
| `enso_index` | `enso_index`, `enso_phase` | `direct_read` |
| (genérico) | Variables del response del adaptador | varies |

### 3.2 Extracción por adaptador

#### 3.2.1 `weatherapi` (index.js:392-428)

```javascript
if (name === "weatherapi" && source.response?.current) {
  const c = source.response.current;
  const dataTimeEnd = source.response.location?.localtime_epoch
    ? new Date(source.response.location.localtime_epoch * 1000).toISOString()
    : source.request?.timestamp || new Date().toISOString();

  extracted.push(this._buildVariable(
    "air_temperature_current", c.temp_c, source,
    { start: dataTimeEnd, end: dataTimeEnd },
    { method: "direct_read", completeness: 1.0 },
    coverageDecision
  ));
  // ... humidity, wind_speed, surface_pressure
}
```

**Características**:
- Lectura directa de `response.current`
- Timestamp único (lectura actual)
- Completitud = 1.0 (valor único)
- No requiere agregación temporal

#### 3.2.2 `nasa_power` (index.js:430-462)

```javascript
if (name === "nasa_power" && source.response?.properties?.parameter) {
  const p = source.response.properties.parameter;
  const dates = Object.keys(p.PRECTOTCORR || {}).sort();
  const dataTimeRange = dates.length >= 2
    ? { start: dates[0], end: dates[dates.length - 1] }
    : { start: dates[0] || "unknown", end: dates[0] || "unknown" };

  if (p.PRECTOTCORR) {
    const result = this._aggregateCompletenessAware(
      Object.values(p.PRECTOTCORR),
      null, dates.length,
      "precipitation_sum",
      name
    );
    if (result.value != null) {
      extracted.push(this._buildVariable(
        "precipitation_sum", result.value, source,
        dataTimeRange,
        {
          method: "completeness_weighted_sum",
          completeness: result.completenessRatio,
          validCount: result.validCount,
          expectedCount: result.expectedCount,
          correction_applied: result.correction_applied,
          correction_factor: result.correction_factor,
          threshold_used: result.threshold_used,
          fill_values_source_registered: result.fill_values_source_registered,
        },
        coverageDecision
      ));
    }
  }
}
```

**Características**:
- Serie temporal diaria de `PRECTOTCORR` (precipitación)
- Agregación completeness-aware (suma ponderada)
- Rango de tiempo: primer y último date del response
- Incluye metadata de corrección por sesgo

#### 3.2.3 `openmeteo_cmip6` (index.js:464-553)

```javascript
if (name === "openmeteo_cmip6" && source.response?.daily) {
  const d = source.response.daily;
  const times = d.time || [];

  const horizons = getHorizons();
  const CC_VARS = [
    { rawKey: "temperature_2m_max", canonicalBase: "air_temperature_max" },
    { rawKey: "temperature_2m_min", canonicalBase: "air_temperature_min" },
    { rawKey: "precipitation_sum", canonicalBase: "precipitation_sum" },
  ];

  for (const { rawKey, canonicalBase } of CC_VARS) {
    const rawArr = d[rawKey];
    if (!rawArr) continue;

    for (const h of horizons) {
      const sliced = sliceByDateRange(times, rawArr, h.start, h.end);
      if (sliced.values.length === 0) continue;

      const canonicalName = `${canonicalBase}_${h.name}`;
      const result = this._aggregateCompletenessAware(
        sliced.values, null, sliced.values.length,
        canonicalBase,
        name
      );
      if (result.value == null) continue;

      // ... ensemble weighting comparison ...
      extracted.push(this._buildVariable(canonicalName, result.value, source, timeRange, aggInfo, coverageDecision));

      // Alias para horizon "corto" (compatibilidad con Stage 04)
      if (h.name === "corto") {
        extracted.push(this._buildVariable(canonicalBase, result.value, source, timeRange, aggInfo, coverageDecision));
      }
    }
  }
}
```

**Características**:
- Proyecciones CMIP6 con 4 horizons (histórico, corto, mediano, largo)
- Slicing temporal por horizon usando `sliceByDateRange()`
- Comparación de ensemble weighting (alternative schemes)
- Alias para `corto` (compatibilidad con Stage 04/05)

### 3.3 `_extractCmip6HorizonSlice()` (index.js)

Función helper para slicing CMIP6 por horizon:

```javascript
_extractCmip6HorizonSlice(times, rawArr, h) {
  const sliced = sliceByDateRange(times, rawArr, h.start, h.end);
  return {
    values: sliced.values,
    times: sliced.times,
    horizon: h.name,
    truncated: h.truncated,
  };
}
```

### 3.4 `_extractAdaptedVariables()` (index.js)

Función genérica para adaptadores no especializados:

```javascript
_extractAdaptedVariables(source, validation, coverage) {
  const extracted = [];
  const response = source.response;
  if (!response) return extracted;

  // Buscar variables en el response
  const variables = Object.keys(response);
  for (const varName of variables) {
    const value = response[varName];
    if (value != null && typeof value === "number") {
      extracted.push(this._buildVariable(
        varName, value, source,
        { start: source.request?.timestamp, end: source.request?.timestamp },
        { method: "direct_read", completeness: 1.0 },
        coverage
      ));
    }
  }
  return extracted;
}
```

### 3.5 `_resolveWorldBankIndicator()` (index.js)

Función helper para resolver indicadores del World Bank:

```javascript
_resolveWorldBankIndicator(indicator) {
  const mapping = {
    "SI.POV.DDAY": "poverty_rate",
    "NY.GDP.PCAP.CD": "gdp_per_capita",
    "SH.H2O.BASW.ZS": "water_access",
  };
  return mapping[indicator] || indicator;
}
```

---

## 4. Tabla de Impacto

| Componente | Tipo de cambio | Riesgo si falla | Dependencia |
|------------|---------------|-----------------|-------------|
| `_extractVariablesFromSource()` | Core extraction | Variables no extraídas | Adaptador específico |
| `_extractCmip6HorizonSlice()` | Slicing | CMIP6 sin horizons | `horizons.js` |
| `_extractAdaptedVariables()` | Generic extraction | Variables genéricas perdidas | `source.response` |
| `_resolveWorldBankIndicator()` | Mapping | Indicador World Bank no resuelto | `world_bank` |
| `_aggregateCompletenessAware()` | Aggregation | Serie temporal incompleta | PASO 5 |
| `_testMissingnessRandomness()` | MCAR check | MCAR no verificado | PASO 5 |

---

## 5. Supuestos y Limitaciones

1. **Cada adaptador tiene su propia lógica de extracción**: No hay una función genérica que cubra todos los casos. Los adaptadores especializados (weatherapi, nasa_power, openmeteo_cmip6) tienen código dedicado.

2. **`direct_read` no requiere agregación**: Variables como `air_temperature_current` o `elevation` son valores únicos que no necesitan completitud temporal.

3. **CMIP6 genera aliases para `corto`**: La variable `air_temperature_max_corto` se publica también como `air_temperature_max` para compatibilidad con Stage 04/05 que no son horizon-aware.

4. **`fill_values_source_registered` se propaga**: Indica si la fuente tiene fill values documentados en la configuración o si se usó GLOBAL_FILL_VALUES (fallback).

5. **Ensemble weighting comparison es informativa**: No afecta el valor reportado, solo documenta cuánto habría cambiado bajo un scheme alternativo.

---

## 6. Trazabilidad

| Referencia | Ubicación |
|------------|-----------|
| H-7 (CMIP6 horizons) | Auditoría Stage 03, hallazgo 7 — RESUELTO: slicing por horizon |
| H-3.5 (Ensemble weighting) | Auditoría Stage 03, hallazgo 3.5 — comparación alternativa reportada |
| H-4.2 (GLOBAL_FILL_VALUES) | Auditoría Stage 03, hallazgo 4.2 — RESUELTO: `_getSourceFillValues()` con fallback |
| H-3.3 (MCAR sin verificar) | Auditoría Stage 03, hallazgo 3.3 — RESUELTO: `_testMissingnessRandomness()` |
| CMIP6 ensemble | Knutti et al. (2010) — "The future of CMIP5 model diversity" |
| Horizons | `pipeline/shared/horizons.js` — ventana temporal por horizon |
