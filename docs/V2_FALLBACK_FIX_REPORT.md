# V2_FALLBACK_FIX_REPORT

**Defect ID:** V2-CRIT-001  
**Status:** FIXED  
**Date:** 2026-06-12  

---

## Root Cause

The V2 climate risk pipeline contained three code paths that silently classified unavailable data as `"bajo"` (low risk):

### 1. Backend — Layer3 catch fallback (`server/routes/climate.js`)

```js
// BEFORE (bug)
businessRiskOutput = { risks: [], overall_exposure: 'bajo', sector_key: 'otros' };

// AFTER (fix)
businessRiskOutput = { risks: [], overall_exposure: null, sector_key: 'otros' };
```

When `assessBusinessRisk` threw an exception, the pipeline continued with a fake `'bajo'` exposure, producing a 200 OK response that looked valid but contained fabricated risk data.

### 2. Backend — Single analysis response body (`server/routes/climate.js`)

```js
// BEFORE (bug)
overall_exposure: contextualRisks.overall_exposure ?? 'bajo',
overall_risk_score: ... : 0.1,  // 0.1 = bajo

// AFTER (fix)
overall_exposure: contextualRisks.overall_exposure ?? null,
unavailable: !contextualRisks.overall_exposure,
overall_risk_score: ... : contextualRisks.overall_exposure === 'bajo' ? 0.1 : null,
```

The `?? 'bajo'` default converted any null/undefined exposure (degraded pipeline state) into a green low-risk reading.

### 3. Backend — Batch analysis success path (`server/routes/climate.js`)

```js
// BEFORE (bug)
overall_exposure: businessRisk.overall_exposure ?? 'bajo',
overall_risk_score: ... : 0.1,

// AFTER (fix)
const exposure = businessRisk.overall_exposure ?? null;
overall_exposure: exposure,
unavailable: !exposure,
overall_risk_score: ... : exposure === 'bajo' ? 0.1 : null,
```

Same pattern as #2, affecting the batch endpoint used by `Assets.jsx`, `RiskMap.jsx`, and `Dashboard.jsx`.

### 4. Frontend — AssetDetail.jsx TDZ bug

```js
// BEFORE (bug — uses variable before declaration, temporal dead zone)
const isRiskUnavailable = isRiskUnavailable || computedRisk?.unavailable === true;

// AFTER (fix — uses riskUnavailable from useAssetRisk hook)
const isRiskUnavailable = riskUnavailable || computedRisk?.unavailable === true;
```

The self-referencing declaration would throw a ReferenceError in strict mode (ES modules are always strict). In practice some transpilers may have coerced this to `undefined`, causing the unavailable state to never be shown.

### 5. Frontend — RiskMap.jsx legend (cosmetic)

Added gray "No disponible" entry to the map legend so users understand that gray markers represent data-unavailable assets, not a fifth risk level.

---

## Components Verified as Already Correct

| Component | Status |
|-----------|--------|
| `src/hooks/useAssetRisk.js` — `useAssetRisk` | ✅ Correct — `buildFallbackRisk` returns `unavailable: true` |
| `src/hooks/useAssetRisk.js` — `useBatchAssetRisks` | ✅ Correct — checks `batchRisk.unavailable` flag |
| `src/lib/api.js` — `analyzeClimateRisk` | ✅ Correct — returns `null` on non-ok response; catch returns `null` |
| `src/lib/api.js` — `batchAnalyzeClimateRisk` | ✅ Correct — same pattern |
| `src/pages/Assets.jsx` | ✅ Correct — shows "Riesgo no disponible" badge when `risk.unavailable` |
| `src/pages/Dashboard.jsx` | ✅ Correct — shows amber banner when `risksUnavailable` |
| `src/components/dashboard/TopRisksTable.jsx` | ✅ Correct — shows "Riesgo no disponible" badge |
| `src/lib/enterprisePdfReport.js` | ✅ Correct — shows warning callout when `unavailableCount > 0` |
| `src/pages/RiskMap.jsx` — markers | ✅ Correct — uses gray `#71717a` for unavailable |

---

## Failure Paths Covered After Fix

| Failure Mode | Backend Response | Hook Result | UI |
|---|---|---|---|
| Layer1 throws | `500 { error, partial }` | `api.js` returns null → `buildFallbackRisk` | "Riesgo no disponible" |
| Layer3 throws | `200 { overall_exposure: null, unavailable: true }` | `normalizeV2Risk` returns null → `buildFallbackRisk` | "Riesgo no disponible" |
| Outer catch | `500 { error }` | `api.js` returns null → `buildFallbackRisk` | "Riesgo no disponible" |
| Network timeout | fetch rejects → catch | `api.js` returns null → `buildFallbackRisk` | "Riesgo no disponible" |
| Malformed JSON | `res.json()` throws → catch | `api.js` returns null → `buildFallbackRisk` | "Riesgo no disponible" |
| Batch partial failure | `{ unavailable: true }` per asset | `useBatchAssetRisks` uses `UNAVAILABLE_RISK` | "Riesgo no disponible" |

---

## Regression Safety

When V2 succeeds and Layer3 returns a valid exposure (`'critico'|'alto'|'medio'|'bajo'`):

- `exposure` is truthy → `unavailable: false`
- `overall_exposure` is unchanged from the engine output
- `overall_risk_score` maps to the same value as before
- All UI components display unchanged behavior

No changes were made to Layer1, Layer2, Layer3, Layer5, Layer6, Layer9, or any business logic.
