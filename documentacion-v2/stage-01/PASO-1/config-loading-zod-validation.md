# PASO-1 — Carga de Configuración, Cache y Validación Zod

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `config-loader.js` → `loadConfig()` + `getAuthoritativeSources()` |
| **Ubicación** | `pipeline/orchestration/config-loader.js:1-42`, `pipeline/shared/types.js:12-17` |
| **Stage** | Stage 01 — Acquisition (ID: 1) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-14 |
| **Propósito** | Documentación del primer paso del pipeline: carga, cache y validación del registro de fuentes autoritativas |

---

## 1. Resumen Ejecutivo

PASO-1 es el punto de entrada de configuración del Stage 01. Antes de que cualquier adapter se invoque, `getAdapters()` llama a `getAuthoritativeSources()` que carga `authoritative-sources.json` desde disco, lo cachea en memoria con TTL de 60 segundos, y lo valida estructuralmente contra un esquema Zod. Si el archivo no existe, es ilegible, o tiene estructura inválida, el pipeline falla con error fatal antes de intentar cualquier consulta externa.

Este paso es **pre-condición obligatoria** para todos los pasos posteriores. Sin configuración válida, el pipeline no sabe qué fuentes consultar ni con qué adapters hacerlo.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
PipelineEngine.run(input)                                   // engine.js:22
  │
  └── Stage01Acquisition.execute(input)                     // index.js:40
        │
        └── this.registry.executeAll(location)              // registry.js:33
              │
              └── this.getAdapters()                        // registry.js:12
                    │
                    └── getAuthoritativeSources()           // ← PASO ANALIZADO (config-loader.js:39)
                          │
                          ├── loadConfig("authoritative-sources.json")
                          │     ├── Cache hit? → return cached
                          │     └── Cache miss:
                          │           ├── existsSync() → Error si no existe
                          │           ├── readFileSync() → JSON string
                          │           ├── JSON.parse() → objeto JS
                          │           └── cache.set() con TTL 60s
                          │
                          └── AuthoritativeSourcesSchema.parse()  // Zod validation
                                └── Si falla → ZodError (fatal)
```

### 2.2 Flujo de datos

```
authoritative-sources.json (disco)
        │
        ├── [cache miss] → readFileSync → JSON.parse → cache (Map, TTL 60s)
        │
        └── [cache hit] → return cached.value
              │
              └── AuthoritativeSourcesSchema.parse(raw)
                    │
                    ├── success → { sources: { observation_current: {...}, ... } }
                    └── failure → ZodError (detiene pipeline)
```

---

## 3. Descripción Detallada del Flujo

### 3.1 Invocación

`getAuthoritativeSources()` (config-loader.js:39-42) es la función de entrada:

```javascript
export function getAuthoritativeSources() {
  const raw = loadConfig("authoritative-sources.json");
  return AuthoritativeSourcesSchema.parse(raw);
}
```

Es llamada por `SourceRegistry.getAdapters()` (registry.js:13) en cada ejecución del pipeline.

### 3.2 Mecanismo de cache (config-loader.js:9-37)

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
| **Cache en memoria (Map)** | Evitar I/O de disco síncrono (`readFileSync`) en ejecuciones consecutivas del pipeline | Bajo volumen de consultas (1-100/día), configuración tiny (~11KB). Un Map es suficiente. |
| **TTL de 60 segundos** | Balance entre frescura de configuración y rendimiento | Los archivos de configuración no cambian en runtime. 60s permite hot-reload en desarrollo sin overhead. |
| **`readFileSync` en vez de `readFileSync`** | Simplificar flujo de carga | El archivo es pequeño (11KB). `readFileSync` bloquea el event loop ~0.1ms, aceptable para el volumen actual. |

### 3.3 Validación Zod (shared/types.js:12-17)

```javascript
export const AuthoritativeSourcesSchema = z.object({
  sources: z.record(z.object({
    authoritative: z.string().min(1),
    domain: z.string().min(1),
  }).passthrough())
  .refine(s => Object.keys(s).length > 0, { message: "sources cannot be empty" }),
}).passthrough();
```

**Campos validados:**

| Campo | Tipo | Restricción | Propósito |
|---|---|---|---|
| `sources` | `Record<string, object>` | No vacío (`.refine`) | Garantizar que hay al menos un dominio configurado |
| `sources.*.authoritative` | `string` | `min(1)` | Nombre de la fuente autoritativa (no puede ser string vacío) |
| `sources.*.domain` | `string` | `min(1)` | Descripción del dominio (no puede ser string vacío) |

**Campos permitidos pero no validados (`.passthrough()`):** `selection_type`, `selection_rationale`, `complementary`, `resolution`, `resolution_reference`, `coverage`, `known_limitations`, `notes`. Estos campos son necesarios para trazabilidad y gobernanza, pero no son requeridos para la ejecución del pipeline.

### 3.4 Errores posibles

| Escenario | Error | Fatal? | Mitigación |
|---|---|---|---|
| Archivo no existe | `Error("Config file not found: ...")` | **Sí** | El pipeline no puede operar sin fuentes configuradas |
| JSON inválido | `SyntaxError` en `JSON.parse()` | **Sí** | Error de formato detectado inmediatamente |
| `sources` vacío | `ZodError("sources cannot be empty")` | **Sí** | Previenen ejecución sin fuentes |
| `authoritative` vacío | `ZodError` en `z.string().min(1)` | **Sí** | Previenen lookup fallido en `getAdapters()` |

---

## 4. Archivo de configuración: authoritative-sources.json

### 4.1 Estructura

El archivo define 8 dominios de información climática. Cada dominio tiene:

| Campo | Tipo | Descripción |
|---|---|---|
| `domain` | string | Descripción legible del dominio (ej: "observación actual") |
| `authoritative` | string | Nombre de la fuente primaria (ej: "weatherapi") |
| `complementary` | string[] | Fuentes alternativas/compañeras (ej: ["open_elevation"]) |
| `selection_type` | string | Clasificación de la selección (ver §4.2) |
| `resolution` | string | Resolución espacial declarada |
| `coverage` | string | Cobertura geográfica |

### 4.2 Tipos de selección

| Tipo | Significado | Ejemplo |
|---|---|---|
| `scientific_standard` | La fuente ES el estándar científico reconocido y es accesible via REST API gratuita | NASA POWER (MERRA-2), World Bank, NOAA CPC ONI |
| `operational_proxy` | La fuente redistribuye datos cuya fuente primaria es otra. Se elige por disponibilidad de API, no por superioridad científica | WeatherAPI (proxy de ERA5/ISD), Open-Meteo (proxy de ESGF CMIP6) |
| `best_available_via_api` | No existe fuente científicamente superior con REST API pública gratuita | OpenTopoData SRTM30m, GRI Oxford |
| `derived_cache` | Grilla o store propio derivado de fuentes externas | Supabase climate_cells |

### 4.3 Selección de fuentes: justificación científica

Cada dominio tiene una justificación documentada en `authoritative-sources.json` bajo la clave `selection_rationale`. Ejemplos:

- **NASA POWER** (observation_historical): "NASA POWER es la interfaz oficial de MERRA-2, reanálisis reconocido por WMO." Referencia: Gelaro et al. (2017), J. Climate, 30(14), 5419-5454.
- **NOAA CPC ONI** (enso): "ONI de NOAA CPC es el índice oficial para clasificación de eventos El Niño/La Niña." Referencia: Trenberth (1997), Bull. Amer. Meteor. Soc., 78, 2771-2777.

---

## 5. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Configuración en JSON externo** | Separación de datos de código; permite revisión científica por no-programadores | Gobernanza, versionabilidad | Error tipográfico puede silenciar un dominio (mitigado por Zod) |
| **Cache TTL 60s** | Evitar I/O en ejecuciones cercanas | Rendimiento bajo carga | Cambios tardan hasta 60s en reflejarse |
| **Validación Zod estructural** | Garantizar integridad mínima antes de usar | Detección temprana de errores | No valida semántica (un `authoritative` inexistente pasa validación) |
| **`.passthrough()` en schema** | Permitir campos adicionales sin romper validación | Flexibilidad para metadata adicional | Campos no validados pueden tener errores silenciosos |
| **`readFileSync` en vez de `readFileSync`** | Simplificar flujo | Sincronía aceptable para archivo tiny | Bloquea event loop ~0.1ms (irrelevante para 1-100 consultas/día) |

---

## 6. Limitaciones y Riesgos

### 6.1 Validación solo estructural, no semántica

**Descripción**: Zod verifica que `authoritative` sea string no vacío, pero no verifica que el adapter exista en el `SourceRegistry`. Un dominio con `authoritative: "fuente_que_no_existe"` pasa validación pero falla silenciosamente en `getAdapters()` con `console.warn`.

**Impacto**: Un error tipográfico en el nombre de la fuente autoritativa no se detecta hasta la ejecución.

**Mitigación**: Los tests de consistencia en `tests-new/pipeline/stages/stage-01-registry-consistency.test.js` verifican que cada `authoritative` del JSON tiene adapter registrado.

### 6.2 `readFileSync` bloqueante

**Descripción**: `loadConfig()` usa `readFileSync`, que bloquea el event loop de Node.js.

**Impacto**: Para el volumen actual (1-100 consultas/día), el bloqueo de ~0.1ms es irrelevante. Si el sistema escala a miles de consultas concurrentes, migrar a `fs.promises.readFile` sería necesario.

**Riesgo**: Bajo en el alcance actual.

### 6.3 Cache sin invalidación por cambio de archivo

**Descripción**: El cache se invalida por TTL (60s), no por detección de cambios en el archivo.

**Impacto**: Si el archivo se modifica durante una ejecución del pipeline, el cambio se refleja en la siguiente ejecución (hasta 60s después).

**Riesgo**: Bajo. Los archivos de configuración no cambian en runtime.

---

## 7. Auditoría de Consistencia

### 7.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| Cache TTL | 60,000ms (`config-loader.js:9`) | 60 segundos | ✅ Consistente |
| Validación Zod | `AuthoritativeSourcesSchema` (`types.js:12-17`) | Documentada en §3.3 | ✅ Consistente |
| Error si archivo no existe | `existsSync` + throw (`config-loader.js:30-32`) | Documentado en §3.4 | ✅ Consistente |

### 7.2 Consumidores de la configuración

| Componente | Invocación | Consumo |
|---|---|---|
| `SourceRegistry.getAdapters()` | `getAuthoritativeSources()` | Itera `sources` para resolver adapters |
| `config-loader.js:getMaxDistanceForSource()` | `loadConfig("spatial-decorrelation.json")` | Calcula distancias máximas por variable (no es parte de PASO-1) |
| `config-loader.js:getThresholds()` | `loadConfig("thresholds.json")` | Umbrales de activación (no es parte de PASO-1) |

---

## 8. Conclusiones

### 8.1 ¿El diseño es técnicamente sólido?

Sí. PASO-1 es un paso simple pero crítico: carga un archivo JSON pequeño, lo valida estructuralmente, y lo cachea brevemente. La combinación de `readFileSync` + `JSON.parse` + Zod validation es la aproximación correcta para un archivo de configuración de ~11KB que no cambia en runtime.

### 8.2 Fortalezas

1. **Fail-fast**: Si la configuración falta o es inválida, el pipeline falla inmediatamente con un error claro.
2. **Cache simple**: TTL de 60s evita I/O redundante sin mecanismos complejos de invalidación.
3. **Validación estructural**: Zod garantiza que el JSON tenga la forma mínima requerida.
4. **Documentación inline**: El JSON contiene `selection_rationale` que justifica cada selección de fuente.

### 8.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| Validación solo estructural, no semántica | Error tipográfico en nombre de fuente pasa desapercibido | Baja (mitigado por tests) |
| `readFileSync` bloqueante | Bloqueo de ~0.1ms en event loop | Baja (irrelevante para volumen actual) |

---

## 9. Referencias

- Zod Documentation. (2024). *Zod: TypeScript-first schema validation*. https://zod.dev/
- Node.js Documentation. (2024). *fs.readFileSync*. https://nodejs.org/api/fs.html#fsreadfilesyncpath-options
- Gelaro, R. et al. (2017). The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2). *J. Climate*, 30(14), 5419-5454.
- Trenberth, K.E. (1997). The Definition of El Niño. *Bull. Amer. Meteor. Soc.*, 78, 2771-2777.
