# Stage 03 — Normalización

## Propósito

Seleccionar la mejor fuente de datos por dominio (precipitación, temperatura, etc.) mediante scoring cuantitativo, extraer variables del adaptador ganador, completar la serie temporal de forma completa-aware (sin inyectar sesgo por faltantes), derivar cobertura espacial por variable, y entregar un paquete normalizado listo para que Stage 04 (señales) lo consuma.

## Arquitectura del stage

```
index.js (Normalizer)
│
├─ run()
│   ├─ PASO 1: loadConfig()          → configCache, profile
│   ├─ PASO 2: _filterAndGroup()     → domainGroups
│   ├─ PASO 3: _scoreSources()       → scored, decisions, spatialCoverage
│   │   ├─ _scoreSourcePair()
│   │   ├─ _applyAuthorityGate()
│   │   ├─ _computeSensitivity()
│   │   └─ _buildSourceDecisions()
│   ├─ PASO 4: _extractVariablesFromSource()  → normalized[]
│   │   ├─ _extractCmip6HorizonSlice()
│   │   ├─ _extractAdaptedVariables()
│   │   ├─ _extractSingleVariable()
│   │   ├─ _resolveWorldBankIndicator()
│   │   ├─ _testMissingnessRandomness()  ← Wald-Wolfowitz MCAR check
│   │   ├─ _aggregateCompletenessAware()
│   │   ├─ _fillRemainingYears()
│   │   └─ _deriveSpatialCoverageForVariable()
│   ├─ PASO 5: _computeSpatialCoverage()  → spatialCoverage[]
│   ├─ PASO 6: _buildVariable()       → variable
│   └─ PASO 7: _buildOutput()         → { variables, source_decisions, metadata }
│
├─ canonical-schema.js (CanonicalVariableBuilder)
│   ├─ buildVariable()
│   ├─ classifyCompleteness()
│   ├─ buildSpatialCoverage()
│   ├─ buildMethodology()
│   ├─ _validateVariable()
│   ├─ _validateVariableDomain()
│   └─ _validateVariableHorizon()
│
├─ Config files (pipeline/config/):
│   ├─ spatial-decorrelation.json    ← theta, decorrelation_length_km, d_max model
│   ├─ thresholds.json               ← signal activation, horizon years
│   ├─ validation-profiles.json      ← physical ranges, fill rules, completeness
│   ├─ resolution-profiles.json      ← decay model, sector requirements
│   ├─ authoritative-sources.json    ← source registry, authority levels, CMIP6 ensemble
│   └─ adaptive-capacity.json        ← normalization bounds, scoring rules
│
└─ Shared modules (pipeline/shared/):
    ├─ enso-classification.js        ← Trenberth/NOAA CPC 5-season rule
    └─ horizons.js                   ← Horizon window calculation (short/medium/long)
```

## Dependencias de entrada

| Origen | Campo | Descripción |
|--------|-------|-------------|
| Stage 02 | `metadata.departments`, `metadata.districts`, `metadata.stations` | Listas de IDs normalizados |
| Stage 02 | `metadata.sources` | Fuentes aprobadas con adapter, priority, authority_level |
| Stage 02 | `metadata.request` | { departments, districts, date_range } |
| Stage 02 | `metadata.data_requirements` | { variables, minimum_coverage_years, temporal_resolution } |
| Config | `authoritative-sources.json` | Registry de fuentes conocidas, priority, authority_level |
| Config | `spatial-decorrelation.json` | Theta y d_max por variable |
| Config | `thresholds.json` | minimum_completeness_years, horizon_years |
| Config | `validation-profiles.json` | physical_ranges, fill rules, completeness thresholds |
| Config | `resolution-profiles.json` | Resolution decay model |
| Config | `adaptive-capacity.json` | Normalization bounds |
| Shared | `enso-classification.js` | ENSO phase per date |
| Shared | `horizons.js` | Horizon window start year |

## Output

El stage produce un objeto con esta estructura:

```javascript
{
  variables: [/* Array de objetos Variable */],
  source_decisions: [/* Decisiones de selección por dominio */],
  spatial_coverage: [/* Cobertura espacial por variable */],
  metadata: {
    timestamp: "ISO-8601",
    stage: "03-normalization",
    total_variables: number,
    departments: string[],
    districts: string[],
    stations: string[]
  }
}
```

## Resumen de los 7 pasos

| Paso | Nombre | Responsabilidad clave |
|------|--------|----------------------|
| 1 | Carga de configuración | Cachear config, construir profile de validación, mapear dominio→fuentes |
| 2 | Filtrado y agrupación | Separar fuentes registradas (priority≥0) de no registradas (priority=0), agrupar por dominio |
| 3 | Scoring y selección | Score por dimensiones (completeness, proximity, resolution), authority gate, sensitivity analysis |
| 4 | Extracción de variables | Loop por fuente→variable, completeness-aware aggregation, MCAR test, CMIP6 horizon slicing, world_bank extraction |
| 5 | Cobertura espacial | Derivar cobertura por variable usando decorrelation model |
| 6 | Construcción de variable | CanonicalVariableBuilder, validación, methodology |
| 7 | Output | Ensamblar paquete final para Stage 04 |

## Auditorías

Ver `AUDITORIA-stage-03-normalization.md` para hallazgos de calidad y su resolución.
