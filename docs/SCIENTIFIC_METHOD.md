# Scientific Method — Climate Intelligence Platform

**Version:** Sprint 11 — Scientific Governance Layer
**Date:** 2026-05-22
**Platform:** Climate Intelligence Platform (Intercorp Retail Climate Risk)

---

## Overview

This document describes the scientific methodology applied in the Climate Intelligence Platform. The platform follows a layered architecture that transforms raw climate data into scientifically traceable, explicable outputs. Every output is grounded in peer-reviewed data sources, quantitative thresholds from the scientific literature, and transparent uncertainty communication.

The platform is **descriptive, not prescriptive**: it reports observable and projected climate signals, their scientific basis, and relevant adaptation options. It does not produce risk scores, urgency rankings, financial loss estimates, or action mandates.

---

## Methodological Principles

### 1. Source Traceability
Every signal, projection value, historical event, and narrative element in the platform output is traceable to a named, versioned data source with documented spatial resolution, temporal coverage, and confidence level. No values are invented or approximated without explicit attribution.

### 2. No Reinvention
Values and narratives in Layer 10 (Storytelling Engine) are assembled exclusively from the outputs of upstream engines (Layer 7, Layer 8, Layer 9). The storytelling layer does not generate new numbers or claims — it structures and presents what the scientific layers have already computed and cited.

### 3. Uncertainty Propagation
Uncertainty is communicated at every layer:
- **Layer 2 (Signal Detection):** confidence level per signal (`high` / `medium` / `low`)
- **Layer 7 (Interpretation):** `overall_confidence`, `model_spread`, `limitations` per interpretation
- **Layer 9 (Projection):** `temperature_confidence`, `precipitation_confidence` per scenario × window
- **Layer 10 (Storytelling):** `uncertainty_note` built from upstream confidence metadata
- **Layer 11 (Governance):** `disclaimer.uncertainty` communicating the three sources of uncertainty

### 4. No Alarmism, No Urgency, No Financial Language
The platform is designed for descriptive climate risk communication. Output text is validated against patterns that would introduce:
- Urgency language (`urgente`, `debe actuar ahora`, `acción inmediata`)
- Alarmism (`catastrófico`, `colapso`, `inevitable`, `peligro inminente`)
- Financial language (`costo estimado`, `pérdida económica`, `USD`, `millones de`)
- Hidden heuristics (`risk_score`, `urgency_rank`, `puntaje de riesgo`)

`validateStorytelling()` (Layer 10) and `validateGovernance()` (Layer 11) enforce these invariants programmatically.

### 5. Qualitative Adaptation Measures
Adaptation recommendations are qualitative and sector-contextualized. They do not include cost estimates, efficacy percentages, or numerical timelines. Each measure is accompanied by a rationale that cites the corresponding scientific source.

---

## Layer Architecture

| Layer | Name | Role |
|-------|------|------|
| Layer 2  | Signal Detection Engine       | Detects climate signals from raw data; applies IPCC AR6 thresholds |
| Layer 6  | Scientific Domain Model       | Canonical signal taxonomy (10 types) and evidence registry (8 sources) |
| Layer 7  | Scientific Interpretation Engine | Deduplication, contextual fusion, natural-language narratives, uncertainty |
| Layer 8  | Historical Climate Engine     | Catalog of 20 observed climate events in Peru; threshold validation |
| Layer 9  | Projection Scenario Engine    | SSP245/SSP585, 3 time windows, 4 IPCC variables, 6 grounded narratives |
| Layer 10 | Scientific Storytelling Engine | Assembles main narrative from Layers 7+8+9; qualitative adaptation catalog |
| Layer 11 | Scientific Governance Layer   | Traceability, disclaimers, scientific metadata — wraps all outputs |

---

## Signal Detection Methodology (Layer 2)

Climate signals are detected by comparing climate variables against thresholds derived from IPCC AR6 WG1 and WG2 literature:

| Signal Type | Variable | Threshold Source |
|-------------|----------|-----------------|
| `extreme_heat` | Days Tmax > 35°C (hd35) | IPCC AR6 WG1 Table 11.1 |
| `severe_heat` | Days Tmax > 40°C (hd40) | IPCC AR6 WG1 SPM B.2; WMO 2022 |
| `tropical_nights` | Nights Tmin ≥ 20°C | IPCC AR6 WG1 Chapter 11 |
| `temp_increase` | Annual mean temperature anomaly | CMIP6 CCKP ensemble |
| `extreme_rain` | Rx5day precipitation | IPCC AR6 WG1 Chapter 11 |
| `flood_risk` | Flood exposure index | WRI Aqueduct 4.0 / GRI |
| `drought` | Precipitation deficit | WRI Aqueduct 4.0 / CMIP6 |
| `landslide_risk` | Slope + susceptibility class | NASA SRTM + INGEMMET 2021 |
| `huayco_risk` | Convergent drainage + slope | INGEMMET 2021 |
| `enso_phase` | ONI index | NOAA CPC |

All threshold values are documented in `SIGNAL_TAXONOMY` (Layer 6, `server/scientific/domain.js`).

---

## Projection Methodology (Layer 9)

Projections follow the CMIP6 multi-model ensemble approach as synthesized in IPCC AR6 WG1:

- **Scenarios:** SSP2-4.5 (intermediate emissions) and SSP5-8.5 (high emissions)
- **Time windows:** Near-term (2020–2039), Mid-term (2040–2059), Far-term (2060–2079)
- **Historical baseline:** 1980–2014 (CMIP6 CCKP standard)
- **Variables:** Temperature anomaly (°C), Extreme heat days (hd35), Extreme rain index (Rx5day), Precipitation anomaly (%)
- **Confidence:** Assigned per variable per scenario based on IPCC AR6 Chapter 4 and 11 confidence language

All projection values in `PROJECTION_DATA` (`server/scientific/projection.js`) are sourced directly from IPCC AR6 WG1 Atlas (SAM region) and CMIP6 CCKP. No values are interpolated or extrapolated beyond the published ensemble ranges.

---

## Interpretation Methodology (Layer 7)

### Deduplication
Signals with overlapping scientific semantics are grouped into 5 canonical groups before interpretation:
- `heat_stress` — extreme_heat, severe_heat, tropical_nights, temp_increase
- `precipitation_intensity` — extreme_rain, flood_risk
- `water_stress` — drought
- `terrain_instability` — landslide_risk, huayco_risk
- `climate_mode` — enso_phase

Deduplication prevents redundant narratives for phenomena that represent the same physical process observed from different variables.

### Narrative Generation
Interpretation texts are constructed from a template system populated with actual signal values (`delta`, `delta_pct`, `projected`). Every number in a narrative text comes from the signal data or the evidence registry — never from a hard-coded template constant.

### Compound Effects
When two or more signal groups co-occur (e.g., `precipitation_intensity` + `terrain_instability`), the engine generates compound interpretation texts describing the interaction of the two phenomena.

---

## Governance Methodology (Layer 11)

Layer 11 wraps the output of Layer 10 with three governance components:

### FASE A — Traceability
Per-source metadata for each cited source:
- `source` — canonical source name
- `dataset` — full dataset name with institution
- `model` — model or method used (GCM ensemble, observational network, etc.)
- `version` — version or publication year
- `resolution` — spatial resolution
- `confidence` — high / medium / low

### FASE B — Disclaimer System
Structured disclaimers with:
- `limitations[]` — list of methodological constraints
- `uncertainty` — plain-language description of uncertainty sources
- `assumptions[]` — list of working assumptions

Domains available: `general`, `temperature`, `precipitation`, `terrain`, `projection`.

### FASE C — Scientific Metadata
Aggregated scientific quality indicators:
- `validation_status` — `validated` / `partially_validated` / `pending`
- `evidence_strength` — `strong` / `moderate` / `limited`
- `peer_review_status` — `peer_reviewed` / `institutional` / `expert_review`
- `per_source` — per-source breakdown of all three metadata fields

Aggregation rules:
- `validation_status`: `validated` if all sources validated; `partially_validated` if some; `pending` if none
- `evidence_strength`: highest strength among cited sources
- `peer_review_status`: highest peer review level among cited sources

---

## Quality Controls

| Control | Layer | Description |
|---------|-------|-------------|
| `validateStorytelling()` | Layer 10 | 8 invariants: no urgency, no alarmism, no financial, no heuristics, citations present, SSP mentioned, uncertainty mentioned |
| `validateGovernance()` | Layer 11 | 8 checks: traceability present, disclaimer fields present, metadata valid |
| Signal threshold documentation | Layer 2/6 | All thresholds reference IPCC AR6 or primary source |
| Historical event traceability | Layer 8 | All 20 events have `source`, `date_start`, `date_end`, `description` |
| Projection source forcing | Layer 10 | When projection narrative present, CMIP6 and IPCC AR6 always in `sources_cited` |

---

*This document describes the methodological approach at Sprint 11. It should be updated as new layers or data sources are incorporated into the platform.*
