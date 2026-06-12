# Feature Specification: hd40 + Extreme Heat Signal Expansion

**Feature Branch**: `004-hd40-extreme-heat`

**Created**: 2026-06-11

**Status**: COMPLETED

**Input**: Validated audit findings H-003 (hd40 missing), H-010 (txx/hd30/r20mm invisible)

## User Scenarios & Testing

### User Story 1 - hd40 Heatwave Detection (Priority: P1)

As a climate risk analyst covering northern Peru, I want the engine to detect days with Tmax > 40°C, so that I can model heatwaves like the 2024 El Niño Costero event.

**Why this priority**: P1 — current engine cannot detect the most impactful extreme weather event in recent Peruvian history.

**Acceptance Scenarios**:

1. **Given** climate_cells data with hd40 available, **When** signals are computed, **Then** a `severe_heat` signal is generated when hd40 exceeds regional threshold.
2. **Given** climate_cells without hd40, **When** signals are computed, **Then** fallback to Open-Meteo-derived hd40 values.
3. **Given** a location in costa with hd40 > threshold, **When** analyzed, **Then** the signal has threshold_reference citing 'Tmax > 40°C'.

### User Story 2 - hd30 as Tier-2 Heat Signal (Priority: P2)

As a climate scientist, I want hd30 (Tmax > 30°C) as a lower-tier heat signal, so that I can detect moderate heat stress before it becomes extreme.

**Acceptance Scenarios**:

1. **Given** hd30 exceeding threshold, **When** signals are computed, **Then** a `moderate_heat` signal is generated.
2. **Given** both hd30 and hd35 thresholds exceeded, **When** signals are computed, **Then** only the more severe signal (extreme_heat) is generated (avoid duplication).

### User Story 3 - r20mm as Rain Frequency Signal (Priority: P2)

As a hydrologist, I want r20mm (days with rain > 20mm) as a signal, so that I can distinguish between rain frequency and rain intensity (rx5day/rx1day).

**Acceptance Scenarios**:

1. **Given** r20mm delta exceeding threshold, **When** signals are computed, **Then** a signal with indicator 'r20mm' is generated.
2. **Given** both r20mm and r50mm thresholds exceeded, **When** signals are computed, **Then** both signals are present with compound severity noted.

## Architecture

### Layer1 — CLIMATE_VARS Update

```js
const CLIMATE_VARS = [
  'txx', 'tas', 'tasmax',
  'hd30', 'hd35', 'hd40',          // hd40 ADDED
  'tr',
  'rx1day', 'rx5day',
  'r20mm', 'r50mm',
  'pr', 'prpercnt',
  'tx84rr',
];
```

### Layer2 — Signal Detection

```js
// severe_heat via hd40
if (hist?.hd40 != null && period?.hd40 != null) {
    const d = deltaAbs(hist.hd40, period.hd40);
    if (d != null && d > thr.severe_heat_delta) {
        signals.push(buildSignal({
            signalType: 'severe_heat',
            indicator: 'hd40',
            ...
        }));
    }
}

// moderate_heat via hd30
if (hist?.hd30 != null && period?.hd30 != null) {
    const d = deltaAbs(hist.hd30, period.hd30);
    if (d != null && d > thr.moderate_heat_delta) {
        signals.push(buildSignal({
            signalType: 'moderate_heat',
            indicator: 'hd30',
            ...
        }));
    }
}
```

### signalThresholds.js — New Thresholds

```js
severe_heat_delta: { costa: 5, sierra: 0, selva: 2, puna: 0, default: 3 },
moderate_heat_delta: { costa: 20, sierra: 15, selva: 25, puna: 10, default: 15 },
```

## Impacto esperado

- Nueva señal: `severe_heat` (Tmax > 40°C) — crítica para El Niño Costero
- Nueva señal: `moderate_heat` (Tmax > 30°C) — complementaria a extreme_heat
- Nueva señal: `extreme_rain_frequency` (r20mm) — diferenciada de extreme_rain
- Score temperatura: 71/100 → 80/100
- Score precipitación: 66/100 → 70/100

## Métricas de éxito

- hd40 signal detectable en Piura, Tumbes, Lambayeque (donde ocurrió Tmax > 40°C en 2024)
- hd30 signal en todas las regiones con thresholds apropiados
- r20mm signal sin duplicación con r50mm
- Zero regressions en tests existentes de Layer2

## Dependencias

- Open-Meteo ya computa hd40 (openMeteoService.js:93)
- Supabase migration para hd40 en climate_cells (opcional si Open-Meteo fallback es suficiente)

## Plan de rollback

- Feature flag `feature.hd40_signal` on Layer2
- Feature flag `feature.moderate_heat` on Layer2
- Si falla, el sistema retorna al comportamiento actual (solo hd35 como extreme_heat)

## Tests requeridos

- `tests/backend/layers/layer2_hd40.test.js` — severe_heat detection
- `tests/backend/layers/layer2_hd30_r20mm.test.js` — moderate_heat + rain frequency
- `tests/regression/layer2-signal-engine.test.js` — already has hd40 mock tests (lines 97-114)
- `tests/baselines/scenarios.js` — update baselines with hd40 values
