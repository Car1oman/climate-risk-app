# PASO-5 — Detección de Errores y Validación Zod de Respuesta

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `common.js` → `detectApiError()` + `buildRawResponse()` + `RawSourceResponseSchema` |
| **Ubicación** | `pipeline/stages/01-acquisition/adapters/common.js:30-59`, `pipeline/shared/types.js:35-51` |
| **Stage** | Stage 01 — Acquisition (ID: 1) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-14 |
| **Propósito** | Documentación de la detección de errores en respuestas HTTP y la validación estructural de cada `RawSourceResponse` |

---

## 1. Resumen Ejecutivo

PASO-5 opera dentro de cada adapter después de recibir la respuesta HTTP. Tiene dos sub-componentes:

1. **Detección de errores en body** (`detectApiError`): Examina el body de la respuesta en busca de errores estructurados (formatos de API específicos).
2. **Construcción y validación de respuesta** (`buildRawResponse`): Construye un objeto `RawSourceResponse` validado contra `RawSourceResponseSchema` (Zod), garantizando que cada adapter retorne datos con estructura predecible para stages posteriores.

---

## 2. Detección de Errores (common.js:32-39)

```javascript
export function detectApiError(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return null;
  if (responseBody.error)
    return responseBody.error.message ?? responseBody.error;
  if (Array.isArray(responseBody.message) && responseBody.message.length > 0)
    return responseBody.message[0]?.value ?? "api_error";
  return null;
}
```

### 2.1 Formatos de error detectados

| Formato | APIs que lo usan | Ejemplo |
|---|---|---|
| `{ error: { code: XXX, message: "..." } }` | WeatherAPI | `{ error: { code: 1006, message: "No matching location found." } }` |
| `[{ message: [{ id: "…", value: "…" }] }]` | World Bank | `[{ message: [{ id: "120", value: "Invalid indicator" }] }]` |
| HTTP error code | Todas (capturado en `fetchWithTimeout`) | `HTTP 500: Internal Server Error` |

### 2.2 Limitaciones

**Descripción**: `detectApiError` solo examina el body de respuestas HTTP exitosas (status 200). Errores HTTP (4xx/5xx) son capturados por `fetchWithTimeout` antes de llegar a `detectApiError`.

**Cobertura**: Errors de formato no estándar (ej: `{ status: "error", message: "..." }`) no son detectados. Cada adapter debe implementar su propia lógica de detección si el formato lo requiere.

---

## 3. Construcción de Respuesta (common.js:41-59)

```javascript
export function buildRawResponse({
  source_name, source_domain, authority_level,
  request, response, status_code, duration_ms,
  error = null, coverage_status,
  spatial_distance_km = null, resolution_native = null
}) {
  return RawSourceResponseSchema.parse({
    source_name, source_domain, authority_level,
    request: {
      endpoint: request.endpoint || "",
      params: request.params || {},
      timestamp: request.timestamp || new Date().toISOString(),
    },
    response, status_code, duration_ms, error, coverage_status,
    spatial_distance_km, resolution_native,
  });
}
```

### 3.1 Esquema Zod (shared/types.js:35-51)

```javascript
export const RawSourceResponseSchema = z.object({
  source_name: z.string(),
  source_domain: z.string(),
  authority_level: AuthorityLevelEnum,          // "primary" | "complementary"
  request: z.object({
    endpoint: z.string(),
    params: z.record(z.unknown()),
    timestamp: z.string(),
  }),
  response: z.unknown().nullable(),
  status_code: z.number().int(),
  duration_ms: z.number().int().nonnegative(),
  error: z.string().nullable().default(null),
  coverage_status: CoverageStatusEnum,          // "available" | "out_of_coverage" | "failed"
  spatial_distance_km: z.number().nullable().default(null),
  resolution_native: z.string().nullable().default(null),
});
```

### 3.2 Propósito de cada campo

| Campo | Tipo | Propósito | Consumidor downstream |
|---|---|---|---|
| `source_name` | string | Identificador lógico de la fuente | Stage 03 (selección de fuente por dominio) |
| `source_domain` | string | Clave del dominio funcional | Stage 02 (agrupación por dominio), Stage 03 |
| `authority_level` | enum | Nivel de autoridad (primary/complementary) | Stage 03 (priorización) |
| `request.endpoint` | string | URL exacta de la consulta | Trazabilidad, reproducibilidad |
| `request.params` | object | Parámetros de la consulta | Trazabilidad |
| `request.timestamp` | string | Timestamp de la consulta ISO 8601 | Trazabilidad |
| `response` | any/null | Datos crudos de la API | Stage 02 (validación), Stage 03 (normalización) |
| `status_code` | int | Código HTTP de la respuesta | Trazabilidad |
| `duration_ms` | int | Tiempo de la consulta individual | Métricas de rendimiento |
| `error` | string/null | Mensaje de error si falló | Trazabilidad, debugging |
| `coverage_status` | enum | Estado de cobertura | Stage 02 (decisión de validación) |
| `spatial_distance_km` | number/null | Distancia al punto más cercano | Stage 03 (scoring de proximidad) |
| `resolution_native` | string/null | Resolución nativa de la fuente | Stage 03, Stage 04 (confianza) |

---

## 4. Validación Zod en Runtime

**Propósito**: Si un adapter retorna datos mal formados (ej: `source_name` ausente, `coverage_status` inválido), Zod lanza `ZodError` que es capturado por `Promise.allSettled`. Esto garantiza que `sources_consulted` siempre contenga objetos con estructura predecible.

**Overhead**: ~0.1ms por validación. Irrelevante para 11 adapters.

**Riesgo mitigado**: Sin validación, un adapter mal implementado podría retornar un objeto sin `coverage_status`, causando un `TypeError` en el filtro de PASO-6/7.

---

## 5. Normalización de Fallos (registry.js:46-62)

Cuando un adapter lanza una excepción no capturada internamente:

```javascript
return settled.map((result, i) => {
  const entry = adapters[i];
  if (result.status === "fulfilled") return result.value;
  return {
    source_name: entry.sourceName,
    source_domain: entry.key,
    authority_level: entry.sourceName === entry.config.authoritative ? "primary" : "complementary",
    status_code: 0,
    duration_ms: 0,
    error: result.reason?.message ?? "unknown error",
    coverage_status: "failed",
    request: { endpoint: "", params: {}, timestamp: new Date().toISOString() },
    response: null,
    spatial_distance_km: null,
    resolution_native: null,
  };
});
```

### 5.1 Correcciones previas documentadas

| Corrección | Antes | Después | Razón |
|---|---|---|---|
| `source_domain` | `entry.config.domain` (texto en español) | `entry.key` (clave machine-readable) | Los stages posteriores filtran por `source_domain === "observation_current"`, no por `"observación actual"` |
| `authority_level` | `entry.key === entry.config.authoritative` | `entry.sourceName === entry.config.authoritative` | `entry.key` es la clave del dominio (ej: `"observation_current"`), nunca coincide con `entry.config.authoritative` (ej: `"weatherapi"`) |

---

## 6. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Zod en runtime** | Garantizar contrato estructural | Stages posteriores reciben datos predecibles | Overhead ~0.1ms (irrelevante) |
| **`error: reason.message`** | Mensaje legible para debugging | Simplifica trazabilidad | Pierde metadata de error de red (`type`, `code`, `errno`) |
| **`duration_ms: 0` en fallos** | Simplificar mapeo de errores | Consistencia: toda respuesta tiene `duration_ms` | Subestima métricas agregadas |
| **Normalización de fallos** | Garantizar que `sources_consulted` siempre tenga 11 entries | Stage 02 no necesita lógica especial para fallos | Información de error limitada al `.message` |

---

## 7. Limitaciones

### 7.1 Pérdida de metadata de error

**Descripción**: Si el error es un `FetchError` con propiedades `{ type: "system", code: "ETIMEDOUT", errno: -4039 }`, solo se captura `.message`.

**Impacto**: Dificulta debugging de errores de red. Un `ETIMEDOUT` y un `ECONNREFUSED` aparecen ambos como "network error".

### 7.2 `duration_ms: 0` en fallos

**Descripción**: Cuando una promise se rechaza, se asigna `duration_ms: 0` en lugar del tiempo real transcurrido hasta el fallo.

**Impacto**: El `summary.sum_of_durations_ms` subestima el tiempo invertido en consultas fallidas.

---

## 8. Referencias

- Zod Documentation. (2024). *Zod: TypeScript-first schema validation*. https://zod.dev/
- ECMA International. (2024). *ECMAScript® 2025 Language Specification — Promise.allSettled*. ECMA-262.
