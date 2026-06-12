# Tasks: Observational Data Activation

## Phase 0 — Quick Wins

- [x] 0.1 Import buildNdviNarrative in Layer6_NarrativeEngine.js
- [x] 0.2 Import buildGraceFoNarrative in Layer6_NarrativeEngine.js
- [x] 0.3 Add narrative calls in generateNarrative() return statement
- [x] 0.4 Add FINANCIAL_RANGES entries for vegetation_stress, severe_vegetation_stress, groundwater_depletion

## Phase 1 — PRECTOT as Independent Signal

- [x] 1.1 Create PRECTOT drought threshold in signalThresholds.js
- [x] 1.2 Add PRECTOT signal detection in Layer2_SignalEngineV2.js
- [x] 1.3 Ensure PRECTOT signal has proper source_traceability

## Phase 2 — Layer9 Integration

- [x] 2.1 Import runProjectionEngine from Layer9_ProjectionEngine.js in climate.js route
- [x] 2.2 Merge projection output: buildProjectionContext + runProjectionEngine
- [x] 2.3 Update response schema to include ndvi_projection, grace_fo_projection
- [x] 2.4 Deferred → UI-OBS-001 (separate frontend initiative)

## Phase 3 — Testing

- [x] 3.1 Layer6 narrative integration tests — `tests/backend/layers/layer6_observational.test.js` (6 tests ✅)
- [x] 3.2 Layer3 financial range tests for satellite signals — `tests/backend/layers/layer3_observational_finance.test.js` (5 tests ✅)
- [x] 3.3 Layer2 PRECTOT signal tests — `tests/backend/layers/layer2_prectot_signal.test.js` (5 tests ✅)
- [ ] 3.4 Layer9 integration tests — deferred (requires full route test harness)
- [x] 3.5 Regression tests (all existing) — 644 tests ✅

## Implementation Status
- **Phase 0-3 implementation**: ✅ COMPLETED (16 new tests, 644 regression, 0 failures)
- **Phase 2.4**: ⏩ Migrated to UI-OBS-001
- **Phase 3.4**: ⏳ Layer9 integration test — deferred (requires route-level test harness)

## Closure
- **Clasificación**: B) FUNCTIONALLY COMPLETED
- **Decision**: UI enhancement tracked separately (UI-OBS-001). No roadmap dependency.
- **See**: `003_CLOSURE_REPORT.md`
