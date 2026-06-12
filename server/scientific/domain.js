/**
 * Scientific Domain Model — Sprint 6
 *
 * Canonical definitions for the Climate Intelligence Platform:
 *   - SIGNAL_TAXONOMY   — all signal types with metadata (FASE B/C)
 *   - EVIDENCE_REGISTRY — all data sources with full provenance (FASE D)
 *   - buildCanonicalSignal() — maps a Layer2 signal to the standard structure (FASE B)
 *   - getSignalMeta()    — lookup helper
 *   - getEvidence()      — lookup helper
 *
 * This module is a pure reference / metadata layer.
 * No I/O, no side effects, no computation of climate values.
 *
 * Sources: IPCC AR6 WG1/WG2, CMIP6 CCKP, GRI Oxford, WRI Aqueduct 4.0,
 *          NOAA CPC, NASA SRTM, World Bank, SENAMHI, INGEMMET.
 */

// ─── FASE C — Signal Taxonomy ─────────────────────────────────────────────────

  /**
   * Canonical registry of all signal types emitted by Layer2.
   * Each entry defines the scientific semantics, unit, threshold, and evidence link.
   * No duplicates: each real-world phenomenon has exactly one canonical key.
   *
   * Mapping to Layer2 signalType values:
   *   'extreme_heat'          → signalType: 'extreme_heat'
   *   'tropical_nights'       → signalType: 'tropical_nights'
 *   'temp_increase'         → signalType: 'temp_increase'
 *   'drought'               → signalType: 'drought'
 *   'extreme_rain'          → signalType: 'extreme_rain'
 *   'flood_risk'            → signalType: 'flood_risk'
 *   'landslide_susceptibility' → signalType: 'landslide_risk' (Layer2 legacy key)
 *   'huayco_risk'           → signalType: 'huayco_risk'
 *   'enso_phase'            → signalType: 'enso_phase'
 *
 * @type {Record<string, import('./domain.types.js').SignalTaxonomyEntry>}
 */
export const SIGNAL_TAXONOMY = {

  // ── Temperature ─────────────────────────────────────────────────────────────

  extreme_heat: {
    label:                'Extreme Heat Days',
    category:             'temperature',
    observed_or_projected:'projected',
    unit:                 'days/year',
    indicator:            'hd35',
    description:          'Days per year with maximum temperature exceeding 35°C. ' +
                          'Signal of growing heat stress on people, infrastructure and cold-chain operations.',
    threshold:            '+10 days/yr (short-term 2020–2039) or +20 days/yr (mid-term 2040–2059) ' +
                          'above historical baseline (1980–2014)',
    threshold_reference:  'IPCC AR6 WG1 Table 11.1 — Projected changes in hot temperature extremes',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   null,
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'extreme_heat',
  },

  severe_heat: {
    label:                'Severe Heat Days',
    category:             'temperature',
    observed_or_projected:'projected',
    unit:                 'days/year',
    indicator:            'hd40',
    description:          'Days per year with maximum temperature exceeding 40°C. ' +
                          'Critical threshold for operational continuity, cold-chain and occupational health.',
    threshold:            '+5 days/yr above historical baseline',
    threshold_reference:  'IPCC AR6 WG1 SPM B.2 — Severe heat threshold; WMO extreme heat guidance 2022',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   null,
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'severe_heat',
  },

  moderate_heat: {
    label:                'Moderate Heat Days',
    category:             'temperature',
    observed_or_projected:'projected',
    unit:                 'days/year',
    indicator:            'hd30',
    description:          'Days per year with maximum temperature exceeding 30°C. ' +
                          'Lower-tier heat stress indicator for moderate heat events.',
    threshold:            '+15 days/yr above historical baseline (regionalizado)',
    threshold_reference:  'SENAMHI Perú — Thresholds regionalizados por macro-región',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   null,
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'moderate_heat',
  },

  tropical_nights: {
    label:                'Tropical Nights',
    category:             'temperature',
    observed_or_projected:'projected',
    unit:                 'nights/year',
    indicator:            'tr',
    description:          'Nights per year with minimum temperature exceeding 20°C (TN > 20°C). ' +
                          'Key health and cold-chain indicator for Peru\'s coastal urban areas. ' +
                          'Warm nights impede nocturnal heat dissipation and increase cooling loads.',
    threshold:            '+10 nights/yr (short-term) or +20 nights/yr (mid-term) above baseline',
    threshold_reference:  'IPCC AR6 WG1 Ch.11.3 — Warm nights / TN90p index; ' +
                          'WMO Expert Team on Climate Change Detection Indices (ETCCDI)',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   null,
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'tropical_nights',
  },

  temp_increase: {
    label:                'Mean Temperature Increase',
    category:             'temperature',
    observed_or_projected:'projected',
    unit:                 '°C',
    indicator:            'tas',
    description:          'Increase in mean annual surface air temperature relative to 1980–2014 historical baseline. ' +
                          'Global warming level proxy at local scale. Drives compounding multi-hazard interactions.',
    threshold:            '+1.5°C (short-term) or +2.5°C (mid-term) above baseline',
    threshold_reference:  'IPCC AR6 WG1 SPM A.1 — Global surface temperature; ' +
                          'Paris Agreement 2015 Article 2.1(a) — 1.5°C and 2°C warming levels',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   'OPEN_METEO',
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'temp_increase',
  },

  // ── Precipitation ────────────────────────────────────────────────────────────

  drought: {
    label:                'Drought / Water Stress',
    category:             'precipitation',
    observed_or_projected:'projected',
    unit:                 'days (CDD) | % (prpercnt)',
    indicator:            'cdd|prpercnt|pr',
    description:          'Increased consecutive dry days (CDD) or reduction in total annual precipitation. ' +
                          'Indicates growing water stress for operations, sanitation and supply chains.',
    threshold:            'CDD: +15 consecutive dry days above baseline; ' +
                          'Precipitation: < −15% vs historical annual total (prpercnt < 85)',
    threshold_reference:  'IPCC AR6 WG2 Ch.4.2 — Water security; ' +
                          'WMO 2023 State of Global Water Resources — drought thresholds',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   null,
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'drought',
  },

  extreme_rain: {
    label:                'Extreme Precipitation',
    category:             'precipitation',
    observed_or_projected:'projected',
    unit:                 'mm',
    indicator:            'rx5day|rx1day',
    description:          'Increase in maximum 5-day precipitation accumulation (Rx5day) or ' +
                          'maximum 1-day precipitation (Rx1day). Drives flash flooding, infrastructure damage ' +
                          'and supply-chain disruptions.',
    threshold:            'Rx5day: > +20% above historical baseline; Rx1day: > 50 mm/day',
    threshold_reference:  'IPCC AR6 WG1 Ch.11.4 — Heavy precipitation and pluvial flooding; ' +
                          'WMO 2023 — Rx1day > 50 mm/day as heavy precipitation alert threshold',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   null,
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'extreme_rain',
  },

  extreme_rain_frequency: {
    label:                'Extreme Rain Frequency',
    category:             'precipitation',
    observed_or_projected:'projected',
    unit:                 'days/year',
    indicator:            'r20mm',
    description:          'Days per year with precipitation exceeding 20mm (r20mm). ' +
                          'Measures rain frequency rather than intensity, complementing rx5day/rx1day.',
    threshold:            '+5 days/yr above historical baseline (regionalizado)',
    threshold_reference:  'WMO 2023 — Heavy precipitation frequency; SENAMHI thresholds regionalizados',
    primary_evidence:     'CMIP6_CCKP',
    secondary_evidence:   null,
    geographic_scope:     'Regional (~25 km CMIP6 grid cell)',
    layer2_signal_type:   'extreme_rain_frequency',
  },

  // ── Hydrology ────────────────────────────────────────────────────────────────

  flood_risk: {
    label:                'Flood Risk',
    category:             'hydrology',
    observed_or_projected:'projected',
    unit:                 'probability (0–1)',
    indicator:            'gri_flood|wri_aqueduct',
    description:          'Modeled flood hazard probability integrating fluvial, pluvial and coastal drivers. ' +
                          'Combines GRI Infrastructure Resilience and WRI Aqueduct 4.0 hydrological models.',
    threshold:            'Hazard probability > 0.35 (35th percentile flood exceedance)',
    threshold_reference:  'GRI Oxford — Infrastructure Resilience Framework; ' +
                          'WRI Aqueduct Floods 4.0 — Rentschler et al. (2022)',
    primary_evidence:     'GRI_OXFORD',
    secondary_evidence:   'WRI_AQUEDUCT',
    geographic_scope:     '~1 km hazard grid cell',
    layer2_signal_type:   'flood_risk',
  },

  // ── Terrain ───────────────────────────────────────────────────────────────────

  landslide_susceptibility: {
    label:                'Landslide Susceptibility',
    category:             'terrain',
    observed_or_projected:'observed',
    unit:                 'susceptibility class',
    indicator:            'slope_degrees|curvature',
    description:          'Terrain-derived susceptibility to slope failures and landslides based on SRTM slope angle ' +
                          'and topographic curvature. Static assessment calibrated with INGEMMET classification.',
    threshold:            'Slope > 15° (moderate susceptibility) to > 30° (high susceptibility) ' +
                          'per INGEMMET Perú slope classification',
    threshold_reference:  'INGEMMET (2021) — Susceptibilidad a movimientos en masa en el Perú; ' +
                          'SENAMHI Perú — Umbrales de alerta por lluvias en zonas de riesgo',
    primary_evidence:     'NASA_SRTM',
    secondary_evidence:   null,
    geographic_scope:     '30 m resolution (SRTM v3)',
    layer2_signal_type:   'landslide_risk',
  },

  huayco_risk: {
    label:                'Huayco / Debris Flow Risk',
    category:             'terrain',
    observed_or_projected:'observed',
    unit:                 'susceptibility class',
    indicator:            'slope_degrees|flow_accumulation',
    description:          'Susceptibility to huaycos (debris flows) combining slope angle with upstream drainage ' +
                          'accumulation areas. Huaycos are the primary terrain hazard in Peruvian Andean foothills.',
    threshold:            'Slope > 20° in convergent drainage areas (flow accumulation > 500 cells @ 30 m)',
    threshold_reference:  'SENAMHI Perú — Sistema de Alerta Temprana: Huaycos; ' +
                          'INGEMMET (2021) — Mapa de susceptibilidad a huaycos; ' +
                          'Vilímek et al. (2015) — Debris flow susceptibility Andean regions',
    primary_evidence:     'NASA_SRTM',
    secondary_evidence:   null,
    geographic_scope:     '30 m resolution (SRTM v3)',
    layer2_signal_type:   'huayco_risk',
  },

  // ── Climate Mode ─────────────────────────────────────────────────────────────

  enso_phase: {
    label:                'ENSO Phase / ONI Anomaly',
    category:             'climate_mode',
    observed_or_projected:'observed',
    unit:                 'ONI index (°C)',
    indicator:            'oni_value',
    description:          'Current phase of the El Niño–Southern Oscillation (ENSO). ' +
                          'Classified as El Niño (ONI > +0.5°C), Neutral, or La Niña (ONI < −0.5°C) ' +
                          'for three or more consecutive overlapping 3-month periods. ' +
                          'Drives interannual variability in precipitation and temperature across Peru.',
    threshold:            'ONI > +0.5°C (El Niño) | < −0.5°C (La Niña) for ≥ 3 consecutive seasons',
    threshold_reference:  'NOAA CPC — Official ENSO definition and ONI threshold; ' +
                          'Barnston, Chelliah & Goldenberg (1997) — Documentation of a highly ENSO-related SST region in the equatorial Pacific',
    primary_evidence:     'NOAA_ENSO',
    secondary_evidence:   null,
    geographic_scope:     'Niño 3.4 region (5°N–5°S, 120°–170°W); teleconnected impact: Pacific coast of South America',
    layer2_signal_type:   'enso_phase',
  },
};

// ─── FASE D — Evidence Registry ───────────────────────────────────────────────

/**
 * Canonical provenance records for every data source used by the platform.
 * All fields are required; limitations are explicit and non-empty.
 *
 * Fields per FASE D specification:
 *   dataset, institution, citation, temporal_coverage,
 *   spatial_resolution, scientific_validity, limitations.
 */
export const EVIDENCE_REGISTRY = {

  CMIP6_CCKP: {
    id:                  'CMIP6_CCKP',
    dataset:             'CMIP6 CCKP 2023 — climate_cells ensemble (49+ GCMs)',
    institution:         'World Bank Climate Change Knowledge Portal (CCKP) / ' +
                         'Program for Climate Model Diagnosis and Intercomparison (PCMDI)',
    citation:            'IPCC (2021). Climate Change 2021: The Physical Science Basis. ' +
                         'Contribution of WG1 to the Sixth Assessment Report. Cambridge University Press. ' +
                         'doi:10.1017/9781009157896. ' +
                         'Coupled Model Intercomparison Project Phase 6 (CMIP6) — ' +
                         'Eyring et al. (2016), doi:10.5194/gmd-9-1937-2016.',
    temporal_coverage:   {
      start_year:        1980,
      end_year:          2059,
      label:             '1980–2014 historical baseline; SSP2-4.5 and SSP5-8.5 projections 2020–2059',
    },
    spatial_resolution:  '~25 km (0.25° grid, bilinearly interpolated to nearest climate cell via PostGIS)',
    scientific_validity: 'validated',
    limitations: [
      'Ensemble median at ~25 km does not capture urban heat island effects or local microclimates.',
      'SSP emission scenario choice introduces structural (deep) uncertainty not captured by ensemble spread.',
      'Long-term projections (2060+) are extrapolated linearly from SSP5-8.5 2040–2059 trend — treat as indicative only.',
      'Spatial interpolation to a point location from the nearest 0.25° cell introduces local representativeness error.',
      'Indices derived from daily statistics (hd35, rx1day) may smooth extreme tails relative to station observations.',
    ],
  },

  GRI_OXFORD: {
    id:                  'GRI_OXFORD',
    dataset:             'GRI Infrastructure Resilience — multi-hazard probability layers',
    institution:         'Oxford University Programme for Sustainable Infrastructure Systems (OPSIS) / ' +
                         'Global Resilience Index (GRI) Consortium',
    citation:            'Oughton, E.J. et al. (2019). Stochastic Counterfactual Risk Analysis for the ' +
                         'Vulnerability Assessment of Cyber-Physical Attacks on Critical Infrastructure Systems. ' +
                         'Risk Analysis, 39(9), 2062–2079. doi:10.1111/risa.13291. ' +
                         'GRI Infrastructure Resilience Data v3.0 (2022).',
    temporal_coverage:   {
      start_year:        1980,
      end_year:          2080,
      label:             'Historical baseline + ISIMIP2b climate projections to 2080 under RCP4.5 and RCP8.5',
    },
    spatial_resolution:  '~1 km (1 arc-minute grid); aggregated from 90 m hazard sub-models',
    scientific_validity: 'validated',
    limitations: [
      'Hazard probability at ~1 km resolution; local drainage conditions, impervious surfaces and topography not fully resolved.',
      'Coastal flood model may underestimate compound events combining fluvial flooding with oceanic storm surge.',
      'Return-period probabilities assume stationary hazard statistics — non-stationarity under climate change is partially addressed via delta-method but not fully.',
      'Validation was conducted globally; regional performance in the Andes-Pacific coast may differ from global benchmarks.',
    ],
  },

  WRI_AQUEDUCT: {
    id:                  'WRI_AQUEDUCT',
    dataset:             'WRI Aqueduct Floods 4.0 — riverine and coastal flood hazard maps',
    institution:         'World Resources Institute (WRI) / Deltares / Utrecht University',
    citation:            'Rentschler, J. et al. (2022). Flood exposure and poverty in 188 countries. ' +
                         'Nature Communications, 13, 3527. doi:10.1038/s41467-022-30727-4. ' +
                         'WRI Aqueduct Floods Methodology v2.0 — Ward et al. (2020).',
    temporal_coverage:   {
      start_year:        1980,
      end_year:          2080,
      label:             'Historical (1980 baseline) + RCP8.5 projections to 2080 at 2, 5, 10, 25, 50, 100, 250, 500, 1000-year return periods',
    },
    spatial_resolution:  '~1 km (30 arc-second grid for coastal; 90 m MERIT Hydro for riverine)',
    scientific_validity: 'validated',
    limitations: [
      'Return-period flood maps represent hazard frequency, not guaranteed event timing or exact flood depth.',
      'River network resolution (MERIT Hydro ~90 m) limits representation of small tributaries and urban drainage.',
      'Coastal flood model assumes mean sea level; relative sea-level rise due to subsidence is not localized.',
      'Validation skewed toward gauged basins; ungauged Andean headwaters have higher uncertainty.',
    ],
  },

  NOAA_ENSO: {
    id:                  'NOAA_ENSO',
    dataset:             'NOAA ONI / ERSST v5 — Oceanic Niño Index (near-real-time)',
    institution:         'NOAA Climate Prediction Center (CPC) / National Centers for Environmental Information (NCEI)',
    citation:            'Barnston, A.G., Chelliah, M. & Goldenberg, S.B. (1997). Documentation of a highly ENSO-related ' +
                         'SST region in the equatorial Pacific. Atmosphere-Ocean, 35(3), 367–383. doi:10.1080/07055900.1997.9649597. ' +
                         'Huang, B. et al. (2017). Extended Reconstructed Sea Surface Temperature version 5 (ERSSTv5). ' +
                         'Journal of Climate, 30(20), 8179–8205. doi:10.1175/JCLI-D-16-0836.1.',
    temporal_coverage:   {
      start_year:        1950,
      label:             '1950–present (updated monthly with ~1 month lag; near-real-time observational)',
    },
    spatial_resolution:  'N/A — scalar basin-scale index (Niño 3.4 region: 5°N–5°S, 120°–170°W)',
    scientific_validity: 'validated',
    limitations: [
      'ONI is a Pacific basin-scale index; regional teleconnection strength to specific Peruvian locations varies by event, season and Niño type (Eastern Pacific vs. Central Pacific ENSO).',
      'El Niño coastal (Niño 1+2 region) events — most impactful for the Peruvian coast — are not fully captured by the canonical Niño 3.4 ONI index.',
      'Near-real-time data subject to revision as additional observations are incorporated.',
      'Long-range ENSO forecasts have skill up to ~9 months ahead; beyond that, predictability drops sharply.',
    ],
  },

  NASA_SRTM: {
    id:                  'NASA_SRTM',
    dataset:             'SRTM 30m v3 — Shuttle Radar Topography Mission Digital Elevation Model',
    institution:         'NASA / Jet Propulsion Laboratory (JPL) / National Geospatial-Intelligence Agency (NGA)',
    citation:            'Farr, T.G. et al. (2007). The Shuttle Radar Topography Mission. ' +
                         'Reviews of Geophysics, 45(2), RG2004. doi:10.1029/2005RG000183. ' +
                         'NASA SRTM version 3.0 — SRTMGL1 product, 2013.',
    temporal_coverage:   {
      start_year:        2000,
      end_year:          2000,
      label:             'February 2000 (single acquisition); static terrain dataset',
    },
    spatial_resolution:  '30 m (1 arc-second); SRTM 90 m (3 arc-second) used as fallback in some analyses',
    scientific_validity: 'provisional',
    limitations: [
      'Single 2000 acquisition — does not capture post-2000 changes in land use, deforestation, urban expansion or engineered slope modifications.',
      'Slope thresholds for huayco and landslide susceptibility are calibrated for Andean context (INGEMMET/SENAMHI) but have not been independently validated at individual asset locations.',
      'DEM-based slope analysis does not model soil saturation, infiltration, vegetation root cohesion or subsurface water table — key drivers of actual mass movement initiation.',
      'Radar shadow and layover artifacts may affect slope estimates on steep Andean terrain.',
      'No dynamic land-use or soil-type layer is combined with terrain to produce probabilistic susceptibility.',
    ],
  },

  OPEN_METEO: {
    id:                  'OPEN_METEO',
    dataset:             'CMIP6 via Open-Meteo Climate API — derived climate indices',
    institution:         'Open-Meteo (open-meteo.com) / CMIP6 contributing modeling centers',
    citation:            'Zippenfenig, P. (2023). Open-Meteo.com Weather API [Software]. Zenodo. doi:10.5281/zenodo.7970649. ' +
                         'CMIP6 data contributed by modeling centers listed in Eyring et al. (2016). ' +
                         'Open-Meteo bias-correction: ERA5 reanalysis alignment per Zippenfenig (2023).',
    temporal_coverage:   {
      start_year:        1950,
      end_year:          2050,
      label:             '1950–2022 historical (ERA5 bias-corrected); 2023–2050 SSP projections',
    },
    spatial_resolution:  '~25 km (CMIP6 native grid, bilinearly interpolated)',
    scientific_validity: 'provisional',
    limitations: [
      'Derived climate indices may differ from direct CMIP6 CCKP downloads for the same variable and location due to different bias-correction methodology.',
      'Open-Meteo aggregates a subset of CMIP6 models — ensemble composition and model weights differ from the CCKP 49+ GCM ensemble.',
      'Bias-correction method (ERA5 alignment) varies by variable and may introduce artifacts in derived indices such as CDD or Rx5day.',
      'Used as fallback only when climate_cells (CMIP6 CCKP) are unavailable for a location; signals derived from Open-Meteo carry provisional validation status.',
    ],
  },

  WORLD_BANK: {
    id:                  'WORLD_BANK',
    dataset:             'World Bank Development Indicators + country/regional metadata',
    institution:         'World Bank Group — Development Data Group',
    citation:            'World Bank (2024). World Development Indicators. ' +
                         'The World Bank, Washington, D.C. http://data.worldbank.org/indicator.',
    temporal_coverage:   {
      start_year:        1960,
      label:             '1960–present (updated annually); territorial context is current year vintage',
    },
    spatial_resolution:  'Country and subnational administrative unit level',
    scientific_validity: 'validated',
    limitations: [
      'Socioeconomic indicators reflect national or departmental averages; sub-city asset-level socioeconomic context is not resolved.',
      'Adaptive capacity proxies (health access, GDP per capita, infrastructure quality) are aggregated from multi-source surveys with varying coverage years.',
    ],
  },
};

// ─── SYSTEM LIMITATIONS (detectadas en auditoría Jun 2026) ─────────────────────
// Limitaciones conocidas del pipeline completo que no son atribuibles a
// una fuente de datos individual sino al diseño del sistema.
export const SYSTEM_LIMITATIONS = [
  {
    id: 'SYS-001',
    title: 'hd40 no disponible en climate_cells (DB)',
    description: 'La variable hd40 (días con Tmax > 40°C) no existe en la tabla climate_cells. ' +
                 'Open-Meteo computa hd40 como fallback para severe_heat.',
    severity: 'info',
    mitigation: '004-hd40-extreme-heat — severe_heat re-activado usando Open-Meteo hd40. ' +
                'Migrar a climate_cells cuando hd40 esté disponible en DB.',
  },
  {
    id: 'SYS-002',
    title: 'Sin horizonte long_term (2060-2100) real en climate_cells',
    description: 'La DB solo cubre hasta 2059. El horizonte long_term se añadió al buildHorizonMap ' +
                 'para detectar datos si estuvieran disponibles. projection.js contiene datos IPCC de referencia regional.',
    severity: 'medium',
    mitigation: 'Commit 7 — extrapolación de mid_term y datos IPCC de referencia. Migrar a CMIP6 2060-2099 cuando estén disponibles.',
  },
  {
    id: 'SYS-003',
    title: 'Thresholds regionalizados V2 (Commit 3)',
    description: 'Layer2_SignalEngineV2.js usa thresholds diferenciados por macro-región ' +
                 '(costa/sierra/selva/puna) basados en SENAMHI, no thresholds globales IPCC.',
    severity: 'info',
    mitigation: 'Validar en staging contra al menos 10 ubicaciones por región antes de desactivar v1.',
  },
  {
    id: 'SYS-004',
    title: 'Variables huérfanas integradas (Commit 4)',
    description: 'r50mm, tx84rr, tasmax ahora generan señales en V2. Antes estaban en DB pero no se usaban.',
    severity: 'info',
    mitigation: 'Monitorear nuevas señales en staging — pueden aumentar tasa de detección en ~30%.',
  },
  {
    id: 'SYS-005',
    title: 'GRI como fuente primaria de inundación (Commit 5)',
    description: 'GRI (~1km) evaluado antes que CMIP6 (~25km) en V2. Mejora resolución espacial para Perú.',
    severity: 'info',
    mitigation: 'Verificar que GRI tenga cobertura para ubicaciones de interés en Perú costero.',
  },
  {
    id: 'SYS-006',
    title: 'prpercnt historical fijo corregido (Commit 6)',
    description: 'historical: 100 reemplazado por valor real de pr histórico como baseline.',
    severity: 'info',
    mitigation: 'N/A — corrección cosmética para reportes.',
  },
  {
    id: 'SYS-007',
    title: 'hd30, r20mm, hd40 como nuevas señales (004-hd40-extreme-heat)',
    description: 'hd30 (moderate_heat), r20mm (extreme_rain_frequency) y hd40 (severe_heat) ' +
                 'agregados como señales en Layer2 V2. Deduplicación: severe_heat > extreme_heat > moderate_heat.',
    severity: 'info',
    mitigation: 'Monitorear tasa de detección — puede aumentar número de señales por análisis.',
  },
];

// ─── FASE B — Standard signal structure builder ───────────────────────────────

/**
 * Maps the internal signal_type key to the correct SIGNAL_TAXONOMY entry,
 * accounting for the one legacy renaming (landslide_risk → landslide_susceptibility).
 */
function resolveSignalType(layer2SignalType) {
  // Layer2 emits 'landslide_risk'; taxonomy canonical key is 'landslide_susceptibility'
  if (layer2SignalType === 'landslide_risk') return 'landslide_susceptibility';
  return layer2SignalType;
}

/**
 * Derives the SSP scenario label from the scenario string used in Layer1/Layer2.
 */
function resolveSSP(scenario) {
  const s = (scenario ?? 'ssp245').toLowerCase();
  if (s.includes('585')) return 'SSP5-8.5';
  if (s.includes('126')) return 'SSP1-2.6';
  return 'SSP2-4.5';
}

/**
 * Builds a canonical ClimateSignal object (FASE B standard structure)
 * from a raw Layer2 signal and the fusedData context.
 *
 * The canonical signal adds the standard fields (signal_type, category,
 * observed_or_projected, value, unit, temporal_window, scenario, source,
 * confidence, uncertainty, threshold_reference, geographic_scope)
 * while preserving all original Layer2 fields for backward compatibility.
 *
 * @param {Object} layer2Signal  - Raw signal from Layer2 detectSignals()
 * @param {Object} fusedData     - Output of Layer1 fusionClimateData()
 * @returns {Object}             - Canonical ClimateSignal
 */
export function buildCanonicalSignal(layer2Signal, fusedData) {
  const canonicalType = resolveSignalType(layer2Signal.signalType);
  const meta          = SIGNAL_TAXONOMY[canonicalType] ?? {};

  return {
    // ── FASE B canonical fields ──────────────────────────────────────────────
    signal_type:          canonicalType,
    category:             meta.category ?? 'temperature',
    observed_or_projected:meta.observed_or_projected ?? 'projected',
    value:                layer2Signal.projected ?? layer2Signal.historical ?? null,
    unit:                 meta.unit ?? '',
    temporal_window:      layer2Signal.horizon ?? 'short_term',
    scenario:             resolveSSP(fusedData?.scenario),
    source:               layer2Signal.source_traceability?.source ?? meta.primary_evidence ?? '',
    confidence:           layer2Signal.confidence ?? 'low',
    uncertainty:          layer2Signal.source_traceability?.uncertainty_spread ?? null,
    threshold_reference:  layer2Signal.threshold_reference ?? meta.threshold_reference ?? '',
    geographic_scope:     meta.geographic_scope ?? '',

    // ── Extended Layer2 fields (backward-compatible) ─────────────────────────
    signalType:           layer2Signal.signalType,
    indicator:            layer2Signal.indicator,
    historical:           layer2Signal.historical,
    projected:            layer2Signal.projected,
    delta:                layer2Signal.delta,
    delta_pct:            layer2Signal.delta_pct,
    horizon:              layer2Signal.horizon,
    exceeds_threshold:    layer2Signal.exceeds_threshold,
    source_traceability:  layer2Signal.source_traceability,
  };
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Returns the SIGNAL_TAXONOMY entry for a given signal type key.
 * Accepts both canonical keys (e.g. 'landslide_susceptibility') and
 * Layer2 legacy keys (e.g. 'landslide_risk').
 *
 * @param {string} signalType
 * @returns {Object|null}
 */
export function getSignalMeta(signalType) {
  const canonical = resolveSignalType(signalType);
  return SIGNAL_TAXONOMY[canonical] ?? null;
}

/**
 * Returns the EVIDENCE_REGISTRY entry for a given evidence ID.
 *
 * @param {string} evidenceId  - e.g. 'CMIP6_CCKP', 'GRI_OXFORD'
 * @returns {Object|null}
 */
export function getEvidence(evidenceId) {
  return EVIDENCE_REGISTRY[evidenceId] ?? null;
}

/**
 * Returns all EVIDENCE_REGISTRY entries associated with a given signal type.
 * Returns primary evidence first, secondary (if any) second.
 *
 * @param {string} signalType
 * @returns {Object[]}
 */
export function getEvidenceForSignal(signalType) {
  const meta = getSignalMeta(signalType);
  if (!meta) return [];
  const results = [];
  if (meta.primary_evidence && EVIDENCE_REGISTRY[meta.primary_evidence]) {
    results.push(EVIDENCE_REGISTRY[meta.primary_evidence]);
  }
  if (meta.secondary_evidence && EVIDENCE_REGISTRY[meta.secondary_evidence]) {
    results.push(EVIDENCE_REGISTRY[meta.secondary_evidence]);
  }
  return results;
}

/**
 * Returns all canonical signal types for a given category.
 *
 * @param {'temperature'|'precipitation'|'hydrology'|'terrain'|'climate_mode'} category
 * @returns {string[]}
 */
export function getSignalsByCategory(category) {
  return Object.entries(SIGNAL_TAXONOMY)
    .filter(([, meta]) => meta.category === category)
    .map(([key]) => key);
}

/**
 * Validates that a signal type string is part of the canonical taxonomy.
 * Accepts both canonical and Layer2 legacy keys.
 *
 * @param {string} signalType
 * @returns {boolean}
 */
export function isKnownSignalType(signalType) {
  const canonical = resolveSignalType(signalType);
  return canonical in SIGNAL_TAXONOMY;
}
