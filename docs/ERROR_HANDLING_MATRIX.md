# ERROR_HANDLING_MATRIX

**System:** V2 Climate Risk Pipeline  
**Date:** 2026-06-12  

Each row traces a failure from its origin through the full stack to the end user.

---

## Single Analysis — POST /api/v2/climate-risk-analysis

| Failure | Origin | HTTP | api.js returns | Hook state | UI |
|---------|--------|------|----------------|------------|-----|
| Layer1 throws (e.g. DB unreachable) | `fusionClimateData` | `500` | `null` | `v2Data = null` → `buildFallbackRisk` → `unavailable: true` | "Riesgo no disponible" badge + amber banner |
| Layer2 throws | `detectSignalsV2` | `200` with `layer_errors.layer2` | object | `normalizeV2Risk` succeeds (signals degraded) | Normal display with fewer signals |
| Layer3 throws | `assessBusinessRisk` | `200` with `overall_exposure: null, unavailable: true` | object | `normalizeV2Risk` sees `unavailable: true` → returns null → `buildFallbackRisk` | "Riesgo no disponible" badge |
| Layer5 throws | `getAdaptations` | `200` with empty adaptations | object | `normalizeV2Risk` succeeds | Normal display, adaptations section empty |
| Layer6 throws | `generateNarrative` | `200` with "No disponible" summary | object | `normalizeV2Risk` succeeds | Normal display, narrative section degraded |
| Outer catch | any unhandled throw | `500` | `null` | `buildFallbackRisk` → `unavailable: true` | "Riesgo no disponible" |
| Network timeout | fetch | fetch rejects | `null` (catch) | `buildFallbackRisk` → `unavailable: true` | "Riesgo no disponible" |
| Network failure | fetch | fetch rejects | `null` (catch) | `buildFallbackRisk` → `unavailable: true` | "Riesgo no disponible" |
| HTTP 500 | server | 500 non-ok | `null` (`!res.ok`) | `buildFallbackRisk` → `unavailable: true` | "Riesgo no disponible" |
| HTTP 401/403 | auth middleware | 401/403 | `null` (`!res.ok`) | `buildFallbackRisk` → `unavailable: true` | "Riesgo no disponible" |
| Malformed JSON | `res.json()` throws | 200 | `null` (catch) | `buildFallbackRisk` → `unavailable: true` | "Riesgo no disponible" |

---

## Batch Analysis — POST /api/v2/climate-risk-analysis/batch

| Failure | Scope | Backend response | Hook state | UI |
|---------|-------|-----------------|------------|-----|
| One coordinate fails | Per-asset | `results[id] = { unavailable: true, error_code: 'PIPELINE_ERROR' }` | `UNAVAILABLE_RISK` for that asset | Gray marker on map, "Riesgo no disponible" badge |
| All coordinates fail | Batch-wide | `{ results: { all: { unavailable: true } } }` | All assets get `UNAVAILABLE_RISK` | Amber banner on Assets/Dashboard/Map |
| Outer catch (request-level) | Whole batch | HTTP 500 | `batchResult = null` → all `buildFallbackRisk` | `unavailable: true` for all assets, amber banner |
| Network failure | Whole batch | fetch rejects | `batchResult = null` | Amber banner, all unavailable |
| Empty assets array | Client guard | HTTP 400 | `batchResult = null` | (no assets to render) |

---

## Hook Response Contract

```js
// useAssetRisk
{
  computedRisk: {
    asset_id,
    risk_score: null | number,
    risk_level: null | 'critico' | 'alto' | 'medio' | 'bajo',
    unavailable: boolean,
    ...
  },
  isLoading: boolean,
  error: Error | null,
  unavailable: boolean,   // true when data could not be obtained
  stale: boolean,         // true when asset exists but no result yet
}

// useBatchAssetRisks
{
  computedRisks: { [assetId]: same as above },
  getRisk: (asset) => computedRisk,
  isLoading: boolean,
  error: Error | null,
  unavailable: boolean,   // true if ANY asset is unavailable
}
```

---

## UI Visibility Rules

| Condition | Rendered element |
|-----------|-----------------|
| `isLoading === true` | Spinner / "evaluando riesgos..." inline text |
| `unavailable === true` (per-asset) | "Riesgo no disponible" muted badge |
| `unavailable === true` (batch) | Amber banner at page top |
| `error !== null` | Destructive error banner |
| `risk_level === 'bajo'` (real data) | Green "Bajo" badge (ONLY when `unavailable === false`) |
| `risk_level` null/unknown + NOT unavailable | "Sin clasificar" badge |

**Invariant:** "Bajo" badge is NEVER shown when `unavailable === true`.
