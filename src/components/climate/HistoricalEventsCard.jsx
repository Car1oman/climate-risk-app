// @ts-nocheck
import { CalendarClock, MapPin, ThermometerSun, Droplets, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SIGNAL_ICONS = {
  extreme_heat:    ThermometerSun,
  severe_heat:     ThermometerSun,
  tropical_nights: ThermometerSun,
  drought:         Wind,
  extreme_rain:    Droplets,
  temp_increase:   ThermometerSun,
  flood_risk:      Droplets,
};

const SIGNAL_LABELS = {
  extreme_heat:    "Calor extremo (Tmax > 35°C)",
  severe_heat:     "Calor severo  (Tmax > 40°C)",
  tropical_nights: "Noches tropicales (Tmin > 20°C)",
  drought:         "Sequia / estres hidrico",
  extreme_rain:    "Lluvia extrema",
  temp_increase:   "Temperatura media",
  flood_risk:      "Riesgo de inundacion",
};

const INDICATOR_UNITS = {
  hd35: "dias/año", hd40: "dias/año", tr: "dias/año",
  rx1day: "mm", rx5day: "mm",
  tas: "°C", tasmax: "°C", txx: "°C",
  pr: "mm", prpercnt: "% vs hist",
  cdd: "dias",
  flood_probability: "prob",
  gri_flood_probability: "prob", gri_drought_probability: "prob", gri_heat_probability: "prob",
};

const DEFAULT_EVENTS = [
  { icon: Droplets,      text: "Lluvias intensas y anegamientos urbanos documentados en Lima durante eventos El Nino costero." },
  { icon: Wind,          text: "Interrupciones operativas historicas asociadas a drenaje urbano, accesos viales y abastecimiento." },
  { icon: CalendarClock, text: "Registros GRI y fuentes abiertas usados como contexto territorial, no como ranking financiero." },
];

export default function HistoricalEventsCard({ asset = null, signals = [], traceability = null }) {
  const historicalSignals = signals.filter(s =>
    !["enso_phase","landslide_risk","huayco_risk"].includes(s.signalType) && s.historical != null
  ).slice(0, 5);

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historico observado</p>
          <h3 className="text-lg font-semibold mt-1">Baseline CMIP6 · 1980–2014</h3>
        </div>
        <Badge variant="outline" className="gap-1">
          <CalendarClock className="w-3 h-3" />
          1980–2014
        </Badge>
      </div>

      <div className="space-y-2">
        {historicalSignals.length > 0 ? (
          historicalSignals.map((signal, i) => (
            <HistoricalRow key={i} signal={signal} />
          ))
        ) : (
          DEFAULT_EVENTS.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-secondary border border-border p-3">
              <Icon className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs leading-relaxed text-secondary-foreground">{text}</p>
            </div>
          ))
        )}
      </div>

      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3">
        Fuente: {traceability?.source || "CMIP6 climate_cells (Supabase) / GRI / Open-Meteo"} ·
        Periodo: 1980–2014 (baseline historico CMIP6) ·
        Escenario: no aplica (observado) ·
        Confianza: {traceability?.confidence || "high"} ·
        Distrito: {asset?.district || "ubicacion georreferenciada"}
      </p>
    </div>
  );
}

function HistoricalRow({ signal }) {
  const label   = SIGNAL_LABELS[signal.signalType] || signal.signalType;
  const Icon    = SIGNAL_ICONS[signal.signalType]  || MapPin;
  const unit    = INDICATOR_UNITS[signal.indicator] || "";
  const hist    = signal.historical != null ? `${Number(signal.historical).toFixed(1)} ${unit}`.trim() : "sin dato";
  const proj    = signal.projected  != null ? `${Number(signal.projected ).toFixed(1)} ${unit}`.trim() : "sin dato";
  const delta   = signal.delta != null
    ? (signal.delta >= 0 ? `+${Number(signal.delta).toFixed(1)}` : `${Number(signal.delta).toFixed(1)}`)
    : null;
  const horizon = signal.horizon === "mid_term" ? "2040-2059" : "2020-2039";
  const conf    = signal.confidence || "—";

  const spread    = signal.source_traceability?.uncertainty_spread;
  const hasSpread = spread?.p10 != null && spread?.p90 != null;

  return (
    <div className="flex items-start gap-2 rounded-lg bg-secondary border border-border p-3">
      <Icon className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium text-secondary-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">
          Baseline: <span className="text-secondary-foreground">{hist}</span>
          {" · "}Proyectado ({horizon}): <span className="text-secondary-foreground">{proj}</span>
          {delta ? <> · Delta: <span className="text-primary">{delta}</span></> : null}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Indicador: {signal.indicator || "—"} · Conf: {conf}
          {hasSpread && <> · Rango CMIP6: [{Number(spread.p10).toFixed(1)}, {Number(spread.p90).toFixed(1)}]</>}
        </p>
      </div>
    </div>
  );
}
