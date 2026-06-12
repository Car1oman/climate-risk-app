# 002 Execution Plan: Downscaling + Return Periods / AAL

**Classification**: P1 (Competitive gap — spatial resolution + probabilistic risk)
**Score Impact**: Resolución 30/100 → 80/100, Financiero 25/100 → 75/100
**Branch**: `002-downscaling-aal`

---

## Dependency Validation

| Dependency | Status | Alternative | Decision |
|---|---|---|---|
| WorldClim 1km climatology | ⏳ Needs sourcing | ERA5-Land (free, 9km) | Use WorldClim v2.1 (30 arc-sec) GeoTIFF. Cache tiles in `/data/worldclim/`. Fallback: ERA5-Land bilinear-interpolated to 1km. |
| GEV fitting library | ❌ Not in package.json | Pure JS implementation | Implement GEV using L-moments (Hosking 1990). No external dependency needed. |
| Storage for climatology grid | ⏳ ~500 MB for Peru extent | Supabase/PostGIS or local file | Pre-computed tiles as flat GeoTIFF files in repo. Load into memory cache on first request (~200 MB RSS). |

---

## Acceptance Criteria Validation

| # | Criterion | Validation Method | Risk |
|---|---|---|---|
| US1.1 | Andes temperature diff > 3°C from raw CMIP6 | Cusco (-13.5, -71.9) test | High — depends on WorldClim accuracy in Andes |
| US1.2 | Coast precip < 50 mm/month | Lima (-12.0, -77.0) test | Low — coastal aridity is well-established |
| US1.3 | < 5s per location | Benchmark test | Low — cache hit makes this ~200ms |
| US2.1 | RP2/10/50/100/500 with bounds | GEV fitting unit test | Medium — ensemble size affects fit stability |
| US2.2 | AAL in USD/year with CI | Integration test | Medium — depends on loss function calibration |
| US2.3 | AAL within ±30% of fixed range | 3 sector-hazard pairs | Medium — calibration needed |
| US3.1 | 30% difference between supermarket vs warehouse | Impact function test | Low — parameter-driven |
| US3.2 | 20+ asset types with OpEx/CapEx/revenue | Schema validation | Low — data entry effort |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WorldClim license restricts commercial use | Low | High | Use ERA5-Land (CC-BY 4.0) |
| GEV fit unstable with < 10 ensemble members | Medium | Medium | Use Gringorten plotting position as fallback |
| Downscaling adds > 5s latency | Medium | Medium | Aggressive caching + async pre-warm |
| AAL outside fixed range for some sectors | Medium | Medium | Apply scaling factor; document deviation |
| WorldClim tiles not available for Peru sub-regions | Low | Medium | Tile merging from global tiles (30×30°) |

---

## Implementation Phases

### Phase 0 — Research (COMPLETED)
- [x] 0.1 Evaluate downscaling method → **Delta Method** selected
- [x] 0.2 Source climatology data → **WorldClim v2.1** (ERA5-Land fallback)
- [x] 0.3 Evaluate GEV approach → **L-moments pure JS** (no scipy dependency)
- [x] 0.4 Design AAL formula → **Numerical integration over exceedance curve**

### Phase 1 — Downscaling Service (ACTIVE)
- [ ] **1.1** Create `server/services/downscaleService.js` — delta method engine
- [ ] **1.2** Implement `ElevationCorrection` — WorldClim grid loader + bilinear interpolation
- [ ] **1.3** Implement anomaly computation (future - historical at 25km → 1km)
- [ ] **1.4** Integrate with Layer1 after `fetchClimateCell()` — non-breaking
- [ ] **1.5** Add downscaling metadata to fused data output
- [ ] **1.6** Feature flag `feature.downscale`

### Phase 2 — Return Periods / AAL (ACTIVE)
- [ ] **2.1** Create `server/scientific/extremeValueAnalysis.js`
- [ ] **2.2** Implement L-moments GEV parameter estimation
- [ ] **2.3** Implement return level computation (RP2 through RP500)
- [ ] **2.4** Implement exceedance probability curve
- [ ] **2.5** Implement AAL computation
- [ ] **2.6** Integrate with Layer3 — `computeAAL()` as alternative to FINANCIAL_RANGES
- [ ] **2.7** Feature flag `feature.probabilistic_risk`

### Phase 3 — Impact Functions Expansion
- [ ] **3.1** Expand `server/layers/businessProfiles.js` to 20+ asset types
- [ ] **3.2** Create OpEx/CapEx/revenue impact matrix
- [ ] **3.3** Integrate AAL with asset-type impact functions

### Phase 4 — Testing
- [ ] **4.1** Downscaling unit tests (3 locations × 2 scenarios × 4 variables)
- [ ] **4.2** GEV fitting unit tests
- [ ] **4.3** AAL integration tests
- [ ] **4.4** Performance benchmarks
- [ ] **4.5** Regression tests

---

## Score Projection

| Metric | Current | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| Spatial resolution | 30/100 | 80/100 | 80/100 | 80/100 |
| Financial modeling | 25/100 | 25/100 | 75/100 | 85/100 |
| **Combined** | **28/100** | **53/100** | **78/100** | **83/100** |
