# Uncertainty Policy — Climate Intelligence Platform

**Version:** Sprint 11 — Scientific Governance Layer
**Date:** 2026-05-22
**Platform:** Climate Intelligence Platform (Intercorp Retail Climate Risk)

---

## Purpose

This document defines how uncertainty is communicated, quantified, and propagated throughout the Climate Intelligence Platform. Transparent uncertainty communication is a core scientific requirement: projections without uncertainty context are scientifically incomplete and potentially misleading for decision-making.

The platform follows the IPCC AR6 uncertainty framework as its primary reference standard.

---

## The Three Sources of Climate Projection Uncertainty

All climate projections contain uncertainty from three independent sources, which the platform communicates in all output disclaimers:

### 1. Internal Climate Variability (Irreducible)
Natural, random fluctuations in the climate system that cannot be predicted beyond a few years. This includes year-to-year variability driven by ENSO, decadal oscillations (PDO, AMO), and stochastic atmospheric dynamics.

**Implication:** For short time horizons (2020–2039), internal variability dominates over the forced climate change signal. Projections for this period have wider uncertainty bounds relative to the long-term trend.

**How communicated:** `disclaimer.uncertainty` in Layer 11 output; confidence level `low` for near-term precipitation signals.

### 2. Scenario Uncertainty (Reducible by Policy)
Uncertainty about future greenhouse gas emissions, driven by future societal, economic, and political decisions. The platform uses two SSP scenarios to bracket this uncertainty:

| Scenario | Emissions Trajectory | Warming 2100 (median) |
|----------|---------------------|----------------------|
| SSP2-4.5 | Intermediate — peak mid-century, then decline | +2.7°C |
| SSP5-8.5 | High — fossil-fuel intensive through 2100 | +4.4°C |

**Implication:** The range between SSP2-4.5 and SSP5-8.5 outputs represents the upper bound of scenario uncertainty in the platform. For the far-term horizon (2060–2079), this is the dominant source of uncertainty.

**How communicated:** Both scenarios are always presented; no single scenario is labeled as "likely" or "expected."

### 3. Model Uncertainty (Reducible by Research)
Structural differences between climate models (GCMs) in their representation of physical processes — clouds, convection, ocean circulation, land surface. Even under the same emissions scenario, different models can produce different regional outcomes.

**Implication:** The spread of the CMIP6 ensemble quantifies model uncertainty. Platform outputs use ensemble statistics (median, range) and report confidence levels that reflect ensemble agreement.

**How communicated:** `overall_confidence`, `model_spread`, `limitations` in Layer 7 output; `uncertainty.model_spread_note` in Layer 9 projections.

---

## Confidence Level Framework

The platform uses a three-tier confidence framework aligned with IPCC AR6 calibrated uncertainty language:

| Level | Definition | IPCC AR6 Equivalent |
|-------|-----------|---------------------|
| `high` | Strong agreement across CMIP6 ensemble; consistent with IPCC AR6 regional assessments | *High confidence* / *Very likely* |
| `medium` | Moderate agreement; some model spread or observational uncertainty | *Medium confidence* / *Likely* |
| `low` | Low agreement; high model spread or limited observational basis | *Low confidence* / *About as likely as not* |

### Confidence by Variable and Region (Peru / SAM)

| Variable | Near-term (2020–2039) | Mid-term (2040–2059) | Far-term (2060–2079) |
|----------|----------------------|---------------------|---------------------|
| Temperature mean | Medium | High | High |
| Extreme heat days (hd35) | Medium | High | High |
| Precipitation mean | Low | Low | Low |
| Precipitation extremes (Rx5day) | Low | Medium | Medium |

**Note:** Temperature projections have higher confidence than precipitation for the Andean region. The complex orography and the role of convective processes make precipitation the most uncertain variable in CMIP6 for Peru.

---

## Variable-Specific Uncertainty Notes

### Temperature
- Trend direction (warming) is robust across the CMIP6 ensemble for the Andean region — all models agree on the sign of the change.
- The magnitude varies: SSP2-4.5 mid-term range is +1.0°C to +2.0°C; SSP5-8.5 far-term range is +2.5°C to +4.5°C.
- Extreme heat days (hd35, hd40) have higher uncertainty than temperature mean due to the non-linear relationship with the tail of the temperature distribution.

### Precipitation
- The CMIP6 ensemble shows **divergent signal** for annual mean precipitation over the Andean Peru region: some models project increases, others decreases.
- This is why precipitation signals are assigned `low` confidence in the platform by default for near-term and mid-term horizons.
- Precipitation extremes (Rx5day) show a more consistent intensification signal — wetter extremes even where mean precipitation decreases — consistent with the thermodynamic scaling of extreme precipitation with warming.

### Terrain (Landslide/Huayco)
- Terrain susceptibility (INGEMMET 2021) represents **static geomorphological potential**, not dynamic probability. It does not incorporate climate-driven changes in precipitation intensity.
- The combination of increasing Rx5day (climate signal) with high terrain susceptibility represents a compounding risk, but the probabilistic relationship between precipitation change and landslide occurrence is not quantified in the platform.

### ENSO
- The ENSO phase (ONI) is an observational product — uncertainty is low for current and recent phases.
- Seasonal ENSO forecasts beyond 6 months carry significant uncertainty.
- Future changes in ENSO characteristics under climate change are an area of active research with limited consensus in CMIP6.

---

## Uncertainty Propagation Through the Platform

```
Layer 2: Signal Detection
  → signal.confidence = 'high' | 'medium' | 'low'  (per-signal)

Layer 7: Scientific Interpretation
  → overall_confidence = aggregated from signal confidences
  → model_spread = string description of ensemble spread
  → limitations[] = specific methodological constraints

Layer 9: Projection Scenario Engine
  → temperature_confidence = 'high' | 'medium' | 'low'
  → precipitation_confidence = 'high' | 'medium' | 'low'
  → model_spread_note = string from PROJECTION_DATA

Layer 10: Storytelling Engine
  → uncertainty_note = assembled from Layer 7 + Layer 9 confidence
    (always contains 'confianza'; always non-empty)

Layer 11: Governance Layer
  → disclaimer.uncertainty = plain-language description of 3 uncertainty sources
  → disclaimer.limitations[] = methodological constraints
  → scientific_metadata.evidence_strength = 'strong' | 'moderate' | 'limited'
```

---

## Prohibited Uncertainty Language

The platform explicitly prohibits certain uncertainty framings that would misrepresent the scientific basis:

| Prohibited | Reason |
|-----------|--------|
| Point predictions without range ("temperature will be +1.8°C in 2050") | Implies false precision; must show range |
| Urgency language ("must act now", "inevitable") | Converts uncertainty to determinism |
| Probability without basis ("70% chance of flooding") | No probabilistic model is implemented |
| Financial loss estimates ("loss of $X million") | Outside platform scope; would require separate probabilistic risk model |
| Efficacy percentages ("reduces risk by 30%") | No efficacy model implemented |

`validateStorytelling()` (Layer 10) checks all output text for these patterns programmatically.

---

## Limitations Disclosure

The platform always discloses the following limitations in `disclaimer.limitations` (Layer 11):

1. Results are based on global climate models (GCMs) with inherent regional-scale uncertainty.
2. CMIP6 projections reflect long-term statistical trends and are not predictions of specific climate events.
3. Spatial resolution (~25 km) limits representation of local climate phenomena and complex orographic effects.
4. Signal thresholds used are orientative references from the scientific literature; they do not constitute a technical or legal determination.
5. This analysis does not replace on-site risk assessment by certified professionals in engineering, geology, or climatology.

Domain-specific limitations are added for temperature, precipitation, terrain, and projection domains.

---

## Working Assumptions

All platform analyses operate under the following assumptions, disclosed in `disclaimer.assumptions` (Layer 11):

1. Approximate continuity in baseline socioeconomic conditions, without abrupt changes in land use or emissions outside the evaluated SSP range.
2. SENAMHI meteorological station data is representative of regional climate conditions for the analysis area.
3. The historical reference period 1980–2014 is appropriate as the CMIP6 CCKP standard baseline.
4. Large-scale atmospheric circulation patterns relevant to the region remain within the range of natural climate variability under the evaluated SSP scenarios.

---

## References

- IPCC, 2021: Climate Change 2021: The Physical Science Basis. WGI AR6. Cambridge University Press.
- Kuzma et al. (2023): Aqueduct 4.0. WRI Technical Note.
- Farr et al. (2007): The Shuttle Radar Topography Mission. Reviews of Geophysics.
- NOAA CPC: Oceanic Niño Index (ONI). Monthly update.
- INGEMMET (2021): Mapa de susceptibilidad a movimientos en masa. Boletín Serie C.

---

*This policy is maintained alongside the platform governance layer (`server/scientific/governance.js`). Any change to confidence definitions, uncertainty communication, or disclaimer language requires updating this document.*
