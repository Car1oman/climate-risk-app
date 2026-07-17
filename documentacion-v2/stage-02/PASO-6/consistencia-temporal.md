# PASO-6 — Consistencia Temporal (Temporal Consistency Checks)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `Stage02Validation.validateTemporalConsistency()`, `parseYyyymmdd()`, `formatYyyymmdd()` |
| **Ubicación** | `pipeline/stages/02-validation/index.js:531-733` |
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de las verificaciones de integridad temporal: gaps de fechas en series diarias, secuencia de temporadas ONI, y separación de "checked" vs "not_applicable" |

---

## 1. Resumen Ejecutivo

PASO-6 verifica la integridad temporal de las series de datos. Implementa **tres tipos de chequeo**:

1. **Date-gap detection** (nasa_power): Detecta saltos en series diarias donde falta al menos un día consecutivo
2. **ONI season-sequence check** (noaa_cpc_oni): Verifica que las temporadas ONI estén en orden cronológico y sean secuenciales
3. **Null-day counting** (openmeteo_cmip6): Cuenta días con null en variables diarias (reportado para transparencia, severity decidido por completeness rule)

La severidad de los gaps se escala usando los mismos umbrales de completitud (GCOS-245) que PASO-5 — no un segundo conjunto inventado (H-17). Esto asegura que un gap del 3% reciba la misma clasificación que una completitud del 97% para la misma variable.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
validateSource(source, profiles)                                    // index.js:143
  │
  └── validateTemporalConsistency(source, profiles)                 // ← PASO 6 ANALIZADO
        │
        ├── ¿source_name in TEMPORAL_CHECK_IMPLEMENTED?
        │     ├── NO → return { classification: "not_applicable" }
        │     └── SÍ → continuar con chequeos
        │
        ├── [nasa_power] date-gap detection
        │     └── Por cada parameter series:
        │           ├── parseYyyymmdd() dates → sort
        │           ├── dayDiff = Math.round((currMs - prevMs) / 86400000)
        │           └── Si dayDiff !== 1 → gap detectado
        │
        ├── [openmeteo_cmip6] null-day counting
        │     └── Por cada daily variable: count nulls
        │           └── Reportado, NO scored (severity decidido por completeness)
        │
        ├── [noaa_cpc_oni] season-sequence check
        │     └── seasonIndex() per row → detectar gaps y disorder
        │           ├── Temporadas inválidas → fail (structural)
        │           ├── Secuencia no monótona → fail (structural)
        │           └── Temporadas faltantes → severity scaled por index thresholds
        │
        └── return { rule, result, classification, temporal_issues[] }
```

### 2.2 Flujo de datos

```
source.source_name + source.response
  │
  ├── ¿En TEMPORAL_CHECK_IMPLEMENTED? (Set: nasa_power, openmeteo_cmip6, noaa_cpc_oni)
  │     ├── NO → classification: "not_applicable"
  │     │        detail: reason de TEMPORAL_NOT_APPLICABLE_REASONS
  │     └── SÍ → continuar
  │
  ├── [nasa_power] properties.parameter.{T2M, PRECTOTCORR, RH2M, WS2M, PS}
  │     ├── Object.keys(series).sort() → dates[]
  │     ├── parseYyyymmdd(dates[i]) → UTC milliseconds
  │     ├── dayDiff = Math.round((currMs - prevMs) / 86400000)
  │     ├── Si dayDiff !== 1 → gap
  │     ├── gapFraction = gaps.length / intervalsChecked
  │     ├── classifyCompleteness(1 - gapFraction, climateThresholds)
  │     └── severity = completenessResultForClassification(classification)
  │
  ├── [openmeteo_cmip6] daily.{temperature_2m_max, temperature_2m_min, precipitation_sum}
  │     ├── nullCount = arr.filter(v => v == null).length
  │     ├── Reportado pero NO scored
  │     └── scored_by: "completeness_rule"
  │
  └── [noaa_cpc_oni] all_rows
        ├── seasonIndex(row) per row → indices[]
        ├── Detectar: invalidSeasons, disorderedPairs, missingSeasonCount
        ├── invalidSeasons.length > 0 → fail (structural corruption)
        ├── disorderedPairs.length > 0 → fail (structural corruption)
        └── missingSeasonCount > 0 → classifyCompleteness(presentFraction, indexThresholds)
```

---

## 3. Descripción Detallada del Flujo

### 3.1 Fuentes con y sin chequeo temporal

**TEMPORAL_CHECK_IMPLEMENTED** (index.js:98):
```javascript
const TEMPORAL_CHECK_IMPLEMENTED = new Set([
  "nasa_power",         // Series diarias 1981-present
  "openmeteo_cmip6",    // Proyecciones diarias 1950-2050
  "noaa_cpc_oni",       // Series de temporadas (DJF, JFM, ...)
]);
```

**TEMPORAL_NOT_APPLICABLE_REASONS** (index.js:100-107):

| Fuente | Razón |
|---|---|
| `weatherapi` | Single current-observation snapshot (current.*) — no chronological series |
| `opentopodata_srtm30m` | Static SRTM elevation grid, not a temporal series |
| `open_elevation` | Static SRTM-heritage elevation grid, not a temporal series |
| `world_bank` | worldbank.js resolves each indicator to a single most-recent non-null value |
| `supabase_climate_cells` | Precomputed per-index statistics, not a raw dated observation series |
| `gri_oxford` | Fixed rcp/epoch scenario buckets, not incrementally sampled observations |

**H-22**: Cada fuente sin chequeo temporal tiene una razón específica verificada, no un genérico "not checked".

### 3.2 Date-gap detection para nasa_power (index.js:562-601)

```javascript
if (source.source_name === "nasa_power" && source.response.properties?.parameter) {
  const params = source.response.properties.parameter;
  for (const [key, series] of Object.entries(params)) {
    if (typeof series !== "object" || series === null) continue;
    const dates = Object.keys(series).sort();
    if (dates.length <= 1) continue;

    const gaps = [];
    for (let i = 1; i < dates.length; i++) {
      const prevMs = this.parseYyyymmdd(dates[i - 1]);
      const currMs = this.parseYyyymmdd(dates[i]);
      const dayDiff = Math.round((currMs - prevMs) / 86400000);
      if (dayDiff !== 1) {
        gaps.push({
          expected_date: this.formatYyyymmdd(prevMs + 86400000),
          gap_between: `${dates[i - 1]} and ${dates[i]}`,
        });
      }
    }
    // Severity scaling via classifyCompleteness
    const gapFraction = gaps.length / intervalsChecked;
    const classification = classifyCompleteness(1 - gapFraction, climateThresholds);
    const severity = completenessResultForClassification(classification);
  }
}
```

**`parseYyyymmdd()` (index.js:920-925)**:
```javascript
parseYyyymmdd(dateStr) {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  return Date.UTC(year, month, day);
}
```

**H-3**: `Date.UTC()` evita falsos positivos en bordes de mes. `Math.round(diff/86400000)` maneja correctamente DST transitions.

**Ejemplo**: Si `dates = ["20200101", "20200102", "20200105", "20200106"]`:
- `dayDiff(20200101→20200102)` = 1 → OK
- `dayDiff(20200102→20200105)` = 3 → gap! (2 días faltantes: Jan 3, Jan 4)
- `dayDiff(20200105→20200106)` = 1 → OK
- `gapFraction = 1/3 = 33%` → `1 - 0.33 = 0.67` → classifyCompleteness → "degraded" (≥50%)

### 3.3 Null-day counting para openmeteo_cmip6 (index.js:603-627)

```javascript
if (source.source_name === "openmeteo_cmip6" && source.response.daily) {
  for (const key of ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"]) {
    const arr = source.response.daily[key];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const nullCount = arr.filter(v => v == null).length;
    if (nullCount > 0) {
      nullChecks.push({
        variable: key,
        total_days: arr.length,
        null_days: nullCount,
        null_pct: Math.round((nullCount / arr.length) * 10000) / 100,
        scored_by: "completeness_rule",   // ← NO scored here
      });
    }
  }
}
```

**Diseño intencional**: Los nulls en openmeteo ya se cuentan en `validateCompleteness()` (PASO-5) usando los mismos campos y umbrales. Contarlos aquí de nuevo produciría doble scoring bajo dos nombres de regla independientes. Se reportan aquí por transparencia (qué días específicos están afectados), no como segunda veredicto de severidad.

### 3.4 ONI season-sequence check (index.js:639-695)

```javascript
const oniChecks = [];
if (source.source_name === "noaa_cpc_oni" && Array.isArray(source.response.all_rows)) {
  const rows = source.response.all_rows;
  if (rows.length > 1) {
    const indices = rows.map(seasonIndex);
    const invalidSeasons = rows.filter((r, i) => indices[i] == null).map(r => r.season);
    const disorderedPairs = [];
    let missingSeasonCount = 0;

    for (let i = 1; i < indices.length; i++) {
      if (indices[i - 1] == null || indices[i] == null) continue;
      const diff = indices[i] - indices[i - 1];
      if (diff <= 0) {
        disorderedPairs.push(`${rows[i-1].season} ${rows[i-1].year} -> ${rows[i].season} ${rows[i].year}`);
      } else {
        missingSeasonCount += diff - 1;
      }
    }

    if (invalidSeasons.length > 0 || disorderedPairs.length > 0) {
      // Structural corruption → fail (not severity-scaled)
      worsen("fail");
    } else if (missingSeasonCount > 0) {
      // Gap in sequence → severity scaled by index thresholds
      const presentFraction = expectedSlots > 0 ? rows.length / expectedSlots : 1;
      const classification = classifyCompleteness(presentFraction, indexThresholds);
      const severity = completenessResultForClassification(classification);
      worsen(severity);
    }
  }
}
```

**Dos niveles de severidad**:

| Problema | Tipo | Severidad | Justificación |
|---|---|---|---|
| Temporadas inválidas o secuencia no monótona | Structural corruption | `fail` | La asunción de cronología de `classifyEnso()` está rota |
| Temporadas faltantes | Gap in sequence | Severity scaled | Misma lógica que gaps en series diarias |

**H-18**: Reutiliza `seasonIndex` y `MIN_CONSECUTIVE_SEASONS` de `enso-classification.js` — la misma definición canónica de 12 temporadas superpuestas (DJF, JFM, FMA, … Trenberth 1997) usada downstream para clasificar episodios ENSO.

### 3.5 `worsen()` — Agregación de severidad (index.js:558-560)

```javascript
const severityOrder = { pass: 0, warning: 1, fail: 2 };
let worstResult = "pass";
const worsen = (candidate) => {
  if (severityOrder[candidate] > severityOrder[worstResult]) worstResult = candidate;
};
```

El `worstResult` final se usa como `result` del objeto retornado. Si hay múltiples parámetros/variables con issues, se reporta el de mayor severidad.

---

## 4. Decisiones de Diseño

| Decisión | Justificación | Beneficio | Riesgo |
|---|---|---|---|
| **Solo 3 fuentes con chequeo temporal** | Las demás no tienen series temporales genuinas | Precisión, no falsos positivos | Nuevas fuentes sin Set pueden pasar desapercibidas |
| **Severity scaling via GCOS-245** | H-17: mismos umbrales que completeness | Consistencia | — |
| **Nulls no scored en openmeteo** | H-17: evita doble scoring | Transparencia sin penalización doble | — |
| **Structural corruption = fail directo** | Secuencia rota = asunción de classifyEnso() rota | Fail-fast | Puede ser conservador |
| **`not_applicable` con razón específica** | H-22: cada fuente tiene razón verificada | Transparencia | — |
| **`Date.UTC()` para parse** | H-3: evita falsos positivos en bordes de mes | Precisión temporal | — |

---

## 5. Limitaciones y Riesgos

### 5.1 Solo nasa_power tiene date-gap detection real

**Descripción**: openmeteo_cmip6 solo cuenta nulls, no detecta gaps entre fechas.

**Impacto**: Un gap de fechas en openmeteo (ej: días faltantes sin null explícito) no se detectaría.

**Mitigación**: Open-Meteo retorna arrays completos donde null indica días faltantes — no puede haber "gaps sin null".

### 5.2 ONI check depende de `seasonIndex()` correcto

**Descripción**: Si `seasonIndex()` tiene un bug de parsing, se reportarían falsos structural corruptions.

**Impacto**: Alto si ocurre, pero `seasonIndex()` es shared code usado por `enso-classification.js` downstream.

**Mitigación**: Tests existentes en `enso-classification.js` cubren `seasonIndex()`.

### 5.3 `MIN_CONSECUTIVE_SEASONS` no se verifica directamente

**Descripción**: El check ONI detecta gaps pero no verifica que queden suficientes temporadas consecutivas para `classifyEnso()`.

**Impacto**: Una serie con 20 gaps podría tener solo 2 temporadas consecutivas al final, insuficiente para clasificación ENSO.

**Mitigación**: Comentado en el output: "a gap this size may still leave a contiguous run of that length at the end of the series."

---

## 6. Auditoría de Consistencia

### 6.1 Estado del código vs. documentación

| Punto | Código actual | Documentación | Estado |
|---|---|---|---|
| `validateTemporalConsistency()` | `index.js:531-733` | Documentado en §3 | ✅ Consistente |
| `TEMPORAL_CHECK_IMPLEMENTED` | Set de 3 fuentes | Tabla en §3.1 | ✅ Consistente |
| `TEMPORAL_NOT_APPLICABLE_REASONS` | 6 fuentes con razones | Tabla en §3.1 | ✅ Consistente |
| Date-gap detection | nasa_power solo | Documentado en §3.2 | ✅ Consistente |
| Null-day counting | openmeteo solo, not scored | Documentado en §3.3 | ✅ Consistente |
| ONI season-sequence | noaa_cpc_oni | Documentado en §3.4 | ✅ Consistente |
| `parseYyyymmdd()` con `Date.UTC()` | `index.js:920-925` | Documentado en §3.2 | ✅ Consistente |
| Severity scaling via GCOS-245 | `classifyCompleteness()` reusado | Documentado en §1 y §4 | ✅ Consistente |

### 6.2 Consumidores del resultado

| Consumidor | Uso |
|---|---|
| `buildResult()` | Agrega `temporal_consistency` a `validation_results[]` |
| `summary.warnings` / `summary.failed` | Cuenta issues temporales |
| API/UI | Muestra `temporal_issues[]` con detalles por parámetro/variable |
| Stage 03 | No consume directamente (usa `validated_sources` completo) |

---

## 7. Conclusiones

### 7.1 ¿El diseño es técnicamente sólido?

Sí. PASO-6 implementa verificaciones de integridad temporal precisas y bien diferenciadas. La separación entre "structural corruption" (fail directo) y "gap in sequence" (severity scaled) es correcta: un dato desordenado es un problema estructural, mientras que un dato faltante es un problema de completitud.

### 7.2 Fortalezas

1. **Transparencia**: Cada fuente sin chequeo tiene razón específica documentada
2. **Severity scaling consistente**: Mismos umbrales que PASO-5 (H-17)
3. **No doble scoring**: Null-days en openmeteo reportados, no scored (H-17)
4. **Date parsing robusto**: `Date.UTC()` + `Math.round()` evita falsos positivos (H-3)

### 7.3 Debilidades residuales

| Debilidad | Impacto | Prioridad |
|---|---|---|
| Solo 3 fuentes con chequeo real | Otras fuentes sin verificación temporal | Baja (diseñado intencionalmente) |
| ONI no verifica consecutive run | Gap podría dejar run insuficiente para classifyEnso | Baja (comentado en output) |
| `worsen()` usa worst-case | Un parámetro con fail afecta todos los demás | Baja (correcto: fail es fail) |

---

## 8. Referencias

- Trenberth, K.E. (1997). The Definition of El Niño. *Bull. Amer. Meteor. Soc.*, 78, 2771–2777.
- WMO (2018). *Guide to Climatological Practices* (WMO-No. 100). Chapter 5, §5.3.
- ISO (2013). *Geographic Information — Data Quality* (ISO 19157:2013). §6.1.3 Temporal Accuracy.
- GCOS (2022/2025). *ECV Requirements* (GCOS-245). Three-tier system.
- ECMAScript Language Specification (2024). `Date.UTC()`.
