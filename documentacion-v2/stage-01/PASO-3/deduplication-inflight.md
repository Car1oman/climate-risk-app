# PASO-3 — Deduplicación de Promises en Vuelo

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `SourceRegistry.executeAll()` — sección de deduplicación |
| **Ubicación** | `pipeline/stages/01-acquisition/registry.js:37-44` |
| **Stage** | Stage 01 — Acquisition (ID: 1) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-14 |
| **Propósito** | Documentación del mecanismo de deduplicación que evita llamadas HTTP redundantes cuando una fuente tiene múltiples roles |

---

## 1. Resumen Ejecutivo

PASO-3 implementa la deduplicación de promises antes de la ejecución paralela. Cuando una misma fuente aparece en múltiples entries del array de adapters (por tener múltiples roles en la configuración), este mecanismo garantiza que solo se ejecuta una vez la llamada HTTP, reutilizando la promise resultante para las entradas duplicadas.

---

## 2. Problema que Resuelve

`supabase_climate_cells` aparece en 2 entries del array de adapters:

| Entry | Dominio | Rol |
|---|---|---|
| #4 | `projection_climate` | Complementaria de Open-Meteo CMIP6 |
| #11 | `precomputed_grid` | Autoritativa del dominio de caché |

Ambas entries tienen el mismo `sourceName: "supabase_climate_cells"` y reciben los mismos argumentos `(location, config)`. Sin deduplicación, se ejecutarían 2 consultas idénticas a Supabase.

---

## 3. Mecanismo

```javascript
const inflight = new Map();
const settled = await Promise.allSettled(
  adapters.map(entry => {
    if (inflight.has(entry.sourceName))
      return inflight.get(entry.sourceName);          // reutilizar promise existente
    const p = entry.adapter(location, entry.config);  // primera ejecución
    inflight.set(entry.sourceName, p);
    return p;
  })
);
```

**Flujo:**

1. Se crea un `Map` vacío (`inflight`) para rastrear promises en vuelo.
2. Para cada entry, se verifica si `sourceName` ya tiene una promise activa.
3. Si existe: se retorna la promise existente (no se ejecuta de nuevo).
4. Si no existe: se ejecuta el adapter, se almacena la promise en el Map, se retorna.

---

## 4. Limitaciones

### 4.1 Deduplicación por `sourceName`, no por URL

**Descripción**: `noaa_cpc_oni` y `noaa_enso_discussion` comparten la misma URL (`oni.ascii.txt`) pero tienen distinto `sourceName`, por lo que se ejecutan 2 requests idénticos al mismo servidor NOAA.

**Impacto**: 2 requests HTTP redundantes al mismo servidor.

**Riesgo**: Bajo — NOAA CPC no tiene rate limiting documentado.

**Causal raíz**: El criterio de dedup es `sourceName` (identificador lógico de la fuente), no la URL del endpoint. Esto es correcto desde la perspectiva de que `noaa_cpc_oni` y `noaa_enso_discussion` son fuentes semánticamente distintas (una produce datos numéricos, la otra clasificación categórica)尽管 comparten el mismo endpoint HTTP.

### 4.2 `config` no se usa como criterio de dedup

**Descripción**: Si dos entries tuvieran el mismo `sourceName` pero diferentes `config` (ej: diferentes parámetros), la segunda entry reusaría la promise de la primera sin importar que el config sea distinto.

**Impacto**: No aplicable en el diseño actual. Todas las entries duplicadas del mismo `sourceName` reciben el mismo `config`.

---

## 5. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Dedup por `sourceName`** | Identificador lógico único de cada fuente | Evita llamadas redundantes cuando una fuente tiene múltiples roles | No detecta duplicados por URL (NOAA ONI) |
| **`Map` en vez de `Set`** | Almacena la promise para reutilización, no solo presencia | Permite reutilizar el resultado | Complejidad menor |

---

## 6. Referencias

- ECMA International. (2024). *ECMAScript® 2025 Language Specification — Promise.allSettled*. ECMA-262.
