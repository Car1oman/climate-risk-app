// @ts-nocheck
import { useState } from "react";
import {
  CalendarClock, Droplets, Thermometer, Mountain,
  Sun, Waves, AlertCircle, BookOpen, MapPin
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Curated historical event catalog (Sprint 8) ─────────────────────────────
// Observed extreme climate events in Peru with threshold validation and traceability.
// Sources: NOAA CPC, SENAMHI Perú, INGEMMET 2021, IPCC AR6, WMO 2023, INDECI, ANA.

const HISTORICAL_EVENTS = [
  // ENSO
  {
    id: "enso_1982_1983", event_type: "enso",
    label: "El Niño 1982–1983 (Muy fuerte)",
    date_start: "1982-07", region: "costa_norte",
    observed_value: 2.1, observed_unit: "°C ONI",
    threshold_value: 0.5, threshold_unit: "°C ONI",
    threshold_authority: "NOAA CPC",
    exceeds_threshold: true,
    exceeds_explanation: "ONI de +2.1 °C supera ampliamente el umbral El Niño de +0.5 °C definido por NOAA CPC para la región Niño 3.4, clasificándose como evento \"Muy Fuerte\".",
    source: "NOAA CPC — ONI Historical Record / ERSSTv5",
    temporal_resolution: "monthly", spatial_resolution: "regional",
    reference: "Barnston et al. (1997). Atmosphere-Ocean, 35(3).",
  },
  {
    id: "enso_1997_1998", event_type: "enso",
    label: "El Niño 1997–1998 (récord histórico)",
    date_start: "1997-05", region: "costa_norte",
    observed_value: 2.4, observed_unit: "°C ONI",
    threshold_value: 0.5, threshold_unit: "°C ONI",
    threshold_authority: "NOAA CPC",
    exceeds_threshold: true,
    exceeds_explanation: "ONI de +2.4 °C supera el umbral El Niño (NOAA CPC) en un factor de casi 5×, considerado evento de referencia histórica para evaluación de riesgo en el Perú.",
    source: "NOAA CPC — ONI Historical Record; SENAMHI Perú",
    temporal_resolution: "monthly", spatial_resolution: "regional",
    reference: "Trenberth, K.E. (1997). BAMS, 78(12).",
  },
  {
    id: "enso_costero_2017", event_type: "enso",
    label: "El Niño Costero 2017",
    date_start: "2017-01", region: "costa_central_norte",
    observed_value: 3.2, observed_unit: "°C TSM Niño 1+2",
    threshold_value: 0.5, threshold_unit: "°C anomalía TSM",
    threshold_authority: "SENAMHI / IGP",
    exceeds_threshold: true,
    exceeds_explanation: "Anomalía de TSM costera de +3.2 °C supera 6× el umbral SENAMHI/IGP de +0.5 °C para El Niño Costero, causando 860+ huaycos a nivel nacional.",
    source: "SENAMHI Perú — Boletín El Niño Costero 2017; IGP",
    temporal_resolution: "monthly", spatial_resolution: "regional",
    reference: "Garreaud, R. (2018). Int. J. Climatology. doi:10.1002/joc.5426.",
  },
  {
    id: "enso_lanina_1999_2000", event_type: "enso",
    label: "La Niña 1999–2000 (Fuerte)",
    date_start: "1999-07", region: "sierra_sur",
    observed_value: -1.8, observed_unit: "°C ONI",
    threshold_value: -0.5, threshold_unit: "°C ONI",
    threshold_authority: "NOAA CPC",
    exceeds_threshold: true,
    exceeds_explanation: "ONI de −1.8 °C supera (en valor absoluto) el umbral La Niña de −0.5 °C (NOAA CPC) en más de 3×, generando sequía severa en el altiplano sur.",
    source: "NOAA CPC — ONI Historical Record; SENAMHI Perú",
    temporal_resolution: "monthly", spatial_resolution: "regional",
    reference: "NOAA CPC (2000). Climate Diagnostics Bulletin.",
  },
  {
    id: "enso_lanina_2010_2011", event_type: "enso",
    label: "La Niña 2010–2011 (Fuerte)",
    date_start: "2010-07", region: "sierra_sur",
    observed_value: -1.6, observed_unit: "°C ONI",
    threshold_value: -0.5, threshold_unit: "°C ONI",
    threshold_authority: "NOAA CPC",
    exceeds_threshold: true,
    exceeds_explanation: "ONI de −1.6 °C supera en valor absoluto el umbral La Niña de −0.5 °C (NOAA CPC), causando sequías severas en el altiplano y nivel histórico bajo en el lago Titicaca.",
    source: "NOAA CPC — ONI Historical Record; SENAMHI Perú",
    temporal_resolution: "monthly", spatial_resolution: "regional",
    reference: "WMO (2011). The Global Climate in 2011.",
  },
  // Extreme Rain
  {
    id: "rain_lima_2017", event_type: "extreme_rain",
    label: "Huayco Huachipa — Lima, 15 ene 2017",
    date_start: "2017-01-15", region: "lima_metropolitana",
    observed_value: 38, observed_unit: "mm/día (estación Chosica)",
    threshold_value: 25, threshold_unit: "mm/día",
    threshold_authority: "SENAMHI Perú",
    exceeds_threshold: true,
    exceeds_explanation: "38 mm/día en la estación Chosica supera el umbral SENAMHI de 25 mm/día para alerta de huaycos en cuencas altas de Lima, activando flujo de detritos en el cono aluvial del Rímac.",
    source: "SENAMHI Perú — Red cuenca Rímac; INDECI — Reporte emergencias 15-ene-2017",
    temporal_resolution: "daily", spatial_resolution: "local",
    reference: "INDECI (2017). Compendio Estadístico del INDECI 2017.",
  },
  {
    id: "rain_piura_2017", event_type: "extreme_rain",
    label: "Inundaciones Piura — El Niño Costero 2017",
    date_start: "2017-02", region: "costa_norte",
    observed_value: 118, observed_unit: "mm/día (pico 28-mar-2017)",
    threshold_value: 50, threshold_unit: "mm/día",
    threshold_authority: "SENAMHI / WMO",
    exceeds_threshold: true,
    exceeds_explanation: "118 mm/día observados en Piura el 28-mar-2017 supera más de 2× el umbral de 50 mm/día (SENAMHI/WMO) para lluvia extrema en la costa norte peruana.",
    source: "SENAMHI Perú — Red estaciones Piura; ANA — Informe hidráulico 2017",
    temporal_resolution: "daily", spatial_resolution: "regional",
    reference: "Garreaud, R. (2018). Int. J. Climatology.",
  },
  {
    id: "rain_piura_1983", event_type: "extreme_rain",
    label: "Lluvias extremas Piura — El Niño 1983",
    date_start: "1983-01", region: "costa_norte",
    observed_value: 100, observed_unit: "mm/día (pico estaciones Piura)",
    threshold_value: 50, threshold_unit: "mm/día",
    threshold_authority: "SENAMHI / WMO",
    exceeds_threshold: true,
    exceeds_explanation: "Más de 100 mm/día en estaciones de Piura ene–may 1983 superan 2× el umbral SENAMHI/WMO de 50 mm/día para lluvia extrema, con más de 3 000 mm acumulados en 4 meses.",
    source: "SENAMHI Perú — Red estaciones Piura; INDECI — Informe El Niño 1982–83",
    temporal_resolution: "daily", spatial_resolution: "local",
    reference: "Horel & Wallace (1981). Monthly Weather Review, 109(4).",
  },
  // Thermal Anomaly
  {
    id: "heat_sur_2019", event_type: "thermal_anomaly",
    label: "Ola de calor sierra sur — junio 2019",
    date_start: "2019-06-01", region: "sierra_sur",
    observed_value: 3.8, observed_unit: "°C anomalía Tmax mensual",
    threshold_value: 2.0, threshold_unit: "°C anomalía sobre media histórica",
    threshold_authority: "SENAMHI / WMO",
    exceeds_threshold: true,
    exceeds_explanation: "Anomalía media mensual de +3.8 °C en Tmax supera el umbral WMO/SENAMHI de +2.0 °C para clasificación de ola de calor en la sierra sur peruana.",
    source: "SENAMHI Perú — Red estaciones sierra sur; WMO — CLIMDEX",
    temporal_resolution: "daily", spatial_resolution: "regional",
    reference: "SENAMHI (2019). Boletín de Monitoreo Climático Junio 2019.",
  },
  {
    id: "heat_global_2023", event_type: "thermal_anomaly",
    label: "Año más cálido en el registro global — 2023",
    date_start: "2023-01", region: "nacional",
    observed_value: 1.45, observed_unit: "°C sobre pre-industrial (global)",
    threshold_value: 1.5, threshold_unit: "°C sobre pre-industrial",
    threshold_authority: "IPCC AR6 / Acuerdo de París 2015",
    exceeds_threshold: false,
    exceeds_explanation: "La temperatura media global de 2023 (+1.45 °C) se ubica 0.05 °C por debajo del umbral crítico de +1.5 °C del Acuerdo de París — el año más cálido registrado, prácticamente en el límite.",
    source: "WMO — State of the Global Climate 2023; Copernicus C3S",
    temporal_resolution: "monthly", spatial_resolution: "national",
    reference: "WMO (2024). State of the Global Climate 2023. WMO-No. 1347.",
  },
  {
    id: "heat_andes_trend", event_type: "thermal_anomaly",
    label: "Calentamiento acelerado Andes peruanos 1980–2023",
    date_start: "1980-01", region: "sierra_nacional",
    observed_value: 0.27, observed_unit: "°C/década (tasa media)",
    threshold_value: 0.2, threshold_unit: "°C/década",
    threshold_authority: "IPCC AR6 WG1 Ch.2 / SENAMHI",
    exceeds_threshold: true,
    exceeds_explanation: "Tasa de calentamiento de +0.27 °C/década supera el umbral de significancia estadística de +0.2 °C/década (IPCC AR6 WG1 Ch.2), confirmando tendencia atribuible al forzamiento antropogénico.",
    source: "SENAMHI — Tendencias climáticas 1980–2023; Thompson et al. (2023) Science",
    temporal_resolution: "annual", spatial_resolution: "regional",
    reference: "Vuille, M. et al. (2018). Earth-Science Reviews, 176.",
  },
  // Landslide
  {
    id: "landslide_huachipa_2017", event_type: "landslide",
    label: "Huayco Huachipa — Lima, 15 ene 2017",
    date_start: "2017-01-15", region: "lima_metropolitana",
    observed_value: 20, observed_unit: "° pendiente cuenca activada",
    threshold_value: 15, threshold_unit: "° pendiente",
    threshold_authority: "INGEMMET (2021)",
    exceeds_threshold: true,
    exceeds_explanation: "Pendiente de 20° supera el umbral INGEMMET (2021) de 15° para susceptibilidad moderada a huaycos. La combinación con 38 mm/día desencadenó el flujo de detritos en Huachipa.",
    source: "INDECI — Reporte emergencias 15-ene-2017; INGEMMET — Informe técnico",
    temporal_resolution: "daily", spatial_resolution: "local",
    reference: "INGEMMET (2021). Susceptibilidad a movimientos en masa en el Perú. Boletín Serie C.",
  },
  {
    id: "landslide_andes_2017", event_type: "landslide",
    label: "860+ huaycos activos — El Niño Costero, feb–abr 2017",
    date_start: "2017-02", region: "costa_sierra",
    observed_value: 860, observed_unit: "eventos huayco activos (INDECI)",
    threshold_value: 15, threshold_unit: "° pendiente (susceptibilidad moderada)",
    threshold_authority: "INGEMMET (2021)",
    exceeds_threshold: true,
    exceeds_explanation: "860 eventos de huayco registrados por INDECI en feb–abr 2017: el umbral de detonación INGEMMET fue excedido simultáneamente en más de 200 estaciones pluviométricas del país.",
    source: "INDECI — Compendio Estadístico 2017; SENAMHI — Boletín El Niño Costero",
    temporal_resolution: "monthly", spatial_resolution: "national",
    reference: "INDECI (2017). Compendio Estadístico del INDECI 2017. Lima.",
  },
  // Drought
  {
    id: "drought_altiplano_2004_2010", event_type: "drought",
    label: "Sequía altiplano sur — Puno/Cusco 2004–2010",
    date_start: "2004-01", region: "sierra_sur",
    observed_value: -25, observed_unit: "% déficit precipitación anual",
    threshold_value: -15, threshold_unit: "% déficit precipitación anual",
    threshold_authority: "SENAMHI / IPCC AR6",
    exceeds_threshold: true,
    exceeds_explanation: "Déficit de −25% supera el umbral SENAMHI/IPCC AR6 de −15% para sequía moderada, calificando como sequía severa sostenida durante 6 años consecutivos en el altiplano sur.",
    source: "SENAMHI Perú — Boletines hídricos 2004–2010; ANA — Lago Titicaca",
    temporal_resolution: "annual", spatial_resolution: "regional",
    reference: "SENAMHI (2010). Análisis de la sequía meteorológica altiplano sur 2004–2010.",
  },
  {
    id: "drought_sur_2016", event_type: "drought",
    label: "Sequía costa y sierra sur — 2015–2016",
    date_start: "2015-07", region: "costa_sur",
    observed_value: -38, observed_unit: "% déficit precipitación anual (Arequipa–Tacna)",
    threshold_value: -15, threshold_unit: "% déficit precipitación anual",
    threshold_authority: "SENAMHI / IPCC AR6",
    exceeds_threshold: true,
    exceeds_explanation: "Déficit de −38% supera el umbral de sequía severa (−30%) de SENAMHI, constituyendo el peor año hidrológico en la costa y sierra sur peruana en la década 2010–2020.",
    source: "SENAMHI Perú — Boletín Hídrico Nacional 2016; ANA",
    temporal_resolution: "monthly", spatial_resolution: "regional",
    reference: "SENAMHI (2016). Boletín Hídrico Nacional Nº 12/2016.",
  },
];

// ─── Type configuration ───────────────────────────────────────────────────────

const TYPE_CONFIG = {
  all:            { label: "Todos",          Icon: CalendarClock, color: "text-muted-foreground"  },
  enso:           { label: "ENSO",           Icon: Waves,         color: "text-blue-400"           },
  extreme_rain:   { label: "Lluvia extrema", Icon: Droplets,      color: "text-cyan-400"           },
  thermal_anomaly:{ label: "Calor",          Icon: Thermometer,   color: "text-orange-400"         },
  landslide:      { label: "Deslizamiento",  Icon: Mountain,      color: "text-amber-400"          },
  drought:        { label: "Sequía",         Icon: Sun,           color: "text-yellow-400"         },
};

const REGION_LABELS = {
  costa_norte:          "Costa Norte",
  costa_sur:            "Costa Sur",
  costa_central_norte:  "Costa Centro-Norte",
  costa_sierra:         "Costa / Sierra",
  lima_metropolitana:   "Lima Metropolitana",
  sierra_sur:           "Sierra Sur",
  sierra_nacional:      "Sierra (nacional)",
  amazonia:             "Amazonía",
  nacional:             "Perú (nacional)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistoricalEventsCard({ asset = null, traceability = null }) {
  const [activeFilter, setActiveFilter] = useState("all");

  const displayed = activeFilter === "all"
    ? HISTORICAL_EVENTS
    : HISTORICAL_EVENTS.filter(e => e.event_type === activeFilter);

  const filterCounts = Object.fromEntries(
    Object.keys(TYPE_CONFIG)
      .filter(k => k !== "all")
      .map(k => [k, HISTORICAL_EVENTS.filter(e => e.event_type === k).length])
  );

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Histórico observado
          </p>
          <h3 className="text-lg font-semibold mt-1">
            Eventos climáticos extremos — Perú
          </h3>
          {asset?.district && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {asset.district}
            </p>
          )}
        </div>
        <Badge variant="outline" className="gap-1 shrink-0">
          <CalendarClock className="w-3 h-3" />
          {HISTORICAL_EVENTS.length} eventos
        </Badge>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(TYPE_CONFIG).map(([key, { label, Icon, color }]) => {
          const count = key === "all" ? HISTORICAL_EVENTS.length : filterCounts[key];
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={[
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors",
                isActive
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-secondary-foreground",
              ].join(" ")}
            >
              <Icon className={`w-2.5 h-2.5 ${isActive ? "text-primary" : color}`} />
              {label}
              <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Event list */}
      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
        {displayed.map(evt => (
          <EventRow key={evt.id} event={evt} />
        ))}
        {displayed.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sin eventos para el filtro seleccionado.
          </p>
        )}
      </div>

      {/* Traceability footer */}
      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3 leading-relaxed">
        Fuentes: {traceability?.source || "NOAA CPC, SENAMHI Perú, INGEMMET 2021, IPCC AR6, WMO 2023, INDECI, ANA"} ·
        Período: observado 1980–2023 ·
        Umbrales: SENAMHI / NOAA CPC / INGEMMET / IPCC AR6 ·
        Distrito: {asset?.district || "ubicación georreferenciada"}
      </p>
    </div>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event: evt }) {
  const { Icon, color } = TYPE_CONFIG[evt.event_type] || { Icon: CalendarClock, color: "text-muted-foreground" };
  const regionLabel = REGION_LABELS[evt.region] || evt.region;

  const obsDisplay = `${evt.observed_value > 0 ? "+" : ""}${evt.observed_value} ${evt.observed_unit}`;
  const thrDisplay = `Umbral: ${evt.threshold_value > 0 ? "+" : ""}${evt.threshold_value} ${evt.threshold_unit}`;

  return (
    <div className="rounded-lg bg-secondary border border-border p-3 space-y-2">
      {/* Row 1: icon + label + date + region */}
      <div className="flex items-start gap-2">
        <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${color}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-secondary-foreground leading-snug">{evt.label}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{evt.date_start}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{regionLabel}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{evt.temporal_resolution} / {evt.spatial_resolution}</span>
          </div>
        </div>
        {/* Threshold badge */}
        <span className={[
          "text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0",
          evt.exceeds_threshold
            ? "bg-destructive/10 border-destructive/30 text-destructive"
            : "bg-secondary border-border text-muted-foreground",
        ].join(" ")}>
          {evt.exceeds_threshold ? "Supera umbral" : "Cerca del umbral"}
        </span>
      </div>

      {/* Row 2: observed value + threshold */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Observado</span>
          <span className="text-[10px] font-semibold text-secondary-foreground">{obsDisplay}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">·</span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{thrDisplay}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">·</span>
        <div className="flex items-center gap-1">
          <BookOpen className="w-2.5 h-2.5 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground">{evt.threshold_authority}</span>
        </div>
      </div>

      {/* Row 3: exceeds_explanation (the FASE B narrative) */}
      <div className="flex items-start gap-1.5 rounded bg-background/50 border border-border/50 px-2 py-1.5">
        <AlertCircle className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[10px] leading-relaxed text-foreground/75">{evt.exceeds_explanation}</p>
      </div>

      {/* Row 4: source + reference */}
      <p className="text-[9px] text-muted-foreground leading-snug">
        <span className="font-medium">Fuente:</span> {evt.source} ·{" "}
        <span className="italic">{evt.reference}</span>
      </p>
    </div>
  );
}
