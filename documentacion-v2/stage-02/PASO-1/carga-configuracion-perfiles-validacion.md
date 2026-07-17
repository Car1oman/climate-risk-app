# PASO-1 — Carga de Perfiles de Validación y Configuración

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `getValidationProfiles()`, `getMaxDistancesForSource()`, `getSourceConfig()` |
| **Ubicación** | `pipeline/orchestration/config-loader.js` (funciones), `pipeline/config/validation-profiles.json`, `pipeline/config/spatial-decorrelation.json`, `pipeline/config/authoritative-sources.json` |
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del primer paso de Stage 02: carga de configuración que sustenta todas las reglas de validación |

---

## 1. Resumen Ejecutivo

PASO-1 es el punto de entrada de configuración de Stage 02. Antes de que cualquier regla de validación se ejecute, `Stage02Validation.execute()` llama a `getValidationProfiles()` para obtener los perfiles de validación que definen: rangos físicos por variable, valores fill por fuente, umbrales de completitud por tipo de dominio, métricas de calidad de datos, pruebas de consistencia temporal y configuración de cobertura espacial.

Esta configuración se carga desde tres archivos JSON en `pipeline/config/`, cada uno con un dominio de responsabilidad claro y todas sus referencias normativas documentadas inline. El sistema de cache de `config-loader.js` evita I/O de disco redundante en ejecuciones consecutivas.

**Pre-condición obligatoria**: Sin configuración válida, el pipeline no puede ejecutar ninguna regla de validación y falla con error fatal.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
PipelineEngine.run(input)                                          // engine.js:22
  │
  └── Stage02Validation.execute(input)                             // index.js:122
        │
        ├── getValidationProfiles()                                // ← PASO 1A: config-loader.js
        │     ├── loadConfig("validation-profiles.json")
        │     │     ├── Cache hit? → return cached
        │     │     └── Cache miss: readFileSync → JSON.parse → cache.set(TTL 60s)
        │     └── return { schema, fill_values, physical_ranges, completeness, ... }
        │
        ├── getSourceConfig(source.source_name)                   // ← PASO 1B: config-loader.js
        │     └── lookup authoritative-sources.json → { domain, resolution, ... }
        │
        └── [for each source] evaluateCoverage(source)            // PASO-7
              └── getMaxDistancesForSource(source.source_name)    // ← PASO 1C: config-loader.js
                    ├── loadConfig("spatial-decorrelation.json")
                    └── return [{ variable, maxDistanceKm }, ...] per variable
```

### 2.2 Flujo de datos

```
validation-profiles.json (disco)
        │
        ├── [cache miss] → readFileSync → JSON.parse → cache (Map, TTL 60s)
        └── [cache hit] → return cached.value
              │
              └── getValidationProfiles()
                    │
                    ├── .schema                    → Variables canónicas y unidades
                    ├── .fill_values.per_source    → Sentinelas por fuente
                    ├── .physical_ranges           → Rangos WMO/SENAMHI por variable
                    ├── .completeness.thresholds   → Umbrales GCOS-245 por tipo dominio
                    ├── .data_quality_metrics.qc_tests → Pruebas step/persistence
                    ├── .spatial_coverage          → Configuración de decorrelación
                    └── .temporal_consistency      → Pruebas de integridad temporal
```

---

## 3. Descripción Detallada del Flujo

### 3.1 Entry point: `Stage02Validation.execute()` (index.js:122-141)

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

**Observaciones clave**:
- `getValidationProfiles()` se llama una sola vez antes del loop — el cache TTL de 60s garantiza que todas las fuentes se validan con la misma versión de configuración
- `validateSource()` (PASO-2) y `evaluateCoverage()` (PASO-7) se ejecutan secuencialmente por cada fuente
- El input `sources_consulted` viene de Stage 01 (acquisition)

### 3.2 Configuración cargada: validation-profiles.json

**Ubicación**: `pipeline/config/validation-profiles.json` (372 líneas, ~14KB)

| Sección | Contenido | Consumidores |
|---|---|---|
| `schema` | 18 variables canónicas con unidad y descripción | Referencia documental, no consumida por código |
| `fill_values.per_source` | 8 fuentes con paths y sentinels específicos | `validateFillValues()` (PASO-3) |
| `physical_ranges` | 12 variables con `valid_range` y `peru_range` | `validatePhysicalRanges()` (PASO-4) |
| `completeness.thresholds` | 4 tipos de dominio (climate/geophysical/socioeconomic/index) | `validateCompleteness()` (PASO-5), `validateTemporalConsistency()` (PASO-6) |
| `data_quality_metrics.qc_tests` | step_test y persistence_test (definidos, no consumidos) | Placeholder para futura implementación |
| `spatial_coverage` | Metadatos de referencia del modelo de decorrelación | Referencia documental |
| `temporal_consistency` | Configuración de expected_range_of_dates por fuente | Placeholder (no consumido por código actual) |

### 3.3 Mecanismo de cache (config-loader.js)

```javascript
const cache = new Map();
const CACHE_TTL_MS = 60_000;

function loadConfig(filename) {
  const cached = cache.get(filename);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;                              // HIT: retorna sin I/O
  }
  // MISS: lee de disco
  const filepath = join(CONFIG_DIR, filename);
  if (!existsSync(filepath)) {
    throw new Error(`Config file not found: ${filename}`);
  }
  const raw = readFileSync(filepath, "utf-8");
  const parsed = JSON.parse(raw);
  cache.set(filename, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
  return parsed;
}
```

**Decisiones de diseño:**

| Decisión | Justificación | Sustento |
|---|---|---|
| **Cache en memoria (Map)** | Evitar I/O síncrono en ejecuciones consecutivas | Bajo volumen (~100 consultas/día), config tiny (~14KB) |
| **TTL de 60 segundos** | Hot-reload en desarrollo sin overhead | Archivos no cambian en runtime |
| **`readFileSync`** | Simplificar flujo | Archivo pequeño, ~0.1ms bloqueo irrelevante |

### 3.4 `getMaxDistancesForSource()` (config-loader.js)

Retorna las distancias máximas de decorrelación por variable para una fuente dada, consumiendo `spatial-decorrelation.json`:

```javascript
function getMaxDistancesForSource(sourceName) {
  const decorrelation = loadConfig("spatial-decorrelation.json");
  const variables = decorrelation.variables || {};
  const sourceConfig = getSourceConfig(sourceName);
  if (!sourceConfig) return [];

  const domain = sourceConfig.domain;
  const matchingVars = [];
  for (const [varName, varConfig] of Object.entries(variables)) {
    if (varConfig.domains && varConfig.domains.includes(domain)) {
      matchingVars.push({
        variable: varName,
        maxDistanceKm: varConfig.max_distance_km,
      });
    }
  }
  return matchingVars;
}
```

**Fórmula de decorrelación**: `d_max = -L × ln(θ)` donde:
- `L` = `decorrelation_length_km` (variable por fuente)
- `θ` = 0.5 (umbral de correlación mínima aceptable)

Referencia: Isaaks & Srivastava (1989), Chapter 5; Journel & Huijbregts (1978).

---

## 4. Archivos de Configuración

### 4.1 validation-profiles.json — Estructura completa

```json
{
  "_version": "2.0.0",
  "schema": { ... },
  "fill_values": {
    "per_source": {
      "weatherapi": { "paths": {...}, "standard": "..." },
      "nasa_power": { "paths": {...}, "standard": "..." },
      ...
    }
  },
  "physical_ranges": {
    "air_temperature_current": {
      "valid_range": { "min": -90, "max": 60 },
      "peru_range": { "min": -25, "max": 45 },
      "reference": { "global_range": "...", "peru_range": "..." }
    },
    ...
  },
  "completeness": {
    "thresholds": {
      "climate": { "good": 0.95, "acceptable": 0.80, "degraded": 0.50 },
      "geophysical": { "good": 0.99, "acceptable": 0.95, "degraded": 0.80 },
      "socioeconomic": { "good": 1.0, "acceptable": 0.75, "degraded": 0.50 },
      "index": { "good": 1.0, "acceptable": 0.90, "degraded": 0.50 }
    }
  }
}
```

### 4.2 Referencias normativas por sección

| Sección | Estándar | Referencia |
|---|---|---|
| `fill_values` | CF Conventions 1.12 §2.5.1 | `_FillValue` y `missing_value` son atributos por variable, no globales |
| `physical_ranges` | WMO No. 8 (2018) Ch. 3; IPCC AR6 WG1 Ch. 2 | Rangos de observación meteorológica |
| `physical_ranges.peru_range` | SENAMHI (2021) "Climas del Perú" | Extremos observados por estación 1961-2020 |
| `completeness` | GCOS-200 (2022) Principle 10; GCOS-245 (2022/2025) | Sistema de tres niveles Threshold/Breakthrough/Goal |
| `completeness` | WMO No. 100 (2018) §2.3.2 | Monthly ≥80% daily obs, Annual ≥90% monthly |
| `completeness.degraded` | Carro-Calvo et al. (2020) | Clustering funciona con 45% completitud |
| `completeness.degraded` | Shabalala et al. (2019) | Interpolación espacial requiere >80% |
| `completeness.thresholds.socioeconomic.good` | HALLAZGO-16 evaluación | 1.0 mantenido: worldbank.js absorbe rezago documentado |
| `temporal_consistency` | ISO 19157:2013 §6.1.3; WMO No. 100 Ch. 5 | Consistencia temporal |
| `spatial_coverage` | Isaaks & Srivastava (1989); Journel & Huijbregts (1978) | Modelo de decorrelación espacial |

### 4.3 Decisiones de diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **3 archivos JSON separados** | Separación de responsabilidades: validación, decorrelación, fuentes | Gobernanza, revisión científica por dominio | 3 puntos de carga, mitigado por cache |
| **Umbrales por tipo de dominio** | Variables climáticas, geofísicas y socioeconómicas tienen tolerancias diferentes | Precisión en clasificación | Mantener 4 configuraciones synchronizadas |
| **`peru_range` como segunda capa** | No reemplaza `valid_range` global; lo complementa con datos SENAMHI | Detección de anomalías subnacionales | Mantener referencias de estaciones actualizadas |
| **`_warning_ranges_removed`** | Rangos genéricos sin respaldo en WMO/GCOS eliminados en v2.0 | Integridad científica | Funcionalidad de warning perdida (recuperada con peru_range en H-35) |
| **climatological_limit_test eliminado** | Código muerto: ningún adapter pobló `source.climatology` | Limpieza | Requiere fuente de datos (P1/P95) para reimplementar |

---

## 5. Limitaciones y Riesgos

### 5.1 Cache TTL de 60 segundos

**Descripción**: Los archivos de configuración se cachean por 60 segundos. Si se modifican durante una ejecución, el cambio tarda hasta 60s en reflejarse.

**Impacto**: Mínimo. Los archivos de configuración no cambian en runtime de producción.

**Mitigación**: En desarrollo, el TTL permite hot-reload razonable.

### 5.2 `readFileSync` bloqueante

**Descripción**: `loadConfig()` usa `readFileSync`, que bloquea el event loop.

**Impacto**: ~0.1ms por archivo × 3 archivos = ~0.3ms total. Irrelevante para volumen actual (1-100 consultas/día).

**Riesgo**: Bajo. Si escala a miles de consultas concurrentes, migrar a `fs.promises.readFile`.

### 5.3 Validación solo estructural, no semántica

**Descripción**: Zod verifica forma del JSON, pero no valida que las referencias (ej: estaciones SENAMHI) existan realmente.

**Impacto**: Error tipográfico en una referencia pasa desapercibido.

**Mitigación**: Tests de consistencia en `tests-new/pipeline/stages/` verifican estructura.

### 5.4 Configuración no versionada con el código

**Descripción**: Los archivos JSON de configuración se cargan desde disco en runtime, no están importados estáticamente.

**Impacto**: Un cambio de configuración no se detecta como "parte del commit" automáticamente.

**Mitigación**: El pipeline falla si falta cualquier archivo (fail-fast).

---

## 6. Auditoría de Consistencia

### 6.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| Cache TTL | 60,000ms (`config-loader.js`) | 60 segundos | ✅ Consistente |
| 3 archivos cargados | `validation-profiles.json`, `spatial-decorrelation.json`, `authoritative-sources.json` | Documentados | ✅ Consistente |
| `getValidationProfiles()` | Exportada, consumida por `Stage02Validation` | Documentada en §3.1 | ✅ Consistente |
| `getMaxDistancesForSource()` | Exportada, consumida por `evaluateCoverage()` | Documentada en §3.4 | ✅ Consistente |
| Fórmula decorrelación | `d_max = -L × ln(θ)`, θ=0.5 | Documentada en §3.4 | ✅ Consistente |
| Thresholds de completitud | 4 tipos de dominio | Documentados en §4.1 | ✅ Consistente |

### 6.2 Consumidores de la configuración

| Componente | Invocación | Consumo |
|---|---|---|
| `Stage02Validation.execute()` | `getValidationProfiles()` | Perfiles de validación completos |
| `Stage02Validation.validateFillValues()` | `profiles.fill_values.per_source[name]` | Sentinelas por fuente |
| `Stage02Validation.validatePhysicalRanges()` | `profiles.physical_ranges[variable]` | Rangos físicos por variable |
| `Stage02Validation.validateCompleteness()` | `profiles.completeness.thresholds[domainType]` | Umbrales por tipo dominio |
| `Stage02Validation.validateTemporalConsistency()` | `profiles.completeness.thresholds.climate` / `.index` | Severity scaling |
| `Stage02Validation.evaluateCoverage()` | `getMaxDistancesForSource(name)` | Distancias máximas por variable |
| `Stage02Validation.classifyDomain()` | (interno) | Mapeo sourceDomain → domainType |

---

## 7. Conclusiones

### 7.1 ¿El diseño es técnicamente sólido?

Sí. PASO-1 implementa un sistema de configuración maduro y bien fundamentado. Cada regla de validación tiene referencias normativas explícitas (WMO No. 8, GCOS-200/245, SENAMHI), y el sistema de cache con TTL evita overhead innecesario sin sacrificar frescura.

### 7.2 Fortalezas

1. **Trazabilidad completa**: Cada sección del JSON tiene `_standard` y `reference` que justifican sus valores
2. **Separación de responsabilidades**: 3 archivos JSON con dominios claros (validación, decorrelación, fuentes)
3. **Fail-fast**: Si cualquier archivo falta, el pipeline falla inmediatamente
4. **Cache simple**: TTL de 60s evita I/O redundante sin mecanismos complejos
5. **Umbrales por tipo de dominio**: Reconoce que climáticas, geofísicas y socioeconómicas tienen tolerancias diferentes

### 7.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| `readFileSync` bloqueante | ~0.3ms total, irrelevante para volumen actual | Baja |
| Sin invalidación por cambio de archivo | TTL fijo, no detecta cambios en disco | Baja |
| qc_tests definidos pero no consumidos | Funcionalidad placeholder sin implementar | Baja (documentado) |
| `temporal_consistency.expected_range_of_dates` no consumido | Configuración documentada pero sin lector | Baja (documentado) |

---

## 8. Referencias

- CF Conventions 1.12 (2023). Section 2.5.1: `_FillValue` and `missing_value`. https://cfconventions.org/Data/cf-conventions/cf-conventions-1.12/cf-conventions.html#_missing-data
- WMO (2018). *Guide to Instruments and Methods of Observation* (WMO-No. 8). Chapter 3.
- IPCC (2021). *Climate Change 2021: The Physical Science Basis* (AR6 WG1). Chapter 2.
- GCOS (2022). *The Global Observing System for Climate: Implementation Needs* (GCOS-200). WMO/TD-No. 1538.
- GCOS (2022/2025). *ECV Requirements* (GCOS-245). Three-tier system.
- WMO (2018). *Guide to Climatological Practices* (WMO-No. 100). Chapter 2.
- SENAMHI (2021). *Climas del Perú: Mapa de Clasificación Climática Nacional*.
- Isaaks, E.H. & Srivastava, R.M. (1989). *An Introduction to Applied Geostatistics*. Oxford University Press.
- Journel, A.G. & Huijbregts, C.J. (1978). *Mining Geostatistics*. Academic Press.
- Carro-Calvo et al. (2020). k-Gaps: a novel technique for clustering incomplete climatological time series. *Theoretical and Applied Climatology*.
- Shabalala et al. (2019). Evaluation of Infilling Methods for Time Series of Daily Temperature Data. *Climate*.
