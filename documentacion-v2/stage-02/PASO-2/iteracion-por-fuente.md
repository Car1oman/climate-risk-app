# PASO-2 — Iteración por Fuente y Orquestación de Validaciones

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage02Validation.execute()`, `validateSource()` |
| **Ubicación** | `pipeline/stages/02-validation/index.js:122-162` |
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del loop principal que itera sobre fuentes crudas de Stage 01 y orquesta todas las validaciones por fuente |

---

## 1. Resumen Ejecutivo

PASO-2 es el orquestador central de Stage 02. Recibe `sources_consulted` (el output de Stage 01 acquisition) y itera secuencialmente sobre cada fuente, ejecutando un conjunto ordenado de validaciones: schema, fill values, rangos físicos, completitud, consistencia temporal, y cobertura espacial. Cada fuente produce dos artefactos independientes: un `ValidatedRecord` (resultado de validación) y un `CoverageDecision` (decisión de cobertura espacial).

El diseño sigue el patrón **"validate then build"**: primero se ejecutan todas las reglas de validación contra la fuente cruda, luego `buildResult()` agrega los resultados en un registro Zod-validado que se transfiere a Stage 03.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
PipelineEngine.run(input)                                          // engine.js:22
  │
  └── Stage02Validation.execute(input)                             // index.js:122
        │
        ├── getValidationProfiles()                                // PASO-1
        │
        └── for (source of sources_consulted)                      // ← PASO 2: loop principal
              │
              ├── validateSource(source, profiles)                 // Validaciones PASO-3 a PASO-6
              │     ├── validateSchema(source)
              │     ├── validateFillValues(source, fieldMap, profiles)
              │     ├── validatePhysicalRanges(source, fieldMap, profiles)
              │     ├── validateCompleteness(source, fieldMap, profiles)
              │     └── validateTemporalConsistency(source, profiles)
              │
              ├── buildResult(source, validations)                 // Agrega + Zod parse
              │
              └── evaluateCoverage(source)                         // PASO-7
```

### 2.2 Flujo de datos

```
sources_consulted (array de SourceResponse de Stage 01)
        │
        └── [por cada source]
              │
              ├── source.source_name    → clave para SOURCE_FIELD_MAP
              │                          y fill_values.per_source
              ├── source.source_domain  → mapeado a domainType por classifyDomain()
              ├── source.response       → objeto crudo del adapter
              ├── source.spatial_distance_km → distancia al punto más cercano
              └── source.coverage_status     → "available" | "failed"
                    │
                    ├── validateSource() → ValidatedRecord
                    │     ├── validation_results[] → arrays de reglas
                    │     ├── overall_status → "passed" | "warning" | "failed"
                    │     ├── is_valid → boolean
                    │     └── summary → { total, passed, warnings, failed }
                    │
                    └── evaluateCoverage() → CoverageDecision
                          ├── coverage_status → "available" | "partial" | "out_of_coverage" | "unknown" | "failed"
                          ├── variable_coverage[] → por variable
                          └── decision_reason → string descriptivo
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `execute()` — Entry point (index.js:122-141)

```javascript
execute(input) {
  const { sources_consulted } = input;
  const profiles = getValidationProfiles();

  const validatedSources = [];
  const coverageDecisions = [];

  for (const source of sources_consulted) {
    const validation = this.validateSource(source, profiles);
    validatedSources.push(validation);

    const decision = this.evaluateCoverage(source);
    coverageDecisions.push(decision);
  }

  return {
    validated_sources: validatedSources,
    coverage_decisions: coverageDecisions,
  };
}
```

**Observaciones**:
- `getValidationProfiles()` se invoca una sola vez (PASO-1), no por cada fuente
- `validateSource()` y `evaluateCoverage()` se ejecutan secuencialmente por cada fuente
- El output tiene dos arrays independientes: `validated_sources` y `coverage_decisions`
- El loop es secuencial (no paralelo) — justificado por el volumen actual (8-11 fuentes)

### 3.2 `validateSource()` — Orquestador de validaciones (index.js:143-162)

```javascript
validateSource(source, profiles) {
  const fieldMap = SOURCE_FIELD_MAP[source.source_name] || null;

  const validations = [];

  // 1. Schema validation (siempre se ejecuta)
  validations.push(this.validateSchema(source));

  // Si no hay respuesta, cortocircuitar
  if (!source.response) {
    return this.buildResult(source, validations);
  }

  // 2-4. Validaciones de datos (solo si hay fieldMap)
  if (fieldMap) {
    validations.push(this.validateFillValues(source, fieldMap, profiles));
    validations.push(this.validatePhysicalRanges(source, fieldMap, profiles));
    validations.push(this.validateCompleteness(source, fieldMap, profiles));
  }

  // 5. Temporal consistency (siempre se ejecuta si hay response)
  validations.push(this.validateTemporalConsistency(source, profiles));

  return this.buildResult(source, validations);
}
```

**Flujo de validaciones por fuente:**

| # | Regla | Condición de ejecución | Produces |
|---|---|---|---|
| 1 | `schema_validation` | **Siempre** (aunque no haya response) | `result: "pass" \| "fail"` |
| 2 | `fill_value_detection` | Solo si `SOURCE_FIELD_MAP[name]` existe | `result: "pass" \| "warning"`, `fill_values[]` |
| 3 | `physical_range_validation` | Solo si hay fieldMap | `result: "pass" \| "warning" \| "fail"`, `variables_checked[]` |
| 4 | `completeness` | Solo si hay fieldMap | `result: "pass" \| "warning" \| "fail"`, `completeness_pct` |
| 5 | `temporal_consistency` | Solo si `source.response` existe | `result: "pass" \| "warning" \| "fail"`, `classification` |

### 3.3 SOURCE_FIELD_MAP — Mapa de campos por fuente (index.js:6-82)

El `SOURCE_FIELD_MAP` define qué campos de la respuesta de cada adapter se mapean a qué variables canónicas. Es la tabla de traducción entre la estructura de datos nativa de cada API y el modelo normalizado del pipeline.

| Fuente | Campos mapeados | Tipo |
|---|---|---|
| `weatherapi` | 4: temp_c, humidity, wind_kph, pressure_mb | scalar |
| `nasa_power` | 5: T2M, PRECTOTCORR, RH2M, WS2M, PS | timeseries |
| `openmeteo_cmip6` | 3: temperature_2m_max/min, precipitation_sum | timeseries |
| `opentopodata_srtm30m` | 1: elevation | scalar |
| `open_elevation` | 1: elevation | scalar |
| `world_bank` | 4: poverty_rate, gdp_per_capita, water_access, urban_population | scalar |
| `noaa_cpc_oni` | 1: latest_anom | scalar |
| `supabase_climate_cells` | 0 (paths vacío) | — |
| `gri_oxford` | 4: population, buildings, land_cover, traveltime_healthcare | scalar (filter predicates) |

**Total**: 23 campos mapeados a 18 variables canónicas.

### 3.4 Clasificación de dominio: `classifyDomain()` (index.js:1020-1049)

```javascript
classifyDomain(sourceDomain) {
  const map = {
    "observation_current": "climate",
    "observation_historical": "climate",
    "projection_climate": "climate",
    "precomputed_grid": "climate",
    "elevation": "geophysical",
    "hazard_risk_gri": "geophysical",
    "groundwater": "climate",
    "socioeconomic": "socioeconomic",
    "enso": "index",
  };
  const domainType = map[sourceDomain];
  if (domainType) return { domainType, wasMapped: true };
  return { domainType: "climate", wasMapped: false };
}
```

**Propósito**: Determina qué umbrales de completitud aplicar a cada fuente (PASO-5).

| sourceDomain | domainType | Umbral aplicado |
|---|---|---|
| `observation_current` | `climate` | good≥95%, acceptable≥80%, degraded≥50% |
| `observation_historical` | `climate` | good≥95%, acceptable≥80%, degraded≥50% |
| `projection_climate` | `climate` | good≥95%, acceptable≥80%, degraded≥50% |
| `elevation` | `geophysical` | good≥99%, acceptable≥95%, degraded≥80% |
| `socioeconomic` | `socioeconomic` | good=100%, acceptable≥75%, degraded≥50% |
| `enso` | `index` | good=100%, acceptable≥90%, degraded≥50% |
| *(cualquier otro)* | `climate` (fallback) | wasMapped=false, warning en output |

**H-27**: El fallback a "climate" con `wasMapped:false` existe para hacer visible un dominio no mapeado en vez de silenciosamente aplicar umbrales incorrectos.

---

## 4. Decisión de Diseño: Separación validated_sources / coverage_decisions

El output de `execute()` produce **dos arrays separados** en vez de un solo objeto combinado:

| Array | Contenido | Consumidor |
|---|---|---|
| `validated_sources` | Resultados de validación (pass/warning/fail por regla) | Stage 03, API/UI |
| `coverage_decisions` | Decisiones de cobertura espacial (available/partial/out_of_coverage) | Stage 03 (filtro `liveSources`) |

**Justificación**: Stage 03 consume `coverage_decisions` para filtrar fuentes fuera de cobertura (`liveSources = validated_sources.filter(v => v.coverage_status !== "out_of_coverage")`), pero no necesita procesar las validaciones individuales para esa decisión. Mantenerlos separados simplifica el consumo downstream.

---

## 5. Tabla de Reglas Aplicadas

El constructor documenta explícitamente qué reglas aplica Stage 02 (index.js:112-119):

```javascript
this.rulesApplied = [
  "Schema validation: response presence and expected structure",
  "Fill value detection: per-source fill values from validation-profiles.json (CF Conventions 1.12)",
  "Physical range validation: per-variable ranges from WMO No. 8 and IPCC AR6 WG1",
  "Completeness metrics: GCOS-200 thresholds per data type",
  "Temporal consistency: date-gap and NOAA ONI season-sequence checks, severity scaled by completeness.thresholds (nasa_power daily gaps via 'climate', ONI season gaps via 'index' — Trenberth 1997 5-consecutive-season rule)",
  "Spatial coverage: decorrelation-derived max_distance_km from spatial-decorrelation.json (d_max = -L × ln(θ), θ=0.5)",
];
```

---

## 6. Limitaciones y Riesgos

### 6.1 Ejecución secuencial del loop

**Descripción**: El loop itera sobre cada fuente de forma secuencial. No hay paralelismo.

**Impacto**: Para 8-11 fuentes, el overhead es mínimo (<1ms total para validaciones CPU-bound). Si el número de fuentes crece significativamente, considerar `Promise.all` (requeriría refactorizar a async).

**Riesgo**: Bajo en el alcance actual.

### 6.2 Dependencia de SOURCE_FIELD_MAP

**Descripción**: Si una fuente no tiene entrada en `SOURCE_FIELD_MAP`, se omite fill_values, physical_ranges y completeness. Solo schema y temporal se ejecutan.

**Impacto**: Una nueva fuente sin FIELD_MAP pasa desapercibida en 3 de 5 validaciones.

**Mitigación**: `classifyDomain()` con `wasMapped:false` emite warning si el dominio no está mapeado.

### 6.3 `is_valid` vs `overall_status`

**Descripción**: `is_valid` es `true` tanto para "passed" como para "warning". Solo `false` para "failed".

**Impacto**: Una fuente con warnings se reporta como "válida". Esto es intencional (H-32): warnings no descartan la fuente.

**Mitigación**: Stage 03 distingue `overall_status` para decisiones más granulares.

---

## 7. Auditoría de Consistencia

### 7.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| `execute()` entry point | `index.js:122-141` | Documentado en §3.1 | ✅ Consistente |
| `validateSource()` orquestador | `index.js:143-162` | Documentado en §3.2 | ✅ Consistente |
| `SOURCE_FIELD_MAP` | 23 campos, 9 fuentes | Documentado en §3.3 | ✅ Consistente |
| `classifyDomain()` | 8 dominios mappeados | Documentado en §3.4 | ✅ Consistente |
| Output shape | `{ validated_sources, coverage_decisions }` | Documentado en §2.2 | ✅ Consistente |
| `rulesApplied` | 6 reglas documentadas | Documentado en §5 | ✅ Consistente |

### 7.2 Consumidores del output

| Consumidor | Input | Uso |
|---|---|---|
| `PipelineEngine` | `output.validated_sources` | Transferencia a Stage 03 |
| `Stage03Normalization` | `coverage_decisions` | Filtrado `liveSources` |
| `API/UI` | `validated_sources[].summary` | Visualización de resultados |

---

## 8. Conclusiones

### 8.1 ¿El diseño es técnicamente sólido?

Sí. PASO-2 implementa un orquestador claro y predecible: itera fuentes, ejecuta validaciones en orden consistente, y produce output tipado (Zod). La separación de `validated_sources` y `coverage_decisions` es una decisión arquitectónica madura que simplifica el consumo downstream.

### 8.2 Fortalezas

1. **Orden determinista**: Las validaciones se ejecutan en el mismo orden para todas las fuentes
2. **Cortocircuito inteligente**: Si no hay response, solo schema se ejecuta
3. **Output Zod-validado**: `buildResult()` aplica `ValidatedRecordSchema.parse()` (H-13)
4. **Transparencia**: Cada regla documenta su referencia normativa

### 8.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| Ejecución secuencial | Irrelevante para 8-11 fuentes | Baja |
| Dependencia de SOURCE_FIELD_MAP | Nuevas fuentes sin mapa omiten validaciones | Baja (mitigado por wasMapped) |
| `is_valid` incluye warnings | No discrimina warnings de passes | Baja (intencional, H-32) |

---

## 9. Referencias

- Fowler, M. (2002). *Patterns of Enterprise Application Architecture*. Addison-Wesley. (Registry Pattern, p. 480)
- WMO (2018). *Guide to Instruments and Methods of Observation* (WMO-No. 8). Chapter 3.
- GCOS (2022). *The Global Observing System for Climate: Implementation Needs* (GCOS-200). Principle 10.
- Trenberth, K.E. (1997). The Definition of El Niño. *Bull. Amer. Meteor. Soc.*, 78, 2771–2777.
