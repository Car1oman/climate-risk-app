# PASO-4 — Ejecución Paralela HTTP con Timeouts

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `SourceRegistry.executeAll()` — sección de ejecución + `common.js` fetch utilities |
| **Ubicación** | `pipeline/stages/01-acquisition/registry.js:38-45`, `pipeline/stages/01-acquisition/adapters/common.js:1-28` |
| **Stage** | Stage 01 — Acquisition (ID: 1) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-14 |
| **Propósito** | Documentación de la ejecución paralela de adapters con timeouts individuales vía AbortController |

---

## 1. Resumen Ejecutivo

PASO-4 ejecuta los 11 adapters resueltos en PASO-2/3 en paralelo mediante `Promise.allSettled()`. Cada adapter es una función asíncrona que consulta una API climática externa. Cada consulta tiene un timeout individual vía `AbortController` (15-60s según la fuente). Si una API falla, las demás continúan sin bloqueo.

---

## 2. Mecanismo de Timeout (common.js:3-18)

```javascript
const DEFAULT_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
```

**Componentes:**

| Componente | API/Estándar | Propósito |
|---|---|---|
| `AbortController` | Web API (Node 18+) | Cancelación de fetch por timeout |
| `AbortSignal` | Web API | Señal de cancelación pasada a `fetch()` |
| `setTimeout` | Node.js | Programa abort después de N ms |
| `clearTimeout` | Node.js | Limpia timer en éxito o error |

---

## 3. Timeouts por Adapter

| Adapter | Timeout | Justificación |
|---|---|---|
| `weatherapi` | 15s | API comerciale rápida, respuesta típica <2s |
| `nasa_power` | 30s | API gubernamental, puede ser lenta en picos |
| `openmeteo_cmip6` | 60s | Procesamiento de ensemble de 4 modelos CMIP6 |
| `opentopodata_srtm30m` | 15s | API simple de lookup puntual |
| `open_elevation` | 15s | API simple de lookup puntual |
| `world_bank` | 15s c/indicador | 4 requests secuenciales, 15s cada uno |
| `noaa_cpc_oni` | 20s | Descarga de archivo de texto |
| `noaa_enso_discussion` | 20s | Descarga de archivo de texto (mismo que NOAA ONI) |
| `gri_oxford` | 60s | API de procesamiento pesado (pixel-driller) |
| `supabase_climate_cells` | default (30s) | Query a base de datos |

---

## 4. Ejecución Paralela

```javascript
const settled = await Promise.allSettled(
  adapters.map(entry => {
    if (inflight.has(entry.sourceName))
      return inflight.get(entry.sourceName);
    const p = entry.adapter(location, entry.config);
    inflight.set(entry.sourceName, p);
    return p;
  })
);
```

**`Promise.allSettled` vs `Promise.all`:**

| Aspecto | `Promise.all` | `Promise.allSettled` (actual) |
|---|---|---|
| Comportamiento ante fallo | Rechaza en el primer error | Espera a que todas se resuelvan |
| Resultado | Array de valores exitosos | Array de `{status: "fulfilled"|"rejected", value|reason}` |
| Tolerancia a fallos | Ninguna | Total — cada fuente es independiente |
| Apropiado para | Operaciones atómicas (todas o nada) | Consultas a fuentes independientes |

**Justificación**: Las fuentes climáticas son independientes entre sí. Un fallo en WeatherAPI no debe impedir que NASA POWER o GRI Oxford retornen datos. `Promise.allSettled` es la combinación correcta.

---

## 5. Tiempo Total del Paso

El tiempo total de PASO-4 es determinado por el adapter **más lento** (típicamente GRI Oxford o Open-Meteo a ~60s), no por la suma de todos los adapters. Esto es una consecuencia directa del paralelismo:

```
Tiempo real = max(duration_adapter_1, duration_adapter_2, ..., duration_adapter_11)
```

**Ejemplo numérico:**

| Adapter | duration_ms (individual) |
|---|---|
| weatherapi | 1,200 |
| nasa_power | 2,800 |
| openmeteo | 45,000 |
| opentopodata | 800 |
| open_elevation | 900 |
| world_bank | 1,500 |
| noaa_cpc_oni | 3,200 |
| noaa_enso_discussion | 3,100 |
| gri_oxford | 55,000 |
| supabase | 400 |
| **Tiempo real (wall-clock)** | **~55,000** (gri_oxford) |
| **Suma de duraciones** | **~113,900** |

El factor de sobrestimación es ~2.1x.

---

## 6. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **`Promise.allSettled`** | Tolerar fallos individuales | Pipeline continúa con datos parciales | Stage 02 debe manejar `coverage_status: "failed"` |
| **Timeout por adapter** | Cada API tiene características diferentes | Control fino por fuente | Timeout demasiado agresivo puede descartar respuestas válidas |
| **`AbortController`** | API Web estándar para cancelación | Soporte nativo en Node 18+ | No funciona en entornos sin soporte AbortController |
| **`clearTimeout` en ambos caminos** | Evitar fugas de memoria | Limpieza garantizada | — |

---

## 7. Limitaciones

### 7.1 Timeout global del stage

**Descripción**: No hay timeout máximo para todo el stage. Si GRI Oxford tarda 55s, el stage completo toma ~55s aunque el caller espere 60s.

**Impacto**: Para aplicaciones en tiempo real, 60s puede ser inaceptable.

**Mejora futura**: Agregar un timeout global del stage (ej: 120s) que cancele los adapters restantes si se excede.

### 7.2 `AbortController` y errores de red

**Descripción**: Cuando `AbortController.abort()` cancela un fetch, se lanza un `AbortError` que `Promise.allSettled` captura. El mensaje de error es genérico ("The operation was aborted") y no distingue entre timeout real y cancelación manual.

**Impacto**: En debugging, un timeout de 60s y una cancelación manual producen el mismo mensaje de error.

---

## 8. Referencias

- ECMA International. (2024). *ECMAScript® 2025 Language Specification — Promise.allSettled*. ECMA-262.
- MDN Web Docs. (2024). *AbortController — Web API*. Mozilla Developer Network.
- Node.js Documentation. (2024). *Fetch API*. https://nodejs.org/api.fetch.html
