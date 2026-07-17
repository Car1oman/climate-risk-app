# PASO-1 — Carga de Configuración y Mapeos

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `getThresholds()`, `getAdaptiveCapacityConfig()`, `getSectorProfiles()`, constantes de mapeo |
| **Ubicación** | `pipeline/orchestration/config-loader.js`, `pipeline/stages/06-risk/index.js:9-69` |
| **Stage** | Stage 06 — Risk Assessment (ID: 6) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación de la carga de configuración, mapeos estáticos y tablas de conversión que sustentan todos los cálculos de riesgo |

---

## 1. Resumen Ejecutivo

PASO-1 carga y cachea tres archivos de configuración (thresholds.json, adaptive-capacity.json, sector-profiles.json) e inicializa tres mapeos estáticos que conectan: (1) indicadores de CA con variables canónicas del pipeline; (2) fenómenos con fuentes externas de probabilidad; y (3) la tabla de conversión confidence→probability usada como fallback. El cache de config-loader.js (TTL 60s) evita I/O redundante.

---

## 2. Archivos de Configuración

### 2.1 `thresholds.json`

**Secciones consumidas por Stage 06**:

| Sección | Campos clave | Uso en Stage 06 |
|---------|-------------|-----------------|
| `risk_classification` | low_max=2, medium_max=4, catastrophic_multiplier=1.5, catastrophic_impact_threshold=5 | classifyRisk(), classifyCatastrophic() |
| `confidence_to_probability` | mapping: [[0.0,1],[0.2,2],[0.4,3],[0.6,4],[0.8,5]] | calculateProbability() — mapeo P |
| `impact_calculation` | sensitivity_scale_factor=4, sensitivity_scale_offset=1, exposure_bands | calculateImpact() — sensibilidad y exposición |
| `horizon_years` | short=5, medium=10, long=30 | classifyHorizon() — corte operativo/estrategico |
| `adaptive_capacity` | default=3, min_indicators_required=3 | Fallback CA=null y umbral de indicadores |
| `evaluation_coverage_requirements` | scenarios_required=2, horizons_required=3 | computeEvaluationCoverage() — cobertura contractual |

### 2.2 `adaptive-capacity.json`

**Sección consumida por Stage 06**:

| Campo | Valor | Uso |
|-------|-------|-----|
| `indicators[]` | 5 indicadores (poverty_rate, gdp_per_capita, access_to_water, healthcare_access, education_literacy) | calculateAdaptiveCapacity() |
| `indicators[].normalization` | min_value, max_value, min_score, max_score | getIndicatorValue() — normalización min-max |
| `_min_indicators` | 3 | Umbral mínimo para calcular CA |

### 2.3 `sector-profiles.json`

**Campos consumidos por Stage 06**:

| Campo | Por sectores | Uso |
|-------|-------------|-----|
| `physical_sensitivity` | agriculture=0.9, infrastructure=0.7, retail=0.6, energy=0.5, finance=0.3 | calculateImpact() — sensibilidad sectorial |
| `default.physical_sensitivity` | 0.5 | Fallback para sector sin perfil propio |

---

## 3. Mapeos Estáticos

### 3.1 INDICATOR_TO_CANONICAL (Líneas 25-31)

```javascript
const INDICATOR_TO_CANONICAL = {
  poverty_rate: "poverty_rate",
  gdp_per_capita: "gdp_per_capita",
  access_to_water: "water_access",
  healthcare_access: "traveltime_healthcare",
  education_literacy: "education_literacy",
};
```

**Propósito**: Conecta los IDs de indicadores en adaptive-capacity.json con los nombres canónicos de variables producidos por Stage 03. Algunos IDs coinciden directamente (poverty_rate → poverty_rate), otros no (access_to_water → water_access).

**Trazabilidad**: H-6.2 (CRÍTICO) — getIndicatorValue() lee desde canonical_variables usando este mapeo.

### 3.2 PHENOMENON_TO_EXTERNAL_PROBABILITY (Líneas 48-52)

```javascript
const PHENOMENON_TO_EXTERNAL_PROBABILITY = {
  sequia: "gri_drought_occurrence",
  inundacion: "gri_flood_occurrence",
  ola_de_calor: "gri_extreme_heat_occurrence",
};
```

**Propósito**: Conecta fenómenos con la variable canónica que carrya su probabilidad de ocurrencia anual desde GRI Oxford (domain hazard_risk_gri). Solo 3 fenómenos tienen fuente GRI equivalente — ola_de_frio, el_nino y la_nina NO tienen cobertura en GRI Oxford (authoritative-sources.json hazard_risk_gri.known_limitations).

**Trazabilidad**: H-6.9 (ALTO) — getExternalProbability() usa este mapeo.

### 3.3 DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING (Líneas 63-69)

```javascript
export const DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING = [
  [0.0, 1], [0.2, 2], [0.4, 3], [0.6, 4], [0.8, 5],
];
```

**Propósito**: Copia exacta del default de thresholds.json confidence_to_probability.mapping. Usado solo cuando thresholds.json falla a proporcionar un mapping (defensive fallback). Garantiza que el path sin config usa la MISMA tabla y el MISMO algoritmo que el path configurado — una sola política, no dos independientes.

**Trazabilidad**: H-6.7 (MEDIO) — antes de H-6.7, el fallback era un `Math.ceil(score*5)` independiente que divergía en los 4 puntos de frontera exactos.

---

## 4. Funciones de Config-Loader

| Función | Archivo cargado | Usado por |
|---------|----------------|-----------|
| `getThresholds()` | `thresholds.json` | calculateProbability(), calculateImpact(), classifyRisk(), classifyCatastrophic(), computeEvaluationCoverage() |
| `getAdaptiveCapacityConfig()` | `adaptive-capacity.json` | calculateAdaptiveCapacity(), getIndicatorValue() |
| `getSectorProfiles()` | `sector-profiles.json` | calculateImpact() — physical_sensitivity |

---

## 5. Cache

| Componente | TTL | Invalidación |
|------------|-----|-------------|
| config-loader.js cache | 60 segundos | invalidateCache() o expiración automática |
| profilesCache (sector-profiles) | Sesión del módulo | Se relee si profilesCache es null |
| profilesCache en transition-risk-detector.js | Sesión del módulo | Independiente — lee el mismo archivo |

**Nota**: profilesCache en index.js y en transition-risk-detector.js son caches independientes del mismo archivo. Si sector-profiles.json se modifica durante una ejecución, ambos caches se invalidarán en la próxima ejecución (TTL 60s del config-loader + profilesCache null al reiniciar el módulo).

---

## 6. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-6.2 (CRÍTICO): getIndicatorValue() retornaba null siempre | INDICATOR_TO_CANONICAL conecta con canonical_variables de Stage 03 |
| H-6.7 (MEDIO): fallback de confidence→probability divergía de la tabla | DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING como copia idéntica |
| H-6.9 (ALTO): fuentes externas de probabilidad no consultadas | PHENOMENON_TO_EXTERNAL_PROBABILITY mapea a GRI Oxford |
| H-6.13 (BAJO): sector-profiles.json fallback silencioso | physical_sensitivity_source distingue "sector_specific" vs "default" |
