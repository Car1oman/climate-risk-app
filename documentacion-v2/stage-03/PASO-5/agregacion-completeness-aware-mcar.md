# PASO-5 — Agregación Completeness-Aware y Prueba MCAR

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `_aggregateCompletenessAware()`, `_testMissingnessRandomness()`, `_normalTwoTailedPValue()`, `_erf()`, `_computeAdaptiveThreshold()`, `_getSourceFillValues()` |
| **Ubicación** | `pipeline/stages/03-normalization/index.js` (líneas 662-875) |
| **Stage** | Stage 03 — Normalization (ID: 3) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del quinto paso de Stage 03: agregación de series temporales con corrección por sesgo y verificación de MCAR |

---

## 1. Resumen Ejecutivo

PASO-5 implementa la agregación de series temporales de forma completa-aware, es decir, sin inyectar sesgo por faltantes cuando la completitud cae por debajo de un umbral adaptativo. Incluye:

1. **Filtrado de fill values**: Eliminar sentinelas usando `_getSourceFillValues()` (documentado vs fallback)
2. **Cálculo de completitud**: Proporción de valores válidos vs esperados
3. **Threshold adaptativo**: Interpolación lineal entre 0.50 (degraded) y 0.75 (acceptable)
4. **Corrección por sesgo**: Factor de corrección `totalExpected / validCount` para `completeness_weighted_sum`
5. **Prueba MCAR**: Wald-Wolfowitz runs test para verificar aleatoriedad del patrón de faltantes
6. **Documentación de fill_values_source_registered**: Indica si la fuente tiene fill values documentados

**Pre-condición**: PASO-4 debe haber extraído los valores crudos del adaptador.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
_extractVariablesFromSource(...)                                     // PASO 4
  │
  ├── _aggregateCompletenessAware(values, fillValues, expectedCount, variableName, sourceName)  // ← PASO 5
  │     ├── _getSourceFillValues(sourceName)                         // Sentinelas por fuente
  │     ├── _computeAdaptiveThreshold(totalExpected)                 // Threshold adaptativo
  │     ├── _testMissingnessRandomness(values, isValid)              // Wald-Wolfowitz MCAR check
  │     └── return { value, completenessRatio, correction_applied, ... }
  │
  └── _buildVariable(...)
```

### 2.2 Flujo de datos

```
values[] (PASO 4 output)
  │
  ├── _getSourceFillValues(sourceName)
  │     ├── [registered] → source-specific sentinel set
  │     └── [unregistered] → GLOBAL_FILL_VALUES = [-9999, -32768, -99999, null]
  │
  ├── isValid(v) = v != null && typeof v === "number" && !sentinels.has(v)
  │
  ├── validValues = values.filter(isValid)
  ├── validCount = validValues.length
  ├── completenessRatio = validCount / totalExpected
  │
  ├── adaptiveThreshold = _computeAdaptiveThreshold(totalExpected)
  │     ├── totalExpected >= 20 → 0.75 (acceptable)
  │     └── totalExpected < 20 → 0.50 + (count/20) * 0.25 (linear interpolation)
  │
  ├── [completenessRatio < adaptiveThreshold && totalExpected > 1]
  │     ├── _testMissingnessRandomness(values, isValid)              // Wald-Wolfowitz
  │     ├── correctionFactor = totalExpected / validCount
  │     └── corrected = rawSum * correctionFactor (for sum) OR rawMean (for mean, no correction)
  │
  └── return { value, completenessRatio, correction_applied, mcar_test, fill_values_source_registered }
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `_getSourceFillValues()` (index.js:662-668)

```javascript
_getSourceFillValues(sourceName) {
  const registered = SOURCE_FILL_VALUES[sourceName];
  return {
    values: new Set(registered || GLOBAL_FILL_VALUES),
    is_registered: registered != null,
  };
}
```

**Comportamiento**:
- Si `sourceName` tiene fill values documentados en `SOURCE_FILL_VALUES` → usa esos
- Si no → usa `GLOBAL_FILL_VALUES` = `new Set([-9999, -32768, -99999, null])`
- `is_registered` indica si se usó la convención documentada o el fallback

### 3.2 `_aggregateCompletenessAware()` (index.js:786-875)

```javascript
_aggregateCompletenessAware(values, fillValues, expectedCount, variableName, sourceName) {
  const sourceFills = this._getSourceFillValues(sourceName);
  const explicitFills = fillValues != null ? new Set(fillValues) : null;
  const sentinels = explicitFills || sourceFills.values;
  const fillValuesSourceRegistered = explicitFills != null ? true : sourceFills.is_registered;

  const isValid = v => v != null && typeof v === "number" && !sentinels.has(v);
  const validValues = values.filter(isValid);

  const validCount = validValues.length;
  const totalExpected = expectedCount || values.length;
  const completenessRatio = totalExpected > 0 ? validCount / totalExpected : 0;

  const adaptiveThreshold = this._computeAdaptiveThreshold(totalExpected);
  const canonicalInfo = CANONICAL_VARIABLES[variableName];
  const method = canonicalInfo?.methodology?.default_method || "completeness_weighted_sum";

  if (validCount === 0) {
    return {
      value: null, completenessRatio: 0, validCount: 0, expectedCount: totalExpected,
      threshold_used: adaptiveThreshold,
      fill_values_source_registered: fillValuesSourceRegistered,
    };
  }

  if (completenessRatio < adaptiveThreshold && totalExpected > 1) {
    const missingnessTest = this._testMissingnessRandomness(values, isValid);
    const correctionFactor = totalExpected / validCount;
    if (method === "completeness_weighted_sum") {
      const rawSum = validValues.reduce((a, b) => a + b, 0);
      const corrected = rawSum * correctionFactor;
      return {
        value: Math.round(corrected * 100) / 100,
        completenessRatio,
        validCount,
        expectedCount: totalExpected,
        correction_applied: true,
        correction_factor: correctionFactor,
        threshold_used: adaptiveThreshold,
        mcar_test: missingnessTest,
        fill_values_source_registered: fillValuesSourceRegistered,
      };
    }
    if (method === "completeness_weighted_mean") {
      const rawMean = validValues.reduce((a, b) => a + b, 0) / validCount;
      return {
        value: Math.round(rawMean * 100) / 100,
        completenessRatio,
        validCount,
        expectedCount: totalExpected,
        correction_applied: false,
        note: "Mean computed from valid values only; no correction applied for temporal mean (WMO No. 100 §2.3.2: mean is unbiased if MCAR)",
        threshold_used: adaptiveThreshold,
        mcar_test: missingnessTest,
        fill_values_source_registered: fillValuesSourceRegistered,
      };
    }
  }

  // ... completitud suficiente → sin corrección ...
}
```

### 3.3 `_computeAdaptiveThreshold()` (index.js:695-701)

```javascript
_computeAdaptiveThreshold(dataPointCount) {
  const thresholds = this._validationProfiles?.completeness?.thresholds?.climate;
  const floor = thresholds?.degraded ?? 0.50;
  const ceiling = thresholds?.acceptable ?? COMPLETENESS_THRESHOLD_DEFAULT;

  if (dataPointCount == null || dataPointCount >= 20) return ceiling;
  return floor + (dataPointCount / 20) * (ceiling - floor);
}
```

**Modelo**:
- `dataPointCount >= 20` → 0.75 (acceptable)
- `dataPointCount < 20` → interpolación lineal entre 0.50 (degraded) y 0.75 (acceptable)

**Referencia**: GCOS-245 (Carro-Calvo et al. 2020), WMO No. 100

### 3.4 `_testMissingnessRandomness()` (index.js:724-767)

```javascript
_testMissingnessRandomness(values, isValid) {
  const indicators = values.map(v => (isValid(v) ? 1 : 0));
  const n1 = indicators.reduce((a, b) => a + b, 0);
  const n2 = indicators.length - n1;
  const N = indicators.length;

  const MIN_PER_GROUP = 2;
  const MIN_N = 8;
  if (n1 < MIN_PER_GROUP || n2 < MIN_PER_GROUP || N < MIN_N) {
    return {
      tested: false,
      reason: `insufficient_n(n_valid=${n1}, n_missing=${n2}; need >=${MIN_PER_GROUP} of each and >=${MIN_N} total for the normal approximation to hold)`,
    };
  }

  let runs = 1;
  for (let i = 1; i < indicators.length; i++) {
    if (indicators[i] !== indicators[i - 1]) runs++;
  }

  const expectedRuns = (2 * n1 * n2) / N + 1;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (N * N * (N - 1));
  if (!(variance > 0)) {
    return { tested: false, reason: "degenerate_variance" };
  }

  const z = (runs - expectedRuns) / Math.sqrt(variance);
  const pValue = this._normalTwoTailedPValue(z);
  const significant = pValue < 0.05;
  const pattern = !significant ? "consistent_with_random" : (z < 0 ? "clustered" : "alternating");

  return {
    tested: true,
    runs,
    expected_runs: Math.round(expectedRuns * 100) / 100,
    z: Math.round(z * 1000) / 1000,
    p_value: Math.round(pValue * 10000) / 10000,
    pattern,
  };
}
```

**Test de rachas Wald-Wolfowitz** (Wald & Wolfowitz, 1940):

| Resultado | Interpretación | Implicación |
|-----------|---------------|-------------|
| `pattern: "consistent_with_random"` | Rachas observadas ≈ esperadas | Compatible con MCAR |
| `pattern: "clustered"` (z < 0) | Menos rachas de lo esperado | Faltantes agrupados en tramos → consistente con MAR estacional |
| `pattern: "alternating"` (z > 0) | Más rachas de lo esperado | Patrón alternante → no aleatorio pero no estacional |
| `tested: false` | Datos insuficientes | No se puede verificar MCAR |

**Referencia**: Wald & Wolfowitz (1940), "On a Test Whether Two Samples are from the Same Population", Ann. Math. Statist.

### 3.5 `_normalTwoTailedPValue()` (index.js:772-775)

```javascript
_normalTwoTailedPValue(z) {
  return 1 - this._erf(Math.abs(z) / Math.SQRT2);
}
```

**Aproximación**: Abramowitz & Stegun (1964) 7.1.26 (error máximo 1.5e-7)

### 3.6 `_erf()` (index.js:777-784)

```javascript
_erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}
```

**Referencia**: Abramowitz & Stegun (1964), Handbook of Mathematical Functions

---

## 4. Ejemplo Numérico

### 4.1 Escenario: Serie de precipitación con faltantes

**Valores crudos**: `[2.5, 3.1, null, 1.8, 4.2, -9999, 2.9, 3.5, null, 2.1]`

**Configuración**:
- `expectedCount = 10`
- `sourceName = "senamhi_daily"`
- `SOURCE_FILL_VALUES.senamhi_daily = [-9999]`

**Paso 1: Filtrado de fill values**
```
sentinels = new Set([-9999])
isValid(v): v != null && typeof v === "number" && !sentinels.has(v)
validValues = [2.5, 3.1, 1.8, 4.2, 2.9, 3.5, 2.1]
validCount = 7
```

**Paso 2: Completitud**
```
completenessRatio = 7 / 10 = 0.70
```

**Paso 3: Threshold adaptativo**
```
totalExpected = 10 (< 20)
adaptiveThreshold = 0.50 + (10/20) * 0.25 = 0.625
```

**Paso 4: ¿Corrección?**
```
completenessRatio (0.70) >= adaptiveThreshold (0.625) → NO se aplica corrección
```

**Paso 5: Test MCAR**
```
indicators = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1]
n1 = 7 (válidos), n2 = 3 (faltantes), N = 10
runs = 4 (1→1→0→1→1→0→1→1→0→1)
expectedRuns = (2*7*3)/10 + 1 = 5.2
variance = (2*7*3*(2*7*3-10))/(10*10*9) = 1.3067
z = (4 - 5.2) / sqrt(1.3067) = -1.048
p_value = 0.2946
pattern = "consistent_with_random"
```

**Resultado final**:
```javascript
{
  value: 20.1,  // 2.5+3.1+1.8+4.2+2.9+3.5+2.1 = 20.1 (sin corrección)
  completenessRatio: 0.70,
  validCount: 7,
  expectedCount: 10,
  correction_applied: false,
  threshold_used: 0.625,
  mcar_test: {
    tested: true,
    runs: 4,
    expected_runs: 5.2,
    z: -1.048,
    p_value: 0.2946,
    pattern: "consistent_with_random"
  },
  fill_values_source_registered: true
}
```

---

## 5. Tabla de Impacto

| Componente | Tipo de cambio | Riesgo si falla | Dependencia |
|------------|---------------|-----------------|-------------|
| `_getSourceFillValues()` | Lookup | Sentinelas no reconocidas → valores válidos descartados | `SOURCE_FILL_VALUES`, `GLOBAL_FILL_VALUES` |
| `_aggregateCompletenessAware()` | Core aggregation | Serie temporal con sesgo no corregido | `_testMissingnessRandomness()` |
| `_computeAdaptiveThreshold()` | Config | Threshold incorrecto → corrección aplicada cuando no debería | `validation-profiles.json` |
| `_testMissingnessRandomness()` | MCAR check | MCAR asumido sin verificar → sesgo no detectado | Wald-Wolfowitz test |
| `_normalTwoTailedPValue()` | Stats | p-valor incorrecto → conclusión MCAR errónea | `_erf()` |
| `_erf()` | Math | Error de precisión → p-valor incorrecto | Abramowitz & Stegun |

---

## 6. Supuestos y Limitaciones

1. **MCAR se asume para corrección pero se verifica**: La corrección por sesgo (factor `totalExpected / validCount`) se aplica asumiendo MCAR, pero el test de rachas verifica si el patrón de faltantes es consistente con aleatoriedad. Si el test detecta agrupamiento (consistente con MAR estacional), se reporta explícitamente en `methodology.mcar_test`.

2. **`completeness_weighted_mean` no se corrige**: La media es insesgada bajo MCAR (WMO No. 100 §2.3.2), por lo que no se aplica factor de corrección. Solo se reporta la media de valores válidos.

3. **`completeness_weighted_sum` sí se corrige**: La suma sí necesita corrección porque los faltantes reducen el total.

4. **Threshold adaptativo es lineal**: La interpolación entre 0.50 (degraded) y 0.75 (acceptable) es una elección de máxima entropía (sin evidencia de la curva real).

5. **`fill_values_source_registered` es informativo**: No afecta el cálculo, solo documenta si la fuente tiene fill values documentados o si se usó el fallback genérico.

---

## 7. Trazabilidad

| Referencia | Ubicación |
|------------|-----------|
| H-3.3 (MCAR sin verificar) | Auditoría Stage 03, hallazgo 3.3 — RESUELTO: `_testMissingnessRandomness()` |
| H-4.2 (GLOBAL_FILL_VALUES incompleto) | Auditoría Stage 03, hallazgo 4.2 — RESUELTO: ahora incluye -32768 y -99999 |
| H-3.4 (Threshold adaptativo) | Auditoría Stage 03, hallazgo 3.4 — interpolación lineal entre anchors |
| Wald-Wolfowitz | Wald & Wolfowitz (1940), Ann. Math. Statist. |
| Abramowitz & Stegun | Handbook of Mathematical Functions (1964), 7.1.26 |
| WMO No. 100 | §2.3.2: mean is unbiased if MCAR |
| GCOS-245 | Carro-Calvo et al. (2020) — completeness thresholds |
