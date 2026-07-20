export const CANONICAL_VARIABLES = {
  air_temperature_current: {
    unit: "°C",
    description: "Temperatura del aire actual (observación en tiempo real)",
    domain: "observation_current",
    methodology: {
      default_method: "direct_read",
      references: ["WMO No. 8 (2018) CIMO Guide §3.2: Temperature measurement"],
      scientific_rationale: "Lectura directa del sensor meteorológico en estación sinóptica",
    },
  },
  air_temperature_max: {
    unit: "°C",
    description: "Temperatura máxima diaria del aire (2m)",
    domain: "projection_climate",
    methodology: {
      default_method: "completeness_weighted_mean",
      references: [
        "WMO No. 100 (2018) Guide to Climatological Practices §2.3.2: Completeness thresholds for daily data",
        "GCOS-200 (2022) Climate Monitoring Principles: Principle 10 — completeness reporting",
      ],
      scientific_rationale: "Promedio diario con control de completitud. WMO requiere ≥80% de observaciones diarias para validez mensual.",
    },
  },
  air_temperature_min: {
    unit: "°C",
    description: "Temperatura mínima diaria del aire (2m)",
    domain: "projection_climate",
    methodology: {
      default_method: "completeness_weighted_mean",
      references: [
        "WMO No. 100 (2018) §2.3.2",
        "GCOS-200 (2022) Principle 10",
      ],
      scientific_rationale: "Promedio diario con control de completitud",
    },
  },
  precipitation_current: {
    unit: "mm",
    description: "Precipitación actual (observación en tiempo real)",
    domain: "observation_current",
    methodology: {
      default_method: "direct_read",
      references: ["WMO No. 8 (2018) CIMO Guide §3.4: Precipitation measurement"],
      scientific_rationale: "Lectura directa del pluviómetro/pluviógrafo. La precipitación no puede ser negativa (WMO No. 8 §3.4).",
    },
  },
  precipitation_sum: {
    unit: "mm",
    description: "Precipitación acumulada en el período",
    domain: "observation_historical",
    methodology: {
      default_method: "completeness_weighted_sum",
      references: [
        "WMO No. 100 (2018) §2.3.2: Acumulación mensual requiere ≥80% observaciones diarias",
        "Huffman, G.J. et al. (2001). J. Hydrometeor., 2(1), 36–50: GPCP merge de observaciones",
        "GCOS-200 (2022) GPCC y GPCP requieren completitud para productos de precipitación global",
      ],
      scientific_rationale: "Suma acumulativa con factor de corrección por completitud. Si faltan observaciones, se escala por (expected/valid) siguiendo la práctica de GPCP para evitar subestimación.",
      assumptions: [
        "Asume que los valores faltantes están distribuidos aleatoriamente (MCAR). En regiones con estacionalidad marcada, esto puede subestimar acumulaciones en temporada húmeda.",
      ],
    },
  },
  relative_humidity: {
    unit: "%",
    description: "Humedad relativa del aire",
    domain: "observation_current",
    methodology: {
      default_method: "direct_read",
      references: ["WMO No. 8 (2018) CIMO Guide §3.5: Humidity measurement — rango [0,100]%"],
      scientific_rationale: "Lectura directa del higrómetro. Valores fuera de [0,100]% indican error instrumental (WMO No. 8 §3.5).",
    },
  },
  wind_speed: {
    unit: "km/h",
    description: "Velocidad del viento",
    domain: "observation_current",
    methodology: {
      default_method: "direct_read",
      references: ["WMO No. 8 (2018) CIMO Guide §3.6: Wind measurement — anemometer range"],
      scientific_rationale: "Lectura directa del anemómetro. La velocidad del viento no puede ser negativa.",
    },
  },
  surface_pressure: {
    unit: "hPa",
    description: "Presión atmosférica superficial",
    domain: "observation_current",
    methodology: {
      default_method: "direct_read",
      references: ["WMO No. 8 (2018) CIMO Guide §3.3: Pressure measurement — rango [870, 1085] hPa"],
      scientific_rationale: "Lectura directa del barómetro. La presión es un campo sinóptico con larga longitud de decorrelación (~500 km).",
    },
  },
  elevation: {
    unit: "m",
    description: "Elevación del terreno (SRTM 30m)",
    domain: "elevation",
    methodology: {
      default_method: "direct_read",
      references: [
        "Farr, T.G. et al. (2007). Rev. Geophys., 45(2), RG2004: SRTM mission validation",
        "WGS84 ellipsoid reference",
      ],
      scientific_rationale: "Valor de elevación del modelo digital de elevación (DEM). Campo fijo no estocástico — no aplican umbrales de decorrelación espacial.",
      assumptions: [
        "Asume que el DEM más fino disponible (SRTM 30m) es la referencia canónica. Para Perú, SRTM tiene error RMSE ~5-10m en costa y ~15-20m en sierra.",
      ],
    },
  },
  gri_flood_occurrence: {
    unit: "probability",
    description: "Probabilidad anual de inundación — baseline (GRI Oxford, ISIMIP/Aqueduct/JRC)",
    domain: "hazard_risk_gri",
    methodology: {
      default_method: "direct_read",
      references: [
        "GRI Oxford pixel-driller API — global.infrastructureresilience.org",
        "ISIMIP flood model ensemble",
        "WRI Aqueduct Floods",
        "JRC Global Flood Database",
      ],
      scientific_rationale: "Probabilidad de ocurrencia anual de inundación (fluvial, costera, pluvial) en condiciones baseline. Se toma el valor de occurrence del dominio de mayor resolución disponible (jrc_flood > aqueduct > isimip).",
    },
  },
  gri_drought_occurrence: {
    unit: "probability",
    description: "Probabilidad anual de sequía — baseline (GRI Oxford, ISIMIP)",
    domain: "hazard_risk_gri",
    methodology: {
      default_method: "direct_read",
      references: ["GRI Oxford pixel-driller API — global.infrastructureresilience.org", "ISIMIP drought model ensemble"],
      scientific_rationale: "Probabilidad de ocurrencia anual de sequía en condiciones baseline. Basado en ensemble ISIMIP con múltiples GCMs.",
    },
  },
  gri_extreme_heat_occurrence: {
    unit: "probability",
    description: "Probabilidad anual de calor extremo — baseline (GRI Oxford, ISIMIP)",
    domain: "hazard_risk_gri",
    methodology: {
      default_method: "direct_read",
      references: ["GRI Oxford pixel-driller API — global.infrastructureresilience.org", "ISIMIP extreme heat model ensemble"],
      scientific_rationale: "Probabilidad de ocurrencia anual de calor extremo en condiciones baseline. Basado en ensemble ISIMIP con múltiples GCMs.",
    },
  },
  twsa: {
    unit: "cm",
    description: "Terrestrial Water Storage Anomaly (GRACE-FO)",
    domain: "groundwater",
    methodology: {
      default_method: "direct_read",
      references: [
        "Wahr, J. et al. (1998). J. Geophys. Res., 103(B12), 30205–30229: GRACE TWSA retrieval",
        "GRACE-FO Level-3 product description: JPL TELLUS GRACEFO_L3_CSR_RL06.1",
      ],
      scientific_rationale: "Anomalía de almacenamiento de agua terrestre derivada de variaciones del campo gravitatorio. Producto Level-3 con suavizado Gaussiano de ~300 km.",
      assumptions: [
        "El suavizado Gaussiano DDK ~300 km es la resolución efectiva. Señales por debajo de esta escala no son resolubles.",
      ],
    },
  },
  oni_index: {
    unit: "°C",
    description: "Oceanic Niño Index (NOAA CPC)",
    domain: "enso",
    methodology: {
      default_method: "direct_read",
      references: [
        "NOAA CPC ONI definition: 3-month running mean SST anomaly in Niño 3.4 region (5°N-5°S, 170°W-120°W)",
        "Trenberth, K.E. (1997). Bull. Amer. Meteor. Soc., 78, 2771–2777: ENSO definition",
      ],
      scientific_rationale: "Índice de cuenca (Niño 3.4). No es un campo griddado — el valor es único para toda la región del Pacífico tropical central.",
      assumptions: [
        "El ONI es representativo de las condiciones ENSO para toda la cuenca del Pacífico tropical. No captura gradientes este-oeste dentro de la región Niño 3.4.",
      ],
    },
  },
  enso_phase: {
    unit: "categorical",
    description: "Fase ENSO clasificada: el_nino / la_nina / neutral",
    domain: "enso",
    methodology: {
      default_method: "consecutive_threshold_classification",
      references: [
        "NOAA CPC ONI definition: 3-month running mean SST anomaly in Niño 3.4 region",
        "Trenberth, K.E. (1997). Bull. Amer. Meteor. Soc., 78, 2771–2777: El Niño/La Niña requiere ONI >= +0.5°C (<= -0.5°C) durante >=5 trimestres superpuestos consecutivos",
      ],
      scientific_rationale: "Clasificación categórica derivada de la serie oni_index (pipeline/shared/enso-classification.js), aplicando la regla oficial NOAA CPC de 5 trimestres consecutivos. Un solo trimestre por encima del umbral no constituye un episodio ENSO — ver HALLAZGO-4.",
      assumptions: [
        "Requiere que los 5 trimestres más recientes de la serie fuente sean consecutivos (sin huecos); si no lo son, o hay menos de 5 registros, se clasifica 'neutral'. El motivo exacto (insufficient_data / non_consecutive_seasons / threshold_not_sustained) queda en sources_consulted[].response.classification_basis del artifact crudo de Stage 01.",
      ],
    },
  },
  // cc_* variables: ETCCDI-style climate extreme indices from the precomputed
  // climate_cells grid (supabase_climate_cells), historical/baseline period
  // only. Prefixed "cc_" (not reusing e.g. air_temperature_current) because
  // these are climatological baseline statistics derived from a CMIP6-based
  // grid, not real-time direct observations — mixing the two under one
  // canonical name would misrepresent what was actually measured.
  // Each source value is a {p10, p90, median} distribution; only the median
  // is propagated as the canonical scalar. Full percentiles remain available
  // in sources_consulted[].response.historical.<index> in the raw artifact.
  // HALLAZGO-6 follow-up (auditoría de transformación de datos, hallazgo
  // P2): el bloque "ensemble-all-sspXXX_YYYY-YYYY" SÍ se extrae ahora, pero
  // solo para tasmax y pr (ver cc_tasmax_corto/cc_tasmax_mediano/
  // cc_pr_corto/cc_pr_mediano más abajo) — los únicos 2 índices con un
  // detector/fenómeno real que los consuma (ola_de_calor/ola_de_frio,
  // sequia/inundacion). El resto de los 12 índices climate_cells permanece
  // solo en su forma histórica (bare, sin escenario) — extraerlos por
  // escenario sin un consumidor downstream repetiría el mismo patrón de
  // "dato extraído pero nunca usado" que esa auditoría señaló para NASA
  // POWER T2M.
  cc_tas: {
    unit: "°C",
    description: "Temperatura media del aire (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'tas' (near-surface air temperature) — variable estándar de los protocolos CMIP"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid. Grilla derivada de openmeteo_cmip6 (ver authoritative-sources.json: precomputed_grid.selection_rationale).",
      assumptions: ["Período exacto de la ventana 'historical' no está documentado en el payload de origen — pendiente de confirmar con el proceso que puebla climate_cells."],
    },
  },
  cc_tasmax: {
    unit: "°C",
    description: "Temperatura máxima media diaria (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'tasmax' (daily maximum near-surface air temperature)"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Ver cc_tas."],
    },
  },
  // cc_tasmax_historico/_corto/_mediano: mismo índice que cc_tasmax, pero
  // expuesto con sufijo de horizonte para que ProjectionDetector
  // (04-signals/confidence.js) pueda emparejar cada banda de proyección con
  // su línea base vía `${base}_historico`, exactamente el mismo contrato que
  // ya usan las variables horizonte-sufijadas de openmeteo_cmip6. _corto y
  // _mediano provienen de los bloques ensemble-all-{scenario}_2020-2039 /
  // _2040-2059 de la MISMA fuente (climate_cells) — el escenario (ssp245 por
  // defecto, ssp585 si se solicita) se resuelve en Stage 03 a partir del
  // parámetro de ejecución `scenario`. No existe banda "largo": climate_cells
  // no publica un bloque 2060-2079, y no se fabrica una extrapolación para
  // esa banda inexistente.
  cc_tasmax_historico: {
    unit: "°C",
    description: "Temperatura máxima media diaria — línea base histórica (climate_cells, 1991-2020), alias de cc_tasmax con sufijo de horizonte",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'tasmax'"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid — idéntico valor que cc_tasmax, re-expuesto con sufijo _historico para el contrato de ProjectionDetector.",
      assumptions: ["Ver cc_tas."],
    },
  },
  cc_tasmax_corto: {
    unit: "°C",
    description: "Temperatura máxima media diaria proyectada, 2020-2039, bajo el escenario climático solicitado (climate_cells, ensemble CMIP6)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'tasmax' bajo SSP2-4.5/SSP5-8.5, ensemble-all"],
      scientific_rationale: "Mediana (p50) del ensemble de proyección para el bloque 2020-2039 del escenario solicitado. Único índice climate_cells con dimensión de escenario real extraída — ver auditoría de transformación de datos, hallazgo P2.",
      assumptions: ["Escenario resuelto por el parámetro `scenario` de la consulta (default ssp245) — no un valor fijo ni inferido."],
    },
  },
  cc_tasmax_mediano: {
    unit: "°C",
    description: "Temperatura máxima media diaria proyectada, 2040-2059, bajo el escenario climático solicitado (climate_cells, ensemble CMIP6)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'tasmax' bajo SSP2-4.5/SSP5-8.5, ensemble-all"],
      scientific_rationale: "Mediana (p50) del ensemble de proyección para el bloque 2040-2059 del escenario solicitado.",
      assumptions: ["Ver cc_tasmax_corto."],
    },
  },
  cc_txx: {
    unit: "°C",
    description: "TXx — valor extremo (máximo) de la temperatura máxima diaria (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Zhang, X. et al. (2011). WIREs Climate Change, 2(6), 851-870: ETCCDI index TXx"],
      scientific_rationale: "Índice de extremos climáticos ETCCDI. Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Ver cc_tas."],
    },
  },
  cc_tr: {
    unit: "días",
    description: "TR — Noches tropicales (Tmin > 20°C) (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Zhang, X. et al. (2011). WIREs Climate Change, 2(6), 851-870: ETCCDI index TR (Tropical nights)"],
      scientific_rationale: "Índice de extremos climáticos ETCCDI. Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Ver cc_tas. Período de conteo (anual/estacional) no confirmado en el payload."],
    },
  },
  cc_hd30: {
    unit: "días",
    description: "Días de calor con Tmax > 30°C (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Convención de nombre no-ETCCDI estándar; umbral 30°C es autodescriptivo del nombre de campo"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Definición inferida del nombre del campo, no confirmada contra documentación del proceso que puebla climate_cells."],
    },
  },
  cc_hd35: {
    unit: "días",
    description: "Días de calor extremo con Tmax > 35°C (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Convención de nombre no-ETCCDI estándar; umbral 35°C es autodescriptivo del nombre de campo"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Definición inferida del nombre del campo, no confirmada contra documentación del proceso que puebla climate_cells."],
    },
  },
  cc_r20mm: {
    unit: "días",
    description: "R20mm — días con precipitación ≥ 20mm (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Zhang, X. et al. (2011). WIREs Climate Change, 2(6), 851-870: familia de índices ETCCDI R__mm"],
      scientific_rationale: "Índice de extremos climáticos ETCCDI (variante). Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Ver cc_tas. Período de conteo (anual/estacional) no confirmado en el payload."],
    },
  },
  cc_r50mm: {
    unit: "días",
    description: "Días con precipitación ≥ 50mm (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Zhang, X. et al. (2011). WIREs Climate Change, 2(6), 851-870: familia de índices ETCCDI R__mm"],
      scientific_rationale: "Índice de extremos climáticos ETCCDI (variante). Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Ver cc_r20mm."],
    },
  },
  cc_rx1day: {
    unit: "mm",
    description: "Rx1day — precipitación máxima en 1 día (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Zhang, X. et al. (2011). WIREs Climate Change, 2(6), 851-870: ETCCDI index Rx1day"],
      scientific_rationale: "Índice de extremos climáticos ETCCDI. Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Ver cc_tas."],
    },
  },
  cc_rx5day: {
    unit: "mm",
    description: "Rx5day — precipitación máxima acumulada en 5 días consecutivos (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Zhang, X. et al. (2011). WIREs Climate Change, 2(6), 851-870: ETCCDI index Rx5day"],
      scientific_rationale: "Índice de extremos climáticos ETCCDI. Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Ver cc_tas."],
    },
  },
  cc_pr: {
    unit: "mm",
    description: "Precipitación acumulada (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'pr' (precipitation)"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Período de acumulación (mensual/estacional/anual) no está documentado en el payload de origen — no asumir directamente comparable con precipitation_sum (que sí tiene período explícito vía data_time_range)."],
    },
  },
  // cc_pr_historico/_corto/_mediano: mismo criterio que cc_tasmax_* arriba —
  // ver esas entradas para el razonamiento completo del sufijo de horizonte
  // y la resolución de escenario.
  cc_pr_historico: {
    unit: "mm",
    description: "Precipitación acumulada — línea base histórica (climate_cells, 1991-2020), alias de cc_pr con sufijo de horizonte",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'pr'"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid — idéntico valor que cc_pr, re-expuesto con sufijo _historico para el contrato de ProjectionDetector.",
      assumptions: ["Período de acumulación no documentado en el payload de origen — ver cc_pr."],
    },
  },
  cc_pr_corto: {
    unit: "mm",
    description: "Precipitación acumulada proyectada, 2020-2039, bajo el escenario climático solicitado (climate_cells, ensemble CMIP6)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'pr' bajo SSP2-4.5/SSP5-8.5, ensemble-all"],
      scientific_rationale: "Mediana (p50) del ensemble de proyección para el bloque 2020-2039 del escenario solicitado. Ver auditoría de transformación de datos, hallazgo P2.",
      assumptions: ["Escenario resuelto por el parámetro `scenario` de la consulta (default ssp245).", "Período de acumulación no documentado en el payload de origen — ver cc_pr."],
    },
  },
  cc_pr_mediano: {
    unit: "mm",
    description: "Precipitación acumulada proyectada, 2040-2059, bajo el escenario climático solicitado (climate_cells, ensemble CMIP6)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["CMIP6 'pr' bajo SSP2-4.5/SSP5-8.5, ensemble-all"],
      scientific_rationale: "Mediana (p50) del ensemble de proyección para el bloque 2040-2059 del escenario solicitado.",
      assumptions: ["Ver cc_pr_corto."],
    },
  },
  cc_prpercnt: {
    unit: "%",
    description: "Precipitación como porcentaje de lo normal/baseline (grid climate_cells, baseline histórico)",
    domain: "precomputed_grid",
    methodology: {
      default_method: "direct_read",
      references: ["Convención de nombre no-ETCCDI estándar; interpretación de '% de precipitación normal' inferida del nombre y del valor observado (~100 en baseline histórico)"],
      scientific_rationale: "Mediana (p50) de la distribución histórica del grid.",
      assumptions: ["Período/normal de referencia exactos no confirmados en el payload de origen."],
    },
  },
  // "tx84rr" from the same payload is intentionally NOT registered as a
  // canonical variable: its definition could not be confirmed with
  // reasonable confidence (not a recognized standard ETCCDI/CMIP index name).
  // Fabricating a scientific_rationale for an unverified index would repeat
  // exactly the kind of unsupported claim this audit has been correcting
  // elsewhere. It remains visible in the raw evidence trace
  // (sources_consulted[].response.historical.tx84rr) but is not promoted to
  // a canonical variable until its definition is confirmed with whoever
  // built the climate_cells ETL.
  poverty_rate: {
    unit: "%",
    description: "Tasa de pobreza nacional (World Bank)",
    domain: "socioeconomic",
    methodology: {
      default_method: "direct_read",
      references: [
        "World Bank Poverty and Inequality Platform (PIP)",
        "INEI: Medición de pobreza monetaria en Perú",
      ],
      scientific_rationale: "Indicador país-nivel. La tasa de pobreza es un agregado nacional, no un campo espacial continuo. Cobertura espacial no aplica.",
      assumptions: [
        "El valor nacional es representativo de todo el país. No captura desigualdades subnacionales (departamento, distrito).",
      ],
    },
  },
  gdp_per_capita: {
    unit: "USD",
    description: "GDP per cápita (World Bank)",
    domain: "socioeconomic",
    methodology: {
      default_method: "direct_read",
      references: ["World Bank national accounts data"],
      scientific_rationale: "Indicador país-nivel. Agregado económico nacional. No tiene dimensión espacial intra-país.",
      assumptions: [
        "Valor nacional. No captura variación regional del PBI per cápita.",
      ],
    },
  },
  water_access: {
    unit: "%",
    description: "Acceso a agua potable (World Bank)",
    domain: "socioeconomic",
    methodology: {
      default_method: "direct_read",
      references: [
        "World Bank: 'People using safely managed drinking water services' (WHO/UNICEF JMP)",
        "SDG Indicator 6.1.1",
      ],
      scientific_rationale: "Indicador país-nivel. Porcentaje de población con acceso a servicios de agua potable gestionados de forma segura.",
    },
  },
  urban_population: {
    unit: "persons",
    description: "Población urbana (World Bank)",
    domain: "socioeconomic",
    methodology: {
      default_method: "direct_read",
      references: ["World Bank: Urban population (% of total) — UN World Urbanization Prospects"],
      scientific_rationale: "Indicador país-nivel. Población que reside en áreas clasificadas como urbanas según definición nacional.",
      assumptions: [
        "La definición de 'urbano' varía por país. Para Perú, INEI define urbano como centros poblados con ≥100 viviendas.",
      ],
    },
  },
  education_literacy: {
    unit: "%",
    description: "Tasa de alfabetismo adulto (World Bank, SE.ADT.LITR.ZS)",
    domain: "socioeconomic",
    methodology: {
      default_method: "direct_read",
      references: [
        "World Bank: Adult literacy rate, population 15+ years (UNESCO Institute for Statistics)",
        "Brooks et al. (2005): literacy rate as highest-ranked determinant of adaptive capacity",
      ],
      scientific_rationale: "Indicador país-nivel. Porcentaje de población ≥15 años que puede leer y escribir una corta declaración sobre su vida diaria. Proxy de capital humano para capacidad adaptativa.",
      assumptions: [
        "Valor nacional. No captura variación subnacional de alfabetismo.",
        "La definición de alfabetismo varía entre fuentes — UNESCO usa la definición de la ley nacional.",
      ],
    },
  },
  traveltime_healthcare: {
    unit: "min",
    description: "Tiempo de viaje motorizado a establecimiento de salud (GRI Oxford, Weiss et al. 2020)",
    domain: "hazard_risk_gri",
    methodology: {
      default_method: "direct_read",
      references: [
        "Weiss et al. (2020) 'Global maps of travel time to healthcare facilities' Nature Medicine",
        "GRI Oxford friction surface v2.0",
      ],
      scientific_rationale: "Tiempo de viaje motorizado al centro de salud más cercano. Subtipo 'motorized' seleccionado porque Weiss et al. 2020 calibra contra el estándar OMS de acceso de 2 horas en vehículo.",
      assumptions: [
        "Resolución ~1km. El valor esrepresentativo del píxel, no de un punto exacto.",
        "Se usa subtype=motorized (no walking) porque los tiempos motorizados encajan con el rango de normalización 0-120 min del indicador healthcare_access en adaptive-capacity.json.",
      ],
    },
  },
};

// Horizon-sliced variants of the openmeteo_cmip6 daily series: instead of one
// scalar per variable averaged over whatever date range happened to be
// requested (previously a hardcoded, undocumented 2020-2050 window — see
// HALLAZGO-7), Stage03 now slices the full available archive
// (pipeline/shared/horizons.js) into 4 non-overlapping bands and produces one
// canonical variable per {base variable} x {horizon}. Generated from the base
// entries above (not hand-duplicated) so methodology/references/default_method
// stay a single source of truth; only description/assumptions are extended
// per horizon.
const HORIZON_LABELS = {
  historico: "histórico (normal climático WMO 1991-2020)",
  corto: "corto plazo",
  mediano: "mediano plazo",
  largo: "largo plazo",
};

for (const baseName of ["air_temperature_max", "air_temperature_min", "precipitation_sum"]) {
  const baseInfo = CANONICAL_VARIABLES[baseName];
  for (const [horizonName, horizonLabel] of Object.entries(HORIZON_LABELS)) {
    CANONICAL_VARIABLES[`${baseName}_${horizonName}`] = {
      ...baseInfo,
      description: `${baseInfo.description} — horizonte ${horizonLabel}`,
      methodology: {
        ...baseInfo.methodology,
        assumptions: [
          ...(baseInfo.methodology.assumptions || []),
          `Ventana temporal del horizonte "${horizonName}" calculada por pipeline/shared/horizons.js (límites exactos y estado de truncamiento en getHorizons()). La fuente (Open-Meteo Climate API) cubre 1991-01-01 a 2050-01-01 (rango solicitado por el adapter); el horizonte "largo" se trunca cuando la ventana nominal (baseline+10 a baseline+30 años) excede ese límite.`,
          `Valor diario = media del ensemble de 7 modelos HighResMIP ponderada por resolución inversa (w_i=1/resolution_km_i, re-normalizada por día ante datos faltantes de un modelo), no media aritmética simple. No es weighting por skill — ver pipeline/stages/01-acquisition/adapters/openmeteo.js (ENSEMBLE_WEIGHTING_SCHEMES/ACTIVE_ENSEMBLE_WEIGHTING_SCHEME) para la justificación completa y sus límites reconocidos (Knutti et al. 2010, GRL). El esquema equal-weight alternativo (Tebaldi & Knutti 2007) ya no es solo una mención en comentario: se calcula para el mismo período y se reporta el delta real por variable/horizonte en methodology.ensemble_weighting_comparison y en assumptions (finding 3.5). RMSE-weighting contra SENAMHI queda pendiente — no hay serie observacional SENAMHI conectada al pipeline todavía.`,
        ],
      },
    };
  }
}

export function getCanonicalInfo(name) {
  const base = CANONICAL_VARIABLES[name];
  if (!base) {
    return {
      unit: "unknown",
      description: name,
      domain: null,
      methodology: {
        default_method: "unknown",
        references: [],
        scientific_rationale: "Variable no registrada en el esquema canónico. El valor se propaga sin transformación.",
        assumptions: ["Variable no definida en el registro canónico. Verificar con el mantenedor del esquema."],
      },
    };
  }
  return base;
}

export function getVariablesByDomain() {
  const byDomain = {};
  for (const [name, info] of Object.entries(CANONICAL_VARIABLES)) {
    const domain = info.domain || "unknown";
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(name);
  }
  return byDomain;
}
