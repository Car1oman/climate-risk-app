# Design Document: Downscaling + Return Periods / AAL

## Downscaling Architecture

### Data Flow

```
Request: /v2/climate-risk-analysis?lat=-12.0&lon=-77.0
    │
    ▼
Layer1 fusionClimateData()
    │
    ├── fetchClimateCell() → raw CMIP6 25km
    ├── downscaleService.downscale(rawData, lat, lon)
    │       │
    │       ├── loadClimatology(lat, lon) → WorldClim 1km grid point
    │       ├── computeAnomaly(historical, future) → delta at 25km
    │       ├── interpolateAnomaly(delta, 25km → 1km) → bilinear
    │       ├── applyAnomaly(climatology, interpolatedDelta) → downscaled
    │       └── return { downscaled, metadata }
    │
    ├── ... (rest of fusion)
    │
    ▼
Normalized climateData at effective 1km
```

### Key Design Decisions

1. **Delta Method over BCSD**: Simpler, faster, proven effective in IPCC AR6. BCSD (full bias correction) can be added in Phase 2.
2. **WorldClim 1 km** as baseline: Free, peer-reviewed, covers Peru completely.
3. **Bilinear interpolation**: Sufficient for delta method. Bicubic adds complexity for marginal gain.

### Storage

- WorldClim grid: Pre-computed tile service or embedded SQLite (~500 MB for Peru extent)
- Downscaled projections: Cache with 24h TTL (same as current climate_cells cache)

## Return Periods / AAL Architecture

### GEV Fitting

```
ensemble_values = [model_1, model_2, ..., model_n]  # n >= 10 for stable fit
gev_params = fit_genextreme(ensemble_values)  # scipy.stats.genextreme.fit()

return_levels = {
    2:    gev.isf(1/2),
    10:   gev.isf(1/10),
    50:   gev.isf(1/50),
    100:  gev.isf(1/100),
    500:  gev.isf(1/500),
}
```

### AAL Computation

```
exceedance_curve = []
for loss in linspace(min_loss, max_loss, 100):
    p_exceed = 1 - gev.cdf(loss)
    exceedance_curve.append({loss, p_exceed})

AAL = sum(loss_i × Δp_i for adjacent pairs on exceedance curve)
```

### Integration Points

- Layer3: Replace `FINANCIAL_RANGES` with `computeAAL(hazard, sector, ensemble_data)`
- Response: Add `return_periods` and `aal` fields to each risk entry
- Frontend: Display AAL and return periods in ConsolidatedRiskCard

## Performance Considerations

- Downscaling: ~200ms per location (cached climatology + simple interpolation)
- GEV fitting: ~50ms per hazard
- Total added latency: ~500ms per request
- Cache: WorldClim grid in memory (shared across requests)
