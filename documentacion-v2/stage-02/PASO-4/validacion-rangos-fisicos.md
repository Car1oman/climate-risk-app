# PASO-4 — Validación de Rangos Físicos (Per-Variable Ranges)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage02Validation.validatePhysicalRanges()` |
| **Ubicación** | `pipeline/stages/02-validation/index.js:313-427` |
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la validación de rangos físicos con doble capa: global (WMO) y nacional (SENAMHI) |

---

## 1. Resumen Ejecutivo

PASO-4 valida que cada valor numérico en la respuesta cruda caiga dentro de un rango físicamente plausible. Implementa un sistema de **doble capa**:

1. **`valid_range`** (global): Rangos absolutos basados en WMO No. 8 (2018) e IPCC AR6 WG1. Valores fuera de este rango son **imposibles físicamente** → `result: "fail"`.
2. **`peru_range`** (nacional): Rangos basados en observaciones SENAMHI por estación. Valores fuera de este rango pero dentro de `valid_range` son **estadísticamente inusuales para Perú** → `result: "warning"`.

Este sistema de doble capa fue activado en H-35 (2026-07-15) y es distinto de los `warning_ranges` eliminados en v2.0: cada `peru_range` cita estaciones SENAMHI específicas y períodos de observación (ej: "Estación Antacolpa (Moquegua) -24.5°C, 1961-2020").

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
validateSource(source, profiles)                                    // index.js:143
  │
  └── if (fieldMap) {
        ├── validateFillValues(...)                                 // PASO-3
        ├── validatePhysicalRanges(source, fieldMap, profiles)      // ← PASO 4 ANALIZADO
        ├── validateCompleteness(...)                               // PASO-5
        └── validateTemporalConsistency(...)                        // PASO-6
      }
```

### 2.2 Flujo de datos

```
source.response (objeto crudo) + fieldMap (SOURCE_FIELD_MAP)
  │
  └── Por cada [pathStr, fieldInfo] en fieldMap.paths:
        │
        ├── variable = fieldInfo.variable
        ├── rangeConfig = profiles.physical_ranges[variable]
        │
        ├── resolvePath(response, pathStr) → value
        ├── extractValues(value) → values[]
        │
        └── Por cada valor numérico v:
              │
              ├── isNaN(v)? → issue: "not_a_number", action: "fail"
              │
              ├── v < valid_range.min OR v > valid_range.max?
              │     → issue: "below_minimum" | "above_maximum", action: "fail"
              │
              ├── peru_range exists AND (v < peru_range.min OR v > peru_range.max)?
              │     → issue: "below_peru_range" | "above_peru_range", action: "warning"
              │
              └── else → fieldOk++
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `validatePhysicalRanges()` (index.js:313-427)

```javascript
validatePhysicalRanges(source, fieldMap, profiles) {
  const issues = [];
  const checked = [];

  for (const [pathStr, fieldInfo] of Object.entries(fieldMap.paths)) {
    const variable = fieldInfo.variable;
    const rangeConfig = profiles.physical_ranges[variable];
    if (!rangeConfig) continue;

    const value = this.resolvePath(source.response, pathStr);
    if (value == null) continue;

    const values = this.extractValues(value);
    let fieldIssues = 0;
    let fieldWarnings = 0;
    let fieldOk = 0;

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || typeof v !== "number") continue;

      // NaN check (H-10)
      if (Number.isNaN(v)) {
        issues.push({ path, variable, value: "NaN", valid_range: vr,
                       reason: "not_a_number", action: "fail" });
        fieldIssues++;
        continue;
      }

      // Valid range check (WMO/physical)
      if (v < vr.min || v > vr.max) {
        issues.push({ path, variable, value: v, valid_range: vr,
                       reason: "below_minimum" | "above_maximum", action: "fail" });
        fieldIssues++;
        continue;
      }

      // Peru range check (SENAMHI) - warning only
      if (pr && (v < pr.min || v > pr.max)) {
        issues.push({ path, variable, value: v, peru_range: pr,
                       reason: "below_peru_range" | "above_peru_range", action: "warning" });
        fieldWarnings++;
        continue;
      }

      fieldOk++;
    }

    checked.push({
      path: pathStr, variable,
      values_checked: values.filter(v => v != null && typeof v === "number").length,
      within_range: fieldOk,
      outside_peru_range: fieldWarnings,
      outside_range: fieldIssues,
      valid_range: rangeConfig.valid_range,
      peru_range: rangeConfig.peru_range,
      reference: rangeConfig.reference,
    });
  }

  // Aggregate result
  const failCount = issues.filter(i => i.action === "fail").length;
  const warnCount = issues.filter(i => i.action === "warning").length;
  const result = failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass";

  return { rule: "physical_range_validation", result, detail, variables_checked, range_issues, reference };
}
```

### 3.2 Jerarquía de validación

```
                    ┌─────────────────────────┐
                    │  isNaN(v)?              │
                    │  action: FAIL           │
                    └─────────┬───────────────┘
                              │ Si no es NaN
                    ┌─────────▼───────────────┐
                    │  v fuera de valid_range?│
                    │  action: FAIL           │
                    │  (imposible físicamente) │
                    └─────────┬───────────────┘
                              │ Dentro de valid_range
                    ┌─────────▼───────────────┐
                    │  v fuera de peru_range? │
                    │  action: WARNING        │
                    │  (inusual para Perú)    │
                    └─────────┬───────────────┘
                              │ Dentro de peru_range
                    ┌─────────▼───────────────┐
                    │  OK: valor válido       │
                    └─────────────────────────┘
```

### 3.3 Rangos físicos configurados

| Variable | valid_range | peru_range | Referencia global | Referencia Perú |
|---|---|---|---|---|
| `air_temperature_current` | [-90, 60] °C | [-25, 45] °C | WMO No. 8 Ch. 3, Vostok -89.2°C, Death Valley 56.7°C | SENAMHI: Antacolpa -24.5°C, Chachapoyas 42.8°C (1961-2020) |
| `air_temperature_max` | [-90, 60] °C | [-15, 48] °C | Mismo WMO | SENAMHI: Selva alta ~45°C Pucallpa |
| `air_temperature_min` | [-90, 60] °C | [-25, 30] °C | Mismo WMO | Vostok -89.2°C (WMO global) |
| `precipitation_current` | [0, 2000] mm | [0, 1500] mm | WMO: negativos = error instrumento. Récord: 1825mm/24h La Réunion | SENAMHI: Quincemil ~700mm, Costa ~150mm |
| `precipitation_sum` | [0, 2000] mm | — | Mismo WMO. **H-11**: rango ajustado de [0,50000] a [0,2000] | Ambas APIs validan diarios individuales |
| `relative_humidity` | [0, 100] % | — | Clausius-Clapeyron: 0-100% definición física | — |
| `wind_speed` | [0, 500] km/h | — | Récord: 407 km/h (Barrow Is.), tornado ~485 km/h | — |
| `surface_pressure` | [870, 1085] hPa | [950, 1030] hPa | WMO: Tip typhoon 870 hPa, Tosontsengel 1084.8 hPa | SENAMHI: Costa 1010-1020, Sierra 950-1000 |
| `elevation` | [-500, 9000] m | [0, 6768] m | SRTM range. Everest 8848m | Huascarán 6768m |
| `twsa` | [-100, 100] cm | — | GRACE TWSA. Global ±50cm, extremos ±80cm | — (placeholder H-24) |
| `oni_index` | [-4, 4] °C | — | ONI historical range [-2.5, +3.0]°C | — |
| `poverty_rate` | [0, 100] % | — | Definición porcentual | INEI: 20.2%-58.7% |
| `gdp_per_capita` | [0, 500000] USD | [1500, 20000] USD | Monaco $288k (2024). 500k = corruption ceiling | World Bank: $6,217-$9,684 |

### 3.4 Tratamiento de NaN (H-10)

```javascript
// typeof NaN === "number", and NaN < x / NaN > x are both false
// Without this check, NaN would silently satisfy any range.
if (Number.isNaN(v)) {
  issues.push({ ..., reason: "not_a_number", action: "fail" });
}
```

**Referencia**: ECMAScript Language Specification, §9.4: `typeof NaN === "number"`.

### 3.5 `peru_range` como segunda capa (H-35)

**Diferencia de los `warning_ranges` eliminados en v2.0**:

| Característica | warning_ranges (v2.0, eliminados) | peru_range (v2.1, H-35) |
|---|---|---|
| Origen | Valores redondos elegidos manualmente | Estaciones SENAMHI específicas |
| Referencia | Sin respaldo documental | Cita estación + años de observación |
| Acción | warning (misma que peru_range) | warning |
| Status | Eliminados por no tener respaldo | Activados con respaldo verificable |

---

## 4. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Doble capa (global + peru)** | Distinguir "imposible físicamente" de "inusual para Perú" | Granularidad en la detección | Mantener 12 rangos × 2 capas sincronizados |
| **`valid_range` como fail** | Valores fuera de rango son errores de datos | Protección contra datos corruptos | Puede descartar valores atípicos legítimos (mitigado por peru_range) |
| **`peru_range` como warning** | No descarta, solo alerta | Transparencia para investigadores | Warning fatigue si muchos valores caen fuera |
| **NaN como fail explícito** | NaN no es un valor faltante, es un error de parse | Detecta problemas de parsing upstream | Puede aumentar count de fails |
| **`continue` después de fail** | Un valor fallido no se compara con peru_range | Evita doble reporting | — |

---

## 5. Limitaciones y Riesgos

### 5.1 Solo valida valores numéricos

**Descripción**: `typeof v !== "number"` excluye strings, booleans, objetos de la validación.

**Impacto**: Datos no numéricos (ej: categorías de land_cover) pasan sin validar.

**Mitigación**: Correcto por diseño: rangos físicos solo aplican a magnitudes numéricas.

### 5.2 `peru_range` no existe para todas las variables

**Descripción**: Solo 8 de 12 variables tienen `peru_range` configurado.

**Impacto**: Variables sin peru_range (humidity, wind_speed, oni_index, twsa) no reciben la segunda capa de validación.

**Mitigación**: Esas variables no tienen estaciones SENAMHI documentadas. La capa global (WMO) es suficiente.

### 5.3 Precipitación: mismo rango para daily y accumulative

**Descripción**: `precipitation_sum` hereda `valid_range` de `precipitation_current` ([0, 2000] mm).

**Impacto**: El rango aplica a totales diarios, no acumulativos. Stage 02 valida elementos individuales del array, no la suma total.

**Mitigación**: Documentado extensamente en `_scope_note` de validation-profiles.json (H-11).

---

## 6. Auditoría de Consistencia

### 6.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| `validatePhysicalRanges()` | `index.js:313-427` | Documentado en §3.1 | ✅ Consistente |
| Doble capa valid/peru | Líneas 356-380 | Documentado en §3.2 | ✅ Consistente |
| NaN check | Líneas 343-354 | Documentado en §3.4 | ✅ Consistente |
| 12 variables configuradas | validation-profiles.json | Tabla en §3.3 | ✅ Consistente |
| WMO No. 8 reference | `_standard` en physical_ranges | Citado en §1 y §3.3 | ✅ Consistente |
| SENAMHI reference | `reference.peru_range` por variable | Citado en §3.3 | ✅ Consistente |

### 6.2 Consumidores del resultado

| Consumidor | Uso |
|---|---|
| `buildResult()` | Agrega `physical_range_validation` a `validation_results[]` |
| `summary.failed` | Cuenta fails de rangos físicos |
| Stage 03 | Recibe valores sin reemplazo (fill values ya detectados en PASO-3) |
| API/UI | Muestra `variables_checked[]` con detalles por variable |

---

## 7. Conclusiones

### 7.1 ¿El diseño es técnicamente sólido?

Sí. PASO-4 implementa una validación de rangos físicos con doble capa bien fundamentada. La separación entre `valid_range` (WMO, fail) y `peru_range` (SENAMHI, warning) es una mejora significativa sobre el sistema anterior (sin rangos subnacionales). Cada referencia es verificable contra fuentes oficiales.

### 7.2 Fortalezas

1. **Trazabilidad completa**: Cada rango tiene referencia normativa y justificación
2. **Doble capa**: Distingue errores físicos de anomalías nacionales
3. **NaN explícito**: Detecta problemas de parse upstream
4. **No descarta fuentes**: `peru_range` es warning, no fail

### 7.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| Solo valida numéricos | Datos categóricos pasan sin validar | Baja (correcto por diseño) |
| 8/12 variables sin peru_range | Sin capa nacional para humidity, wind, etc. | Baja (sin datos SENAMHI) |
| Mismo rango daily/accumulative | precipitation_sum hereda de precipitation_current | Baja (documentado H-11) |

---

## 8. Referencias

- WMO (2018). *Guide to Instruments and Methods of Observation* (WMO-No. 8). Chapter 3.
- IPCC (2021). *Climate Change 2021: The Physical Science Basis* (AR6 WG1). Chapter 2.
- SENAMHI (2021). *Climas del Perú: Mapa de Clasificación Climática Nacional*.
- WMO World Weather & Climate Extremes Archive. https://wmo.asu.edu/
- ECMAScript Language Specification (2024). §9.4: `typeof NaN === "number"`.
