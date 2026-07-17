# PASO-5 — Evaluación de Completitud (Completeness Assessment)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage02Validation.validateCompleteness()`, `classifyCompleteness()`, `completenessResultForClassification()` |
| **Ubicación** | `pipeline/stages/02-validation/index.js:429-509` |
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la evaluación de completitud de datos usando umbrales GCOS-245 por tipo de dominio |

---

## 1. Resumen Ejecutivo

PASO-5 mide qué fracción de los valores esperados en una fuente están presentes (no-null, no-NaN, no-fill-value). Usa un sistema de **cuatro niveles** basado en GCOS-245 (2022/2025):

| Nivel | Significado | Resultado |
|---|---|---|
| `good` | Completitud ideal o cercana | `pass` |
| `acceptable` | Completitud suficiente para análisis | `pass` |
| `degraded` | Completitud marginal, datos útiles pero con limitaciones | `warning` |
| `insufficient` | Completitud insuficiente para uso confiable | `fail` |

Los umbrales varían por tipo de dominio: las variables climáticas aceptan 50% degradado, las geofísicas requieren 80%, y los indicadores socioeconómicos exigen 100% para "good".

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
validateSource(source, profiles)                                    // index.js:143
  │
  └── if (fieldMap) {
        ├── validateFillValues(...)                                 // PASO-3
        ├── validatePhysicalRanges(...)                             // PASO-4
        ├── validateCompleteness(source, fieldMap, profiles)        // ← PASO 5 ANALIZADO
        └── validateTemporalConsistency(...)                        // PASO-6
      }
```

### 2.2 Flujo de datos

```
source.response + fieldMap.paths + profiles.completeness.thresholds
  │
  ├── Por cada pathStr en fieldMap.paths:
  │     ├── resolvePath(response, pathStr) → value
  │     ├── ¿Es timeseries? → Array.isArray(value) → contar length
  │     ├── ¿Es scalar? → 1 campo esperado
  │     └── isPresentValue(v)? → presentCount++ si es válido
  │
  ├── pct = presentCount / totalExpected
  │
  ├── classifyDomain(source_domain) → domainType
  │     ├── "observation_current" → "climate" (good≥95%, acceptable≥80%, degraded≥50%)
  │     ├── "elevation" → "geophysical" (good≥99%, acceptable≥95%, degraded≥80%)
  │     ├── "socioeconomic" → "socioeconomic" (good=100%, acceptable≥75%, degraded≥50%)
  │     └── "enso" → "index" (good=100%, acceptable≥90%, degraded≥50%)
  │
  ├── classifyCompleteness(pct, thresholds) → classification
  │     ├── pct ≥ good → "good"
  │     ├── pct ≥ acceptable → "acceptable"
  │     ├── pct ≥ degraded → "degraded"
  │     └── sino → "insufficient"
  │
  └── completenessResultForClassification(classification) → result
        ├── "good" | "acceptable" → "pass"
        ├── "degraded" → "warning"
        └── "insufficient" → "fail"
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `validateCompleteness()` (index.js:448-509)

```javascript
validateCompleteness(source, fieldMap, profiles) {
  const expectedFields = Object.keys(fieldMap.paths);
  if (expectedFields.length === 0) {
    return {
      rule: "completeness",
      result: "pass",
      detail: "No data fields expected for this source (index or metadata-only source)",
      completeness_pct: 1.0,
      classification: "not_applicable",
      reference: null,
    };
  }

  let presentCount = 0;
  let totalExpected = 0;

  for (const [pathStr, fieldInfo] of Object.entries(fieldMap.paths)) {
    const value = this.resolvePath(source.response, pathStr);
    if (fieldInfo.type === "timeseries") {
      if (Array.isArray(value)) {
        totalExpected += value.length;
        presentCount += value.filter(v => this.isPresentValue(v)).length;
      } else if (typeof value === "object" && value !== null) {
        const entries = Object.values(value);
        totalExpected += entries.length;
        presentCount += entries.filter(v => this.isPresentValue(v)).length;
      } else if (this.isPresentValue(value)) {
        totalExpected += 1;
        presentCount += 1;
      } else {
        totalExpected += 1;
      }
    } else {
      totalExpected += 1;
      if (this.isPresentValue(value)) presentCount += 1;
    }
  }

  const pct = totalExpected > 0 ? presentCount / totalExpected : 0;

  const { domainType, wasMapped } = this.classifyDomain(source.source_domain);
  const thresholds = profiles.completeness.thresholds[domainType]
    || profiles.completeness.thresholds.climate;
  const classification = this.classifyCompleteness(pct, thresholds);
  const result = this.completenessResultForClassification(classification);

  return {
    rule: "completeness",
    result,
    detail: `${(pct * 100).toFixed(1)}% completeness (${presentCount}/${totalExpected} valid, non-null, non-NaN values)`,
    completeness_pct: Math.round(pct * 10000) / 10000,
    classification,
    thresholds_used: thresholds,
    domain_type: domainType,
    domain_type_was_explicitly_mapped: wasMapped,
    reference: { standard: "GCOS-200 (2022)...", ... },
  };
}
```

### 3.2 `isPresentValue()` — Definición de "presente" (index.js:210-214)

```javascript
isPresentValue(v) {
  if (v == null) return false;                            // null, undefined
  if (typeof v === "number" && Number.isNaN(v)) return false;  // NaN
  return true;
}
```

**H-10/H-14**: `typeof NaN === "number"` y `NaN != null` es `true`. Sin este check explícito, un NaN contaría como "dato presente", inflando artificialmente `completeness_pct`.

**Referencia**: ECMAScript Language Specification §9.4.

### 3.3 `classifyCompleteness()` — Clasificación por umbrales (index.js:435-440)

```javascript
classifyCompleteness(presentFraction, thresholds) {
  if (presentFraction >= thresholds.good) return "good";
  if (presentFraction >= thresholds.acceptable) return "acceptable";
  if (presentFraction >= thresholds.degraded) return "degraded";
  return "insufficient";
}
```

**H-17**: Reutilizado por `validateTemporalConsistency()` para severity scaling — mismo conjunto de umbrales, no un segundo conjunto inventado.

### 3.4 `classifyDomain()` — Mapeo a umbrales (index.js:1020-1049)

| sourceDomain | domainType | good | acceptable | degraded | Referencia |
|---|---|---|---|---|---|
| `observation_current` | `climate` | ≥95% | ≥80% | ≥50% | GCOS-200 Principle 10 |
| `observation_historical` | `climate` | ≥95% | ≥80% | ≥50% | GCOS-200 Principle 10 |
| `projection_climate` | `climate` | ≥95% | ≥80% | ≥50% | GCOS-200 Principle 10 |
| `precomputed_grid` | `climate` | ≥95% | ≥80% | ≥50% | GCOS-200 Principle 10 |
| `elevation` | `geophysical` | ≥99% | ≥95% | ≥80% | Shabalala et al. 2019 |
| `hazard_risk_gri` | `geophysical` | ≥99% | ≥95% | ≥80% | Shabalala et al. 2019 |
| `groundwater` | `climate` | ≥95% | ≥80% | ≥50% | GCOS-200 (reservado GRACE-FO) |
| `socioeconomic` | `socioeconomic` | =100% | ≥75% | ≥50% | World Bank 75% acceptable |
| `enso` | `index` | =100% | ≥90% | ≥50% | Trenberth 1997 |

**H-16**: `socioeconomic.good = 1.0` es correcto. worldbank.js absorbe el rezago documentado (mrv=10 + filter non-null), por lo que un null significa "indicador no publicado en la última década" — sí amerita no calificar como "good".

**H-27**: Si `sourceDomain` no está en el map, retorna `{ domainType: "climate", wasMapped: false }`. Esto es un fallback visible, no silencioso.

### 3.5 Manejo de tipos de campo

```javascript
if (fieldInfo.type === "timeseries") {
  // Array → contar cada elemento
  // Object → contar cada value
  // Scalar → 1 campo
} else {
  // scalar → 1 campo
}
```

**Timeseries** (nasa_power, openmeteo): El conteo es por elementos individuales del array, no por la serie completa.

**Scalar** (weatherapi, world_bank, gri_oxford): Cada campo declarado es 1 elemento esperado.

### 3.6 Ejemplo numérico: world_bank

```
fieldMap.paths = {
  poverty_rate: 1 campo,      → present? 1
  gdp_per_capita: 1 campo,    → present? 1
  water_access: 1 campo,      → present? 1
  urban_population: 1 campo   → present? 1
}
totalExpected = 4, presentCount = 4 → pct = 1.0
domainType = "socioeconomic", thresholds.good = 1.0
classification = "good" → result = "pass"
```

Con solo 4 campos, `completeness_pct` solo puede tomar {0, 0.25, 0.5, 0.75, 1.0}. El threshold `good = 1.0` es alcanzable y correcto.

---

## 4. Referencias Normativas

| Referencia | Uso | Cita |
|---|---|---|
| **GCOS-200 (2022)** Principle 10 | "Data completeness should be monitored and reported with each dataset." | WMO/TD-No. 1538 |
| **GCOS-245 (2022/2025)** | Sistema de tres niveles: Threshold (T) / Breakthrough (B) / Goal (G) | ECV Requirements |
| **WMO No. 100 (2018)** §2.3.2 | Monthly ≥80% daily obs, Annual ≥90% monthly | Guide to Climatological Practices |
| **WMO CCl (2020)** | Extreme event analysis requires ≥95% completeness | Extreme event analysis |
| **Carro-Calvo et al. (2020)** | k-Gaps clustering works with 45% completeness | Theoretical and Applied Climatology |
| **Kim & Cho (2019)** | Monthly climatology affected by missing rates >5% | J. Climate Change Research |
| **Shabalala et al. (2019)** | Spatial interpolation requires >80% coverage | Climate |
| **Anderson (2018)** | 3/5 rule and 4/10 rule for monthly normals | Intl. J. Climatology |

---

## 5. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **4 niveles (no 2 o 3)** | GCOS-245 distingue T/B/G — el pipeline agrega "insufficient" como 4to | Granularidad | 4 umbrales por tipo de dominio = 16 configuraciones |
| **Umbrales por dominio** | Climáticas, geofísicas y socioeconómicas tienen tolerancias diferentes | Precisión | Mantener 4 configuraciones sincronizadas |
| **`completeness_pct` a 4 decimales** | Suficiente precisión sin pretender exactitud espuria | Transparencia | — |
| **`wasMapped` flag** | H-27: detectar dominios nuevos sin mapa de umbrales | Visibilidad de bugs de configuración | — |
| **Reutilizar en temporal** | H-17: `validateTemporalConsistency()` usa mismos umbrales | Consistencia, un solo conjunto de umbrales | — |

---

## 6. Limitaciones y Riesgos

### 6.1 Completitud binaria por campo

**Descripción**: Un campo se cuenta como "present" o "ausente". No hay gradiente (ej: un valor borderline no se penaliza parcialmente).

**Impacto**: Un campo con valor extremo pero técnicamente presente cuenta como 100% completo.

**Mitigación**: Los rangos físicos (PASO-4) ya validan la calidad de los valores presentes.

### 6.2 `good = 1.0` para socioeconomic

**Descripción**: Exige 100% de campos presentes para "good".

**Impacto**: Un solo campo null impide alcanzar "good".

**Mitigación**: worldbank.js ya filtra nulls upstream (mrv=10 + filter), así que un null aquí indica un problema real.

### 6.3 No distingue missing data de fill values

**Descripción**: Completeness cuenta campos presentes vs. esperados. Fill values (PASO-3) se detectan aparte.

**Impacto**: Un campo con fill value (-999) cuenta como "presente" en completitud si no se filtra antes.

**Mitigación**: Stage 03 reemplaza fill values con `null` antes de la normalización. En Stage 02, fill values y completitud son reglas independientes.

---

## 7. Auditoría de Consistencia

### 7.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| `validateCompleteness()` | `index.js:448-509` | Documentado en §3.1 | ✅ Consistente |
| `isPresentValue()` | `index.js:210-214` | Documentado en §3.2 | ✅ Consistente |
| `classifyCompleteness()` | `index.js:435-440` | Documentado en §3.3 | ✅ Consistente |
| `classifyDomain()` | `index.js:1020-1049` | Tabla en §3.4 | ✅ Consistente |
| 4 tipos de dominio | validation-profiles.json | Tabla en §3.4 | ✅ Consistente |
| GCOS-200/245 refs | `_standard`, `reference` | Citados en §4 | ✅ Consistente |

### 7.2 Consumidores del resultado

| Consumidor | Uso |
|---|---|
| `buildResult()` | Agrega `completeness` a `validation_results[]` |
| `summary.completeness_pct` | Percentual de completitud en el resumen |
| `validateTemporalConsistency()` | Reutiliza `classifyCompleteness()` para severity scaling |
| Stage 03 | Filtra variables con completitud insuficiente |
| API/UI | Muestra `completeness_pct`, `classification`, `thresholds_used` |

---

## 8. Conclusiones

### 8.1 ¿El diseño es técnicamente sólido?

Sí. PASO-5 implementa un sistema de completitud robusto basado en GCOS-245 con umbrales por tipo de dominio. La reutilización de `classifyCompleteness()` en temporal consistency (H-17) asegura consistencia en la clasificación de severidad.

### 8.2 Fortalezas

1. **4 niveles con referencias**: Cada umbral tiene sustento en literatura (GCOS, WMO, papers)
2. **Umbrales por dominio**: Reconoce que diferentes tipos de datos tienen tolerancias diferentes
3. **NaN explícito**: `isPresentValue()` evita que NaN inflen artificialmente la completitud
4. **Reutilización**: Mismos umbrales en completeness y temporal (H-17)

### 8.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| Completitud binaria por campo | Sin gradiente de calidad | Baja |
| `good = 1.0` para socioeconomic | Un null impide "good" | Baja (correcto por diseño) |
| No distingue fill values | Fill values cuentan como "present" | Baja (mitigado por PASO-3 + Stage 03) |

---

## 9. Referencias

- GCOS (2022). *The Global Observing System for Climate: Implementation Needs* (GCOS-200). WMO/TD-No. 1538.
- GCOS (2022/2025). *ECV Requirements* (GCOS-245). Three-tier system.
- WMO (2018). *Guide to Climatological Practices* (WMO-No. 100). Chapter 2, §2.3.2.
- Carro-Calvo et al. (2020). k-Gaps: a novel technique for clustering incomplete climatological time series. *Theoretical and Applied Climatology*.
- Kim & Cho (2019). Development of a Gap Filling Technique for Statistical Downscaling. *Journal of Climate Change Research*.
- Shabalala et al. (2019). Evaluation of Infilling Methods for Time Series of Daily Temperature Data. *Climate*.
- Anderson (2018). Accounting for missing data in monthly temperature series. *Intl. J. Climatology*.
- Trenberth, K.E. (1997). The Definition of El Niño. *Bull. Amer. Meteor. Soc.*, 78, 2771–2777.
