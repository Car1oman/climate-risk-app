# PASO-2 — Resolución de Adapters (getAdapters)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `SourceRegistry.getAdapters()` |
| **Ubicación** | `pipeline/stages/01-acquisition/registry.js:12-31` |
| **Stage** | Stage 01 — Acquisition (ID: 1) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-14 |
| **Propósito** | Documentación del paso de resolución de adapters: vincular configuración declarativa con implementaciones concretas |

---

## 1. Resumen Ejecutivo

PASO-2 es el mecanismo que resuelve **qué fuentes se consultan** en cada ejecución del pipeline. Toma el registro de fuentes autoritativas (cargado en PASO-1) y lo vincula con las funciones adaptadoras concretas (archivos en `adapters/`). Para cada dominio funcional, localiza la función adaptadora correspondiente mediante búsqueda de dos niveles: primero por nombre autoritativo, luego por clave de dominio como fallback. Además itera el array `complementary` de cada dominio para generar entries adicionales.

El resultado es un array de 11 entries (8 autoritativas + 3 complementarias) que determina qué fuentes se ejecutan en PASO-3/4.

---

## 2. Flujo Detallado

### 2.1 Invocación

```
Stage01Acquisition.execute(input)                     // index.js:40
  └── this.registry.executeAll(location)              // registry.js:33
        └── this.getAdapters()                        ← PASO ANALIZADO
```

### 2.2 Lógica de resolución

```javascript
getAdapters() {
  const registry = getAuthoritativeSources();         // PASO-1
  const entries = [];
  for (const [key, src] of Object.entries(registry.sources)) {
    const authoritative = src.authoritative;
    const fn = this._adapters.get(src.authoritative) || this._adapters.get(key);
    if (fn) {
      entries.push({ key, sourceName: authoritative, config: src, adapter: fn });
    } else {
      console.warn(`[SourceRegistry] domain="${key}" authoritative="${authoritative}" — no adapter registered, domain excluded`);
    }
    for (const compName of (src.complementary ?? [])) {
      const compFn = this._adapters.get(compName);
      if (compFn) {
        entries.push({ key, sourceName: compName, config: src, adapter: compFn });
      }
    }
  }
  return entries;
}
```

### 2.3 Búsqueda de dos niveles

| Prioridad | Búsqueda | Ejemplo (dominio `elevation`) |
|---|---|---|
| 1 | `this._adapters.get(src.authoritative)` | `"opentopodata_srtm30m"` → `opentopodataAdapter` |
| 2 | `this._adapters.get(key)` (fallback) | `"elevation"` → no encontrado |

El fallback (prioridad 2) es una red de seguridad. Actualmente todos los dominios se resuelven en prioridad 1.

### 2.4 Entries generadas

| # | Dominio (`key`) | `sourceName` | `authority_level` | Tipo |
|---|---|---|---|---|
| 1 | `observation_current` | `weatherapi` | primary | Autoritativa |
| 2 | `observation_historical` | `nasa_power` | primary | Autoritativa |
| 3 | `projection_climate` | `openmeteo_cmip6` | primary | Autoritativa |
| 4 | `projection_climate` | `supabase_climate_cells` | complementary | Complementaria |
| 5 | `elevation` | `opentopodata_srtm30m` | primary | Autoritativa |
| 6 | `elevation` | `open_elevation` | complementary | Complementaria |
| 7 | `hazard_risk_gri` | `gri_oxford` | primary | Autoritativa |
| 8 | `socioeconomic` | `world_bank` | primary | Autoritativa |
| 9 | `enso` | `noaa_cpc_oni` | primary | Autoritativa |
| 10 | `enso` | `noaa_enso_discussion` | complementary | Complementaria |
| 11 | `precomputed_grid` | `supabase_climate_cells` | primary | Autoritativa |

---

## 3. Registro de Adapters en Constructor

Los 10 adapters se registran manualmente en el constructor de `Stage01Acquisition` (index.js:16-30):

```javascript
this.registry.registerAdapter("weatherapi", weatherapiAdapter);
this.registry.registerAdapter("nasa_power", nasaPowerAdapter);
this.registry.registerAdapter("openmeteo_cmip6", openmeteoAdapter);
this.registry.registerAdapter("opentopodata_srtm30m", opentopodataAdapter);
this.registry.registerAdapter("world_bank", worldbankAdapter);
this.registry.registerAdapter("noaa_cpc_oni", noaaOniAdapter);
this.registry.registerAdapter("supabase_climate_cells", supabaseAdapter);
this.registry.registerAdapter("open_elevation", openElevationAdapter);
this.registry.registerAdapter("noaa_enso_discussion", noaaEnsoAdapter);
this.registry.registerAdapter("gri_oxford", griOxfordAdapter);
```

**Observación**: El registro es manual. No hay verificación automática de que todos los adapters estén alcanzables desde el JSON. Los tests de consistencia (`stage-01-registry-consistency.test.js`) mitigan este riesgo.

---

## 4. Semántica de las Fuentes Complementarias

| Complementaria | Dominio | Autoritativa | Relación |
|---|---|---|---|
| `open_elevation` | `elevation` | `opentopodata_srtm30m` | **Failover**: misma variable, distinta API |
| `noaa_enso_discussion` | `enso` | `noaa_cpc_oni` | **Enriquecimiento**: produce clasificación categórica (El Niño/La Niña/Neutral) a partir del mismo dato numérico |
| `supabase_climate_cells` | `projection_climate` | `openmeteo_cmip6` | **Caché**: grilla precomputada como alternativa a llamada live |

---

## 5. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Registry Pattern** | Separar declaración (JSON) de implementación (adapters) | Extensibilidad, gobernanza | Complejidad de indirección |
| **Búsqueda dual (authoritative → key)** | Resiliencia ante discrepancias de nomenclatura | Fallback robusto | El fallback puede resolver adapter incorrecto si nombres coinciden accidentalmente |
| **Exclusión silenciosa sin adapter** | Un dominio no debe detener todo el pipeline | Resiliencia | Dominio excluido emite solo `console.warn` |
| **Constructor como punto de registro** | Visibilidad explícita de adapters disponibles | Claridad | Registro manual propenso a omisiones |

---

## 6. Limitaciones

### 6.1 Registro manual de adapters

**Descripción**: Cada adapter se importa y registra manualmente en el constructor. Agregar una nueva fuente requiere modificar `index.js`.

**Mitigación**: Tests de consistencia verifican que cada `authoritative` y `complementary` del JSON tiene adapter registrado.

### 6.2 Exclusión silenciosa

**Descripción**: Si un dominio no encuentra adapter, se omite con `console.warn`. El pipeline continúa sin ese dominio.

**Mitigación**: Los tests de consistencia previenen que esto ocurra en el diseño actual.

---

## 7. Referencias

- Fowler, M. (2002). *Patterns of Enterprise Application Architecture*. Addison-Wesley. (Registry Pattern, p. 480)
