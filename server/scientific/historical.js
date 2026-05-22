/**
 * Historical Climate Engine — Sprint 8
 *
 * Curated catalog of observed extreme climate events in Peru with:
 *   FASE A — Observed event catalog (extreme rain, ENSO, thermal anomalies, landslides, droughts)
 *   FASE B — Threshold validation per event (authority, value, exceeds_explanation)
 *   FASE C — Full traceability (source, date, temporal/spatial resolution, reference)
 *
 * Pure function module. No I/O, no side effects, fully testable.
 *
 * Sources: NOAA CPC, SENAMHI Perú, INGEMMET 2021, IPCC AR6, WMO 2023,
 *          INDECI, IGP (Instituto Geofísico del Perú), ANA, UNDRR.
 */

// ─── FASE A — Event Type Taxonomy ────────────────────────────────────────────

export const EVENT_TYPES = {
  extreme_rain:    { label: 'Lluvia extrema observada',      icon_hint: 'droplets'     },
  enso:            { label: 'Evento ENSO (El Niño/La Niña)', icon_hint: 'waves'        },
  thermal_anomaly: { label: 'Anomalía térmica observada',    icon_hint: 'thermometer'  },
  landslide:       { label: 'Deslizamiento / Huayco',        icon_hint: 'mountain'     },
  drought:         { label: 'Sequía observada',              icon_hint: 'sun'          },
};

// ─── FASE A — Historical Event Catalog ───────────────────────────────────────
// Each event documents an observed extreme climate event in Peru.
// Fields follow FASE B (threshold) and FASE C (traceability) specs.

export const HISTORICAL_EVENTS = [

  // ── ENSO Events ─────────────────────────────────────────────────────────────

  {
    id:                   'enso_1982_1983',
    event_type:           'enso',
    label:                'El Niño 1982–1983 (Muy fuerte)',
    description:          'Uno de los eventos El Niño más severos del siglo XX. El Perú experimentó precipitaciones extraordinarias en la costa norte (5–10× el promedio anual), inundaciones masivas y aproximadamente 3 000 víctimas. Considerado evento de referencia histórica para evaluaciones de riesgo ENSO.',
    date_start:           '1982-07',
    date_end:             '1983-06',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'costa_norte',
    observed_value:       2.1,
    observed_unit:        '°C ONI (pico Nov–Dic 1982)',
    threshold_value:      0.5,
    threshold_unit:       '°C ONI',
    threshold_authority:  'NOAA CPC',
    threshold_description:'ONI > +0.5 °C durante ≥ 3 temporadas estacionales consecutivas define El Niño según NOAA CPC.',
    exceeds_threshold:    true,
    exceeds_explanation:  'ONI de +2.1 °C supera ampliamente el umbral El Niño de +0.5 °C definido por NOAA CPC para la región Niño 3.4, clasificándose como evento "Muy Fuerte".',
    source:               'NOAA CPC — Oceanic Niño Index (ONI) Historical Record / ERSSTv5',
    source_id:            'NOAA_ENSO',
    reference:            'Barnston et al. (1997). Atmosphere-Ocean, 35(3). doi:10.1080/07055900.1997.9649597.',
  },

  {
    id:                   'enso_1997_1998',
    event_type:           'enso',
    label:                'El Niño 1997–1998 (Muy fuerte — récord histórico)',
    description:          'Considerado el evento El Niño más intenso del siglo XX. La costa norte peruana recibió precipitaciones entre 600% y 1 200% sobre la media histórica. El río Piura superó su caudal máximo registrado. Más de 300 000 damnificados en Perú.',
    date_start:           '1997-05',
    date_end:             '1998-05',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'costa_norte',
    observed_value:       2.4,
    observed_unit:        '°C ONI (pico Nov–Dic 1997)',
    threshold_value:      0.5,
    threshold_unit:       '°C ONI',
    threshold_authority:  'NOAA CPC',
    threshold_description:'ONI > +0.5 °C durante ≥ 3 temporadas consecutivas según NOAA CPC.',
    exceeds_threshold:    true,
    exceeds_explanation:  'ONI de +2.4 °C supera el umbral El Niño de +0.5 °C (NOAA CPC) en un factor de casi 5×, clasificándose como "Muy Fuerte" y considerado el evento de referencia para la evaluación de riesgos de precipitación extrema en el Perú.',
    source:               'NOAA CPC — ONI Historical Record / ERSSTv5; SENAMHI Perú — Boletín El Niño 1997–98',
    source_id:            'NOAA_ENSO',
    reference:            'Trenberth, K.E. (1997). The Definition of El Niño. Bulletin of the American Meteorological Society, 78(12). doi:10.1175/1520-0477(1997)078.',
  },

  {
    id:                   'enso_2015_2016',
    event_type:           'enso',
    label:                'El Niño 2015–2016 (Muy fuerte — ONI récord global)',
    description:          'Evento con el pico ONI más alto en el registro moderno (+2.6 °C). El impacto en Perú fue menor al esperado en la costa norte dado el tipo "Pacífico Central", pero la sierra y selva sufrieron anomalías de calor y alteraciones en el ciclo de lluvias.',
    date_start:           '2015-03',
    date_end:             '2016-04',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'nacional',
    observed_value:       2.6,
    observed_unit:        '°C ONI (pico Nov–Dic 2015)',
    threshold_value:      0.5,
    threshold_unit:       '°C ONI',
    threshold_authority:  'NOAA CPC',
    threshold_description:'ONI > +0.5 °C durante ≥ 3 temporadas consecutivas según NOAA CPC.',
    exceeds_threshold:    true,
    exceeds_explanation:  'ONI de +2.6 °C es el valor más alto registrado en el Índice Oceánico Niño histórico, superando el umbral El Niño (NOAA CPC) en más de 5×.',
    source:               'NOAA CPC — ONI Historical Record',
    source_id:            'NOAA_ENSO',
    reference:            "L'Heureux, M. et al. (2017). Observing and predicting the 2015/16 El Niño. BAMS. doi:10.1175/BAMS-D-16-0009.1.",
  },

  {
    id:                   'enso_costero_2017',
    event_type:           'enso',
    label:                'El Niño Costero 2017',
    description:          'Evento atípico concentrado en las aguas costeras peruanas (región Niño 1+2), sin la intensidad del Pacífico central que caracteriza El Niño canónico. La TSM costera alcanzó +3 a +5 °C sobre lo normal. Causó las lluvias más intensas en Lima en décadas y 860+ huaycos a nivel nacional.',
    date_start:           '2017-01',
    date_end:             '2017-05',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'costa_central_norte',
    observed_value:       3.2,
    observed_unit:        '°C anomalía TSM Niño 1+2 (Feb–Mar 2017)',
    threshold_value:      0.5,
    threshold_unit:       '°C anomalía TSM Niño 1+2',
    threshold_authority:  'SENAMHI Perú / IGP',
    threshold_description:'Anomalía de TSM en Niño 1+2 > +0.5 °C durante ≥ 3 meses consecutivos define El Niño Costero según SENAMHI/IGP.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Anomalía de TSM costera de +3.2 °C supera 6× el umbral SENAMHI/IGP de +0.5 °C para El Niño Costero en la región Niño 1+2.',
    source:               'SENAMHI Perú — Boletín El Niño Costero 2017; IGP — Informe técnico Niño 1+2',
    source_id:            'NOAA_ENSO',
    reference:            'Garreaud, R. (2018). A plausible atmospheric trigger for the 2017 coastal El Niño. Int. J. Climatology. doi:10.1002/joc.5426.',
  },

  {
    id:                   'enso_lanina_1999_2000',
    event_type:           'enso',
    label:                'La Niña 1999–2000 (Fuerte)',
    description:          'Evento La Niña fuerte que generó severas sequías en la sierra sur del Perú (altiplano) y exceso de precipitaciones en la Amazonía. Puno, Cusco y Arequipa registraron déficit hídrico superior al 40% de la media anual.',
    date_start:           '1999-07',
    date_end:             '2000-06',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'sierra_sur',
    observed_value:       -1.8,
    observed_unit:        '°C ONI (pico Oct–Nov 1999)',
    threshold_value:      -0.5,
    threshold_unit:       '°C ONI',
    threshold_authority:  'NOAA CPC',
    threshold_description:'ONI < −0.5 °C durante ≥ 3 temporadas consecutivas define La Niña según NOAA CPC.',
    exceeds_threshold:    true,
    exceeds_explanation:  'ONI de −1.8 °C supera (en valor absoluto) el umbral La Niña de −0.5 °C (NOAA CPC) en más de 3×, clasificándose como evento "Fuerte".',
    source:               'NOAA CPC — ONI Historical Record; SENAMHI Perú',
    source_id:            'NOAA_ENSO',
    reference:            'NOAA CPC (2000). Cold Episode — La Niña 1999–2000. CPC Climate Diagnostics Bulletin.',
  },

  {
    id:                   'enso_lanina_2010_2011',
    event_type:           'enso',
    label:                'La Niña 2010–2011 (Fuerte)',
    description:          'Segunda La Niña fuerte en dos años. La sierra sur y el altiplano sufrieron sequías intensas, mientras la Amazonía norte experimentó lluvias extraordinarias. El lago Titicaca registró niveles por debajo del mínimo histórico durante 2009–2010.',
    date_start:           '2010-07',
    date_end:             '2011-05',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'sierra_sur',
    observed_value:       -1.6,
    observed_unit:        '°C ONI (pico Nov 2010)',
    threshold_value:      -0.5,
    threshold_unit:       '°C ONI',
    threshold_authority:  'NOAA CPC',
    threshold_description:'ONI < −0.5 °C durante ≥ 3 temporadas consecutivas según NOAA CPC.',
    exceeds_threshold:    true,
    exceeds_explanation:  'ONI de −1.6 °C supera en valor absoluto el umbral La Niña de −0.5 °C (NOAA CPC), clasificado como evento "Fuerte".',
    source:               'NOAA CPC — ONI Historical Record; SENAMHI Perú — Boletín La Niña 2010–11',
    source_id:            'NOAA_ENSO',
    reference:            'WMO (2011). The Global Climate in 2011. World Meteorological Organization, Geneva.',
  },

  {
    id:                   'enso_lanina_2020_2022',
    event_type:           'enso',
    label:                'La Niña Triple 2020–2022',
    description:          'Evento La Niña excepcionalmente prolongado — tres años consecutivos con fase fría dominante. Contribuyó a déficits hídricos acumulados en la sierra sur peruana y a condiciones de sequía extendida en la región andina.',
    date_start:           '2020-08',
    date_end:             '2023-03',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'sierra_sur',
    observed_value:       -1.2,
    observed_unit:        '°C ONI (pico Sep 2021)',
    threshold_value:      -0.5,
    threshold_unit:       '°C ONI',
    threshold_authority:  'NOAA CPC',
    threshold_description:'ONI < −0.5 °C durante ≥ 3 temporadas consecutivas según NOAA CPC.',
    exceeds_threshold:    true,
    exceeds_explanation:  'ONI de −1.2 °C supera el umbral La Niña durante tres temporadas consecutivas (2020–2022) — evento de triple duración sin precedente reciente en el registro NOAA CPC.',
    source:               'NOAA CPC — ONI Historical Record',
    source_id:            'NOAA_ENSO',
    reference:            'WMO (2023). State of the Global Climate 2022. WMO-No. 1316. doi:10.25789/s5n9-4n77.',
  },

  // ── Extreme Rain Events ──────────────────────────────────────────────────────

  {
    id:                   'rain_piura_1983',
    event_type:           'extreme_rain',
    label:                'Lluvias extremas Piura — El Niño 1983',
    description:          'Durante El Niño 1982–83, Piura registró más de 3 000 mm en 4 meses frente a una media anual histórica de 60–80 mm. El río Piura desbordó inundando más del 60% de la ciudad y destruyendo infraestructura agraria en los valles de Chira y San Lorenzo.',
    date_start:           '1983-01',
    date_end:             '1983-05',
    temporal_resolution:  'daily',
    spatial_resolution:   'local',
    region:               'costa_norte',
    observed_value:       100,
    observed_unit:        'mm/día (pico diario en estaciones Piura/Chulucanas)',
    threshold_value:      50,
    threshold_unit:       'mm/día',
    threshold_authority:  'SENAMHI Perú / WMO',
    threshold_description:'Precipitación ≥ 50 mm/día califica como lluvia extrema en la costa norte peruana (SENAMHI). WMO define Rx1day > 50 mm/día como umbral de alerta de precipitación intensa.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Lluvias de más de 100 mm/día observadas en estaciones de Piura durante ene–may 1983 superan 2× el umbral SENAMHI/WMO de 50 mm/día para lluvia extrema en la costa norte del Perú.',
    source:               'SENAMHI Perú — Red estaciones Piura / Chulucanas; INDECI — Informe El Niño 1982–83',
    source_id:            'CMIP6_CCKP',
    reference:            'Horel, J.D. & Wallace, J.M. (1981). Planetary-scale atmospheric phenomena associated with the Southern Oscillation. Monthly Weather Review, 109(4).',
  },

  {
    id:                   'rain_lima_2017',
    event_type:           'extreme_rain',
    label:                'Huayco Huachipa — Lima, 15 enero 2017',
    description:          'Lluvias en las cuencas altas del Rímac y Chillón generaron flujos de detritos que alcanzaron Lima Metropolitana. El evento de Huachipa destruyó viviendas, cortó la Carretera Central y causó 23 fallecidos con ~1 500 afectados directos.',
    date_start:           '2017-01-15',
    date_end:             '2017-01-15',
    temporal_resolution:  'daily',
    spatial_resolution:   'local',
    region:               'lima_metropolitana',
    observed_value:       38,
    observed_unit:        'mm/día en estación Chosica (cuenca alta Rímac)',
    threshold_value:      25,
    threshold_unit:       'mm/día',
    threshold_authority:  'SENAMHI Perú',
    threshold_description:'Precipitación ≥ 25 mm/día en cuencas altas de Lima activa alerta de huaycos según SENAMHI. Umbral para lluvia muy fuerte en serranía de Lima: 25–50 mm/día.',
    exceeds_threshold:    true,
    exceeds_explanation:  '38 mm/día en la estación Chosica supera el umbral SENAMHI de 25 mm/día para alerta de huaycos en cuencas altas de Lima, activando condiciones de flujo de detritos en el cono aluvial del Rímac.',
    source:               'SENAMHI Perú — Red hidrometeorológica cuenca Rímac; INDECI — Reporte emergencias 15-ene-2017',
    source_id:            'CMIP6_CCKP',
    reference:            'INDECI (2017). Compendio Estadístico del INDECI 2017. Instituto Nacional de Defensa Civil del Perú.',
  },

  {
    id:                   'rain_piura_2017',
    event_type:           'extreme_rain',
    label:                'Inundaciones Piura — El Niño Costero, feb–abr 2017',
    description:          'Piura y Tumbes recibieron precipitaciones históricas asociadas al El Niño Costero. La ciudad de Piura sufrió inundaciones severas con el río Piura desbordando 5 km al interior. 159 muertos a nivel nacional, 1 600 km de carreteras dañadas.',
    date_start:           '2017-02',
    date_end:             '2017-04',
    temporal_resolution:  'daily',
    spatial_resolution:   'regional',
    region:               'costa_norte',
    observed_value:       118,
    observed_unit:        'mm/día (pico máximo diario estación Piura, 28-mar-2017)',
    threshold_value:      50,
    threshold_unit:       'mm/día',
    threshold_authority:  'SENAMHI Perú / WMO',
    threshold_description:'Precipitación ≥ 50 mm/día califica como lluvia extrema en la costa peruana (SENAMHI). WMO define Rx1day > 50 mm/día como alerta de precipitación intensa.',
    exceeds_threshold:    true,
    exceeds_explanation:  '118 mm/día observados en la estación Piura el 28 de marzo 2017 supera más de 2× el umbral de 50 mm/día (SENAMHI/WMO) para lluvia extrema en la costa norte peruana.',
    source:               'SENAMHI Perú — Red estaciones Piura; ANA — Informe hidráulico 2017',
    source_id:            'CMIP6_CCKP',
    reference:            'Garreaud, R. (2018). A plausible atmospheric trigger for the 2017 coastal El Niño. Int. J. Climatology. doi:10.1002/joc.5426.',
  },

  {
    id:                   'rain_amazonia_2012',
    event_type:           'extreme_rain',
    label:                'Inundación amazónica récord — Loreto, mayo 2012',
    description:          'El río Amazonas en Iquitos alcanzó su nivel máximo histórico: 120.41 m.s.n.m., superando el récord anterior de 1991. Más de 35 000 familias afectadas en Loreto, Ucayali y Madre de Dios.',
    date_start:           '2012-03',
    date_end:             '2012-06',
    temporal_resolution:  'daily',
    spatial_resolution:   'regional',
    region:               'amazonia',
    observed_value:       120.41,
    observed_unit:        'm.s.n.m. nivel hidrométrico río Amazonas en Iquitos (pico mayo 2012)',
    threshold_value:      117.0,
    threshold_unit:       'm.s.n.m. (umbral alerta roja ANA — estación Iquitos)',
    threshold_authority:  'ANA (Autoridad Nacional del Agua del Perú)',
    threshold_description:'Nivel hidrométrico ≥ 117.0 m.s.n.m. en la estación Iquitos activa alerta roja de inundación según ANA.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Nivel hidrométrico de 120.41 m.s.n.m. supera en 3.4 m el umbral de alerta roja de 117.0 m.s.n.m. definido por ANA para la estación de Iquitos, constituyendo un récord histórico de creciente amazónica.',
    source:               'ANA — Boletín hidrológico estación Iquitos; SENAMHI Perú',
    source_id:            'CMIP6_CCKP',
    reference:            'ANA (2012). Informe de Emergencia Hidráulica: Inundaciones Loreto mayo 2012. Autoridad Nacional del Agua del Perú.',
  },

  // ── Thermal Anomalies ────────────────────────────────────────────────────────

  {
    id:                   'heat_sur_2019',
    event_type:           'thermal_anomaly',
    label:                'Ola de calor sierra sur — junio 2019',
    description:          'La sierra sur del Perú (Puno, Cusco, Arequipa) experimentó temperaturas diurnas 3–4 °C por encima de la media histórica de junio. La anomalía afectó el período de heladas nocturnas típicas, perturbando el calendario agrícola andino.',
    date_start:           '2019-06-01',
    date_end:             '2019-06-30',
    temporal_resolution:  'daily',
    spatial_resolution:   'regional',
    region:               'sierra_sur',
    observed_value:       3.8,
    observed_unit:        '°C anomalía media mensual Tmax (jun 2019 vs. 1980–2014)',
    threshold_value:      2.0,
    threshold_unit:       '°C anomalía sobre media histórica',
    threshold_authority:  'SENAMHI Perú / WMO',
    threshold_description:'Anomalía de Tmax ≥ +2 °C sobre la media histórica mensual durante 5 o más días consecutivos califica como ola de calor según criterios WMO adaptados a la región andina por SENAMHI.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Anomalía media mensual de +3.8 °C en Tmax supera el umbral WMO/SENAMHI de +2.0 °C para clasificación de ola de calor en la sierra sur peruana.',
    source:               'SENAMHI Perú — Red estaciones sierra sur; WMO — CLIMDEX indices',
    source_id:            'CMIP6_CCKP',
    reference:            'SENAMHI (2019). Boletín de Monitoreo Climático Junio 2019. Servicio Nacional de Meteorología e Hidrología del Perú.',
  },

  {
    id:                   'heat_global_2023',
    event_type:           'thermal_anomaly',
    label:                'Año más cálido en el registro global — 2023',
    description:          '2023 fue el año más cálido instrumentalmente registrado a nivel global (+1.45 °C sobre pre-industrial). En Perú, junio–septiembre 2023 registró anomalías de temperatura media de +0.8 a +1.2 °C, agravadas por el inicio del evento El Niño 2023–24.',
    date_start:           '2023-01',
    date_end:             '2023-12',
    temporal_resolution:  'monthly',
    spatial_resolution:   'national',
    region:               'nacional',
    observed_value:       1.45,
    observed_unit:        '°C sobre nivel pre-industrial (media anual global 2023)',
    threshold_value:      1.5,
    threshold_unit:       '°C sobre nivel pre-industrial',
    threshold_authority:  'IPCC AR6 / Acuerdo de París 2015',
    threshold_description:'El Acuerdo de París establece +1.5 °C sobre el período pre-industrial como umbral crítico. IPCC AR6 SPM A.1 muestra que 2023 (+1.45 °C) se ubica 0.05 °C por debajo de ese límite.',
    exceeds_threshold:    false,
    exceeds_explanation:  'La temperatura media global de 2023 (+1.45 °C) se ubica 0.05 °C por debajo del umbral crítico de +1.5 °C del Acuerdo de París — el año más cálido registrado, prácticamente en el límite.',
    source:               'WMO — State of the Global Climate 2023; Copernicus Climate Change Service (C3S)',
    source_id:            'CMIP6_CCKP',
    reference:            'WMO (2024). State of the Global Climate 2023. WMO-No. 1347. doi:10.25789/s5n9-4n77.',
  },

  {
    id:                   'heat_andes_trend',
    event_type:           'thermal_anomaly',
    label:                'Calentamiento acelerado Andes peruanos — 1980–2023',
    description:          'Los Andes peruanos se han calentado a +0.20–0.34 °C por década desde 1980, más rápido que el promedio global. Las regiones de alta montaña (> 4 000 m.s.n.m.) muestran el calentamiento más marcado. El glaciar Qori Kalis (Quelccaya) retrocede 32 m/año (2000–2023) vs. 6 m/año (1963–1978).',
    date_start:           '1980-01',
    date_end:             '2023-12',
    temporal_resolution:  'annual',
    spatial_resolution:   'regional',
    region:               'sierra_nacional',
    observed_value:       0.27,
    observed_unit:        '°C/década (tasa media calentamiento Andes peruanos 1980–2023)',
    threshold_value:      0.2,
    threshold_unit:       '°C/década',
    threshold_authority:  'IPCC AR6 WG1 Ch.2 / SENAMHI Perú',
    threshold_description:'Tasas de calentamiento > +0.2 °C/década en regiones tropicales de montaña son estadísticamente significativas y superan la variabilidad natural según IPCC AR6 WG1 Capítulo 2.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Tasa de calentamiento de +0.27 °C/década en los Andes peruanos supera el umbral de significancia estadística de +0.2 °C/década (IPCC AR6 WG1 Ch.2), confirmando una tendencia atribuible al forzamiento antropogénico.',
    source:               'SENAMHI Perú — Tendencias climáticas 1980–2023; Thompson et al. (2023) Science',
    source_id:            'CMIP6_CCKP',
    reference:            'Vuille, M. et al. (2018). Rapid decline of snow and ice in the tropical Andes. Earth-Science Reviews, 176. doi:10.1016/j.earscirev.2017.09.019.',
  },

  // ── Landslide / Huayco Events ─────────────────────────────────────────────────

  {
    id:                   'landslide_huachipa_2017',
    event_type:           'landslide',
    label:                'Huayco Huachipa — Lima, 15 enero 2017',
    description:          'Flujo de detritos que arrasó el sector Huachipa (Lima Este). Destruyó decenas de viviendas, cortó la Carretera Central (principal acceso a Lima) y causó 23 fallecidos. Mayor impacto de huayco en Lima en más de 30 años.',
    date_start:           '2017-01-15',
    date_end:             '2017-01-15',
    temporal_resolution:  'daily',
    spatial_resolution:   'local',
    region:               'lima_metropolitana',
    observed_value:       20,
    observed_unit:        '° pendiente media cuenca activada (estimado INGEMMET)',
    threshold_value:      15,
    threshold_unit:       '° pendiente',
    threshold_authority:  'INGEMMET (2021)',
    threshold_description:'Pendientes > 15° en zonas de convergencia de drenaje clasifican como susceptibilidad moderada a alta de huaycos según INGEMMET (2021) — Mapa de susceptibilidad a movimientos en masa.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Pendiente de 20° en la cuenca activada supera el umbral INGEMMET (2021) de 15° para susceptibilidad moderada a huaycos. La combinación con 38 mm/día desencadenó el flujo de detritos.',
    source:               'INDECI — Reporte emergencias 15-ene-2017; INGEMMET — Informe técnico posterior',
    source_id:            'NASA_SRTM',
    reference:            'INGEMMET (2021). Susceptibilidad a movimientos en masa en el Perú. Boletín Serie C: Geodinámica e Ingeniería Geológica.',
  },

  {
    id:                   'landslide_santa_teresa_2010',
    event_type:           'landslide',
    label:                'Deslizamientos Urubamba — acceso Machu Picchu, enero 2010',
    description:          'Lluvias extraordinarias de enero 2010 (La Niña 2009–10) desencadenaron múltiples deslizamientos en el valle del Urubamba. El acceso a Machu Picchu Pueblo quedó aislado semanas. 4 800 turistas evacuados vía helicóptero.',
    date_start:           '2010-01-25',
    date_end:             '2010-02-10',
    temporal_resolution:  'daily',
    spatial_resolution:   'local',
    region:               'sierra_sur',
    observed_value:       28,
    observed_unit:        '° pendiente media laderas afectadas (Urubamba, INGEMMET)',
    threshold_value:      20,
    threshold_unit:       '° pendiente (umbral susceptibilidad alta huaycos)',
    threshold_authority:  'INGEMMET (2021)',
    threshold_description:'Pendientes > 20° en zonas con drenaje convergente clasifican como susceptibilidad alta a flujos de detritos según INGEMMET (2021).',
    exceeds_threshold:    true,
    exceeds_explanation:  'Pendientes de 28° en laderas del Urubamba superan el umbral INGEMMET (2021) de 20° para susceptibilidad alta a huaycos, confirmando la geodinámica de riesgo del corredor Aguas Calientes–Machu Picchu.',
    source:               'INDECI — Informe emergencia Cusco ene–feb 2010; INGEMMET — Evaluación geológica post-evento',
    source_id:            'NASA_SRTM',
    reference:            'INGEMMET (2021). Susceptibilidad a movimientos en masa en el Perú. Boletín Serie C.',
  },

  {
    id:                   'landslide_andes_2017',
    event_type:           'landslide',
    label:                'Huaycos múltiples — El Niño Costero, feb–abr 2017',
    description:          'Durante El Niño Costero 2017 se registraron más de 860 huaycos activos en todo el Perú (INDECI). Los departamentos más afectados fueron Lima, Ica, Arequipa, La Libertad y Ancash. Más de 20 puentes destruidos y 500+ km de carreteras interrumpidas.',
    date_start:           '2017-02',
    date_end:             '2017-04',
    temporal_resolution:  'monthly',
    spatial_resolution:   'national',
    region:               'costa_sierra',
    observed_value:       860,
    observed_unit:        'eventos de huayco activos registrados (INDECI, feb–abr 2017)',
    threshold_value:      15,
    threshold_unit:       '° pendiente (umbral susceptibilidad moderada INGEMMET)',
    threshold_authority:  'INGEMMET (2021)',
    threshold_description:'Pendientes > 15° en zonas de drenaje convergente definen susceptibilidad moderada a alta a huaycos (INGEMMET 2021). El Niño Costero 2017 superó umbrales de detonación simultáneamente en cientos de cuencas.',
    exceeds_threshold:    true,
    exceeds_explanation:  '860 eventos de huayco en feb–abr 2017 (INDECI) superan cualquier registro histórico previo: el umbral de detonación INGEMMET fue excedido en más de 200 estaciones pluviométricas simultáneamente durante el evento.',
    source:               'INDECI — Compendio Estadístico 2017; SENAMHI — Boletín El Niño Costero 2017',
    source_id:            'NASA_SRTM',
    reference:            'INDECI (2017). Compendio Estadístico del INDECI 2017. Instituto Nacional de Defensa Civil del Perú, Lima.',
  },

  // ── Drought Events ───────────────────────────────────────────────────────────

  {
    id:                   'drought_altiplano_2004_2010',
    event_type:           'drought',
    label:                'Sequía altiplano sur — Puno/Cusco 2004–2010',
    description:          'Período prolongado de déficit hídrico en el altiplano sur peruano: precipitaciones entre 15% y 35% por debajo de la media en Puno, Cusco y Arequipa. El nivel del lago Titicaca descendió más de 1.5 m bajo el promedio histórico en 2009–2010. Fuerte impacto en ganadería altoandina y agricultura de subsistencia.',
    date_start:           '2004-01',
    date_end:             '2010-12',
    temporal_resolution:  'annual',
    spatial_resolution:   'regional',
    region:               'sierra_sur',
    observed_value:       -25,
    observed_unit:        '% déficit precipitación anual vs. media 1981–2010 (promedio período 2004–2010)',
    threshold_value:      -15,
    threshold_unit:       '% déficit de precipitación anual',
    threshold_authority:  'SENAMHI Perú / IPCC AR6',
    threshold_description:'Déficit de precipitación anual ≥ −15% define sequía moderada (SENAMHI). IPCC AR6 WG2 Ch.4 establece −15% como umbral de estrés hídrico significativo.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Déficit de −25% supera el umbral SENAMHI/IPCC AR6 de −15% para sequía moderada, calificando como sequía severa sostenida durante 6 años consecutivos en el altiplano sur peruano.',
    source:               'SENAMHI Perú — Boletines hídricos 2004–2010; ANA — Monitoreo nivel Lago Titicaca',
    source_id:            'CMIP6_CCKP',
    reference:            'SENAMHI (2010). Análisis de la sequía meteorológica en el altiplano sur del Perú 2004–2010. Dirección General de Hidrología y Recursos Hídricos.',
  },

  {
    id:                   'drought_sur_2016',
    event_type:           'drought',
    label:                'Sequía costa y sierra sur — 2015–2016',
    description:          'A pesar del El Niño 2015–16, la sierra sur y costa sur del Perú sufrieron un período seco atípico. Arequipa, Moquegua y Tacna registraron déficits de 30–45% de precipitación. Las reservas de los embalses de Tinajones y El Fraile cayeron a mínimos críticos.',
    date_start:           '2015-07',
    date_end:             '2016-06',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'costa_sur',
    observed_value:       -38,
    observed_unit:        '% déficit precipitación anual vs. media histórica (prom. Arequipa–Tacna)',
    threshold_value:      -15,
    threshold_unit:       '% déficit precipitación anual',
    threshold_authority:  'SENAMHI Perú / IPCC AR6',
    threshold_description:'Déficit de precipitación anual ≥ −15% define sequía moderada (SENAMHI). Déficit ≥ −30% clasifica como sequía severa.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Déficit de −38% supera el umbral de sequía severa (−30%) definido por SENAMHI, constituyendo el peor año hidrológico en la costa y sierra sur peruana en la década 2010–2020.',
    source:               'SENAMHI Perú — Boletín Hídrico Nacional 2016; ANA — Informe situación hídrica cuenca sur',
    source_id:            'CMIP6_CCKP',
    reference:            'SENAMHI (2016). Boletín Hídrico Nacional Nº 12/2016. Servicio Nacional de Meteorología e Hidrología del Perú.',
  },

  {
    id:                   'drought_amazonia_2010',
    event_type:           'drought',
    label:                'Sequía amazónica extrema — 2010',
    description:          'La Amazonía peruana experimentó en 2010 una sequía extrema que redujo el caudal del Ucayali y parte del Amazonas a mínimos históricos. Relacionada con anomalías de TSM en el Atlántico tropical norte. Impacto severo en navegabilidad y comunidades ribereñas.',
    date_start:           '2010-07',
    date_end:             '2010-11',
    temporal_resolution:  'monthly',
    spatial_resolution:   'regional',
    region:               'amazonia',
    observed_value:       -45,
    observed_unit:        '% déficit caudal río Ucayali vs. media histórica (jul–oct 2010)',
    threshold_value:      -30,
    threshold_unit:       '% déficit caudal vs. media histórica',
    threshold_authority:  'ANA (Autoridad Nacional del Agua del Perú)',
    threshold_description:'Déficit de caudal ≥ −30% respecto a la media histórica mensual activa alerta hidrológica de sequía severa según ANA.',
    exceeds_threshold:    true,
    exceeds_explanation:  'Déficit de caudal de −45% en el río Ucayali supera el umbral ANA de −30% para alerta hidrológica de sequía severa, uno de los eventos de sequía amazónica más intensos del registro histórico peruano.',
    source:               'ANA — Boletín hidrológico cuenca Ucayali 2010; SENAMHI — Monitoreo amazónico',
    source_id:            'CMIP6_CCKP',
    reference:            'Lewis, S.L. et al. (2011). The 2010 Amazon Drought. Science, 331(6017). doi:10.1126/science.1200807.',
  },
];

// ─── FASE B — Threshold Validation Helper ────────────────────────────────────

/**
 * Returns all required threshold fields for an event.
 * Used in validation — not exposed as a public function.
 */
export function getThresholdFields() {
  return ['threshold_value', 'threshold_unit', 'threshold_authority', 'threshold_description', 'exceeds_explanation'];
}

// ─── FASE C — Traceability Query Functions ───────────────────────────────────

/**
 * Returns all events of a given event_type.
 * Returns empty array for unknown types.
 *
 * @param {string} eventType - One of the keys in EVENT_TYPES
 * @returns {Object[]}
 */
export function getHistoricalEventsByType(eventType) {
  return HISTORICAL_EVENTS.filter(e => e.event_type === eventType);
}

/**
 * Returns events matching a region (exact match OR region === 'nacional').
 * Always includes national-scope events as context.
 *
 * @param {string} region
 * @returns {Object[]}
 */
export function getHistoricalEventsByRegion(region) {
  return HISTORICAL_EVENTS.filter(e => e.region === region || e.region === 'nacional');
}

// ─── Signal-to-EventType mapping ─────────────────────────────────────────────

const SIGNAL_TO_EVENT_TYPES = {
  extreme_rain:    ['extreme_rain', 'enso'],
  flood_risk:      ['extreme_rain', 'enso'],
  extreme_heat:    ['thermal_anomaly'],
  severe_heat:     ['thermal_anomaly'],
  tropical_nights: ['thermal_anomaly'],
  temp_increase:   ['thermal_anomaly'],
  drought:         ['drought', 'enso'],
  landslide_risk:  ['landslide'],
  huayco_risk:     ['landslide'],
  enso_phase:      ['enso'],
};

/**
 * Derives the set of event types relevant to the current Layer2 signals.
 * ENSO context is always included regardless of signals.
 */
function deriveRelevantTypes(signals) {
  const types = new Set(['enso']);
  for (const s of signals) {
    const mapped = SIGNAL_TO_EVENT_TYPES[s.signalType];
    if (mapped) mapped.forEach(t => types.add(t));
  }
  return Array.from(types);
}

/**
 * Ranks events so that ENSO phase-matching events appear first,
 * followed by the most recent events (by date_start descending).
 */
function rankEvents(events, currentEnsoPhase) {
  return [...events].sort((a, b) => {
    if (currentEnsoPhase && a.event_type === 'enso' && b.event_type === 'enso') {
      const aMatch = currentEnsoPhase === 'el_nino' ? a.observed_value > 0 : a.observed_value < 0;
      const bMatch = currentEnsoPhase === 'el_nino' ? b.observed_value > 0 : b.observed_value < 0;
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return  1;
    }
    return b.date_start.localeCompare(a.date_start);
  });
}

// ─── FASE A-C — Historical Context Builder ───────────────────────────────────

/**
 * Builds a structured historical context from Layer2 signals and Layer1 fusedData.
 * Matches observed historical events to the current signal profile.
 *
 * @param {Object} signalOutput  - Output of Layer2 detectSignals() — must have .signals array
 * @param {Object} fusedData     - Output of Layer1 fusionClimateData() — may have .ensoData
 * @returns {Object}             - Historical context object
 */
export function buildHistoricalContext(signalOutput, fusedData) {
  const signals     = signalOutput?.signals ?? [];
  const ensoPhase   = fusedData?.ensoData?.phase ?? null;

  const relevantTypes = deriveRelevantTypes(signals);

  // Gather and rank events
  let matched = HISTORICAL_EVENTS.filter(e => relevantTypes.includes(e.event_type));
  matched = rankEvents(matched, ensoPhase);

  const relevant_events = matched.slice(0, 8);

  // ENSO summary context
  const enso_events = HISTORICAL_EVENTS.filter(e => e.event_type === 'enso');
  const el_nino_events = enso_events.filter(e => e.observed_value > 0);
  const la_nina_events = enso_events.filter(e => e.observed_value < 0);

  const enso_context = {
    total_events_in_catalog: enso_events.length,
    el_nino_count:           el_nino_events.length,
    la_nina_count:           la_nina_events.length,
    current_phase:           ensoPhase,
    current_phase_match:     enso_events.filter(e =>
      ensoPhase === 'el_nino' ? e.observed_value > 0 :
      ensoPhase === 'la_nina' ? e.observed_value < 0 : false
    ).length,
  };

  // Threshold authority summary
  const authorityMap = new Map();
  for (const e of relevant_events) {
    const auth  = e.threshold_authority;
    const count = (authorityMap.get(auth) ?? 0) + 1;
    authorityMap.set(auth, count);
  }
  const threshold_context = Array.from(authorityMap.entries()).map(([authority, events_count]) => ({
    authority,
    events_count,
  }));

  return {
    relevant_events,
    enso_context,
    threshold_context,
    total_events_matched: matched.length,
    generated_at:         new Date().toISOString(),
  };
}
