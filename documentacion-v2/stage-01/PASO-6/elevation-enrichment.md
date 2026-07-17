# PASO-6 — Enriquecimiento de Elevación

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage01Acquisition.execute()` — sección de enriquecimiento de elevación |
| **Ubicación** | `pipeline/stages/01-acquisition/index.js:44-63` |
| **Stage** | Stage 01 — Acquisition (ID: 1) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-14 |
| **Propósito** | Documentación del enriquecimiento automático de `location.elevation` desde fuentes de elevación |

---

## 1. Resumen Ejecutivo

PASO-6 es la **única transformación de datos** permitida en Stage 01. Si el caller no proveyó `location.elevation`, busca en los resultados de fuentes de elevación (opentopodata_srtm30m y open_elevation) la fuente autoritativa con cobertura disponible, extrae el valor numérico, y lo inyecta en `location.elevation`.

---

## 2. Código

```javascript
if (location.elevation == null) {
  const elevationCandidates = results.filter(
    r => r.source_domain === "elevation" && r.coverage_status === "available"
  );
  const elevationResult =
    elevationCandidates.find(r => r.authority_level === "primary") ??
    elevationCandidates[0];
  if (elevationResult) {
    const elev = elevationResult.response?.results?.[0]?.elevation;
    if (elev != null) {
      location.elevation = elev;
    } else {
      console.warn(
        `[Stage01Acquisition] source="${elevationResult.source_name}" coverage_status="available" but no parseable elevation at response.results[0].elevation`
      );
    }
  }
}
```

---

## 3. Flujo

```
1. Verificar si location.elevation == null
2. Filtrar results por source_domain === "elevation" && coverage_status === "available"
3. Seleccionar por authority_level === "primary" (opentopodata), fallback a primera candidata (open_elevation)
4. Extraer response.results[0].elevation
5. Si elev != null → location.elevation = elev (mutación)
6. Si elev == null → console.warn (alerta de formato)
```

---

## 4. Justificación Científica

La elevación es una variable geofísica fundamental para el análisis de riesgo climático por tres razones:

### 4.1 Gradiente adiabático

La temperatura disminuye ~6.5°C por km de altitud según el ISA (International Standard Atmosphere, ICAO Doc 7488/3). Sin elevación, las comparaciones de temperatura entre ubicaciones a distinta altitud son engañosas.

**Referencia**: ICAO. (1993). *Manual of the Standard Atmosphere* (Doc 7488/3, 3rd ed.).

### 4.2 Exposición a amenazas

La elevación determina exposición a inundaciones (zonas bajas), deslizamientos (laderas empinadas), y sequías (zonas altas con menor disponibilidad hídrica).

### 4.3 Correcciones de datos climáticos

Los modelos de proyección CMIP6 operan a escalas gruesas (~0.7°-2°) que no capturan variación topográfica. La elevación permite aplicar correcciones de gradiente para interpolar datos de grilla a punto.

---

## 5. Selección por `authority_level`

```javascript
const elevationResult =
  elevationCandidates.find(r => r.authority_level === "primary") ??
  elevationCandidates[0];
```

**Mecanismo**: Busca primero una candidata con `authority_level === "primary"` (opentopodata_srtm30m). Si ninguna tiene ese nivel, usa la primera candidata disponible (open_elevation).

**Justificación**: Preferir la fuente más confiable (SRTM 30m, resolución nativa) sobre la complementaria (Open-Elevation, ~90m). El operador `??` (nullish coalescing) implementa la precedencia de forma explícita.

---

## 6. Ruta de Extracción

```javascript
const elev = elevationResult.response?.results?.[0]?.elevation;
```

**Ruta**: `response.results[0].elevation`

| Adaptador | Formato de respuesta | Ruta de elevación |
|---|---|---|
| `opentopodataAdapter` | `{ results: [{ elevation: N, location: [lat, lon] }] }` | `results[0].elevation` |
| `openElevationAdapter` | `{ results: [{ elevation: N, latitude: lat, longitude: lon }] }` | `results[0].elevation` |

Ambos comparten la ruta porque Open-Elevation implementa una API compatible con OpenTopoData.

---

## 7. Mutación de `location`

```javascript
location.elevation = elev;
```

**Efecto colateral**: El objeto `location` se muta directamente. Dado que `engine.js:44` ejecuta `Object.assign(pipelineState, result)` y `location` es parte de `pipelineState`, la mutación es visible para todos los stages posteriores.

**Justificación**: La elevación es metadata de la ubicación, no un dato climático. Enriquecerla dentro del stage de adquisición (responsable de resolver la ubicación contra fuentes externas) es coherente con la separación de responsabilidades.

---

## 8. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Enriquecimiento dentro del stage** | Elevación es metadata de ubicación resuelta desde fuentes externas | Autonomía del stage | Mutación de `location` (efecto colateral) |
| **Selección por `authority_level` explícita** | Documenta intención de preferir fuente más confiable | Resistente a cambios en `registry.js` | Dependencia del campo `authority_level` |
| **`console.warn` en fallo de parseo** | Detecta cambios de formato de respuesta | Detección temprana de regresiones | `console.warn` no se captura en artefacto de evidencia |
| **Extracción hardcodeada de `results[0].elevation`** | Ambos adaptadores comparten mismo contrato | Simplicidad | Frágil a cambios de formato no sincronizados |

---

## 9. Limitaciones

### 9.1 `console.warn` no se captura en artefacto

**Descripción**: Si la extracción falla, el `console.warn` se emite a stdout/stderr pero no se registra en el artefacto de evidencia.

**Impacto**: En entornos sin stdout (Lambda, worker, CI), la alerta se pierde.

### 9.2 Extracción hardcodeada

**Descripción**: La ruta `response.results[0].elevation` está acoplada al contrato de respuesta de OpenTopoData y Open-Elevation.

**Impacto**: Si alguno de estos servicios cambia su API, la extracción falla silenciosamente.

---

## 10. Referencias

- ICAO. (1993). *Manual of the Standard Atmosphere* (Doc 7488/3, 3rd ed.).
- Farr, T.G. et al. (2007). The Shuttle Radar Topography Mission. *Reviews of Geophysics*, 45(2), RG2004.
