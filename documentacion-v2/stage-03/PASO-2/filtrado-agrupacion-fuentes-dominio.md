# PASO-2 — Filtrado y Agrupación de Fuentes por Dominio

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `liveSources` (filter), `byDomain` (group), `_scoreSources()` |
| **Ubicación** | `pipeline/stages/03-normalization/index.js` (líneas 107-162) |
| **Stage** | Stage 03 — Normalization (ID: 3) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del segundo paso de Stage 03: filtrado de fuentes inválidas y agrupación por dominio climático |

---

## 1. Resumen Ejecutivo

PASO-2 toma la lista de `sources_consulted` (proveniente de Stage 02) y realiza dos operaciones:

1. **Filtrado**: Elimina fuentes que no tienen respuesta (`!s.response`), que fallaron (`coverage_status === "failed"`), o que están fuera de cobertura espacial (`coverage_status === "out_of_coverage"`).

2. **Agrupación**: Agrupa las fuentes restantes por dominio climático (`source_domain`) para que cada dominio se evalúe independientemente en PASO-3 (scoring).

**Pre-condición**: Stage 02 debe haber completado validación y coverage para todas las fuentes.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
Stage03Normalization.execute(input)                                    // index.js:150
  │
  ├── loadConfig()                                                    // ← PASO 1
  │
  └── for (const [domain, domainSources] of Object.entries(byDomain)) // ← PASO 2-7
        │
        ├── PASO 2: Filtrado + Agrupación
        │     ├── liveSources = sourcesConsulted.filter(s => ...)
        │     └── byDomain[domain].push(source)
        │
        ├── PASO 3: _scoreSources(domainSources, validationMap, domain)
        ├── PASO 4: _extractVariablesFromSource(bestSource, ...)
        ├── PASO 5: _computeSpatialCoverage(...)
        └── PASO 7: _buildOutput(...)
```

### 2.2 Flujo de datos

```
sourcesConsulted (Stage 02 output)
  │
  ├── [filter: !s.response]                    → ELIMINADA (sin datos)
  ├── [filter: s.coverage_status === "failed"] → ELIMINADA (fallo de conexión)
  ├── [filter: dec.coverage_status === "out_of_coverage"] → ELIMINADA (fuera de zona)
  │
  └── liveSources[]
        │
        ├── source_domain === "precipitation"  → byDomain.precipitation[]
        ├── source_domain === "temperature"    → byDomain.temperature[]
        ├── source_domain === "hydrology"      → byDomain.hydrology[]
        ├── source_domain === "socioeconomic"  → byDomain.socioeconomic[]
        └── source_domain === "unknown"        → byDomain.unknown[]
```

---

## 3. Descripción Detallada del Flujo

### 3.1 Filtrado de fuentes inválidas (index.js:107-111)

```javascript
const liveSources = sourcesConsulted.filter(s => {
  if (!s.response || s.coverage_status === "failed") return false;
  const dec = coverageMap.get(s.source_name);
  return !dec || dec.coverage_status !== "out_of_coverage";
});
```

**Criterios de eliminación**:

| Criterio | Condición | Descripción |
|----------|-----------|-------------|
| Sin respuesta | `!s.response` | El adaptador no devolvió datos |
| Fallo de conexión | `s.coverage_status === "failed"` | Error de red o timeout |
| Fuera de cobertura | `dec.coverage_status === "out_of_coverage"` | Fuente geográficamente fuera del área de estudio |

**Nota importante**: Fuentes con `coverage_status === "unknown"` o `"partial"` **NO se eliminan** — se mantienen para que el filtrado por variable (PASO-4) pueda decidir caso por caso. Esto evita que la brecha de información se haga invisible.

### 3.2 Agrupación por dominio (index.js:118-123)

```javascript
const byDomain = {};
for (const source of liveSources) {
  const domain = source.source_domain || "unknown";
  if (!byDomain[domain]) byDomain[domain] = [];
  byDomain[domain].push(source);
}
```

**Mapeo dominio→fuentes**:

| Dominio | Variables típicas | Fuentes ejemplo |
|---------|-------------------|-----------------|
| `precipitation` | `precipitation_sum` | senamhi_daily, chirps_daily, era5_land_daily |
| `temperature` | `air_temperature_max`, `air_temperature_min` | senamhi_daily, era5_land_daily |
| `hydrology` | `river_discharge` | grdc_monthly |
| `socioeconomic` | `gdp_per_capita`, `population` | world_bank |
| `climate_indices` | `enso_index`, `iod_index` | noaa_cpc_monthly |
| `unknown` | (cualquier variable no mapeada) | (fuente sin `source_domain`) |

### 3.3 Iteración por dominio (index.js:125-162)

```javascript
for (const [domain, domainSources] of Object.entries(byDomain)) {
  const scored = this._scoreSources(domainSources, validationMap, domain);  // PASO 3
  const bestSource = scored[0];

  if (!bestSource) continue;

  const extracted = this._extractVariablesFromSource(                        // PASO 4
    bestSource.source,
    validationMap.get(bestSource.source.source_name),
    coverageMap.get(bestSource.source.source_name)
  );

  // ... filtrado por cobertura espacial por variable ...
  // ... deduplicación ...
}
```

**Observaciones clave**:
- Cada dominio se evalúa independientemente — no hay comparación inter-dominio
- Solo la fuente ganadora (`bestSource`) se usa para extraer variables
- Las fuentes descartadas se registran en `source_decisions` con razón de descarte

---

## 4. Tabla de Impacto

| Componente | Tipo de cambio | Riesgo si falla | Dependencia |
|------------|---------------|-----------------|-------------|
| `sourcesConsulted` | Input externo | Sin datos que evaluar | Stage 02 |
| `coverageMap` | Lookup externo | Fuentes fuera de cobertura no se filtran | Stage 02 |
| `liveSources` | Filter | Fuentes inválidas pasan al scoring | `coverageMap` |
| `byDomain` | Grouping | Variables de dominios mezclados | `source_domain` |
| `source_domain` | Campo de fuente | Fuentes sin dominio van a `"unknown"` | Adaptadores |

---

## 5. Supuestos y Limitaciones

1. **`source_domain` es obligatorio pero puede ser `"unknown"`**: Si el adaptador no establece `source_domain`, la fuente va al grupo `"unknown"` y probablemente no tendrá fuentes candidatas en PASO-3.

2. **Filtrado por `coverage_status === "out_of_coverage"` es definitivo**: Una fuente fuera de cobertura se elimina completamente, no solo las variables específicas. Esto es consistente con el diseño: si la fuente no tiene datos para la región, no tiene sentido evaluarla.

3. **Fuentes con `coverage_status === "unknown"` o `"partial"` pasan el filtro**: Esto es intencional — el filtrado por variable (PASO-4) puede decidir caso por caso si una variable específica está dentro de cobertura.

4. **Deduplicación por `name|domain|start`**: Evita que la misma variable del mismo dominio y período se reporte más de una vez (ej. si dos fuentes del mismo dominio producen la misma variable).

---

## 6. Trazabilidad

| Referencia | Ubicación |
|------------|-----------|
| H-7 (Cobertura parcial) | Auditoría Stage 03, hallazgo 7 — fuentes "unknown" y "partial" se mantienen intencionalmente |
| H-8 (Dominio desconocido) | Auditoría Stage 03, hallazgo 8 — fuente sin distance model se mantiene para filtrado por variable |
| Deduplicación | Línea 152: `dedupKey = ${v.name}|${domain}|${v.data_time_range?.start}` |
