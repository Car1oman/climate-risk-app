# Feature Specification: Observational Data Activation (NDVI/GRACE-FO/POWER)

**Feature Branch**: `003-observational-activation`

**Created**: 2026-06-11

**Status**: COMPLETED (UI Enhancement Pending — see UI-OBS-001)

**Input**: Validated audit findings H-005, H-006, H-009; dead code in Layer9

## User Scenarios & Testing

### User Story 1 - NDVI Narrative (Priority: P1)

As a user viewing a climate risk analysis, I want to see narrative context for vegetation stress signals, so that I understand what "NDVI anomaly = -0.3" means for my asset.

**Independent Test**: Request analysis for a location with simulated NDVI stress. Verify executive_summary contains NDVI narrative text.

**Acceptance Scenarios**:

1. **Given** a location with `vegetation_health = 'stress'`, **When** analysis runs, **Then** executive_summary must include NDVI narrative with numerical values.
2. **Given** a location with `vegetation_health = 'severe_stress'`, **When** analysis runs, **Then** executive_summary must indicate severe stress.

### User Story 2 - GRACE-FO Narrative (Priority: P1)

As a user, I want to see narrative context for groundwater depletion signals, so that I understand long-term water security risks.

**Acceptance Scenarios**:

1. **Given** a location with `tws_anomaly_cm < -5`, **When** analysis runs, **Then** executive_summary must include GRACE-FO narrative.
2. **Given** a location with normal groundwater, **When** analysis runs, **Then** no GRACE-FO narrative (null check).

### User Story 3 - Financial Impact for Satellite Signals (Priority: P2)

As a risk analyst, I want vegetation_stress and groundwater_depletion to have financial impact ranges, so that I can quantify the cost of environmental degradation.

**Acceptance Scenarios**:

1. **Given** a `vegetation_stress` signal for retail sector, **When** assessed, **Then** financial_impact_range must be non-zero with min/max USD.
2. **Given** a `groundwater_depletion` signal for agro sector, **When** assessed, **Then** financial_impact_range must reflect water dependency.

### User Story 4 - PRECTOT as Independent Drought Signal (Priority: P2)

As a climate scientist, I want NASA POWER PRECTOT as an independent drought signal (not just a compounding flag), so that I can monitor current drought conditions in near-real-time.

**Acceptance Scenarios**:

1. **Given** PRECTOT < 0.5 mm/day, **When** signals are computed, **Then** a `drought_observacional` signal is generated.
2. **Given** PRECTOT >= 0.5 mm/day, **When** signals are computed, **Then** no drought_observacional signal.

## Architecture

### Layer6 — Narrative Activation

```
Layer6_NarrativeEngine.js
    │
    ├── import { buildNdviNarrative } from '../services/modisNdviService.js'    (NEW)
    ├── import { buildGraceFoNarrative } from '../services/graceFoService.js'   (NEW)
    │
    ├── ndviSentence = buildNdviNarrative(fusedData?.ndviData?.anomaly)         (NEW)
    ├── graceSentence = buildGraceFoNarrative(fusedData?.graceFoData?.anomaly)  (NEW)
    │
    └── executive_summary = [..., ndviSentence, graceSentence].filter(Boolean).join(' ')
```

### Layer3 — Financial Ranges

```
FINANCIAL_RANGES = {
    ...existing,
    vegetation_stress:        { min_usd: 15_000, max_usd: 60_000 },
    severe_vegetation_stress: { min_usd: 40_000, max_usd: 150_000 },
    groundwater_depletion:    { min_usd: 30_000, max_usd: 100_000 },
}
```

### Layer2 — PRECTOT Signal

```
if (nasaPowerData?.recent?.PRECTOT?.value < 0.5) {
    signals.push(buildSignal({
        signalType: 'drought_observacional',
        indicator: 'prectot',
        projected: nasaPowerData.recent.PRECTOT.value,
        conf: 'medium',
        horizon: 'short_term',
        threshold_reference: 'NASA POWER PRECTOT < 0.5 mm/día',
        exceeds_threshold: true,
    }))
}
```

### Layer9 — Integration

Re-enable `runProjectionEngine` in the route pipeline. Merge NDVI/GRACE-FO projections with existing IPCC projection context:

```
projectionOutput = {
    ...buildProjectionContext(signalOutput),
    ndvi_projection: runProjectionEngine(fusedData).ndvi_projection,
    grace_fo_projection: runProjectionEngine(fusedData).grace_fo_projection,
}
```

## Impacto esperado

- Score observacional: 35/100 → 55/100
- Narrative enriquecida con 2-3 oraciones adicionales
- Señales satelitales monetizables

## Métricas de éxito

- NDVI narrative presente en 100% de análisis con vegetation_stress
- GRACE-FO narrative presente en 100% de análisis con groundwater_depletion
- financialRange no-zero para vegetation_stress y groundwater_depletion
- PRECTOT drought signal independiente en 100% de análisis con POWER data

## Dependencias

- QW-002 ya implementado (buildNdviNarrative/buildGraceFoNarrative existentes)
- QW-004 ya implementado (financial ranges para vegetación/groundwater)
- Layer9 integración no requiere cambios en projection.js

## Plan de rollback

- NDVI/GRACE narratives: feature flag `feature.observational_narrative`
- Layer9 projection: feature flag `feature.layer9_projections`
- PRECTOT signal: feature flag `feature.prectot_drought`

## Tests requeridos

- `tests/backend/layers/layer6_observational.test.js` — NDVI/GRACE narrative en Layer6
- `tests/backend/layers/layer3_observational_finance.test.js` — financial ranges para señales satelitales
- `tests/backend/layers/layer2_prectot_signal.test.js` — PRECTOT como señal independiente
- `tests/regression/layer9-observational.test.js` — integración Layer9 con NDVI/GRACE
