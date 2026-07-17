# PASO-1 — Carga de Configuración y Perfil de Validación

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `loadConfig()`, `getValidationProfiles()`, `getSpatialDecorrelationConfig()` |
| **Ubicación** | `pipeline/stages/03-normalization/index.js` (métodos internos), `pipeline/orchestration/config-loader.js` |
| **Stage** | Stage 03 — Normalization (ID: 3) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del primer paso de Stage 03: carga de configuración que sustenta scoring, agregación y cobertura espacial |

---

## 1. Resumen Ejecutivo

PASO-1 es el punto de entrada de configuración de Stage 03. Antes de que cualquier fuente se evalúe, se cargan y cachean seis archivos de configuración que definen: dominio→fuente mapping, umbrales de completitud, rangos físicos, reglas de fill, parámetros de decorrelación espacial, modelo de decaimiento de resolución, y reglas de scoring.

El sistema de cache de `config-loader.js` evita I/O de disco redundante en ejecuciones consecutivas. Cada archivo tiene un dominio de responsabilidad claro y todas sus referencias normativas documentadas inline.

**Pre-condición obligatoria**: Sin configuración válida, Stage 03 no puede ejecutar scoring ni agregación y falla con error fatal.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
PipelineEngine.run(input)                                              // engine.js:22
  │
  └── Stage03Normalization.execute(input)                              // index.js:150
        │
        ├── loadConfig()                                                // ← PASO 1: index.js
        │     ├── configLoader.getValidationProfiles()                 // validation-profiles.json
        │     ├── configLoader.loadConfig("spatial-decorrelation.json")
        │     ├── configLoader.loadConfig("thresholds.json")
        │     ├── configLoader.loadConfig("resolution-profiles.json")
        │     ├── configLoader.loadConfig("authoritative-sources.json")
        │     ├── configLoader.loadConfig("adaptive-capacity.json")
        │     └── _buildDomainSourceMap()                              // dominio→fuentes mapping
        │
        ├── _filterAndGroup(sources)                                   // ← PASO 2
        ├── _scoreSources(domainGroups)                                // ← PASO 3
        ├── _extractVariablesFromSource(...)                           // ← PASO 4
        │     ├── _testMissingnessRandomness()                         // Wald-Wolfowitz MCAR check
        │     ├── _aggregateCompletenessAware()
        │     ├── _fillRemainingYears()
        │     └── _deriveSpatialCoverageForVariable()
        ├── _computeSpatialCoverage(...)                               // ← PASO 5
        └── _buildOutput(...)                                          // ← PASO 7
```

### 2.2 Flujo de datos

```
config/ (disco)
  │
  ├── authoritative-sources.json ─→ SOURCE_REGISTRY (Map<sourceName, sourceDef>)
  │                                  SOURCE_FILL_VALUES (Map<sourceName, fillValues[]>)
  │                                  SOURCE_DOMAIN_MAP (Map<domainType, sourceNames[]>)
  │
  ├── validation-profiles.json ──→ profile.completeness (thresholds climate/degraded)
  │                                 profile.physical_ranges (rangos WMO/SENAMHI)
  │                                 profile.fill_values.per_source (sentinelas)
  │                                 profile.data_quality_metrics
  │                                 profile.spatial_coverage
  │
  ├── spatial-decorrelation.json ─→ SPATIAL_CONFIG.theta (decay exponent)
  │                                  SPATIAL_CONFIG.decorrelation_length_km (por variable)
  │                                  SPATIAL_CONFIG.d_max_model (distancia máxima)
  │
  ├── thresholds.json ──────────→ minimum_completeness_years (default: 20)
  │                                horizon_years (short: 10, medium: 20, long: 30)
  │
  ├── resolution-profiles.json ─→ RESOLUTION_CONFIG.decay_model (exponential)
  │                                 RESOLUTION_CONFIG.sector_requirements (minima por sector)
  │
  └── adaptive-capacity.json ───→ NORMALIZATION_CONFIG.bounds (min_resolution_km, etc.)
                                   NORMALIZATION_CONFIG.scoring (equal_weight, etc.)
```

---

## 3. Descripción Detallada del Flujo

### 3.1 Entry point: `Stage03Normalization.execute()` (index.js:150-185)

```javascript
execute(input) {
  const { metadata } = input;
  const configCache = this.loadConfig();                          // PASO 1
  const domainGroups = this._filterAndGroup(metadata.sources);   // PASO 2
  const scored = this._scoreSources(domainGroups, configCache);  // PASO 3
  // ... extracción, agregación, cobertura ...
  return this._buildOutput(normalized, sourceDecisions, spatialCoverage, metadata);  // PASO 7
}
```

**Observaciones clave**:
- `loadConfig()` se llama una sola vez antes del loop — el cache TTL de 60s garantiza que todas las fuentes se evalúan con la misma versión de configuración
- `_filterAndGroup()` (PASO-2) y `_scoreSources()` (PASO-3) se ejecutan secuencialmente
- `_extractVariablesFromSource()` (PASO-4) se ejecuta por cada fuente candidata, pero solo para la fuente ganadora se completa la serie temporal

### 3.2 `loadConfig()` (index.js:155-175)

```javascript
loadConfig() {
  const profile = this._configLoader.getValidationProfiles();
  const spatialConfig = this._configLoader.loadConfig("spatial-decorrelation.json");
  const thresholds = this._configLoader.loadConfig("thresholds.json");
  const resolutionConfig = this._configLoader.loadConfig("resolution-profiles.json");
  const sourceRegistry = this._configLoader.loadConfig("authoritative-sources.json");
  const adaptiveCapacity = this._configLoader.loadConfig("adaptive-capacity.json");

  this._validationProfiles = profile;
  this._spatialConfig = spatialConfig;
  this._thresholds = thresholds;
  this._resolutionConfig = resolutionConfig;
  this._sourceRegistry = sourceRegistry;
  this._adaptiveCapacity = adaptiveCapacity;

  // Construir mappings derivados
  this._buildDomainSourceMap(sourceRegistry);
  this._buildSourceFillValues(profile);

  return {
    profile, spatialConfig, thresholds, resolutionConfig,
    sourceRegistry, adaptiveCapacity,
  };
}
```

**Parámetros cargados**:

| Archivo | Constante interna | Tipo | Descripción |
|---------|-------------------|------|-------------|
| `authoritative-sources.json` | `SOURCE_REGISTRY` | `Map<string, object>` | Definición por fuente: domain, resolution, priority, authority_level |
| `authoritative-sources.json` | `SOURCE_FILL_VALUES` | `Map<string, number[]>` | Valores sentinela por fuente (ej. [null] → usa GLOBAL) |
| `authoritative-sources.json` | `SOURCE_DOMAIN_MAP` | `Map<string, string[]>` | Mapeo dominio→lista de fuentes |
| `validation-profiles.json` | `this._validationProfiles` | `object` | Thresholds, physical_ranges, fill_values, spatial_coverage |
| `spatial-decorrelation.json` | `this._spatialConfig` | `object` | Theta, decorrelation_length_km, d_max_model |
| `thresholds.json` | `this._thresholds` | `object` | minimum_completeness_years, horizon_years |
| `resolution-profiles.json` | `this._resolutionConfig` | `object` | Decay model, sector requirements |
| `adaptive-capacity.json` | `this._adaptiveCapacity` | `object` | Normalization bounds, scoring rules |

### 3.3 `_buildDomainSourceMap()` (index.js)

Construye `SOURCE_DOMAIN_MAP` desde `authoritative-sources.json`:

```javascript
_buildDomainSourceMap(sourceRegistry) {
  this._domainSourceMap = new Map();
  for (const [sourceName, sourceDef] of Object.entries(sourceRegistry)) {
    const domain = sourceDef.domain;
    if (!this._domainSourceMap.has(domain)) {
      this._domainSourceMap.set(domain, []);
    }
    this._domainSourceMap.get(domain).push(sourceName);
  }
}
```

### 3.4 `_buildSourceFillValues()` (index.js)

Construye `SOURCE_FILL_VALUES` desde `validation-profiles.json`:

```javascript
_buildSourceFillValues(profile) {
  this._sourceFillValues = new Map();
  const perSource = profile?.fill_values?.per_source || {};
  for (const [sourceName, fills] of Object.entries(perSource)) {
    this._sourceFillValues.set(sourceName, fills);
  }
}
```

---

## 4. Archivos de Configuración

### 4.1 `authoritative-sources.json`

**Responsabilidad**: Registry de fuentes conocidas, priority, authority_level, dominio, resolución.

**Estructura por fuente**:
```json
{
  "senamhi_daily": {
    "domain": "precipitation",
    "resolution": "daily",
    "priority": 1,
    "authority_level": "primary",
    "adapter": "senamhi",
    "fill_values": [-999.9, -32768],
    "cmip6_ensemble": ["MPI-ESM1-2-HR", "EC-Earth3"]
  }
}
```

**Campos relevantes**:
- `priority`: Nivel de autoridad (≥1 = registrada, 0 = no registrada)
- `authority_level`: `"primary"` o `"complementary"`
- `adapter`: Nombre del adaptador a invocar
- `domain`: Tipo de dominio climático
- `fill_values`: Valores sentinela conocidos para esta fuente

### 4.2 `validation-profiles.json`

**Responsabilidad**: Rangos físicos, reglas de fill, umbrales de completitud, pruebas de calidad.

**Secciones relevantes para Stage 03**:
- `completeness.thresholds.climate`: `{ degraded: 0.50, acceptable: 0.75 }` — usados para adaptive threshold
- `fill_values.per_source`: Mapa de sentinela por fuente
- `physical_ranges`: Rangos WMO/SENAMHI por variable (validación post-agregación)

### 4.3 `spatial-decorrelation.json`

**Responsabilidad**: Parámetros del modelo de decorrelación espacial.

```json
{
  "theta": 0.01,
  "decorrelation_length_km": {
    "precipitation": 50,
    "temperature": 200
  },
  "d_max_model": {
    "precipitation": 150,
    "temperature": 600
  }
}
```

**Parámetros**:
- `theta`: Exponente de decaimiento exponencial (configurable)
- `decorrelation_length_km`: Distancia a la cual la correlación cae a 1/e por variable
- `d_max_model`: Distancia máxima de influencia por variable

### 4.4 `thresholds.json`

**Responsabilidad**: Umbrales de completitud y ventanas de horizonte.

```json
{
  "minimum_completeness_years": 20,
  "horizon_years": {
    "short": 10,
    "medium": 20,
    "long": 30
  }
}
```

### 4.5 `resolution-profiles.json`

**Responsabilidad**: Modelo de decaimiento de resolución, requerimientos mínimos por sector.

```json
{
  "decay_model": "exponential",
  "sector_requirements": {
    "agriculture": { "min_resolution_km": 10 },
    "infrastructure": { "min_resolution_km": 5 }
  }
}
```

### 4.6 `adaptive-capacity.json`

**Responsabilidad**: Límites de normalización, reglas de scoring.

```json
{
  "bounds": {
    "min_resolution_km": 1,
    "max_resolution_km": 100000
  },
  "scoring": {
    "equal_weight": true,
    "dimensions": ["completeness", "proximity", "resolution_score"]
  }
}
```

---

## 5. Constantes Críticas

| Constante | Valor | Fuente | Descripción |
|-----------|-------|--------|-------------|
| `COMPLETENESS_THRESHOLD_DEFAULT` | 0.75 | `validation-profiles.json` | Umbral mínimo de completitud para aceptar una fuente |
| `GLOBAL_FILL_VALUES` | `new Set([-9999, -32768, -99999])` | `index.js` | Valores sentinela globales para fuentes no registradas |
| `MCAR_MIN_N` | 8 | `index.js` | Mínimo de observaciones para ejecutar test de rachas |
| `MCAR_MIN_PER_GROUP` | 2 | `index.js` | Mínimo de válidos/faltantes para test de rachas |
| `MCAR_ALPHA` | 0.05 | `index.js` | Nivel de significancia para test de Wald-Wolfowitz |
| `ADAPTIVE_THRESHOLD_MAX_COUNT` | 20 | `index.js` | Número de puntos para alcanzar umbral completo |

---

## 6. Tabla de Impacto

| Componente | Tipo de cambio | Riesgo si falla | Dependencia |
|------------|---------------|-----------------|-------------|
| `loadConfig()` | Inicialización | Stage 03 completo falla | Ninguna |
| `_buildDomainSourceMap()` | Mapping | Fuentes no se agrupan por dominio | `authoritative-sources.json` |
| `_buildSourceFillValues()` | Mapping | Fill values no se reconocen | `validation-profiles.json` |
| `configLoader.getValidationProfiles()` | I/O cache | Perfil inválido → scoring incorrecto | `config-loader.js` |
| `configLoader.loadConfig()` | I/O cache | Config faltante → constants undefined | `config-loader.js` |

---

## 7. Supuestos y Limitaciones

1. **Cache TTL fijo de 60 segundos**: Todas las fuentes se evalúan con la misma versión de configuración. Si la configuración cambia durante una ejecución en curso, el cambio no se refleja hasta la siguiente ejecución.

2. **`SOURCE_DOMAIN_MAP` se construye desde `authoritative-sources.json`**: Fuentes no registradas en este archivo no aparecen en el mapping y son tratadas como "no dominio" → se descartan en PASO-2.

3. **`GLOBAL_FILL_VALUES` es un `Set` estático**: No se extiende dinámicamente desde la configuración. Las fuentes no registradas siempre usan `[-9999, -32768, -99999]` como sentinelas.

4. **`COMPLETENESS_THRESHOLD_DEFAULT` se usa como fallback**: Si `validation-profiles.json` no define `completeness.thresholds.climate.acceptable`, se usa 0.75.

---

## 8. Trazabilidad

| Referencia | Ubicación |
|------------|-----------|
| H-1.1 (Carga de configuración) | Auditoría Stage 03, hallazgo 1.1 |
| H-1.2 (Dominio→fuente mapping) | Auditoría Stage 03, hallazgo 1.2 |
| H-4.2 (GLOBAL_FILL_VALUES incompleto) | Auditoría Stage 03, hallazgo 4.2 — RESUELTO: ahora incluye -32768 y -99999 |
| Config cache TTL | `pipeline/orchestration/config-loader.js` |
