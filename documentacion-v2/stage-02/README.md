# Stage 02 — Validation: Documentación por Pasos

**Resumen de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Stage** | Stage 02 — Validation (ID: 2) |
| **Clase** | `Stage02Validation` |
| **Ubicación** | `pipeline/stages/02-validation/index.js` (1051 líneas) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Input** | `sources_consulted` (output de Stage 01) |
| **Output** | `{ validated_sources: ValidatedRecord[], coverage_decisions: CoverageDecision[] }` |

---

## Diagrama de Flujo

```
                    Stage 01: Acquisition
                           │
                    sources_consulted[]
                           │
              ┌────────────▼────────────────┐
              │   PASO-1: Load Config       │
              │   getValidationProfiles()   │
              │   3 JSON files (cached)      │
              └────────────┬────────────────┘
                           │
              ┌────────────▼────────────────┐
              │   PASO-2: Per-Source Loop   │
              │   for each source:          │
              └────────────┬────────────────┘
                           │
          ┌────────────────┼────────────────────────┐
          │                │                        │
   ┌──────▼──────┐  ┌─────▼───────┐  ┌─────────────▼────────────┐
   │ PASO-3:     │  │ PASO-4:     │  │ PASO-5:                  │
   │ Fill Values │  │ Phys. Range │  │ Completeness             │
   │ (CF 1.12)   │  │ (WMO+SENAMHI│  │ (GCOS-245)              │
   └──────┬──────┘  └─────┬───────┘  └─────────────┬────────────┘
          │                │                        │
          └────────────────┼────────────────────────┘
                           │
              ┌────────────▼────────────────┐
              │   PASO-6: Temporal Check    │
              │   Date gaps + ONI sequence  │
              │   Severity via GCOS-245     │
              └────────────┬────────────────┘
                           │
              ┌────────────▼────────────────┐
              │   PASO-7: Coverage + Build  │
              │   Decorrelation model       │
              │   Zod-validated output      │
              └────────────┬────────────────┘
                           │
              ┌────────────▼────────────────┐
              │   ValidatedRecord[]          │
              │   CoverageDecision[]         │
              └────────────┬────────────────┘
                           │
                    Stage 03: Normalization
```

---

## Resumen de Pasos

| PASO | Componente | Líneas | Propósito | Estándar |
|---|---|---|---|---|
| **PASO-1** | `getValidationProfiles()` | config-loader.js | Carga 3 archivos JSON de configuración con cache TTL 60s | CF Conventions, WMO No. 8, GCOS-200/245 |
| **PASO-2** | `execute()`, `validateSource()` | index.js:122-162 | Loop principal: itera fuentes, orquesta 5 validaciones por fuente | — |
| **PASO-3** | `validateFillValues()`, path engine | index.js:234-295, 935-1018 | Detecta sentinelas por fuente (CF 1.12 §2.5.1) | CF Conventions 1.12 |
| **PASO-4** | `validatePhysicalRanges()` | index.js:313-427 | Doble capa: valid_range (WMO fail) + peru_range (SENAMHI warning) | WMO No. 8, IPCC AR6 WG1, SENAMHI 2021 |
| **PASO-5** | `validateCompleteness()` | index.js:448-509 | 4 niveles por tipo de dominio (GCOS-245 thresholds) | GCOS-200, GCOS-245, WMO No. 100 |
| **PASO-6** | `validateTemporalConsistency()` | index.js:531-733 | Date gaps (nasa_power), ONI sequence, null counting | WMO No. 100, ISO 19157, Trenberth 1997 |
| **PASO-7** | `evaluateCoverage()`, `buildResult()` | index.js:747-918 | Decorrelación per-variable, Zod-validated output | Isaaks & Srivastava 1989 |

---

## Reglas de Validación (6)

| # | Regla | PASO | Referencia | Resultados posibles |
|---|---|---|---|---|
| 1 | `schema_validation` | PASO-2 | — | pass, fail |
| 2 | `fill_value_detection` | PASO-3 | CF Conventions 1.12 §2.5.1 | pass, warning |
| 3 | `physical_range_validation` | PASO-4 | WMO No. 8, IPCC AR6, SENAMHI | pass, warning, fail |
| 4 | `completeness` | PASO-5 | GCOS-200, GCOS-245, WMO No. 100 | pass, warning, fail |
| 5 | `temporal_consistency` | PASO-6 | WMO No. 100, ISO 19157, Trenberth 1997 | pass, warning, fail |
| 6 | spatial coverage | PASO-7 | Isaaks & Srivastava 1989 | available, partial, out_of_coverage, unknown, failed |

---

## Output Shape

```typescript
{
  validated_sources: ValidatedRecord[],    // Zod-validated
  coverage_decisions: CoverageDecision[]
}

ValidatedRecord = {
  source: string,
  overall_status: "passed" | "warning" | "failed",
  is_valid: boolean,                       // true para passed + warning (H-32)
  validation_results: ValidationResult[],
  summary: {
    total_checks: number,
    passed: number,
    warnings: number,
    failed: number,
    completeness_pct: number | null,
  }
}

CoverageDecision = {
  source: string,
  source_domain: string,
  coverage_status: "available" | "partial" | "out_of_coverage" | "unknown" | "failed",
  distance_km: number | null,
  resolution: string | null,
  variable_coverage: VariableCoverage[],
  max_distance_source: "decorrelation_model",
  max_distance_formula: "d_max = -L × ln(θ)",
  max_distance_theta: 0.5,
  decision_reason: string,
}
```

---

## Hallazgos Corregidos (v2.1)

| Hallazgo | Severidad | Corrección | PASO |
|---|---|---|---|
| H-1 | Critica | PRECTOTCORR en vez de PRECTOT | PASO-2 |
| H-2 | Critica | Wildcard `[*]` en resolvePathParts | PASO-3 |
| H-3 | Critica | Date.UTC() + Math.round para dayDiff | PASO-6 |
| H-4 | Alta | Filter predicates para GRI Oxford | PASO-3 |
| H-5 | Alta | climatological_limit_test eliminado | — |
| H-6 | Alta | Feature muerta removida | — |
| H-7 | Alta | Per-variable coverage (no Math.max) | PASO-7 |
| H-8 | Alta | Fail-closed para null distance | PASO-7 |
| H-9 | Media | Warning para nested objects | PASO-3 |
| H-10 | Media | Number.isNaN check explícito | PASO-4 |
| H-11 | Media | Rango [0,2000] en vez de [0,50000] | PASO-4 |
| H-12 | Media | isErrorResponse check | PASO-2 |
| H-13 | Media | ValidatedRecordSchema.parse() | PASO-7 |
| H-14 | Media | isPresentValue() para NaN | PASO-5 |
| H-15 | Media | GCOS-245 Threshold citations | PASO-5 |
| H-16 | Media | socioeconomic good=1.0 evaluado | PASO-5 |
| H-17 | Media | classifyCompleteness reusado | PASO-5, PASO-6 |
| H-18 | Media | ONI season sequence check | PASO-6 |
| H-19 | Media | not_available documentado | PASO-7 |
| H-20 | Media | Bare * handler | PASO-3 |
| H-22 | Media | TEMPORAL_NOT_APPLICABLE_REASONS | PASO-6 |
| H-27 | Media | wasMapped flag | PASO-5 |

---

## Archivos de Configuración

| Archivo | Tamaño | Contenido | Consumidores |
|---|---|---|---|
| `pipeline/config/validation-profiles.json` | ~14KB, 372 líneas | Fill values, physical ranges, completeness thresholds, QC tests | PASO-1 → todos los pasos |
| `pipeline/config/spatial-decorrelation.json` | Variable | Decorrelation lengths por variable | PASO-7 |
| `pipeline/config/authoritative-sources.json` | ~11KB | Source registry con domain mappings | PASO-1 (vía config-loader) |
