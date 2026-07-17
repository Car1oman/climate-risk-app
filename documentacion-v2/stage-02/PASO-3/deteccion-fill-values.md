# PASO-3 — Detección de Fill Values (Sentinelas por Fuente)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage02Validation.validateFillValues()`, `resolvePath()`, `extractValues()`, `splitPath()`, `resolvePathParts()` |
| **Ubicación** | `pipeline/stages/02-validation/index.js:234-295` (validateFillValues), `935-1018` (path resolution) |
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la detección de valores sentinelas (fill values) en respuestas crudas, siguiendo CF Conventions 1.12 |

---

## 1. Resumen Ejecutivo

PASO-3 detecta **valores sentinelas** — valores numéricos que una fuente usa para indicar "dato faltante" en lugar de un valor real. Ejemplos: NASA POWER usa -999 y -9999 para datos faltantes, Open-Meteo usa `null`, GRI Oxford usa -999. Estos valores, si no se detectan, se confundirían con datos reales en validaciones posteriores (rangos físicos, completitud).

El estándar que sustenta este diseño es **CF Conventions 1.12 §2.5.1**: los atributos `_FillValue` y `missing_value` son **por variable, no globales** — cada fuente declara sus propios sentinels en `validation-profiles.json`. Stage 03 reemplaza estos sentinels con `null` antes de la normalización.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
validateSource(source, profiles)                                    // index.js:143
  │
  ├── validateSchema(source)                                        // PASO-2
  │
  └── if (fieldMap) {
        ├── validateFillValues(source, fieldMap, profiles)          // ← PASO 3 ANALIZADO
        ├── validatePhysicalRanges(source, fieldMap, profiles)      // PASO-4
        ├── validateCompleteness(source, fieldMap, profiles)        // PASO-5
        └── validateTemporalConsistency(source, profiles)           // PASO-6
      }
```

### 2.2 Flujo de datos

```
source.response (objeto crudo del adapter)
  │
  ├── Por cada pathStr en fill_values.per_source[source_name].paths:
  │     │
  │     ├── resolvePath(response, pathStr)                         // Paso 1: navegar objeto
  │     │     ├── splitPath("properties.parameter.T2M")           // → ["properties","parameter","T2M"]
  │     │     └── resolvePathParts(response, parts)               // → Object { "2020-01-01": 25.3, ... }
  │     │
  │     ├── extractValues(value)                                   // Paso 2: normalizar a array
  │     │     ├── Si es array → retorna array
  │     │     ├── Si es objeto → Object.values() + warning si hay nested
  │     │     └── Si es escalar → [value]
  │     │
  │     └── Por cada valor: sentinels.includes(v)?                // Paso 3: comparar con sentinels
  │           ├── SÍ → detected.push({ path, value, index/key })
  │           └── NO → skip
  │
  └── return { rule, result, fill_values[], reference }
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `validateFillValues()` (index.js:234-295)

```javascript
validateFillValues(source, fieldMap, profiles) {
  const sourceFillConfig = profiles.fill_values.per_source[source.source_name];
  if (!sourceFillConfig) {
    return { rule: "fill_value_detection", result: "pass",
             detail: "No fill value configuration defined for '...'", reference: null };
  }

  const fillPaths = sourceFillConfig.paths;
  if (!fillPaths || Object.keys(fillPaths).length === 0) {
    return { rule: "fill_value_detection", result: "pass",
             detail: "Source '...' has no fill values declared in its configuration.",
             reference: { standard: sourceFillConfig.standard || "Not specified" } };
  }

  const detected = [];
  for (const [pathStr, sentinels] of Object.entries(fillPaths)) {
    if (sentinels.length === 0) continue;
    const value = this.resolvePath(source.response, pathStr);
    if (value == null) continue;
    const values = this.extractValues(value);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v != null && sentinels.includes(v)) {
        detected.push({
          path: pathStr,
          index: Array.isArray(value) ? i : undefined,
          key: typeof value === "object" && !Array.isArray(value) ? Object.keys(value)[i] : undefined,
          value: v,
        });
      }
    }
  }

  if (detected.length > 0) {
    return {
      rule: "fill_value_detection",
      result: "warning",
      detail: `${detected.length} fill value(s) detected across ${Object.keys(fillPaths).length} checked field(s)`,
      fill_values: detected,
      reference: { standard: sourceFillConfig.standard || "CF Conventions 1.12",
                    source: sourceFillConfig.reference || null },
    };
  }

  return { rule: "fill_value_detection", result: "pass", ... };
}
```

**Semántica del resultado**:
- `result: "pass"` → No se encontraron sentinels en los campos declarados
- `result: "warning"` → Se encontraron al menos un sentinel. **No es "fail"** intencionalmente: un fill value es un dato faltante reportado, no un error de datos

### 3.2 Path Resolution Engine (index.js:935-1018)

El motor de resolución de paths soporta 4 tipos de navegación:

| Tipo | Sintaxis | Ejemplo | Comportamiento |
|---|---|---|---|
| **Dot-notation** | `a.b.c` | `properties.parameter.T2M` | Navegación simple por propiedades |
| **Wildcard array** | `key[*]` | `results[*].elevation` | Itera todos los elementos del array |
| **Index array** | `key[n]` | `results[0].elevation` | Accede a elemento específico |
| **Filter predicate** | `key[field=value]` | `results[layer.domain=population]` | Filtra array por condición |
| **Bare wildcard** | `*` | (no usado actualmente) | Recursivo en todos los elementos |

**`splitPath()` (index.js:942-958)**: Divide el path en segmentos, respetando brackets:

```javascript
splitPath(pathStr) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of pathStr) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "." && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}
```

**`resolvePathParts()` (index.js:960-1018)**: Resuelve recursivamente cada segmento:

```javascript
resolvePathParts(current, parts) {
  if (current == null) return undefined;
  if (parts.length === 0) return current;

  const [part, ...rest] = parts;

  // 1. Wildcard: key[*]
  const wildcardMatch = part.match(/^(\w+)\[\*\]$/);
  if (wildcardMatch) {
    const arr = current[wildcardMatch[1]];
    if (!Array.isArray(arr)) return undefined;
    return arr.map(item => this.resolvePathParts(item, rest));
  }

  // 2. Index: key[n]
  const indexMatch = part.match(/^(\w+)\[(\d+)\]$/);
  if (indexMatch) { ... }

  // 3. Filter: key[field.path=value]
  const filterMatch = part.match(/^(\w+)((?:\[[\w.]+=[^[\]]+\])+)$/);
  if (filterMatch) { ... }

  // 4. Bare wildcard: *
  if (part === "*" && Array.isArray(current)) {
    return current.map(item => this.resolvePathParts(item, rest));
  }

  // 5. Property access
  if (current[part] === undefined || current[part] === null) return undefined;
  return this.resolvePathParts(current[part], rest);
}
```

### 3.3 `extractValues()` — Normalización a array (index.js:216-232)

```javascript
extractValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") {
    const vals = Object.values(value);
    const hasNested = vals.some(v => v != null && typeof v === "object");
    if (hasNested) {
      console.warn(
        "[validation] extractValues: object contains nested objects. " +
        "Only leaf-level primitives are compared against sentinels. " +
        "Configure paths to resolve to leaf values (e.g., 'a.b.c' instead of 'a.b')."
      );
    }
    return vals;
  }
  return [value];
}
```

**H-9**: Si el objeto tiene anidamiento, se emite warning pero se procesan solo los valores hoja.

---

## 4. Fill Values Configurados por Fuente

| Fuente | Sentinels | Estándar | Referencia |
|---|---|---|---|
| `weatherapi` | `[]` (ninguno) | WeatherAPI retorna numéricos, null en fallo de conexión | Manejado upstream |
| `nasa_power` | `[-999, -9999]` | CF Conventions 1.10. NASA POWER API Guide | power.larc.nasa.gov |
| `openmeteo_cmip6` | `[null]` | Open-Meteo JSON API: null = dato faltante | open-meteo.com/en/docs |
| `opentopodata_srtm30m` | `[-9999, -32768]` | -32768 es SRTM void value | opentopodata.org/api |
| `open_elevation` | `[-9999, -32768]` | Mismo SRTM heritage | open-elevation.com |
| `world_bank` | `[null]` | World Bank API: null = dato no disponible | datahelpdesk.worldbank.org |
| `noaa_cpc_oni` | `[]` (ninguno) | NOAA CPC: datos válidos en formato ASCII | cpc.ncep.noaa.gov |
| `supabase_climate_cells` | `{}` (vacío) | DB native types, NOT NULL en schema | — |
| `gri_oxford` | `[-999, -9999, null]` | GRI Oxford: -999 para celdas faltantes | api.gri.oxford.edu/docs |

---

## 5. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Fill values por fuente, no globales** | CF Conventions 1.12 §2.5.1: `_FillValue` es atributo por variable | Precisión, trazabilidad | Mantener 8 configuraciones sincronizadas |
| **`result: "warning"` no "fail"** | Un fill value es dato faltante reportado, no error de datos | No descarta la fuente por reportar honestamente sus huecos | Fuente con muchos warnings puede pasar desapercibida |
| **Exclusión silenciosa de metadata fields** | Solo se validan paths declarados, no metadatos del response | Evita falsos positivos en campos de control | Campos de datos no declarados pasan sin validar |
| **Filter predicates** | GRI Oxford usa `results[layer.domain=X]` en vez de índices numéricos | Resolución robusta a cambios de orden en la respuesta | Complejidad en `splitPath()` |
| **`sentinels.includes(v)`** | Comparación directa, no fuzzy | Simple y predecible | No detecta sentinels no declarados |

---

## 6. Limitaciones y Riesgos

### 6.1 Solo detecta sentinels declarados

**Descripción**: Si una fuente introduce un nuevo fill value no declarado en `validation-profiles.json`, pasa desapercibido.

**Impacto**: Un nuevo fill value (ej: -888 en una actualización de API) se confunde con dato real.

**Mitigación**: Los rangos físicos (PASO-4) capturan muchos sentinels no declarados que caen fuera de rango válido.

### 6.2 `extractValues()` solo procesa hojas

**Descripción**: Si el path resuelve a un objeto con anidamiento, solo extrae valores de primer nivel.

**Impacto**: Datos anidados no se comparan contra sentinels.

**Mitigación**: Warning emitido (H-9). Los paths en `SOURCE_FIELD_MAP` están configurados para resolver a hojas.

### 6.3 `null` como sentinel

**Descripción**: Open-Meteo y World Bank usan `null` como sentinel. El check `v != null` en el loop excluye `null` antes de la comparación `sentinels.includes(v)`.

**Impacto**: `null` no se detecta como fill value explícito, pero `null` ya es "absence" por definición — se maneja en completitud (PASO-5).

**Mitigación**: Es correcto: `null` no necesita detección especial porque ya es "no dato".

---

## 7. Auditoría de Consistencia

### 7.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| `validateFillValues()` | `index.js:234-295` | Documentado en §3.1 | ✅ Consistente |
| Path resolution | `index.js:935-1018` | 4 tipos documentados en §3.2 | ✅ Consistente |
| `extractValues()` | `index.js:216-232` | Documentado en §3.3 | ✅ Consistente |
| NASA POWER sentinels | `[-999, -9999]` | Documentado en §4 | ✅ Consistente |
| GRI Oxford sentinels | `[-999, -9999, null]` | Documentado en §4 | ✅ Consistente |
| CF Conventions ref | §2.5.1 | Cita en §1 y §4 | ✅ Consistente |

### 7.2 Consumidores del resultado

| Consumidor | Uso del resultado |
|---|---|
| `buildResult()` (PASO-7) | Agrega `fill_value_detection` a `validation_results[]` |
| Stage 03 normalization | Lee `fill_values[]` para reemplazar sentinels con `null` |
| API/UI | Muestra `fill_value_detection.result` y `fill_values[]` |

---

## 8. Conclusiones

### 8.1 ¿El diseño es técnicamente sólido?

Sí. PASO-3 implementa la detección de fill values siguiendo CF Conventions 1.12 (por fuente, no global). El motor de path resolution es robusto y maneja wildcards, filtros, e índices. La decisión de usar `result: "warning"` en vez de `"fail"` es correcta: un fill value es un dato faltante reportado, no un error.

### 8.2 Fortalezas

1. **Trazabilidad normativa**: Cada fuente tiene `standard` y `reference` justificando sus sentinels
2. **Path resolution robusto**: 4 tipos de navegación cubren todas las estructuras de API del pipeline
3. **No descarta fuentes**: Fill values son warnings, no failures — la fuente sigue siendo usable
4. **Exclusión de metadata**: Solo se validan paths declarados, evitando falsos positivos

### 8.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| Solo detecta sentinels declarados | Nuevo fill value no detectado | Baja (mitigado por PASO-4) |
| `null` no se detecta explícitamente | Correcto por diseño, pero puede confundir | Baja |
| `extractValues()` solo primer nivel | Datos anidados no validados | Baja (paths resuelven a hojas) |

---

## 9. Referencias

- CF Conventions 1.12 (2023). Section 2.5.1: `_FillValue` and `missing_value`. https://cfconventions.org/Data/cf-conventions/cf-conventions-1.12/cf-conventions.html#_missing-data
- NASA POWER API User Guide. (2024). Temporal daily API. https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- Open-Meteo Climate API. (2024). https://open-meteo.com/en/docs/climate-api
- OpenTopoData API. (2024). https://www.opentopodata.org/api/
- Open-Elevation API. (2024). https://open-elevation.com/
- World Bank API. (2024). Data Help Desk. https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
- GRI Oxford API. (2024). https://api.gri.oxford.edu/docs
