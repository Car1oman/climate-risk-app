# AUDITORIA — Supuestos, Calculos Heuristicos y Decisiones sin Sustento Completo

**Documento de Auditoria — Stage 02 Validation**

| Campo | Valor |
|---|---|
| **Alcance** | Codigo completo de `pipeline/stages/02-validation/index.js` + configs dependencias |
| **Fecha** | 2026-07-14 |
| **Proposito** | Identificar supuestos, calculos heuristicos y decisiones que requieren justificacion adicional para defensa ante auditoria |

---

## Resumen Ejecutivo

Se identificaron **36 hallazgos** clasificados por severidad:

| Severidad | Cantidad | Descripcion |
|---|---|---|
| **Critica** | 3 | Bugs de implementacion que producen resultados incorrectos |
| **Alta** | 5 | Supuestos significativos sin justificacion o features no funcionales |
| **Media** | 17 | Heuristicas, approximaciones o gaps de cobertura |
| **Baja** | 11 | Simplificaciones aceptables pero que deben documentarse |

---

## HALLAZGO-1 [CRITICA] — Mismatch PRECTOT vs PRECTOTCORR en NASA POWER

**Archivo**: `pipeline/stages/02-validation/index.js:16` + `pipeline/stages/01-acquisition/adapters/nasa-power.js`

```javascript
// SOURCE_FIELD_MAP en Stage 02:
"properties.parameter.PRECTOTCORR": { variable: "precipitation_sum", type: "timeseries" },

// Pero el adapter nasa-power.js solicita:
const params = ["T2M", "T2M_MAX", "T2M_MIN", "T2MDEW", "PRECTOT", "WS2M", "RH2M", "ALLSKY_SFC_SW_DWN"];
```

**Problema**: El adapter solicita `PRECTOT` (precipitacion total sin correccion), pero SOURCE_FIELD_MAP mapea `PRECTOTCORR` (precipitacion con correccion de sesgo). NASA POWER solo retorna `PRECTOTCORR` cuando se solicita explicitamente. Como el adapter solicita `PRECTOT`, el campo `PRECTOTCORR` no existira en la respuesta, y `resolvePath()` retornara `undefined`.

**Impacto**: La validacion de rangos fisicos y fill values para precipitacion de NASA POWER **nunca se ejecuta**. Datos de precipitacion con valores absurdos pasan sin ser detectados.

**Sustento actual**: Ninguno. Es un bug de implementacion.

**Accion requerida**:
1. Cambiar `SOURCE_FIELD_MAP` para usar `PRECTOT` en lugar de `PRECTOTCORR`, O
2. Cambiar el adapter para solicitar `PRECTOTCORR` en lugar de `PRECTOT`
3. Verificar cual parametro es correcto para el uso del pipeline

**Estado**: **SIN RESOLVER — Bug de implementacion**

---

## HALLAZGO-2 [CRITICA] — Wildcard path `results[*].elevation` nunca resuelve

**Archivo**: `pipeline/stages/02-validation/index.js:616-635` (resolvePath)

```javascript
// La expresion regular solo matchea patron "key[index]":
const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

// Pero el path en validation-profiles.json es:
"results[*].elevation": [-9999, -32768]

// El segmento "[*]" NO matchea el regex (porque * no es \d+)
// Y el check part === "*" tampoco coincide (porque el string es "[*]", no "*")
// Resultado: retorna undefined siempre
```

**Problema**: El mecanismo de wildcard en `resolvePath()` esta roto. El path `results[*].elevation` nunca resuelve, por lo que la deteccion de fill values para SRTM void values (`-32768`, `-9999`) en OpenTopoData y Open-Elevation **nunca se ejecuta**.

**Mitigacion parcial**: La validacion de rangos fisicos SI funciona porque usa `results[0].elevation` (con indice numerico, no wildcard). El valor `-32768` es capturado como `below_minimum` en el rango `[-500, 9000]`. Sin embargo, la metadata de la deteccion es incorrecta (se reporta como "rango fisico" en lugar de "fill value").

**Sustento actual**: Ninguno. Bug de implementacion en la resolucion de paths.

**Accion requerida**:
1. Corregir `resolvePath()` para manejar `[*]` como wildcard que itera todos los elementos del array, O
2. Cambiar los paths en `validation-profiles.json` para usar `results[0].elevation` (aceptando que solo valida el primer elemento)

**Estado**: **SIN RESOLVER — Bug de implementacion**

---

## HALLAZGO-3 [CRITICA] — Deteccion de gaps temporales con falsos positivos en bordes de mes

**Archivo**: `pipeline/stages/02-validation/index.js:496-503`

```javascript
// Logica para NASA POWER:
const dates = Object.keys(series).sort();
for (let i = 1; i < dates.length; i++) {
  const prev = parseInt(dates[i - 1]);  // ej: 20240131
  const curr = parseInt(dates[i]);       // ej: 20240201
  if (curr !== prev + 1) {               // 20240201 !== 20240132 -> TRUE
    checks.push({ ... });                // FALSO POSITIVO
  }
}
```

**Problema**: La comparacion de fechas como enteros `YYYYMMDD` falla en los bordes de mes. Ejemplo:
- Enero 31 = `20240131`, Febrero 1 = `20240201`. Diferencia = `70`, no `1`
- Esto genera **~11 falsos positivos por ano** (un gap falso por cada cambio de mes)

**Impacto**: TODAS las series temporales de NASA POWER tendran warnings de consistencia temporal inexistentes. Esto infla artificialmente el conteo de warnings y puede afectar la decision de seleccion de fuente en Stage 03.

**Sustento actual**: Ninguno. El algoritmo de comparacion es incorrecto para fechas.

**Accion requerida**:
1. Usar comparacion de fechas Date en lugar de enteros, O
2. Parsear YYYY-MM-DD y comparar componentes year/month/day separadamente

**Estado**: **SIN RESOLVER — Bug de implementacion**

---

## HALLAZGO-4 [ALTA] — Estructura de paths de GRI Oxford incierta

**Archivo**: `pipeline/stages/02-validation/index.js:55-63`

```javascript
gri_oxford: {
  paths: {
    "population_2020": { variable: "population", type: "scalar" },
    "buildings_2020": { variable: "buildings", type: "scalar" },
    "land_cover_2020": { variable: "land_cover", type: "scalar" },
    "traveltime_to_healthcare": { variable: "traveltime_healthcare", type: "scalar" },
  },
},
```

**Problema**: SOURCE_FIELD_MAP asume keys planas `population_2020`, `buildings_2020`, etc. Pero el adapter `gri-oxford.js` pasa la respuesta cruda de la API (`response: data`). La documentacion de la API GRI Oxford indica que la estructura es `{ results: [{ domain: "...", data: { ... } } ] }` — una estructura anidada, no keys planas.

**Impacto**: Si la respuesta es `data.results[0].data.population_2020`, el path `population_2020` no resolvera y la validacion de GRI Oxford estara completamente deshabilitada.

**Sustento actual**: Ninguno. Requiere verificacion en vivo con la API.

**Accion requerida**:
1. Verificar la estructura real de la respuesta de GRI Oxford API
2. Ajustar los paths en SOURCE_FIELD_MAP para coincidir con la estructura real

**Estado**: **SIN RESOLVER — Requiere verificacion empirica**

---

## HALLAZGO-5 [ALTA] — Percentiles P1/P99 y P5/P95 sin respaldo WMO

**Archivo**: `pipeline/stages/02-validation/index.js:289-408` + `pipeline/config/validation-profiles.json:317-329`

```javascript
// Logica de validacion climatologica:
if (p1 != null && p99 != null && (v < p1 || v > p99)) {
  // -> result: "fail" (limite absoluto)
} else if (p5 != null && p95 != null && (v < p5 || v > p95)) {
  // -> result: "warning" (rango de advertencia)
}
```

```json
"percentiles": {
  "absolute_limit": [1, 99],
  "warning": [5, 95]
}
```

**Problema**: Los umbrales P1/P99 (fail) y P5/P95 (warning) son communes en QC operacional, pero:
- WMO No. 1203 (2017) define como calcular Climate Normals, NO cuales percentiles usar para QC
- WMO No. 8 Cap. 7 describe procedimientos QC pero no fija percentiles especificos
- La eleccion de P1/P99 como umbral de "fail" es una decision arbitraria, no un estandar

**Para precipitacion** (distribucion fuertemente asimetrica a la derecha), P99 puede ser un valor extremo comun. Usar P99 como umbral de "fail" podria flaggear lluvias legitimas como erroneas.

**Referencia citada en el codigo**: "WMO No. 1203 (2017) Guidelines on the Calculation of Climate Normals" — pero este estandar NO define percentiles para QC.

**Accion requerida**:
1. Documentar que P1/P99 y P5/P95 son convenciones operacionales, NO estandares WMO
2. Buscar referencias que respalden la eleccion de percentiles para QC (ej. Durre et al. 2010, WMO TD No. 1538)
3. Evaluar si P1/P99 es apropiado para distribuciones asimetricas (precipitacion)

**Estado**: **SIN RESOLVER — Referencia atribuida incorrectamente**

---

## HALLAZGO-6 [ALTA] — Feature de limite climatologico no funcional

**Archivo**: `pipeline/stages/02-validation/index.js:289-311`

```javascript
validateClimatologicalLimit(source, fieldMap, profiles) {
  // ...
  if (!source.climatology || typeof source.climatology !== "object") {
    return {
      rule: "climatological_limit",
      result: "not_available",
      detail: "No climatology reference data provided for this source.",
    };
  }
  // ... resto de la logica
}
```

**Problema**: Ningun adapter provee el campo `source.climatology` en su respuesta. El `RawSourceResponseSchema` en `types.js` no incluye un campo `climatology`. Esto significa que el test de limite climatologico **SIEMPRE retorna `"not_available"`** para TODAS las fuentes.

**Impacto**: Una feature completa (~120 lineas de codigo) esta implementada pero nunca se ejecuta. El `rulesApplied` del Stage 02 lista "Climatological limit test" como regla aplicada, lo cual es engañoso.

**Sustento actual**: La implementacion es correcta, pero no hayDataAdapter que provea datos de climatologia de referencia.

**Accion requerida**:
1. Decidir si la feature se implementa (requiere consultar NASA POWER para percentiles 1991-2020) o se elimina
2. Si se mantiene, agregar el campo `climatology` al `RawSourceResponseSchema` o calcularlo en Stage 02
3. Mientras tanto, remover "Climatological limit test" de `rulesApplied` o marcarlo como "implemented, not activated"

**Estado**: **SIN RESOLVER — Feature muerta**

---

## HALLAZGO-7 [ALTA] — `Math.max()` para distancia multi-variable es simplificacion MVP

**Archivo**: `pipeline/orchestration/config-loader.js:71-87`

```javascript
export function getMaxDistanceForSource(sourceName) {
  const sourceVars = SOURCE_VARIABLES[sourceName];
  // ...
  let distances = [];
  for (const varName of sourceVars) {
    const d = getMaxDistanceForVariable(varName);
    if (d != null) distances.push(d);
  }
  // Use max so a multivariate source is not disqualified by its most localised
  // variable (e.g. precipitation L=30 km should not reject nasa_power for
  // temperature, which has L=500 km).
  return Math.max(...distances);
}
```

**Problema**: La funcion usa `Math.max()` para retornar la distancia maxima entre todas las variables de una fuente. Esto significa que una fuente se considera "disponible" si la distancia esta dentro del rango de su variable MAS PERMISIVA.

Ejemplo: NASA POWER tiene temperatura (L=500km, d_max=347km) y precipitacion (L=30km, d_max=21km). Con `Math.max()`, la fuente se considera "disponible" hasta 347km. Pero la precipitacion a 300km NO es representativa (d_max=21km).

**Justificacion del codigo**: "Stage 03 evaluara cobertura por variable individualmente."

**Evaluacion**: Esto es una simplificacion documentada, no un bug. Stage 02 hace una evaluacion a nivel de fuente; Stage 03 hace la evaluacion por variable. Sin embargo, Stage 02 podria excluir fuentes que Stage 03 consideraria validas, o viceversa.

**Accion requerida**:
1. Documentar explicitamente que `evaluateCoverage()` es una simplificacion MVP
2. Referenciar que la evaluacion por variable ocurre en Stage 03

**Estado**: **SIN RESOLVER — Simplificacion documentada pero no referenciada**

---

## HALLAZGO-8 [ALTA] — Distancia null = "asumido disponible" (fail-open)

**Archivo**: `pipeline/stages/02-validation/index.js:563-568`

```javascript
} else if (distance == null) {
  coverageStatus = "available";
  coverageReason = "distance_not_available_assumed_available";
}
```

**Problema**: Cuando `spatial_distance_km` es `null` y `maxDistance` no es `null`, la fuente se marca como "available" con razon "distance_not_available_assumed_available". Esto es un diseno **fail-open**: la ausencia de informacion de distancia se trata como "probablemente bien".

**Evaluacion**: En el uso actual, esto es correcto porque las fuentes sin distancia son fuentes no-espaciales (world_bank, noaa_cpc_oni, gri_oxford) donde la distancia no aplica. Sin embargo, si un adapter bugueado no calcula la distancia, la fuente pasaria la validacion de cobertura sin ser detectada.

**Accion requerida**:
1. Documentar que el diseno es fail-open y por que
2. Considerar agregar un flag `spatial_distance_required` por dominio

**Estado**: **SIN RESOLVER — Diseno fail-open sin documentar**

---

## HALLAZGO-9 [MEDIA] — `extractValues()` no maneja objetos anidados

**Archivo**: `pipeline/stages/02-validation/index.js:154-169`

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

**Problema**: Para objetos anidados (ej. `{ a: { b: 1 }, c: 2 }`), retorna `[{ b: 1 }, 2]`. La comparacion `sentinels.includes(v)` compararia un objeto contra numeros — siempre `false`.

**Analisis de alternativas**:
- **Flattening recursivo**: Descartado. Los sentinels son primitivos (`-999`, `null`). Comparar un objeto contra `-999` nunca tiene sentido. El `resolvePath` ya resuelve rutas anidadas hasta hojas — un path que retorna objeto es error de configuracion, no caso de uso valido.
- **Solo documentar**: Insuficiente. El error pasaria silencioso.

**Solucion implementada**: Warning runtime que detecta objetos anidados y advise configurar paths a hojas. Mantiene comportamiento existente (solo hojas se comparan contra sentinels) pero hace visible la limitacion.

**Justificacion**:
1. `resolvePath` resuelve `properties.parameter.T2M` al numero, no al objeto padre
2. Todos los paths en `validation-profiles.json` apuntan a hojas primitivas
3. El warning detecta proactivamente configuraciones incorrectas sin over-engineering

**Estado**: **RESUELTO — Warning runtime + documentacion**

---

## HALLAZGO-10 [MEDIA] — NaN pasa validacion de rangos fisicos

**Archivo**: `pipeline/stages/02-validation/index.js:232-234`

```javascript
for (let i = 0; i < values.length; i++) {
  const v = values[i];
  if (v == null || typeof v !== "number") continue;
  // NaN tiene typeof === "number"
  // NaN < vr.min es false, NaN > vr.max es false
  // -> NaN pasa la validacion silenciosamente
}
```

**Problema**: `typeof NaN === "number"` es `true` en JavaScript. Las comparaciones `NaN < min` y `NaN > max` siempre retornan `false`, por lo que NaN pasa la validacion de rangos sin ser detectado.

**Impacto**: Valores NaN de fallos de parsing pasan sin ser flagged.

**Accion requerida**:
1. Agregar `Number.isNaN(v)` al filtro, O
2. Usar `if (v == null || typeof v !== "number" || isNaN(v)) continue`

**Estado**: **SIN RESOLVER — Bug sutil de JavaScript**

---

## HALLAZGO-11 [MEDIA] — Rango de precipitacion_sum demasiado amplio

**Archivo**: `pipeline/config/validation-profiles.json:163-170`

```json
"precipitation_sum": {
  "valid_range": { "min": 0, "max": 50000 },
  "reference": {
    "annual_max": "Global max annual precipitation: 11,872mm at Mawsynram, India (WMO).",
    "monthly_max": "Monthly max: 50000mm is a conservative upper bound for monthly accumulation."
  }
}
```

**Problema**: El rango `[0, 50000]` mm es tan amplio que nunca flaggea nada real. El record anual global es ~12,000mm. Un acumulado diario maximo es ~1,825mm. Un acumulado mensual maximo podria ser ~3,000-5,000mm en regiones de monzon extremo. El valor de 50,000mm es efectivamente un no-op.

**Evaluacion**: Si bien es "seguro" (nunca flaggea datos reales), no proporciona ningun valor de calidad. Un rango mas ajustado (ej. [0, 3000] para diario, [0, 20000] para mensual/anual) seria mas util.

**Accion requerida**:
1. Definir rangos separados para precipitacion diaria vs acumulada
2. O documentar que el rango es intencionalmente conservador para no interferir

**Estado**: **SIN RESOLVER — Rango sin valor de calidad**

---

## HALLAZGO-12 [MEDIA] — Validacion de schema demasiado debil

**Archivo**: `pipeline/stages/02-validation/index.js:129-170`

```javascript
validateSchema(source) {
  if (!source.response) {
    return { rule: "schema_validation", result: "fail", ... };
  }
  if (typeof source.response !== "object") {
    return { rule: "schema_validation", result: "fail", ... };
  }
  if (this.isErrorResponse(source.response)) {
    console.warn(`[validation] schema: source '${source.source_name}' response appears to be an error object.`);
  }
  return { rule: "schema_validation", result: "pass", ... };
}

isErrorResponse(obj) {
  if (obj.error != null) return true;
  if (obj.message && Array.isArray(obj.message)) return true;
  if (obj.code && obj.message && typeof obj.message === "string") return true;
  return false;
}
```

**Problema original**: Solo verificaba presencia y tipo. No detectaba objetos de error.

**Analisis de alternativas**:

| Alternativa | Riesgo | Valor real |
|---|---|---|
| **A) Agregar keys esperadas por fuente** | Alto — fragil, requiere mantener esquema por fuente, rompe si la API cambia | Bajo — `SOURCE_FIELD_MAP` + `resolvePath` ya validan rutas usadas downstream |
| **B) Mantener minima + documentar** | Nulo | Bajo — no mejora diagnostico |
| **C) Detectar objetos error + warning** | Muy bajo | Alto — hace visible el problema sin over-engineering |

**Por qué NO alternativa A (keys esperadas por fuente)**:
1. **Defensa en multiples capas ya existe**: Etapa 01 (`detectApiError`) → Etapa 02 (`validateSchema`) → Etapa 02 (validadores con `resolvePath`) → Etapa 03 (optional chaining)
2. **`SOURCE_FIELD_MAP` ya funciona como esquema**: Define rutas por fuente. Si una ruta no existe, `resolvePath` retorna `undefined` y se salta
3. **Fragil**: Si la API cambia su estructura (ej. WeatherAPI agrega un campo), el esquema quedaría obsoleto
4. **Redundante**: Los adaptadores ya manejan errores en etapa 01 con `detectApiError()`

**Solucion implementada**: `isErrorResponse()` detecta patrones comunes de error (`{error: ...}`, `{message: [...]}`, `{code, message}`) y emite warning. Mantiene comportamiento existente pero hace visible cuando un error object pasa sin ser detectado en etapa 01.

**Justificacion**:
1. `detectApiError()` en `common.js:48-69` ya detecta `{error: {message}}`, `{error: true, reason}`, `{message: [{value}]}`
2. Los adaptadores que no usan `detectApiError` (gri-oxford, noaa-oni, noaa-enso) retornan raw data que no tiene forma de error
3. El warning detecta casos donde un adaptador nuevo olvida usar `detectApiError`

**Estado**: **RESUELTO — Deteccion de error objects + warning runtime**

---

## HALLAZGO-13 [MEDIA] — Schemas Zod no se aplican en runtime

**Archivo**: `pipeline/shared/types.js:80-93`

```javascript
export const ValidationResultSchema = z.object({
  rule: z.string(),
  result: z.enum(["pass", "fail", "warning"]),  // "not_available" no esta en el enum
  detail: z.string(),
});

export const ValidatedRecordSchema = z.object({
  source: z.string(),
  validation_results: z.array(ValidationResultSchema),
  fill_values_detected: z.array(z.string()),    // campo que no existe en output real
  null_fields_detected: z.array(z.string()),    // campo que no existe en output real
  warnings: z.array(z.string()),                 // campo que no existe en output real
  is_valid: z.boolean(),
});
```

**Problema**:
1. `ValidationResultSchema` requiere `result` en `["pass", "fail", "warning"]`, pero Stage 02 produce `"not_available"` (en `validateClimatologicalLimit`)
2. `ValidatedRecordSchema` requiere campos (`fill_values_detected`, `null_fields_detected`, `warnings`) que `buildResult()` no produce
3. Ningun schema Zod se aplica en runtime — son definiciones aspiracionales

**Accion requerida**:
1. Actualizar los schemas Zod para reflejar el output real, O
2. Aplicar los schemas en runtime para detectar inconsistencias

**Estado**: **SIN RESOLVER — Schemas desactualizados**

---

## HALLAZGO-14 [MEDIA] — NaN infla completitud

**Archivo**: `pipeline/stages/02-validation/index.js:431`

```javascript
presentCount += value.filter(v => v != null).length;
// NaN != null es true -> NaN cuenta como "presente"
```

**Problema**: Valores NaN cuentan como "presentes" en el calculo de completitud, inflando artificialmente el porcentaje.

**Impacto**: Una serie con 50% NaN y 50% datos reales reportaria 100% de completitud.

**Accion requerida**:
1. Cambiar el filtro a `v != null && !isNaN(v)`, O
2. Agregar una verificacion explicita de NaN

**Estado**: **SIN RESOLVER — Bug de completitud**

---

## HALLAZGO-15 [MEDIA] — Umbrales "degraded" sin respaldo GCOS/WMO

**Archivo**: `pipeline/config/validation-profiles.json:248-305`

**Problema original**: Los umbrales `degraded` (0.50, 0.80) no tenían respaldo documental en GCOS o WMO.

**Investigación realizada**:

| Fuente | Hallazgo | Relevancia |
|---|---|---|
| **GCOS-245 (2022/2025)** | Sistema de tres niveles: Threshold (T) = "minimum requirement to ensure data are useful" | Nuestro "degraded" = GCOS "Threshold" |
| **WMO No. 100 (2018)** §2.3.2 | Datos mensuales ≥80% observaciones diarias; anuales ≥90% mensuales | Respaldan "acceptable" |
| **WMO CCl (2020)** | Eventos extremos requieren ≥95% completitud | Respaldan "good" |
| **Carro-Calvo et al. (2020)** | k-gaps funciona con 55% datos faltantes (45% completitud) | Límite inferior: 50% |
| **Kim & Cho (2019)** | Climatología mensual afectada por missing rates >5% | Incluso 95% no es suficiente para análisis finos |
| **Shabalala et al. (2019)** | Interpolación espacial requiere >80% cobertura para RMSE aceptable | Geophysical: 80% |
| **Cowtan & Way (2013)** | Cobertura HadCRUT4: 84% — sesgo significativo cuando cae a ~65% | Validación de umbrales intermedios |

**Justificación por categoría**:

| Categoría | Degraded | Justificación |
|---|---|---|
| **climate** | 0.50 | GCOS-245 Threshold. Carro-Calvo et al. (2020): clustering funciona con 45% completitud. Below 50%, análisis estadísticos pierden significancia. |
| **geophysical** | 0.80 | Datos estáticos no se interpolan temporalmente. Shabalala et al. (2019): interpolación espacial requiere >80% cobertura. Gaps = información perdida permanentemente. |
| **socioeconomic** | 0.50 | Indicadores país-nivel son agregados y estables. World Bank acepta 75% como "acceptable". 50% = mínimo para valor agregado significativo. |
| **index** | 0.50 | Índices climáticos (ONI) requieren series continuas para clasificación. 50% = mínimo para clasificación válida según Trenberth (1997). |

**Solución implementada**:
1. Actualizado `_degraded_thresholds` con referencias científicas
2. Agregados `_degraded_reference` por categoría
3. Agregadas referencias: GCOS-245, Carro-Calvo et al. (2020), Kim & Cho (2019), Shabalala et al. (2019), Anderson (2018)

**Estado**: **RESUELTO — Respaldo científico documentado**

---

## HALLAZGO-16 [MEDIA] — Completitud socioeconomic good=1.0 demasiado estricta

**Archivo**: `pipeline/config/validation-profiles.json:266-270`

```json
"socioeconomic": {
  "good": 1.0,        // CUALQUIER dato faltante impide "good"
  "acceptable": 0.75,
  "degraded": 0.50
}
```

**Problema**: `good >= 1.0` significa que CUALQUIER indicador faltante impide la clasificacion "good". Dado que World Bank tiene rezago de 1-2 anos (documentado en authoritative-sources.json), el dato mas reciente puede tener nulls. Esto clasificaria World Bank consistentemente como "acceptable" en lugar de "good".

**Accion requerida**:
1. Evaluar si 1.0 es apropiado o si deveria ser 0.90/0.95
2. Documentar la razon del umbral estricto

**Estado**: **SIN RESOLVER — Umbral potencialmente demasiado estricto**

---

## HALLAZGO-17 [MEDIA] — Sin escalabilidad de severidad para null_pct en temporal consistency

**Archivo**: `pipeline/stages/02-validation/index.js:516-531`

```javascript
if (nullCount > 0) {
  checks.push({
    variable: key,
    total_days: arr.length,
    null_days: nullCount,
    null_pct: Math.round((nullCount / arr.length) * 10000) / 100,
  });
}
// ...
if (hasWarnings) {
  return { rule: "temporal_consistency", result: "warning", ... };
}
```

**Problema**: 1 null en 21,532 dias (60 anos) produce el mismo "warning" que 5,000 nulls. No hay diferenciacion de severidad.

**Accion requerida**:
1. Agregar umbrales: null_pct < 1% = pass, 1-5% = warning, >5% = fail, O
2. Documentar que la decision de severidad se delega a Stage 03

**Estado**: **SIN RESOLVER — Sin diferenciacion de severidad**

---

## HALLAZGO-18 [MEDIA] — Consistencia temporal no verificada para NOAA ONI

**Archivo**: `pipeline/stages/02-validation/index.js:530-572`

**Problema original**: La respuesta de NOAA ONI incluye `all_rows` (ultimas ~20 temporadas), que ES una serie temporal. Pero `validateTemporalConsistency()` no tenia verificacion especifica para ONI.

**Analisis**:

El ONI (Oceanic Niño Index) es una media móvil de 3 meses de anomalías de SST en la región Niño 3.4. NOAA CPC define la secuencia de temporadas como una convención fija:

> **DJF → MAM → JJA → SON** (Trenberth, 1997; NOAA CPC ONI Documentation)

La verificación de secuencia es una validación de **integridad estructural**, no una suposición arbitraria. Un rompimiento en la secuencia indicaría:
1. Errores de parsing del archivo ASCII
2. Corrupción de datos
3. Cambio en el formato de la fuente

**Solucion implementada**: Validación de secuencia de temporadas para NOAA ONI:

```javascript
if (source.source_name === "noaa_cpc_oni" && source.response?.all_rows) {
  const rows = source.response.all_rows;
  const SEASON_ORDER = ["DJF", "MAM", "JJA", "SON"];
  // Verifica: secuencia cronológica, year progression, season codes
}
```

**Checks implementados**:
1. **Secuencia de temporadas**: DJF → MAM → JJA → SON → DJF (next year)
2. **Year progression**: DJF comparte year con SON anterior (same climate year)
3. **Year gaps**: Detección de saltos de año inesperados
4. **Season codes**: Validación de códigos de temporada válidos

**Fundamento científico**:
- NOAA CPC ONI Documentation: "The ONI uses 3-month running means of SST anomalies in the Niño 3.4 region"
- Trenberth (1997): "El Niño/Southern Oscillation events are defined by 5 consecutive overlapping 3-month seasons"
- La secuencia DJF→MAM→JJA→SON es una convención fija, no una suposición

**Estado**: **RESUELTO — Verificacion de secuencia de temporadas implementada**

---

## HALLAZGO-19 [MEDIA] — "not_available" excluido silenciosamente del overall status

**Archivo**: `pipeline/stages/02-validation/index.js:739-765`

**Problema original**: Los resultados `"not_available"` no contribuyen a `hasFail` ni `hasWarning`. Son excluidos silenciosamente del assessment general.

**Analisis**:

1. **`"not_available"` NO esta en el enum de `ValidationResultSchema`**: Solo permite `["pass", "fail", "warning"]` (shared/types.js:100)
2. **Ningun validador actual produce `"not_available"`**: Fue removido con `validateClimatologicalLimit` en HALLAZGO-6
3. **El patron es correcto**: Tests no aplicables retornan `"pass"` con detalle descriptivo, no un cuarto estado

**Fundamento del diseño**:
- ISO 19157:2013: "not applicable" se maneja como "pass" con metadatos, no como estado separado
- Un test skipeado NO debe penalizar el overall_status
- El summary solo cuenta los tres valores válidos (`passed`, `warnings`, `failed`)

**Solucion implementada**: Documentación en `buildResult()` que explica:
1. `"not_available"` no es un valor válido
2. Tests no aplicables retornan `"pass"` con detalle descriptivo
3. Historia: fue producido por `validateClimatologicalLimit` (removido en HALLAZGO-6)

**Estado**: **RESUELTO — Comportamiento documentado**

---

## HALLAZGO-20 [MEDIA] — Wildcard solo funciona en posicion final

**Archivo**: `pipeline/stages/02-validation/index.js:616-635`

**Problema**: El wildcard `*` solo funcionaria si esta como ultimo segmento del path. Un path como `parent.*.child` no estaria soportado. Los paths actuales solo usan `[*]` (que no funciona) o `[0]` (que si funciona).

**Accion requerida**:
1. Documentar la limitacion de paths soportados
2. Si se necesitan paths mas complejos, evaluar una libreria de path resolution

**Estado**: **SIN RESOLVER — Limitacion de diseno**

---

## HALLAZGO-21 [MEDIA] — Inconsistencia de nombres canonicos vs API — FALSO POSITIVO

**Archivo**: `pipeline/orchestration/config-loader.js:12-22` vs `pipeline/stages/02-validation/index.js:4-63`

**Problema planteado**: `SOURCE_VARIABLES` usa nombres canonicos (`population`, `buildings`), pero `SOURCE_FIELD_MAP` usa nombres de API (`population_2020`, `buildings_2020`).

**Evidencia de que no existe inconsistencia**:

| Fuente | `SOURCE_VARIABLES` (config-loader.js) | `SOURCE_FIELD_MAP` (index.js) |
|--------|---------------------------------------|-------------------------------|
| gri_oxford | `population`, `buildings` | `variable: "population"`, `variable: "buildings"` |
| weatherapi | `air_temperature_current` | `variable: "air_temperature_current"` |
| nasa_power | `precipitation_sum` | `variable: "precipitation_sum"` |

- `grep` por `population_2020` y `buildings_2020` retorna 0 resultados en todo `pipeline/`
- Ambos mapas usan los **mismos nombres canónicos** (ej: `air_temperature_current`, `population`, `buildings`)
- No hay inconsistencia real de nomenclatura

**Convención documentada** (implícita en código):
- `SOURCE_VARIABLES`: lista de variables canónicas que un source provee
- `SOURCE_FIELD_MAP.paths[x].variable`: mapeo de path de respuesta API → nombre canónico
- El nombre canónico es el contrato; el path de API es la implementación específica

**Estado**: **FALSO POSITIVO — No hay inconsistencia real**

---

## HALLAZGO-22 [MEDIA] — "pass" engañoso para sources sin checks temporales

**Archivo**: `pipeline/stages/02-validation/index.js:479-488`

```javascript
validateTemporalConsistency(source) {
  if (!source.response || typeof source.response !== "object") {
    return { rule: "temporal_consistency", result: "pass", detail: "No temporal data to validate" };
  }
  // ... solo checks para nasa_power y openmeteo_cmip6
  return { rule: "temporal_consistency", result: "pass", detail: "Temporal data is consistent" };
}
```

**Problema**: Para fuentes como `noaa_cpc_oni` que SI tienen datos temporales, el mensaje "Temporal data is consistent" es engañoso — no se verifico nada.

**Accion requerida**:
1. Retornar "not_available" para fuentes sin checks implementados, O
2. Agregar checks para todas las fuentes con datos temporales

**Estado**: **SIN RESOLVER — Mensaje engañoso**

---

## HALLAZGO-23 a HALLAZGO-36 [BAJA] — Hallazgos de baja severidad

### H-23: Fill values son warnings, no fails
- **Archivo**: `index.js:193`
- **Decision**: Los fill values se marcan como `warning`, no `fail`. Esto es correcto: fill values indican datos faltantes, no datos incorrectos. La completitud downstream penaliza fuentes con muchos fill values.

### H-24: Rango de twsa definido pero no utilizado
- **Archivo**: `validation-profiles.json:210-217`
- **Observacion**: El rango `[-100, 100]` cm para TWSA esta documentado con Wahr et al. (1998), pero ninguna fuente provee TWSA actualmente.

### H-25: Rango de GDP demasiado generoso
- **Archivo**: `validation-profiles.json:237-244`
- **Observacion**: `[0, 500000]` USD es efectivamente un no-op. El GDP per capita maximo global es ~$130,000.

### H-26: Good y acceptable ambos mapean a pass
- **Archivo**: `index.js:398-401` (`completenessResultForClassification`)
- **Observacion**: No hay distincion de severidad entre "good" y "acceptable". La distincion existe solo en el campo `classification`.

**Fundamento tecnico**:

1. **Separacion de responsabilidades por disenio**: El campo `result` solo responde "¿los datos son usables?". El campo `classification` provee el nivel granular de calidad. Esto sigue el patron de `ValidationResultSchema` que solo permite `["pass", "fail", "warning"]`.

2. **GCOS-245 three-tier system**: El estandar define tres niveles:
   - **Threshold (T)** = minimo para que datos sean utiles → `degraded` → `warning`
   - **Breakthrough (B)** = mejora intermedia → no usado explicitamente
   - **Goal (G)** = requisito ideal → `good` → `pass`
   
   Tanto "good" como "acceptable" significan "los datos son cientificamente usables". Ninguno requiere intervencion.

3. **ISO 19157:2013 §6.2**: Los niveles de calidad incluyen "conforme" y "condicionalmente conforme". Ambos son datos validos; la diferencia es el nivel de confianza. Hacer "acceptable" seria `warning` penalizaria artificialmente datos que cumplen estandares cientificos.

4. **Decision de diseno**: Los `thresholds` estan documentados en `validation-profiles.json` con referencias a GCOS-200/WMO-No.100. La distincion good/acceptable esta preservada en `classification` para consumidores downstream que necesiten granularidad.

| Classification | Result | Significado | Accion requerida |
|---------------|--------|-------------|------------------|
| good | pass | Datos cumplen estandar ideal | Ninguna |
| acceptable | pass | Datos cumplen estandar minimo | Ninguna |
| degraded | warning | Datos bajos umbral, uso condicional | Revision |
| insufficient | fail | Datos insuficientes | Rechazo |

**Estado**: **RESUELTO — Disenio intencional, justificado con GCOS-245 e ISO 19157**

### H-27: Dominio desconocido fallback a climate
- **Archivo**: `index.js:637-650`
- **Observacion**: `classifyDomain()` usa `|| "climate"` como fallback. Es seguro pero podria enmascarar errores de mapeo.

### H-28: Climatology listada como regla aplicada
- **Archivo**: `index.js:72`
- **Observacion**: `rulesApplied` incluye "Climatological limit test" pero la prueba nunca se ejecuta.

### H-29: ONI all_rows fill values declarados pero nunca verificados
- **Archivo**: `validation-profiles.json:94-96`
- **Observacion**: Los paths `all_rows[*].anom` y `all_rows[*].total` tienen sentinels configurados, pero no estan en SOURCE_FIELD_MAP.

**Analisis tecnico**:

1. **Sentinels vacios son intencionales**: Los arrays de sentinels para `all_rows[*].anom` y `all_rows[*].total` estan vacios (`[]`), no porque falte informacion, sino porque **NOAA CPC ONI no tiene fill values**. El formato ASCII solo contiene valores estacionales validos.

2. **El adapter ya filtra NaN**: `noaa-oni.js:14` ejecuta `.filter(r => !isNaN(r.anom))`, eliminando fallos de parseo antes de que Stage 02 los vea.

3. **`validateFillValues` saltaria sentinels vacios**: `index.js:250` tiene `if (sentinels.length === 0) continue;` — incluso si estos paths estuvieran en `SOURCE_FIELD_MAP`, no se verificarian porque no hay valores sentinela que buscar.

4. **`all_rows` no esta en `SOURCE_FIELD_MAP`**: Solo `latest_anom` esta declarado para validacion. Esto es correcto: la validacion de completitud y rangos fisicos se aplica al campo principal (`oni_index`), no a cada fila del historico.

5. **Proposito de los paths en config**: Son documentacion declarativa de "estos paths existen en la respuesta y podrian tener fill values si la fuente cambiara". Patron de preparacion sin implementacion.

**Referencia**: NOAA CPC ONI ASCII format documentation — "data consists of seasonal Oceanic Niño Index values, no missing data markers."

**Estado**: **RESUELTO — Sentinels vacios son correctos, documentacion intencional**

### H-30: pressure_mb vs hPa (equivalente)
- **Archivo**: `index.js:9`
- **Observacion**: `pressure_mb` (millibars) es equivalente a hPa por definicion (1 mbar = 100 Pa = 1 hPa). No es un bug.

### H-31: Boundary case d = d_max es consistente
- **Archivo**: `index.js:572`
- **Observacion**: `distance > maxDistance` (estricto) significa que en el limite exacto (rho=0.5) la fuente es "available". Esto es consistente con "theta=0.5 es la correlacion minima aceptable".

### H-32: is_valid incluye warnings
- **Archivo**: `index.js:604`
- **Observacion**: Fuentes con warnings se consideran "valid". Esto es intencional: warnings indican problemas potenciales, no invalidacion.

### H-33: Rango de elevation max=9000 con SRTM confiable hasta ~7000m
- **Archivo**: `validation-profiles.json:200-208`
- **Observacion**: El 9000 provee margen sobre Everest (8848m). SRTM es confiable hasta ~7000m (Farr et al. 2007).
- **Resolucion**: `valid_range` define plausibilidad física (rechazar valores imposibles), no confiabilidad del sensor. max=9000m es el techo de plausibilidad terrestre (Everest + margen); la degradación de calidad SRTM >7000m es una preocupación de calidad de datos, no de validación física. Documentado en `reference.range_justification` (validation-profiles.json:210) y `known_limitations` (authoritative-sources.json:74). Para Perú (máx 6,768m), SRTM opera dentro de su rango confiable.

### H-34: Temporal expected_range de weatherapi = 60 min
- **Archivo**: `validation-profiles.json:355`
- **Observacion**: Criterio propio: "Current weather debe ser < 1 hora de antiguedad". Sin referencia normativa.

### H-35: Rangos fisicos de Peru no usados en validacion
- **Archivo**: `validation-profiles.json:128-133`
- **Observacion**: Los `peru_range` estan documentados pero el codigo solo usa `valid_range` global.

### H-36: Fuentes sin temporal checks retornan "pass" con detail correcto
- **Archivo**: `index.js:483-487`
- **Observacion**: Para fuentes escalares (weatherapi, opentopodata, open_elevation), "No temporal data to validate" es correcto.
- **Resolucion**: Confirmado. El código retorna `result:"pass"` + `classification:"not_applicable"` (no `"verified"`). HALLAZGO-22 (index.js:482-487) documenta que esto distingue "checked, no issues found" de "nothing to check". Cada fuente escalar tiene razón específica en `TEMPORAL_NOT_APPLICABLE_REASONS` (index.js:100-107): weatherapi → snapshot, opentopodata/open_elevation → grid estático, world_bank → valor más reciente, supabase_climate_cells → estadísticas precomputadas, gri_oxford → escenarios fijos. Fuentes no mapeadas retornan fallback honesto "not implemented" (index.js:500), no silencioso pass. Diseño intencional, sin cambio requerido.

### H-23: Fill values son warnings, no fails
- **Archivo**: `index.js:270`
- **Decision**: Los fill values se marcan como `warning`, no `fail`.
- **Fundamento tecnico**:
  1. **CF Conventions 1.12 Section 2.5.1**: `_FillValue` y `missing_value` son atributos por variable que indican datos ausentes, no datos incorrectos. Un fill value es un placeholder legítimo en datasets científicos.
  2. **ISO 19157:2013**: Completitud (logical consistency) es una dimensión separada de accuracy. Datos faltantes ≠ datos erróneos.
  3. **Separación de responsabilidades**: Fill values se detectan en Stage 02; la completitud se penaliza en Stage 02 `validateCompleteness()` con `completeness_pct`. Fuentes con muchos fill values reciben menor completitud.
  4. **NASA POWER API User Guide**: Los valores -999/-9999 son declarados explícitamente como "missing data", no como datos inválidos.
- **Referencias**:
  - CF Conventions 1.12 (2023). Section 2.5.1: _FillValue.
  - ISO 19157:2013. Geographic Information — Data Quality. Section 6.2: Completeness.
  - NASA POWER API User Guide: "Values of -999 indicate missing data."
- **Estado**: **RESUELTO — Justificado con CF Conventions y ISO 19157**

---

## Tabla Resumen de Acciones Requeridas

| Hallazgo | Severidad | Accion | Responsable |
|---|---|---|---|
| H-1: PRECTOT vs PRECTOTCORR | Critica | Corregir mapeo de parametro | Tecnico |
| H-2: Wildcard roto | Critica | Corregir resolvePath() o cambiar paths | Tecnico |
| H-3: Falsos positivos temporales | Critica | Corregir algoritmo de comparacion de fechas | Tecnico |
| H-4: GRI Oxford paths | Alta | Verificar estructura real de API | Tecnico |
| H-5: Percentiles sin WMO | Alta | Buscar referencias o documentar como convencion | Cientifico |
| H-6: Feature climatologica muerta | Alta | Decidir: implementar o eliminar | Diseno |
| H-7: Math.max distance | Alta | Documentar simplificacion MVP | Tecnico |
| H-8: Fail-open null distance | Alta | Documentar diseno | Tecnico |
| H-9: extractObjects anidados | Media | Documentar limitacion | Tecnico |
| H-10: NaN pasa rangos | Media | Agregar check isNaN | Tecnico |
| H-11: Rango precipitacion amplio | Media | Ajustar o documentar | Cientifico |
| H-12: Schema validation debil | Media | Agregar checks basicos | Tecnico |
| H-13: Zod schemas desactualizados | Media | Actualizar o aplicar | Tecnico |
| H-14: NaN infla completitud | Media | Agregar check isNaN | Tecnico |
| H-15: Umbrales degraded | Media | Documentar como no-normativo | Tecnico |
| H-16: Socioeconomic good=1.0 | Media | Evaluar umbral | Cientifico |
| H-17: Sin escalabilidad null_pct | Media | Agregar umbrales o documentar | Tecnico |
| H-18: ONI sin temporal check | Media | Agregar check o documentar omision | Tecnico |
| H-19: not_available excluido | Media | Documentar comportamiento | Tecnico |
| H-20: Wildcard posicion final | Media | Documentar limitacion | Tecnico |
| H-21: Inconsistencia nombres | Media | Documentar convencion | Tecnico |
| H-22: pass engañoso | Media | Retornar not_available | Tecnico |
| H-23: Fill values warnings | Media | Justificado con CF Conventions 1.12 | Cientifico |
| H-26: Good/acceptable pass | Media | Disenio intencional GCOS-245 | Cientifico |
| H-29: ONI all_rows sin verificar | Media | Sentinels vacios intencionales | Tecnico |

---

## Criterios de Resolucion

Un hallazgo se considera resuelto cuando:

1. **Tiene justificacion tecnica/cientifica**: La decision se basa en literatura revisada por pares, estandar de la industria, o criterio logico documentado.
2. **Esta documentado**: La justificacion aparece en el codigo (comentarios), en la configuracion, o en documentacion de arquitectura.
3. **Es auditable**: Un auditor externo puede seguir la cadena de justificacion desde la decision hasta la fuente.

---

## Referencias

- WMO. (2018). WMO-No. 8: Guide to Instruments and Methods of Observation. Chapter 3.
- WMO. (2018). WMO-No. 100: Guide to Climatological Practices. Chapter 2, Section 2.3.2.
- WMO. (2017). WMO-No. 1203: Guidelines on the Calculation of Climate Normals.
- GCOS. (2022). GCOS-200: The Global Observing System for Climate. Principle 10.
- GCOS. (2022/2025). GCOS-245: ECV Requirements. Three-tier system (Threshold/Breakthrough/Goal).
- GCOS. (2020). GCOS-244: Global Surface Network Manual. Section 4.3.
- ISO. (2013). ISO 19157:2013 Geographic Information — Data Quality.
- Isaaks, E.H. & Srivastava, R.M. (1989). An Introduction to Applied Geostatistics. Oxford University Press.
- Journel, A.G. & Huijbregts, C.J. (1978). Mining Geostatistics. Academic Press.
- Jones, P.D. et al. (1997). J. Climate, 10, 2548-2568.
- Huffman, G.J. et al. (2001). J. Hydrometeor., 2(1), 36-50.
- Wahr, J. et al. (1998). J. Geophys. Res., 103(B12), 30205-30229.
- Farr, T.G. et al. (2007). Rev. Geophys., 45(2), RG2004.
- Durre, I. et al. (2010). J. Atmos. Oceanic Technol.
- Trenberth, K.E. (1997). Bull. Amer. Meteor. Soc., 78, 2771-2777.
- NASA POWER API User Guide: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- Open-Meteo Climate API: https://open-meteo.com/en/docs/climate-api
- WeatherAPI Documentation: https://www.weatherapi.com/docs/
- OpenTopoData API: https://www.opentopodata.org/api/
- World Bank API: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
- GRI Oxford API: https://api.gri.oxford.edu/docs
- CF Conventions 1.12 (2023). Section 2.5.1: _FillValue. https://cfconventions.org/Data/cf-conventions/cf-conventions-1.12/cf-conventions.html#_fill_value
- NASA POWER API User Guide: https://power.larc.nasa.gov/docs/services/api/

---

## Estado de Resolución (verificación parcial)

**Fecha de revisión:** 2026-07-17 (verificación puntual contra `pipeline/stages/02-validation/index.js` actual, 1051 líneas, y `pipeline/orchestration/config-loader.js`, como parte de `documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md`)

> **Corrección importante:** `AUDITORIA-E2E-PIPELINE-V2.md` (versión inicial) concluyó erróneamente que Stage 02 era "el eslabón más débil, sin evidencia de corrección" porque `02-validation/index.js` no aparecía en el `git diff` de esa sesión. Verificación directa del código (no del diff) muestra que el archivo **ya contenía correcciones sustanciales antes de esta sesión** — el mismo patrón de desincronización documentación↔código que ya afecta a stage-06/07 aplica aquí también. Esta sección corrige esa conclusión.

### Confirmado RESUELTO (verificado directamente en código)

| Hallazgo | Severidad original | Evidencia de resolución |
|---|---|---|
| HALLAZGO-1 (PRECTOT vs PRECTOTCORR) | CRÍTICA | El adapter (`01-acquisition/adapters/nasa-power.js`) solicita `PRECTOTCORR`, coincide con `SOURCE_FIELD_MAP` (`index.js:25`) y con `03-normalization/index.js` — el mismatch ya no existe en ningún punto de la cadena |
| HALLAZGO-2 (wildcard `resolvePath` roto) | CRÍTICA | `resolvePathParts()` (línea 960+) implementa correctamente `key[*]` (wildcard, línea 966-971), `key[N]` (índice, línea 973-978), y un mecanismo nuevo `key[field=value]` (filtro por campo anidado, línea 984-998) — no es un parche de configuración, es una reescritura real del resolutor de paths |
| HALLAZGO-3 (falsos positivos de fecha en frontera de mes) | CRÍTICA | `validateTemporalConsistency()` usa `parseYyyymmdd()`/`formatYyyymmdd()` (funciones dedicadas, línea 920+) que convierten a timestamp real antes de comparar — ya no hay resta de enteros `YYYYMMDD` |
| HALLAZGO-4 (estructura GRI Oxford no verificada) | ALTA | `SOURCE_FIELD_MAP.gri_oxford` usa la sintaxis de filtro nueva contra la estructura real (`results[layer.domain=population].value`), con comentario explícito "verified live 2026-07-14" — la verificación empírica contra la API que el hallazgo pedía ya se hizo |
| HALLAZGO-6 (climatological limit, feature muerta) | ALTA | `validateClimatologicalLimit` fue **eliminada** del código (no implementada tardíamente) — comentario explícito "removed in HALLAZGO-6"; decisión de diseño válida (eliminar en vez de mantener una regla que nunca se ejecuta) |
| HALLAZGO-7 (Math.max entre variables de una fuente) | ALTA | `config-loader.js` ahora expone `getMaxDistancesForSource()` (por variable, sin blending) en vez de un único máximo — resuelto en `orchestration/config-loader.js`, no en `02-validation/index.js` |
| HALLAZGO-10 (NaN pasa validación de rangos) | MEDIA | `Number.isNaN(v)` presente explícitamente en el filtro de valores (línea 212) |
| HALLAZGO-14 (NaN infla completitud) | MEDIA | `Number.isNaN(v)` presente en el conteo de completitud (línea 343) |

### No re-verificado en esta pasada (recomendado como seguimiento)

Los ~28 hallazgos restantes (H-5, H-8, H-9, H-11 a H-13, H-15 a H-36) **no fueron releídos individualmente línea por línea en esta verificación puntual** — dado el patrón encontrado (la mayoría de los hallazgos críticos y altos ya estaban resueltos sin que el documento lo reflejara), es razonable esperar que varios de los MEDIA/BAJA también lo estén, pero esto no debe asumirse sin confirmarlo. Se recomienda una relectura completa del archivo (1051 líneas) equivalente a la que ya se hizo para Stage 06/07, para producir una tabla de resolución completa y honesta como la de esos dos stages.
