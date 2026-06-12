# Feature Specification: Downscaling + Return Periods / AAL

**Feature Branch**: `002-downscaling-aal`

**Created**: 2026-06-11

**Status**: In Progress (Phase 0 completed, Phase 1-2 active)

**Input**: Validated audit findings H-001 (downscaling), H-002 (AAL/return periods)

## User Scenarios & Testing

### User Story 1 - Downscaled Climate Signals (Priority: P1)

As a climate risk analyst, I want climate projections at 1 km resolution instead of 25 km, so that I can assess risks at the asset level in complex terrain (Andean valleys, urban heat islands).

**Why this priority**: P1 — without downscaling, signals are spatially inaccurate for 80% of Peru's economic activity.

**Independent Test**: Compare pre/post downscaling at 3 known locations: Lima coastal plain, Cusco valley, Tarapoto lowland. Delta must be < 2°C Tmean and < 20% precip at coast but > 5°C and > 50% in Andes.

**Acceptance Scenarios**:

1. **Given** a location in the Andean valley (e.g., Cusco -13.5, -71.9), **When** downscaling is applied, **Then** the temperature signal must differ by > 3°C from raw CMIP6 due to elevation correction.
2. **Given** a coastal location (e.g., Lima -12.0, -77.0), **When** downscaling is applied, **Then** the precipitation signal must reflect coastal aridity (PRECTOT climatology < 50 mm/month).
3. **Given** any location, **When** the downscaling pipeline runs, **Then** it must complete in < 5s per location (cacheable).

### User Story 2 - Return Periods for Financial Modeling (Priority: P1)

As a risk underwriter, I want 2-year, 10-year, 50-year, 100-year, and 500-year return periods for each hazard, so that I can price insurance premiums and stress-test portfolios.

**Why this priority**: P1 — required for insurance and regulated financial use cases.

**Independent Test**: For a known location, compute AAL from return periods and verify it falls within ±30% of the existing fixed financial range for the same sector.

**Acceptance Scenarios**:

1. **Given** a hazard (e.g., extreme_heat), **When** return periods are computed, **Then** the output must include RP2, RP10, RP50, RP100, RP500 with P50/P10/P90 confidence bounds.
2. **Given** a hazard with ensemble data, **When** AAL is computed, **Then** it must be expressed in USD/year with confidence intervals.
3. **Given** return periods, **When** compared to the existing fixed financial range, **Then** the AAL must be within the existing min-max range for at least 3 sector-hazard pairs.

### User Story 3 - Impact Functions by Asset Type (Priority: P2)

As a portfolio manager, I want differentiated financial impact ranges by asset type (e.g., supermarket vs warehouse vs hospital), so that I can aggregate risk across heterogeneous asset portfolios.

**Acceptance Scenarios**:

1. **Given** a retail asset (supermarket), **When** assessed for flood_risk, **Then** the AAL must differ from a warehouse by at least 30%.
2. **Given** 20+ asset types, **When** impact functions are defined, **Then** each must include OpEx impact, CapEx impact, and revenue disruption.

## Architecture

### Downscaling (BCSD Delta Method)

```
Layer1 fetchClimateCell()
    │
    ▼
Raw CMIP6 25km ──→ downscaleService.downscale(lat, lon, climateData)
                        │
                        ├── 1. Fetch WorldClim 1km climatology (pre-computed, cached)
                        ├── 2. Compute CMIP6 anomaly (future - historical) at 25km
                        ├── 3. Interpolate anomaly to 1km (bilinear/bicubic)
                        ├── 4. Apply anomaly to WorldClim baseline
                        └── 5. Return downscaled climateData with metadata
```

### Return Periods / AAL (GEV/GPD)

```
Layer3 assessBusinessRisk()
    │
    ├── For each hazard:
    │   ├── 1. Fit GEV distribution to ensemble values
    │   ├── 2. Compute return levels RP2, RP10, RP50, RP100, RP500
    │   ├── 3. Compute exceedance probability curve
    │   └── 4. Compute AAL = ∫(loss × probability) over RP curve
    │
    └── Return { return_periods, aal, exceedance_curve }
```

## Impacto esperado

| Métrica | Actual | Post-downscaling | Post-AAL |
|---------|--------|-----------------|----------|
| Resolución espacial | 25 km | 1 km | 1 km |
| Modelado financiero | Rangos fijos | Rangos fijos | AAL + RPs |
| Score resolución | 30/100 | 80/100 | 80/100 |
| Score financiero | 25/100 | 25/100 | 75/100 |

## Métricas de éxito

- Downscaling: MAE < 1.5°C para temperatura, < 20% para precipitación en 10 ubicaciones de prueba
- AAL: diferencia < 20% con estimación actuarial para 3 escenarios benchmark
- Performance: downscaling < 5s/location, AAL < 2s/location

## Dependencias

- **WorldClim 1 km** (gridMET o ERA5-Land como alternativa gratuita)
- **scipy** (stats.genextreme) o implementación JS nativa
- Cache de climatología base (~2 GB almacenamiento)

## Plan de rollback

- Feature flag `feature.downscale` toggle on Layer1
- Feature flag `feature.probabilistic_risk` toggle on Layer3
- Si falla, el sistema retorna al comportamiento actual (raw CMIP6 + rangos fijos)

## Tests requeridos

- `tests/backend/services/downscaleService.test.js` — 3 ubicaciones × 2 escenarios × 4 variables
- `tests/backend/scientific/extremeValueAnalysis.test.js` — GEV fitting, return levels, AAL
- `tests/backend/layers/layer3_probabilistic.test.js` — integración con Layer3
- `tests/regression/layer1-downscale.test.js` — no break existing climate_cells path
- `tests/benchmarks/downscale-perf.test.js` — performance SLA
