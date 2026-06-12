# Execution Plan — 003-observational-activation

**Based on**: `specs/003-observational-activation/spec.md`
**Dependencies verified**: 2026-06-11

## Dependency Validation

| Dependency | Claimed | Actual | Status |
|------------|---------|--------|--------|
| QW-002 (buildNdviNarrative/buildGraceFoNarrative) | ✅ Exist | ✅ Exist in services/ | ✅ OK — need integration in Layer6 |
| QW-004 (financial ranges) | ✅ Exist | ❌ NOT in Layer3 FINANCIAL_RANGES | ⚠️ Must implement |
| Layer9 projection.js | No changes needed | ✅ Verified | ✅ OK |
| Feature flags | Spec-defined | Not yet created | ⚠️ Will add inline |

## Execution Order

### Phase 0 — Quick Wins (Layer6 + Layer3)
1. Import `buildNdviNarrative` + `buildGraceFoNarrative` in Layer6
2. Call them in `generateNarrative()` — append to executive_summary
3. Add `ndvi`/`grace_fo` keys to `generated_from` provenance
4. Add FINANCIAL_RANGES entries in Layer3

### Phase 1 — PRECTOT Independent Signal (Layer2)
1. Add `prectot_drought_mm` threshold to signalThresholds.js
2. Add standalone `drought_observacional` signal detection in V2
3. Add source_traceability for PRECTOT signal

### Phase 2 — Layer9 Integration (climate.js)
1. Import `runProjectionEngine` in route
2. Call it and merge with `buildProjectionContext`
3. Add ndvi_projection / grace_fo_projection to response

### Phase 3 — Tests
1. Layer6 narrative integration
2. Layer3 financial ranges
3. Layer2 PRECTOT signal
4. Layer9 integration
5. Regression

## Estimated score impact
- Observacional score: 35/100 → 55/100
