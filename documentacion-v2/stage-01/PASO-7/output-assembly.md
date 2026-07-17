# PASO-7 — Ensamblado de Output del Stage

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage01Acquisition.execute()` — sección de ensamblado de output |
| **Ubicación** | `pipeline/stages/01-acquisition/index.js:65-84` |
| **Stage** | Stage 01 — Acquisition (ID: 1) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-14 |
| **Propósito** | Documentación del ensamblado del objeto de retorno del stage: categorización de resultados y cálculo de métricas |

---

## 1. Resumen Ejecutivo

PASO-7 es la fase final del Stage 01. Categoriza los 11 resultados en exitosos/out_of_coverage/failed, calcula métricas agregadas, y construye el objeto de retorno `{ sources_consulted, summary }` que es consumido por el `PipelineEngine` y propagado a stages posteriores.

---

## 2. Código

```javascript
const successful = results.filter(r =>
  r.coverage_status === "available" || r.coverage_status === "out_of_coverage"
);
const failed = results.filter(r => r.coverage_status === "failed");
const outOfCoverage = results.filter(r => r.coverage_status === "out_of_coverage");
return {
  sources_consulted: results,
  summary: {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    out_of_coverage: outOfCoverage.length,
    sum_of_durations_ms: results.reduce((sum, r) => sum + r.duration_ms, 0),
  },
};
```

---

## 3. Categorización de Resultados

| Categoría | Condición | Significado |
|---|---|---|
| `successful` | `coverage_status ∈ {"available", "out_of_coverage"}` | La fuente respondió sin error HTTP/red |
| `failed` | `coverage_status === "failed"` | La fuente no pudo completar la consulta |
| `outOfCoverage` | `coverage_status === "out_of_coverage"` | Subconjunto de `successful` — respondió pero sin datos para esta ubicación |

**Nota**: `outOfCoverage` es un subconjunto de `successful`. Un resultado con `out_of_coverage` se cuenta en ambas categorías.

---

## 4. Cálculo de `sum_of_durations_ms`

```javascript
sum_of_durations_ms: results.reduce((sum, r) => sum + r.duration_ms, 0),
```

**Definición**: Suma conmutativa del `duration_ms` de cada `RawSourceResponse`. Representa el **compute work total** — la suma de todo el tiempo que cada adaptador individual invirtió en su consulta.

**Por qué no es el tiempo real del stage**: Los 11 adaptadores se ejecutaron en paralelo via `Promise.allSettled()`. El tiempo real de wall-clock del stage es determinado por el adaptador más lento, no por la suma de todas las duraciones.

**Ejemplo numérico:**

| Adaptador | duration_ms |
|---|---|
| weatherapi | 1,200 |
| nasa_power | 2,800 |
| openmeteo | 45,000 |
| opentopodata | 800 |
| open_elevation | 900 |
| world_bank | 1,500 |
| noaa_cpc_oni | 3,200 |
| noaa_enso_discussion | 3,100 |
| gri_oxford | 55,000 |
| supabase | 400 |
| **sum_of_durations_ms** | **113,900** |
| **Tiempo real (wall-clock)** | **~55,000** (gri_oxford) |

El `sum_of_durations_ms` (~114s) sobreestima el tiempo real (~55s) en un factor de ~2.1x.

**Consumidores**: Ningún componente funcional consume `summary.sum_of_durations_ms`. El campo existe exclusivamente para trazabilidad y auditoría en el artefacto de evidencia.

---

## 5. Objeto de Retorno

```javascript
{
  sources_consulted: results,          // RawSourceResponse[11]
  summary: {
    total: results.length,             // 11
    successful: successful.length,     // N (available + out_of_coverage)
    failed: failed.length,             // M
    out_of_coverage: outOfCoverage.length, // K
    sum_of_durations_ms: number,       // suma de duration_ms individual
  }
}
```

### 5.1 Consumidores

| Campo | Consumidor | Uso |
|---|---|---|
| `sources_consulted` | Stage 02 (Validation) | Aplicar reglas de validación por dominio |
| `sources_consulted` | Stage 03 (Normalization) | Seleccionar mejor fuente por dominio |
| `summary.total` | Evidence Artifact | Métricas de trazabilidad |
| `summary.successful` | PipelineEngine | Evaluación de completitud |
| `summary.failed` | PipelineEngine, Evidence Artifact | Detección de problemas |
| `summary.out_of_coverage` | Evidence Artifact | Métricas de cobertura |
| `summary.sum_of_durations_ms` | Evidence Artifact (solo trazabilidad) | No consumido funcionalmente |

### 5.2 Propagación en el engine

```javascript
// engine.js:44
Object.assign(pipelineState, result);
```

`Object.assign` mergea `sources_consulted` y `summary` en `pipelineState`, haciendo que estén disponibles para todos los stages posteriores sin pasar explícitamente como argumento.

---

## 6. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **`out_of_coverage` contado como exitoso** | La fuente respondió correctamente — no tener datos es un resultado válido | Claridad semántica | Confusión posible si un operador lee `successful: 11` cuando 2 fuentes no contribuyeron datos |
| **`sum_of_durations_ms` renombrado desde `duration_ms`** | Eliminar ambigüedad entre "compute work" y "wall-clock" | Nombre descriptivo | Breaking change menor (corregido en spec) |
| **Propagación vía `Object.assign`** | Simple, sin pasar argumentos explícitamente | Simplicidad | Efecto colateral: `pipelineState` se muta |

---

## 7. Limitaciones

### 7.1 `sum_of_durations_ms` no refleja tiempo real

**Descripción**: El campo representa la suma de duraciones individuales de adapters que corrieron en paralelo.

**Impacto**: Métrica engañosa si se interpreta como "cuánto tardó el stage".

**Mitigación**: El `duration_ms` del artifact del stage (via `wrapArtifact()` en `stage-interface.js`) sí mide wall-clock real.

### 7.2 `Object.assign` muta `pipelineState`

**Descripción**: La propagación de resultados se hace vía mutación del objeto compartido.

**Impacto**: Efecto colateral que puede causar confusión en debugging.

---

## 8. Referencias

- ECMA International. (2024). *ECMAScript® 2025 Language Specification — Object.assign*. ECMA-262.
