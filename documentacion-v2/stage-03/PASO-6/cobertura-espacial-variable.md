# PASO-6 — Cobertura Espacial por Variable

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `_deriveCoverageAction()`, `_computeSpatialCoverage()`, `_deriveSpatialCoverageForVariable()` |
| **Ubicación** | `pipeline/stages/03-normalization/index.js` (líneas 890-940, 1070-1135) |
| **Stage** | Stage 03 — Normalization (ID: 3) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del sexto paso de Stage 03: determinación de cobertura espacial por variable |

---

## 1. Resumen Ejecutivo

PASO-6 determina si cada variable extraída está dentro de la cobertura espacial de la fuente. La lógica sigue un proceso de tres niveles:

1. **Verificación por variable**: Usa la decisión de Stage 02 si está disponible (`variable_coverage`)
2. **Cálculo local**: Si Stage 02 no tiene información espacial, calcula localmente usando el modelo de decorrelación
3. **Fallback**: Si no hay modelo de decorrelación, usa resolución nativa o distancia ≤ 1km

**Pre-condición**: PASO-4 debe haber extraído las variables y PASO-5 debe haber completado la serie temporal.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
_extractVariablesFromSource(...)                                     // PASO 4
  │
  ├── _aggregateCompletenessAware(...)                               // PASO 5
  │
  ├── _deriveCoverageAction(source, coverageDecision, canonicalName) // ← PASO 6
  │     ├── [variable_coverage available] → use Stage 02 decision
  │     ├── [no variable_coverage] → compute locally
  │     │     ├── getMaxDistanceForVariable(canonicalName)
  │     │     └── distance <= dMax ? nearest_neighbor : out_of_coverage
  │     └── [no decorrelation model] → fallback to resolution or distance
  │
  └── _buildVariable(...)
```

### 2.2 Flujo de datos

```
source, coverageDecision, canonicalName
  │
  ├── [Stage 02 decision available?]
  │     ├── variable_coverage.find(v => v.variable === canonicalName)
  │     │     ├── coverage_status === "out_of_coverage" → action: "out_of_coverage"
  │     │     ├── coverage_status === "unknown" → action: "out_of_coverage"
  │     │     └── coverage_status === "in_coverage" → action: "nearest_neighbor"
  │     └── [no variable_coverage] → fallback
  │
  ├── [Coverage status from Stage 02]
  │     ├── "out_of_coverage" → action: "out_of_coverage"
  │     └── "unknown" → action: "out_of_coverage"
  │
  ├── [Distance check]
  │     ├── distance == null || 0 → action: "direct"
  │     ├── getMaxDistanceForVariable(canonicalName)
  │     │     ├── distance <= dMax → action: "nearest_neighbor"
  │     │     └── distance > dMax → action: "out_of_coverage"
  │     └── [no decorrelation model] → fallback
  │
  └── [Fallback]
        ├── resolution_native → action: "direct" (if within cell)
        ├── distance <= 1km → action: "direct"
        └── else → action: "nearest_neighbor"
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `_deriveCoverageAction()` (index.js:890-940)

```javascript
_deriveCoverageAction(source, coverageDecision, canonicalName) {
  const variableDecision = coverageDecision?.variable_coverage?.find(v => v.variable === canonicalName);
  if (variableDecision) {
    if (variableDecision.coverage_status === "out_of_coverage") {
      return { action: "out_of_coverage", reason: variableDecision.decision_reason };
    }
    if (variableDecision.coverage_status === "unknown") {
      return { action: "out_of_coverage", reason: variableDecision.decision_reason };
    }
    return { action: "nearest_neighbor", reason: variableDecision.decision_reason };
  }
  if (coverageDecision?.coverage_status === "out_of_coverage" || coverageDecision?.coverage_status === "unknown") {
    return { action: "out_of_coverage", reason: coverageDecision.decision_reason };
  }

  const distance = source.spatial_distance_km;
  if (distance == null || distance === 0) return { action: "direct", reason: "co_located_or_distance_not_tracked" };

  const dMax = getMaxDistanceForVariable(canonicalName);
  if (dMax != null) {
    return distance <= dMax
      ? { action: "nearest_neighbor", reason: `distance_${distance}km_within_max_${dMax}km` }
      : { action: "out_of_coverage", reason: `distance_${distance}km_exceeds_max_${dMax}km` };
  }
  const resolution = source.resolution_native;
  if (resolution != null) {
    const meters = this._parseResolutionToMeters(resolution);
    if (meters != null && distance <= meters / 2000) {
      return { action: "direct", reason: "distance_within_native_resolution_cell" };
    }
  }
  if (distance <= 1) return { action: "direct", reason: "distance_within_1km" };
  return { action: "nearest_neighbor", reason: "no_decorrelation_model_assumed_nearest_neighbor" };
}
```

### 3.2 Acciones posibles

| Acción | Significado | Implicación |
|--------|-------------|-------------|
| `"direct"` | Fuente co-localizada o distancia no rastreada | Variable se usa sin restricción |
| `"nearest_neighbor"` | Fuente dentro de distancia máxima de decorrelación | Variable se usa como representativa |
| `"out_of_coverage"` | Fuente fuera de distancia máxima | Variable se descarta (excluida) |

### 3.3 Modelo de decorrelación espacial

**Fórmula**: `d_max = -L * ln(theta)`

**Parámetros**:
- `L`: Longitud de decorrelación por variable (configurable en `spatial-decorrelation.json`)
- `theta`: Correlation mínima aceptable (configurable, default 0.5)

**Ejemplo**:
- `precipitation`: L = 50 km, theta = 0.5 → d_max = -50 * ln(0.5) ≈ 34.7 km
- `temperature`: L = 200 km, theta = 0.5 → d_max = -200 * ln(0.5) ≈ 138.6 km

**Referencia**: Cressie (1993), Statistics for Spatial Data

### 3.4 `_computeSpatialCoverage()` (index.js:1070-1135)

```javascript
_computeSpatialCoverage(source, variables) {
  const coverage = [];
  for (const v of variables) {
    const action = this._deriveCoverageAction(source, v.coverage_decision, v.name);
    coverage.push({
      variable: v.name,
      action: action.action,
      reason: action.reason,
      distance_km: source.spatial_distance_km,
      d_max_km: getMaxDistanceForVariable(v.name),
    });
  }
  return coverage;
}
```

### 3.5 `_deriveSpatialCoverageForVariable()` (index.js)

Función helper que deriva cobertura espacial para una variable específica:

```javascript
_deriveSpatialCoverageForVariable(source, coverageDecision, canonicalName) {
  return this._deriveCoverageAction(source, coverageDecision, canonicalName);
}
```

---

## 4. Ejemplo Numérico

### 4.1 Escenario: Estación SENAMHI con 3 variables

**Configuración**:
- `source.spatial_distance_km` = 50 km
- `source.resolution_native` = "0.25°"
- `decorrelation_length_km.precipitation` = 50 km
- `decorrelation_length_km.temperature` = 200 km
- `theta` = 0.5

**Cálculos**:

| Variable | L (km) | d_max (km) | Distance (km) | Acción |
|----------|--------|------------|---------------|--------|
| `precipitation_sum` | 50 | 34.7 | 50 | `out_of_coverage` (50 > 34.7) |
| `air_temperature_max` | 200 | 138.6 | 50 | `nearest_neighbor` (50 ≤ 138.6) |
| `air_temperature_min` | 200 | 138.6 | 50 | `nearest_neighbor` (50 ≤ 138.6) |

**Resultado**: La variable `precipitation_sum` se descarta porque la estación está demasiado lejos para que la precipitación sea representativa. Las variables de temperatura se mantienen porque la temperatura tiene una decorrelación espacial mayor.

---

## 5. Tabla de Impacto

| Componente | Tipo de cambio | Riesgo si falla | Dependencia |
|------------|---------------|-----------------|-------------|
| `_deriveCoverageAction()` | Core logic | Variables fuera de cobertura se usan incorrectamente | `coverageDecision`, `getMaxDistanceForVariable()` |
| `_computeSpatialCoverage()` | Coverage derivation | Cobertura espacial no reportada | `_deriveCoverageAction()` |
| `_deriveSpatialCoverageForVariable()` | Helper | Cobertura por variable no calculada | `_deriveCoverageAction()` |
| `getMaxDistanceForVariable()` | Config lookup | d_max no disponible → fallback a resolución | `spatial-decorrelation.json` |
| `_parseResolutionToMeters()` | Conversión | Resolución mal interpretada | `resolution_native` |

---

## 6. Supuestos y Limitaciones

1. **Stage 02 decision is authoritative**: Si `variable_coverage` está disponible de Stage 02, se usa directamente sin recalcular. Esto garantiza consistencia entre etapas.

2. **`"unknown"` se trata como `"out_of_coverage"`**: Una fuente con cobertura desconocida se descarta intencionalmente — no se asume que está dentro de cobertura.

3. **d_max inclusivo (`<=`)**: La distancia máxima es inclusiva porque `rho(dMax) = theta = 0.5` exactamente por construcción, y theta es la correlación mínima aceptable.

4. **Fallback a resolución nativa**: Si no hay modelo de decorrelación, se usa la resolución nativa como radio (distancia ≤ resolución/2).

5. **Fallback a distancia ≤ 1km**: Si no hay resolución ni modelo de decorrelación, se asume co-localización si la distancia es ≤ 1km.

---

## 7. Trazabilidad

| Referencia | Ubicación |
|------------|-----------|
| H-7 (Cobertura por variable) | Auditoría Stage 03, hallazgo 7 — RESUELTO: `_deriveCoverageAction()` por variable |
| H-8 (Dominio desconocido) | Auditoría Stage 03, hallazgo 8 — `"unknown"` se trata como `"out_of_coverage"` |
| H-31 (d_max inclusivo) | Auditoría Stage 03, hallazgo 31 — `<=` intencional, consistente con Stage 02 |
| Decorrelación espacial | Cressie (1993), Statistics for Spatial Data |
| `spatial-decorrelation.json` | Config de theta y L por variable |
