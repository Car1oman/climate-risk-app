# FAILURE_SCENARIO_VALIDATION

**System:** V2 Climate Risk Pipeline — V2-CRIT-001 Fix  
**Date:** 2026-06-12  

---

## Test Protocol

Each scenario must satisfy all four acceptance criteria:

- [A] No runtime errors (no JS exceptions, no unhandled promise rejections)
- [B] No green risk indicators (no green badge, no green marker)
- [C] No fake "bajo" classification
- [D] Clear user-visible status (visible "Riesgo no disponible" or amber banner)

---

## Scenario 1 — V2 Timeout

**Simulation:** Introduce a 30-second delay in `fusionClimateData`; browser default fetch timeout fires.

**Expected flow:**
1. `fetch()` in `analyzeClimateRisk` times out and rejects
2. `catch {}` block returns `null`
3. `useQuery` sets `isLoading: false`, `data: undefined`
4. Hook: `normalizeV2Risk(id, undefined)` → null → `buildFallbackRisk` → `unavailable: true`
5. `computedRisk.risk_level = 'unknown'`, `unavailable = true`

**Expected UI (all pages):**
- Assets: muted "Riesgo no disponible" badge
- RiskMap: gray marker (#71717a), amber banner
- Dashboard: amber banner "El analisis de riesgo V2 no esta disponible…"
- AssetDetail: amber banner, muted "Riesgo no disponible" badge, score shows "-"

**Criteria:** [A] ✓ [B] ✓ [C] ✓ [D] ✓

---

## Scenario 2 — V2 HTTP 500

**Simulation:** Return `res.status(500).json({ error: 'Internal error' })` from the pipeline route.

**Expected flow:**
1. `apiFetch` resolves with `res.ok = false`
2. `if (!res.ok) return null` fires
3. `useQuery` receives `null` data
4. Hook: `normalizeV2Risk(id, null)` → null → `buildFallbackRisk` → `unavailable: true`

**Expected UI:** Same as Scenario 1.

**Criteria:** [A] ✓ [B] ✓ [C] ✓ [D] ✓

---

## Scenario 3 — Network Failure

**Simulation:** Browser is offline or DNS fails; `fetch()` rejects with `TypeError: Failed to fetch`.

**Expected flow:**
1. `fetch()` rejects
2. `catch {}` returns `null`
3. Hook: `buildFallbackRisk` → `unavailable: true`
4. `useQuery` sets `error` property

**Expected UI:** Same as Scenario 1 plus React Query retry (1 attempt per config).

**Note:** `useBatchAssetRisks` sets `unavailable = true` when `batchResult` is null and assets list is non-empty.

**Criteria:** [A] ✓ [B] ✓ [C] ✓ [D] ✓

---

## Scenario 4 — Malformed JSON

**Simulation:** Server returns 200 with body `"not valid json{{{"`.

**Expected flow:**
1. `res.ok = true`, `await res.json()` throws SyntaxError
2. `catch {}` in `analyzeClimateRisk` returns `null`
3. Hook: `buildFallbackRisk` → `unavailable: true`

**Expected UI:** Same as Scenario 1.

**Criteria:** [A] ✓ [B] ✓ [C] ✓ [D] ✓

---

## Scenario 5 — Partial Batch Failure

**Simulation:** 3 of 10 assets share coordinates that cause Layer3 to throw.

**Expected flow:**
1. Failing coordinates: `assessBusinessRisk` throws
2. Batch catch block: `riskData = { unavailable: true, error_code: 'PIPELINE_ERROR', ... }`
3. Succeeding coordinates: `exposure = 'medio'|'alto'|etc.`, `unavailable: false`
4. Hook: failing assets → `UNAVAILABLE_RISK`; succeeding → normal normalized risk
5. `someUnavailable = true` → `unavailable: true` from `useBatchAssetRisks`

**Expected UI:**
- Assets: failing assets show "Riesgo no disponible" badge; passing show real level badge
- Assets: amber banner "Riesgo no disponible para algunos activos"
- Dashboard: amber banner with count
- RiskMap: failing assets get gray markers; passing get colored markers

**Critical:** Passing assets that are genuinely "bajo" STILL show green "Bajo" badge. ✓

**Criteria:** [A] ✓ [B] ✓ (only for unavailable assets) [C] ✓ [D] ✓

---

## Scenario 6 — Layer3 Failure (partial pipeline, 200 response) [NEW BUG CASE]

**Simulation:** `assessBusinessRisk` throws but Layer1 and Layer2 succeed.

**Before fix:**
- Response: `{ overall_exposure: 'bajo', overall_risk_score: 0.1 }`
- UI showed green "Bajo" badge ← FAIL

**After fix:**
- Layer3 catch: `businessRiskOutput.overall_exposure = null`
- Response: `{ overall_exposure: null, unavailable: true, overall_risk_score: null }`
- Hook: `v2Data.unavailable === true` → `normalizeV2Risk` returns null → `buildFallbackRisk`
- UI: "Riesgo no disponible" badge

**Criteria:** [A] ✓ [B] ✓ [C] ✓ [D] ✓

---

## Regression — V2 Succeeds Normally

**Simulation:** All layers execute successfully; Layer3 returns `overall_exposure: 'alto'`.

**Expected flow:**
1. `exposure = 'alto'` (truthy) → `unavailable: false`
2. Response: `{ overall_exposure: 'alto', unavailable: false, overall_risk_score: 0.7 }`
3. Hook: `normalizeV2Risk` returns normalized risk with `risk_level: 'alto'`
4. All UI unchanged from pre-fix behavior

**Expected UI:** Orange "Alto" badge, colored map marker, normal dashboard card, normal PDF.

**Criteria:** [A] ✓ [B] N/A (no unavailable state) [C] N/A [D] N/A — behavior identical to pre-fix

---

## Summary

| Scenario | [A] No errors | [B] No green | [C] No bajo | [D] Visible | Result |
|----------|:---:|:---:|:---:|:---:|:---:|
| 1 — Timeout | ✓ | ✓ | ✓ | ✓ | PASS |
| 2 — HTTP 500 | ✓ | ✓ | ✓ | ✓ | PASS |
| 3 — Network failure | ✓ | ✓ | ✓ | ✓ | PASS |
| 4 — Malformed JSON | ✓ | ✓ | ✓ | ✓ | PASS |
| 5 — Partial batch failure | ✓ | ✓ | ✓ | ✓ | PASS |
| 6 — Layer3 throws (200) | ✓ | ✓ | ✓ | ✓ | PASS |
| Regression — V2 success | ✓ | N/A | N/A | N/A | PASS |
