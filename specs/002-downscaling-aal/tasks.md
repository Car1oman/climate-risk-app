# Tasks: Downscaling + Return Periods / AAL

## Phase 0 — Research (COMPLETED)

- [x] 0.1 Evaluate BCSD vs Quantile Mapping vs Delta Method ✅ **Delta Method selected**
- [x] 0.2 Source WorldClim 1 km / ERA5-Land data ✅ **SRTM 30m elevation via OpenTopoData (Phase 1); WorldClim upgrade planned**
- [x] 0.3 Evaluate scipy.stats.genextreme vs xclim for GEV fitting ✅ **Pure JS L-moments implementation**
- [x] 0.4 Design AAL computation formula ✅ **Numerical integration over exceedance curve**

## Phase 1 — Downscaling Service

- [x] 1.1 Create `server/services/downscaleService.js` ✅
- [x] 1.2 Implement elevation correction using SRTM + lapse rates ✅ (WorldClim planned as Phase 2 upgrade)
- [x] 1.3 Implement delta method with temperature/precipitation lapse rates ✅
- [x] 1.4 Integrate with Layer1_ClimateDataFusion.js after fetchClimateCell() ✅
- [x] 1.5 Add downscaling metadata to fusion output (spatial_resolution, downscale) ✅
- [ ] 1.6 Add feature flag `feature.downscale`

## Phase 2 — Return Periods / AAL

- [x] 2.1 Create `server/scientific/extremeValueAnalysis.js` ✅
- [x] 2.2 Implement GEV distribution fitting (L-moments) ✅
- [x] 2.3 Implement return level computation (RP2, RP10, RP50, RP100, RP500) ✅
- [x] 2.4 Implement exceedance probability curve ✅
- [x] 2.5 Implement AAL = Σ(loss_i × ΔP_i) ✅
- [x] 2.6 Integrate with Layer3_BusinessRiskEngine.js ✅

## Phase 3 — Impact Functions Expansion

- [ ] 3.1 Expand `server/layers/businessProfiles.js` from 5 to 20+ types
- [ ] 3.2 Create financial impact matrix for new asset types
- [ ] 3.3 Integrate AAL with asset-type-specific impact functions

## Phase 4 — Testing

- [x] 4.1 Downscaling unit tests (14 tests) ✅ `tests/backend/services/downscaleService.test.js`
- [x] 4.2 GEV fitting unit tests (13 tests) ✅ `tests/backend/scientific/extremeValueAnalysis.test.js`
- [x] 4.3 AAL computation tests (included in EVA tests) ✅
- [ ] 4.4 Performance benchmarks
- [ ] 4.5 Regression tests (no break existing pipeline)

## Implementation Status
- **Phase 0-2 implementation**: ✅ COMPLETED (27 new tests, 0 failures)
- **Phase 3**: ⏳ 20+ asset types (siguiente prioridad)
- **Phase 4.4-4.5**: ⏳ Benchmarks + regression validation pendientes
