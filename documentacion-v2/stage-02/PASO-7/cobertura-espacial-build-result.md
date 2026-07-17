# PASO-7 — Cobertura Espacial y Construcción del Resultado (Coverage + Build Result)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage02Validation.evaluateCoverage()`, `buildResult()` |
| **Ubicación** | `pipeline/stages/02-validation/index.js:747-860` (evaluateCoverage), `875-918` (buildResult) |
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la evaluación de cobertura espacial por decorrelación y la construcción final del ValidatedRecord |

---

## 1. Resumen Ejecutivo

PASO-7 tiene dos partes:

**Parte A — evaluateCoverage()**: Evalúa si la distancia espacial entre el punto de consulta y la estación/grilla más cercana de la fuente es aceptable, usando un modelo de decorrelación espacial: `d_max = -L × ln(θ)` (Isaaks & Srivastava 1989). La evaluación es **por variable individual** (no blendada por fuente), permitiendo que una fuente sea "partial" (algunas variables dentro de rango, otras no).

**Parte B — buildResult()**: Agrega todas las validaciones (schema, fill values, rangos, completitud, temporal) en un `ValidatedRecord` tipado por Zod, con `overall_status`, `is_valid`, y `summary`. El Zod parse (H-13) se ejecuta en construcción para fallar inmediatamente si un campo inesperado aparece.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
execute(input)                                                      // index.js:122
  │
  └── for (source of sources_consulted) {
        ├── validateSource(source, profiles)                         // PASO-2 a PASO-6
        │     ├── validateSchema(...)
        │     ├── validateFillValues(...)
        │     ├── validatePhysicalRanges(...)
        │     ├── validateCompleteness(...)
        │     ├── validateTemporalConsistency(...)
        │     └── return ValidatedRecord (via buildResult)           // ← PASO 7B
        │
        └── evaluateCoverage(source)                                 // ← PASO 7A
              ├── getMaxDistancesForSource(source_name)
              ├── distance <= maxDistanceKm? → available | out_of_coverage
              ├── coverage rollup: all/partial/none → available/partial/out_of_coverage
              └── return CoverageDecision
      }
```

### 2.2 Flujo de datos — evaluateCoverage

```
source.spatial_distance_km + source.coverage_status
  │
  ├── ¿coverage_status === "failed"?
  │     └── SÍ → return { coverage_status: "failed", decision_reason: "source_failed" }
  │
  ├── getMaxDistancesForSource(source_name) → variableDistances[]
  │     ├── spatial-decorrelation.json → variables con domains que matchean
  │     └── [{ variable: "air_temperature_current", maxDistanceKm: 347 }, ...]
  │
  ├── ¿variableDistances.length === 0? (fuentes no-espaciales)
  │     └── SÍ → return { coverage_status: "available", decision_reason: "no_spatial_distance_required" }
  │
  ├── ¿distance == null? (fuentes que necesitan distancia pero no la tienen)
  │     └── SÍ → return { coverage_status: "unknown", ... }  // fail-closed (H-8)
  │
  └── Por cada { variable, maxDistanceKm }:
        ├── withinRange = distance <= maxDistanceKm  (≤ es intencional, H-31)
        └── coverage_status: "available" | "out_of_coverage"
              │
              └── Rollup:
                    ├── all available → "available"
                    ├── all out_of_coverage → "out_of_coverage"
                    └── mixed → "partial"
```

### 2.3 Flujo de datos — buildResult

```
validations[] (resultado de PASO-2 a PASO-6)
  │
  ├── hasFail = validations.some(v => v.result === "fail")
  ├── hasWarning = validations.some(v => v.result === "warning")
  ├── overallStatus = hasFail ? "failed" : hasWarning ? "warning" : "passed"
  │
  ├── completenessValidation → completeness_pct
  │
  └── ValidatedRecordSchema.parse({            // H-13: Zod validation
        source: source.source_name,
        overall_status: overallStatus,
        is_valid: overallStatus !== "failed",  // H-32: true para "warning"
        validation_results: validations,
        summary: {
          total_checks, passed, warnings, failed, completeness_pct
        }
      })
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `evaluateCoverage()` (index.js:747-860)

```javascript
evaluateCoverage(source) {
  const distance = source.spatial_distance_km;
  const modelMeta = {
    max_distance_source: "decorrelation_model",
    max_distance_formula: "d_max = -L × ln(θ)",
    max_distance_theta: 0.5,
  };

  // 1. Failed source → return failed
  if (source.coverage_status === "failed") {
    return { coverage_status: "failed", decision_reason: "source_failed", ... };
  }

  // 2. Get per-variable max distances
  const variableDistances = getMaxDistancesForSource(source.source_name);

  // 3. No spatial model → non-stochastic, always available
  if (variableDistances.length === 0) {
    return { coverage_status: "available", decision_reason: "no_spatial_distance_required", ... };
  }

  // 4. Missing distance for source that needs one → fail-closed (H-8)
  if (distance == null) {
    return { coverage_status: "unknown", decision_reason: "spatial_distance_km_missing...", ... };
  }

  // 5. Per-variable evaluation
  const variableCoverage = variableDistances.map(({ variable, maxDistanceKm }) => {
    const withinRange = distance <= maxDistanceKm;  // ≤ intencional (H-31)
    return {
      variable, distance_km: distance, max_distance_km: maxDistanceKm,
      coverage_status: withinRange ? "available" : "out_of_coverage",
    };
  });

  // 6. Rollup
  const availableCount = variableCoverage.filter(v => v.coverage_status === "available").length;
  const coverageStatus = availableCount === 0 ? "out_of_coverage"
    : availableCount === variableCoverage.length ? "available"
    : "partial";

  return { coverage_status: coverageStatus, variable_coverage: variableCoverage, ... };
}
```

### 3.2 Modelo de decorrelación espacial

**Fórmula**: `d_max = -L × ln(θ)`

| Parámetro | Valor | Fuente |
|---|---|---|
| `L` (decorrelation_length_km) | Variable por fuente | `spatial-decorrelation.json` |
| `θ` (correlation threshold) | 0.5 | Isaaks & Srivastava (1989), Journel & Huijbregts (1978) |

**Interpretación**: A distancia `d_max`, la correlación espacial es 0.5 (50%). Más allá de `d_max`, los datos ya no son representativos del punto de consulta.

**Ejemplo**: Para `air_temperature_current` con `L = 500 km`:
```
d_max = -500 × ln(0.5) = -500 × (-0.693) = 347 km
```

A 347 km: ρ = 0.5 (representativo, `coverage_status: "available"`)
A 348 km: ρ < 0.5 (no representativo, `coverage_status: "out_of_coverage"`)

**H-31**: La comparación es `distance <= maxDistanceKm` (≤ inclusivo), porque en exactamente `d = d_max`, ρ(d) = θ = 0.5 por construcción. θ es el mínimo **aceptable**, así que el punto fronterizo pertenece al lado "available".

### 3.3 Fail-closed para distancia faltante (H-8)

```javascript
if (distance == null) {
  return { coverage_status: "unknown", ... };
}
```

**Lógica**: Si una fuente tiene variables con modelo de decorrelación (weatherapi, nasa_power, openmeteo) pero `spatial_distance_km` es null, significa que el adapter no calculó la distancia (bug), no que la distancia no aplique. `coverage_status: "unknown"` se trata como "out_of_coverage" en Stage 03, haciendo visible el problema.

**Contraste**: Si la fuente NO tiene variables con modelo (world_bank, noaa_cpc_oni), `variableDistances.length === 0` y se retorna "available" directamente — la distancia genuinamente no aplica.

### 3.4 Per-variable evaluation (H-7)

**Problema anterior**: `Math.max()` de todas las distancias de variables de una fuente producía un único valor blendado.

**Ejemplo del problema**: nasa_power tiene `air_temperature_current` d_max=347km y `precipitation_sum` d_max=21km. A 300km:
- Antes: `Math.max(347, 21) = 347` → 300 ≤ 347 → "available" (INCORRECTO: precipitation no es representativo)
- Ahora: Temperature 300 ≤ 347 → "available"; Precipitation 300 > 21 → "out_of_coverage" → rollup "partial" (CORRECTO)

### 3.5 `buildResult()` (index.js:875-918)

```javascript
buildResult(source, validations) {
  const hasFail = validations.some(v => v.result === "fail");
  const hasWarning = validations.some(v => v.result === "warning");
  const overallStatus = hasFail ? "failed" : hasWarning ? "warning" : "passed";

  const completenessValidation = validations.find(v => v.rule === "completeness");

  return ValidatedRecordSchema.parse({
    source: source.source_name,
    overall_status: overallStatus,
    is_valid: overallStatus !== "failed",        // H-32: true para "warning"
    validation_results: validations,
    summary: {
      total_checks: validations.length,
      passed: validations.filter(v => v.result === "pass").length,
      warnings: validations.filter(v => v.result === "warning").length,
      failed: validations.filter(v => v.result === "fail").length,
      completeness_pct: completenessValidation?.completeness_pct ?? null,
    },
  });
}
```

### 3.6 `is_valid` semantics (H-32)

```javascript
is_valid: overallStatus !== "failed"
```

| `overall_status` | `is_valid` | Justificación |
|---|---|---|
| `"passed"` | `true` | Sin issues |
| `"warning"` | `true` | Warnings son noteworthy pero no descartan la fuente |
| `"failed"` | `false` | Failures confirman un problema que descarta la fuente |

**H-32**: `is_valid` es `true` para "warning" intencionalmente: cada regla ya trata "warning" como "noteworthy but not disqualifying" y "fail" como "confirmed problem". `is_valid` refleja la misma frontera a nivel de fuente. Ningún código interno actualmente lee `is_valid` para decidir — Stage 03 filtra por `coverage_status`, no por `is_valid`.

### 3.7 Validación Zod del output (H-13)

```javascript
return ValidatedRecordSchema.parse({ ... });
```

**H-13**: `ValidatedRecordSchema.parse()` se ejecuta en construcción (no como validación lazy). Si `buildResult()` produce un campo que el schema no espera o falta uno requerido, el error se lanza inmediatamente en Stage 02 en vez de propagarse silenciosamente a Stage 03.

---

## 4. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Per-variable evaluation** | H-7: evita que una variable localizada "saque" a las demás | Precisión | Más granularidad = más datos en output |
| **`≤` inclusivo en comparación** | H-31: d_max = punto fronterizo aceptable | Matemáticamente correcto | Puede confundir si se espera exclusivo |
| **Fail-closed para null distance** | H-8: bug del adapter se hace visible | Detección de bugs | Puede excluir fuentes funcionales con adapter roto |
| **`is_valid = !failed`** | H-32: warnings no descartan la fuente | Consistencia con reglas individuales | Consumidores pueden confundir "valid" con "sin warnings" |
| **Zod parse en build** | H-13: falla inmediata en Stage 02 | Fail-fast | Requiere schema actualizado |
| **Separación coverage/validated** | Stage 03 filtra por coverage, no por validation | Claridad downstream | Dos arrays en output |

---

## 5. Limitaciones y Riesgos

### 5.1 `d_max` depende de `spatial-decorrelation.json`

**Descripción**: Las distancias máximas son estáticas, configuradas en JSON. No se recalculan dinámicamente.

**Impacto**: Si la correlación espacial real cambia (ej: por cambio climático), las distancias quedan desactualizadas.

**Mitigación**: Los valores son válidos para el clima actual. Recalculo requeriría análisis geoestadístico por variable.

### 5.2 `θ = 0.5` es una convención, no una verdad absoluta

**Descripción**: El umbral de correlación 0.5 es una referencia de la literatura (Isaaks & Srivastava), no un umbral físico.

**Impacto**: Un análisis más estricto podría usar θ = 0.7, uno más permisivo θ = 0.3.

**Mitigación**: θ = 0.5 es el estándar de la literatura geoestadística. Documentado explícitamente.

### 5.3 `coverage_status` no distingue "partial" por qué variables

**Descripción**: El rollup "partial" indica que algunas variables están dentro de rango, pero no cuáles sin consultar `variable_coverage`.

**Impacto**: Stage 03 debe iterar `variable_coverage` para saber qué variables específicas están fuera de cobertura.

**Mitigación**: `variable_coverage[]` incluye el detalle por variable. El rollup es solo para consulta rápida.

### 5.4 `is_valid` no se consume internamente

**Descripción**: `is_valid` se produce pero no se lee en ningún código interno del pipeline (confirmado por grep).

**Impacto**: Es un campo de reporting para consumidores externos (API/UI). Cambiar su semántica no afectaría el pipeline.

**Mitigación**: Documentado como campo de reporting. Si se necesita como gate, Stage 03 debería filtrar por `is_valid`.

---

## 6. Auditoría de Consistencia

### 6.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| `evaluateCoverage()` | `index.js:747-860` | Documentado en §3.1 | ✅ Consistente |
| Fórmula decorrelación | `d_max = -L × ln(θ)`, θ=0.5 | Documentado en §3.2 | ✅ Consistente |
| Per-variable evaluation | H-7, line 826 | Documentado en §3.4 | ✅ Consistente |
| Fail-closed null distance | H-8, line 797 | Documentado en §3.3 | ✅ Consistente |
| `≤` inclusivo | H-31, line 827 | Documentado en §3.2 | ✅ Consistente |
| `buildResult()` | `index.js:875-918` | Documentado en §3.5 | ✅ Consistente |
| `is_valid = !failed` | H-32, line 908 | Documentado en §3.6 | ✅ Consistente |
| Zod parse | H-13, line 905 | Documentado en §3.7 | ✅ Consistente |

### 6.2 Consumidores del output

| Consumidor | Input | Uso |
|---|---|---|
| `PipelineEngine` | `output.coverage_decisions` | Transferencia a Stage 03 |
| `Stage03Normalization` | `coverage_decisions[].coverage_status` | Filtrado `liveSources` |
| Stage03 `liveSources` | `v.coverage_status !== "out_of_coverage"` | Excluye fuentes fuera de cobertura |
| API/UI | `coverage_decisions[].variable_coverage` | Visualización por variable |
| API/UI | `validated_sources[].is_valid` | Indicador de salud de la fuente |

---

## 7. Conclusiones

### 7.1 ¿El diseño es técnicamente sólido?

Sí. PASO-7 implementa una evaluación de cobertura espacial basada en geoestatística fundamental (Isaaks & Srivastava 1989) con decisiones de diseño bien documentadas. La separación entre per-variable evaluation (H-7), fail-closed para distancia faltante (H-8), y Zod parse en construcción (H-13) producen un sistema robusto y transparente.

### 7.2 Fortalezas

1. **Base geoestadística**: Modelo de decorrelación con referencias de la literatura
2. **Granularidad por variable**: Evita el problema del Math.max blendado (H-7)
3. **Fail-closed**: Bugs del adapter se hacen visibles (H-8)
4. **Zod enforcement**: Output siempre tipado correctamente (H-13)
5. **Transparencia**: `decision_reason` explica por qué se tomó cada decisión

### 7.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| `d_max` estático | No recalcula para cambio climático | Baja |
| `θ = 0.5` convencional | Podría ser más estricto/permisivo | Baja |
| `is_valid` no consumido internamente | Campo de reporting sin uso interno | Baja (documentado) |
| Rollup "partial" sin details | Requiere consultar `variable_coverage` | Baja (diseñado así) |

---

## 8. Referencias

- Isaaks, E.H. & Srivastava, R.M. (1989). *An Introduction to Applied Geostatistics*. Oxford University Press. Chapter 5: The variogram — range, sill, nugget.
- Journel, A.G. & Huijbregts, C.J. (1978). *Mining Geostatistics*. Academic Press.
- WMO (2018). *Guide to Climatological Practices* (WMO-No. 100). §2.2: Station density guidelines.
- Zod Documentation. (2024). *Zod: TypeScript-first schema validation*. https://zod.dev/
