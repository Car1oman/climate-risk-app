# Data Sources — Climate Intelligence Platform

**Version:** Sprint 11 — Scientific Governance Layer
**Date:** 2026-05-22
**Platform:** Climate Intelligence Platform (Intercorp Retail Climate Risk)

---

## Overview

This document catalogs all data sources used by the Climate Intelligence Platform, with full provenance metadata for each. Every source entry follows the 6-field traceability schema defined in Layer 11 (Scientific Governance Layer): `source`, `dataset`, `model`, `version`, `resolution`, `confidence`.

Sources are maintained in `TRACEABILITY_REGISTRY` (`server/scientific/governance.js`) and `EVIDENCE_REGISTRY` (`server/scientific/domain.js`). The canonical lookup for source labels to registry keys is `SOURCE_KEY_MAP`.

---

## Source Catalog

### 1. CMIP6 CCKP — Coupled Model Intercomparison Project Phase 6

| Field | Value |
|-------|-------|
| **Source** | CMIP6 CCKP |
| **Dataset** | CMIP6 Multi-Model Ensemble — Climate Change Knowledge Portal (World Bank) |
| **Model** | Ensemble multi-modelo CMIP6 (21+ GCMs: ACCESS-CM2, BCC-CSM2-MR, CESM2, CNRM-CM6-1, EC-Earth3, GFDL-ESM4, INM-CM5-0, IPSL-CM6A-LR, MIROC6, MPI-ESM1-2-HR, MRI-ESM2-0, otros) |
| **Version** | AR6 (2021) — IPCC Sixth Assessment Report generation |
| **Resolution** | ~25 km grid cell (interpolado desde resolución nativa ~100–250 km GCM) |
| **Confidence** | High |
| **Reference** | IPCC AR6 WGI Atlas — www.ipcc.ch/report/ar6/wg1/ |

**Usage:** Primary source for all climate projections (temperature extremes, precipitation, Rx5day). Variables: hd35, hd40, tropical nights, temperature anomaly (°C), Rx5day, precipitation anomaly (%). Historical baseline: 1980–2014.

**Scientific quality:** Validated by IPCC AR6 WGI. Ensemble multi-modelo curado con métricas de performance estándar (Taylor diagrams, RMSE, skill scores). Published in hundreds of peer-reviewed articles.

---

### 2. IPCC AR6 — Sixth Assessment Report

| Field | Value |
|-------|-------|
| **Source** | IPCC AR6 |
| **Dataset** | IPCC Sixth Assessment Report — WGI (Physical Science Basis), WGII (Impacts, Adaptation), WGIII (Mitigation) |
| **Model** | Síntesis multi-modelo — no modelo único; incluye CMIP6 + literature review |
| **Version** | AR6 (agosto 2021 — febrero 2022) |
| **Resolution** | Regional (SAM — South America / subregiones andinas) |
| **Confidence** | High |
| **Reference** | www.ipcc.ch/report/ar6/ |

**Usage:** Threshold references for signal detection (WG1 Chapters 4, 11), confidence language standards, scenario definitions (SSP), regional climate projections (Atlas). All signal thresholds in `SIGNAL_TAXONOMY` are referenced to IPCC AR6.

**Scientific quality:** Subject to double-blind peer review by >700 experts and governmental review. Highest scientific authority for climate change assessments.

---

### 3. NASA SRTM — Shuttle Radar Topography Mission

| Field | Value |
|-------|-------|
| **Source** | NASA SRTM |
| **Dataset** | Shuttle Radar Topography Mission (SRTM) Digital Elevation Model — NASA / NGA |
| **Model** | Interferometría radar (SAR) — no modelo climático; datos topográficos observados |
| **Version** | SRTM v3.0 (2013, post-procesado con relleno de vacíos) |
| **Resolution** | 30 m resolución horizontal (1 arc-second); precisión vertical ±16 m (90% CI) |
| **Confidence** | High |
| **Reference** | https://www2.jpl.nasa.gov/srtm/ — Farr et al. (2007) Reviews of Geophysics |

**Usage:** Slope analysis for landslide susceptibility signals (`landslide_risk`, `huayco_risk`). Provides the terrain basis for Layer 2 signal detection and Layer 7 terrain interpretation narratives.

**Scientific quality:** Globally validated against GPS ground control points. Vertical accuracy ±16 m (90% CI) in steep terrain, ±10 m in flat terrain. Standard international topographic reference (Farr et al. 2007, Rev. Geophys.).

---

### 4. INGEMMET 2021 — Instituto Geológico Minero y Metalúrgico

| Field | Value |
|-------|-------|
| **Source** | INGEMMET 2021 |
| **Dataset** | Mapa de susceptibilidad a movimientos en masa — Instituto Geológico Minero y Metalúrgico del Perú |
| **Model** | Análisis determinístico multicriterio: pendiente (SRTM), litología, cobertura vegetal (NDVI), inventario de eventos históricos |
| **Version** | 2021 (última edición disponible) |
| **Resolution** | Escala cartográfica 1:100,000; unidad mínima de mapeo ~1 km² |
| **Confidence** | Medium |
| **Reference** | www.ingemmet.gob.pe — Boletín Serie C Geodinámica e Ingeniería Geológica |

**Usage:** Susceptibility classification for landslide and huayco signals. Complements NASA SRTM slope data with lithological and historical event information for Layer 2 terrain signals and Layer 7 terrain interpretation.

**Scientific quality:** Institutional validation by INGEMMET through field work and historical event catalog cross-referencing. Not subject to international peer review. Representative at 1:100,000 scale. Medium confidence due to scale limitations.

---

### 5. NOAA CPC — Oceanic Niño Index

| Field | Value |
|-------|-------|
| **Source** | NOAA CPC |
| **Dataset** | Oceanic Niño Index (ONI) — NOAA Climate Prediction Center; basado en ERSSTv5 |
| **Model** | Observación oceánica in-situ + satélite; índice derivado de anomalías de SST (Niño 3.4) |
| **Version** | Actualización mensual (serie histórica desde 1950) |
| **Resolution** | Regional (Niño 3.4: 5°N–5°S, 120°W–170°W); promedio trimestral de SST |
| **Confidence** | High |
| **Reference** | www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php |

**Usage:** ENSO phase detection (`enso_phase` signal). ONI threshold: ≥ +0.5°C = El Niño; ≤ -0.5°C = La Niña; persisted for ≥5 consecutive months. Used in Layer 2 signal detection and Layer 7 climate mode interpretation.

**Scientific quality:** ONI is the international standard reference index for ENSO monitoring. Operationally validated by NOAA since 1950. Published in dozens of peer-reviewed studies.

---

### 6. WRI Aqueduct 4.0 — Water Risk Atlas

| Field | Value |
|-------|-------|
| **Source** | WRI Aqueduct 4.0 |
| **Dataset** | Aqueduct Water Risk Atlas — World Resources Institute (WRI) |
| **Model** | PCR-GLOBWB 2 (modelo hidrológico global) + proyecciones hidrológicas CMIP6 (GFDL-ESM4, MPI-ESM1-2-HR) |
| **Version** | 4.0 (2023); mejoras respecto a v3.0 en resolución y cobertura de cuencas |
| **Resolution** | ~10 km (HydroBASINS Niveau 6 — cuencas de ~1,000–10,000 km²) |
| **Confidence** | Medium |
| **Reference** | www.wri.org/aqueduct — Kuzma et al. (2023) WRI Technical Note |

**Usage:** Flood exposure index and drought/water stress signals. Provides basin-level water risk indicators for Layer 2 `flood_risk` and `drought` signal detection.

**Scientific quality:** Aqueduct 4.0 published in peer-reviewed Technical Note (Kuzma et al. 2023, WRI). Medium confidence for basins with limited observational data (includes parts of Peru). Higher confidence for global-scale trends.

---

### 7. SENAMHI — Servicio Nacional de Meteorología e Hidrología del Perú

| Field | Value |
|-------|-------|
| **Source** | SENAMHI |
| **Dataset** | Red de Estaciones Meteorológicas e Hidrológicas — Servicio Nacional de Meteorología e Hidrología del Perú |
| **Model** | Observación directa in-situ (termómetros, pluviómetros, estaciones automáticas); no modelo |
| **Version** | Actualización periódica; serie histórica variable por estación (décadas a >50 años) |
| **Resolution** | Estaciones puntuales (~500 estaciones operativas a nivel nacional) |
| **Confidence** | High |
| **Reference** | www.senamhi.gob.pe — Autoridad meteorológica e hidrológica nacional del Perú |

**Usage:** Ground-truth observational reference for historical climate context (Layer 8) and ENSO seasonal forecasts. SENAMHI is the national meteorological authority.

**Scientific quality:** Official meteorological observation network of Peru. Subject to institutional quality control following WMO standards. Nationally recognized authority.

---

### 8. GRI Infrastructure Resilience — Oxford GRI

| Field | Value |
|-------|-------|
| **Source** | GRI Infrastructure Resilience |
| **Dataset** | Global Infrastructure Risk Index — Oxford Infrastructure Resilience / GRI |
| **Model** | Análisis de exposición física a inundación urbana; combina modelos de flujo superficial con datos de activos |
| **Version** | 2021 |
| **Resolution** | ~100 m (áreas urbanas); análisis de exposición de infraestructura a cota de inundación |
| **Confidence** | Medium |
| **Reference** | www.globalresilienceindex.org — Oxford Programme for Sustainable Infrastructure Systems |

**Usage:** Urban flood risk exposure for infrastructure and retail assets. Complements WRI Aqueduct 4.0 for urban-scale flood risk analysis in Layer 2 `flood_risk` signal.

**Scientific quality:** Developed by the Oxford Programme for Sustainable Infrastructure Systems. Expert panel review. Indicative use for urban flood exposure assessment at asset level.

---

## Source Coverage by Signal Type

| Signal | Primary Source | Secondary Source |
|--------|---------------|-----------------|
| `extreme_heat` | CMIP6 CCKP | IPCC AR6 |
| `severe_heat` | CMIP6 CCKP | IPCC AR6 |
| `tropical_nights` | CMIP6 CCKP | IPCC AR6 |
| `temp_increase` | CMIP6 CCKP | IPCC AR6 |
| `extreme_rain` | CMIP6 CCKP | IPCC AR6 |
| `flood_risk` | WRI Aqueduct 4.0 | GRI |
| `drought` | WRI Aqueduct 4.0 | CMIP6 CCKP |
| `landslide_risk` | NASA SRTM | INGEMMET 2021 |
| `huayco_risk` | INGEMMET 2021 | NASA SRTM |
| `enso_phase` | NOAA CPC | SENAMHI |

---

## Data Access and Licensing

All sources used in the platform are publicly accessible or licensed for research and institutional use:

- **CMIP6 CCKP:** World Bank Open Data — CC BY 4.0
- **IPCC AR6:** Freely available — www.ipcc.ch
- **NASA SRTM:** NASA Open Data — public domain
- **INGEMMET 2021:** Open government data (Peru) — www.ingemmet.gob.pe
- **NOAA CPC ONI:** NOAA Open Data — public domain
- **WRI Aqueduct 4.0:** CC BY 4.0 — www.wri.org/data/aqueduct-water-risk-atlas
- **SENAMHI:** Open government data (Peru) — www.senamhi.gob.pe
- **GRI Oxford:** Available for research use — www.globalresilienceindex.org

---

*This document is maintained alongside `server/scientific/governance.js` (TRACEABILITY_REGISTRY). Any addition of new data sources to the platform requires updating both this document and the registry.*
