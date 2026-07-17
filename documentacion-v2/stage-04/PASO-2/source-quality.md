# PASO-2 — Source Quality (Confianza Bidimensional: Calidad de Fuente)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `calculateSourceQuality(source, sector)` + 5 funciones de cálculo por componente |
| **Ubicación** | `pipeline/stages/04-signals/confidence.js:67-331` |
| **Stage** | Stage 04 — Signals (ID: 4) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del cálculo de Source Quality como promedio ponderado de 5 componentes, con exclusión explícita de componentes no calculables |

---

## 1. Resumen Ejecutivo

Source Quality mide la calidad de la fuente de datos subyacente para una variable canónica. Es un score 0-1 calculado como promedio ponderado de 5 componentes, cada uno con una metodología específica y referencias documentadas. Componentes con `value=null` se **excluyen** del promedio (denominador reducido), no se fabrica un valor.

**Fórmula general**:
```
Source Quality = Σ(component_i × weight_i) / Σ(weights_i)  donde component_i ≠ null
```

**Pesos** (thresholds.json `source_quality_weights`):
| Componente | Peso | Fundamento |
|-----------|------|------------|
| coverage_spatial | 0.30 | Isaaks & Srivastava 1989, Journel & Huijbregts 1978 |
| coverage_temporal | 0.20 | WMO No.100, TCFD 2017, WMO-No.1203 |
| completeness | 0.20 | WMO No.100 §2.3.2, GCOS-245 |
| resolution | 0.20 | CEOS WGCV 2019 |
| proximity | 0.10 | WMO-No.8 CIMO Guide, thresholds.json spatial_coverage |

---

## 2. Flujo de Cálculo

```
calculateSourceQuality(source, sector)                           // confidence.js:291
  │
  ├── computeCoverageSpatial(source, decorrCfg, resolution)     // confidence.js:67
  │   ├── ¿non_stochastic? → always_1 / categorical / resolution_ratio
  │   └── ¿stochastic? → exp(-|distance| / decorrelation_length_km)
  │
  ├── computeCoverageTemporal(source, temporalCfg)              // confidence.js:120
  │   ├── point_in_time_sources → 1.0
  │   ├── climate_normal_sources → 1.0
  │   ├── fixed_window_sources → actual_days / required_days
  │   ├── horizon_projection_sources → actual_days / nominal_days
  │   └── unclassified → null (excluido)
  │
  ├── computeCompleteness(source)                               // confidence.js:174
  │   ├── methodology_completeness_ratio (Stage 3) → preferido
  │   └── fallback: present / keys.length
  │
  ├── computeResolution(source, resolutionProfiles, decorrCfg)  // confidence.js:202
  │   ├── non_spatial_variables → 1.0
  │   └── exp(-alpha × max(0, ratio - 1))  donde ratio = native_m / required_m
  │
  └── computeProximity(source, thresholds)                      // confidence.js:260
      ├── enso_max_km=null → 1.0
      └── max(0, 1 - |distance| / max_km)
  │
  └── Promedio ponderado (solo componentes no-null)
      ├── score = weightedSum / totalWeight
      └── components_excluded = [{component, reason}]  (si alguno es null)
```

---

## 3. Descripción Detallada por Componente

### 3.1 coverage_spatial (30%)

**Función**: `computeCoverageSpatial(source, decorrCfg, resolutionResult)` — confidence.js:67

**Fórmula base**: `exp(-|d| / L)` donde:
- `d` = `source.spatial_distance_km` (distancia al punto de datos más cercano)
- `L` = `decorrelation_length_km` de spatial-decorrelation.json para la variable

**Excepciones non_stochastic** (spatial-decorrelation.json):
| Regla | Variables | Valor | Razón |
|-------|-----------|-------|-------|
| `always_1` | oni_index, poverty_rate, gdp_per_capita, water_access, urban_population | 1.0 | Fuentes país-nivel o índices de cuenca sin representatividad espacial local |
| `categorical` | land_cover | 1.0 | Clasificación categórica, cobertura binaria (disponible/no disponible) |
| `resolution_ratio` | elevation, population, buildings, traveltime_healthcare | = resolution component | DEM/campo fijo: cobertura depende de resolución, no de decorrelación |

**Exclusión** (value=null):
- `distance == null` → "distance_unavailable"
- `decorrelation_length_km == null` → "decorrelation_length_unavailable"

**Fundamento**: Isaaks & Srivastava (1989) "An Introduction to Applied Geostatistics" Oxford University Press; Journel & Huijbregts (1978) "Mining Geostatistics" Academic Press. Ver spatial-decorrelation.json para citation completa por variable.

### 3.2 coverage_temporal (20%)

**Función**: `computeCoverageTemporal(source, temporalCfg)` — confidence.js:120

**Mide**: Si la extensión real de la serie subyacente alcanza la duración requerida para el tipo de dato. **No** mide densidad de valores válidos (eso es `completeness`).

**Clasificación por tipo de fuente** (temporal-coverage-profiles.json):

| Tipo | Fuentes | Cálculo | Referencia |
|------|---------|---------|------------|
| point_in_time | weatherapi, opentopodata, open_elevation, world_bank, noaa_cpc_oni, gri_oxford | 1.0 | No hay "serie" cuya extensión medir |
| climate_normal | supabase_climate_cells | 1.0 | WMO-No.1203 (2017): normal climatológica = 30 años |
| fixed_window | nasa_power | actual_days / 365 | WMO No.100 §2.3.2: annual como unidad estándar |
| horizon_projection | openmeteo_cmip6 | actual_days / nominal_days (horizons.js) | TCFD 2017, CEPLAN, World Bank |
| unclassified | (cualquiera no listado) | null (excluido) | Sin metodología definida |

### 3.3 completeness (20%)

**Función**: `computeCompleteness(source)` — confidence.js:174

**Fórmula preferida**: `methodology.completeness_ratio` de Stage 3 (WMO No.100 / GCOS-245 — fracción de observaciones válidas sobre observaciones esperadas en la ventana temporal).

**Fallback**: `present / keys.length` (solo cuando Stage 3 no provee completeness_ratio).

**H-11**: El cálculo previo (present/keys.length) era trivialmente 1.0 para fuentes de una variable. Se reemplaza por la completitud temporal real de Stage 3.

### 3.4 resolution (20%)

**Función**: `computeResolution(source, resolutionProfiles, decorrCfg, sector)` — confidence.js:202

**Fórmula**: `exp(-alpha × max(0, ratio - 1))` donde:
- `ratio` = `native_m / required_m`
- `alpha` = 0.3 (CEOS WGCV 2019)
- `native_m` = resolución nativa de la fuente (parseada de `resolution_native` string)
- `required_m` = `max(sector_required_m, climatological_required_m)`

**required_m** combina:
1. **Piso sectorial** (resolution-profiles.json `sectors.{sector}.required_resolution_meters`): feature mínima relevante / Nyquist factor (3)
2. **Piso climatológico** (resolution-profiles.json `variable_overrides`): `decorrelation_length_km × 1000 / samples_per_decorrelation_length` (2)

**Referencia**: CEOS WGCV (2019) "Best Practices for Sensor Characterization" §4.2, §6.1.

### 3.5 proximity (10%)

**Función**: `computeProximity(source, thresholds)` — confidence.js:260

**Fórmula**: `max(0, 1 - |distance| / max_km)` — caída lineal (no exponencial).

**Máximos por tipo de fuente** (thresholds.json `spatial_coverage`):
| Fuente | Key | max_km | Referencia |
|--------|-----|--------|------------|
| weatherapi, nasa_power | observation_max_km | 25 | WMO OSCAR 2022 |
| openmeteo_cmip6, supabase | grid_projection_max_km | 25 | CORDEX-SA, ERA5 |
| opentopodata, open_elevation | high_resolution_max_km | 1 | ESA Sentinel-2 Handbook |
| gri_oxford | geophysical_max_km | 10 | USGS Open-File Report 2012-1215 |
| world_bank | default_max_distance_km | 50 | WMO-No.8 CIMO Guide |
| noaa_cpc_oni | enso_max_km | null | Trenberth 1997 (sin límite local) |

---

## 4. Score Final

```javascript
// confidence.js:307-323
for (const [key, result] of Object.entries(components)) {
  if (result.value == null) {
    componentsExcluded.push({ component: key, reason: result.reason });
    continue;  // ← excluido, no fabricado
  }
  weightedSum += result.value * weights[key];
  totalWeight += weights[key];
}
const score = totalWeight > 0 ? weightedSum / totalWeight : null;
```

**Score null**: Cuando TODOS los componentes son null (sin datos calculables). No se fuerza a 0.

**components_excluded**: Lista de componentes excluidos con su razón exacta (trazabilidad completa).

---

## 5. Constantes Críticas

| Constante | Valor | Fuente | Descripción |
|-----------|-------|--------|-------------|
| `weights.coverage_spatial` | 0.30 | thresholds.json | Peso de cobertura espacial |
| `weights.coverage_temporal` | 0.20 | thresholds.json | Peso de cobertura temporal |
| `weights.completeness` | 0.20 | thresholds.json | Peso de completitud |
| `weights.resolution` | 0.20 | thresholds.json | Peso de resolución |
| `weights.proximity` | 0.10 | thresholds.json | Peso de proximidad |
| `resolution.decay_alpha` | 0.3 | resolution-profiles.json | CEOS WGCV 2019 |
| `resolution.samples_per_L` | 2 | resolution-profiles.json | Nyquist mínimo |

---

## 6. Trazabilidad

| Referencia | Hallazgo | Resolución |
|------------|----------|------------|
| H-01 (CRÍTICO) | Solo 2/5 componentes, pesos 50/50 | 5 componentes con pesos 30/20/20/20/10 |
| H-11 (MEDIO) | Completeness trivial para 1 variable | Usa methodology.completeness_ratio de Stage 3 |
| H-14 (MEDIO) | Promedio redundante de 1 source | Llamada directa, sin envolver en array |
