# Tasks: hd40 + Extreme Heat Signal Expansion — COMPLETED

## Phase 0 — CLIMATE_VARS

- [x] 0.1 Add 'hd40' to CLIMATE_VARS array in Layer1_ClimateDataFusion.js
- [x] 0.2 Update JSDoc in normalizePeriod() to reflect actual vars (remove tnn, add hd40)

## Phase 1 — Signal Thresholds

- [x] 1.1 Add severe_heat thresholds in signalThresholds.js for all regions
- [x] 1.2 Add moderate_heat thresholds for hd30 in signalThresholds.js
- [x] 1.3 Add r20mm thresholds for all regions in signalThresholds.js

## Phase 2 — Signal Detection

- [x] 2.1 Add severe_heat (hd40) detection in Layer2_SignalEngineV2.js
- [x] 2.2 Add moderate_heat (hd30) detection in Layer2_SignalEngineV2.js
- [x] 2.3 Add extreme_rain_frequency (r20mm) detection in Layer2_SignalEngineV2.js
- [x] 2.4 Ensure no duplicate signals when multiple heat thresholds exceeded (priority: severe_heat > extreme_heat > moderate_heat)

## Phase 3 — Open-Meteo Fallback

- [x] 3.1 Verify openMeteoService.js exports hd40 in its response
- [x] 3.2 Update getClimateTrends() to ensure hd40 is consistently included

## Phase 4 — Domain + Narrative

- [x] 4.1 Update domain.js to map hd40 → severe_heat
- [x] 4.2 Update domain.js to map hd30 → moderate_heat
- [x] 4.3 Update Layer6 SIGNAL_LABELS with severe_heat, moderate_heat
- [x] 4.4 Add OPERATIONAL_IMPACTS in Layer3 for severe_heat and moderate_heat

## Phase 5 — Testing

- [x] 5.1 Update existing hd40 mock tests in layer2-signal-engine.test.js
- [x] 5.2 Add hd30 + r20mm signal tests
- [x] 5.3 Update baselines/scenarios.js
- [x] 5.4 Regression tests
