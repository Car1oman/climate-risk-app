// @ts-nocheck
import { LineChart, ShieldCheck, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SSP_META = {
  ssp245: { label: "SSP2-4.5", badge: "Moderado", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30" },
  ssp585: { label: "SSP5-8.5", badge: "Pesimista", color: "text-red-400",  bg: "bg-red-400/10  border-red-400/30"  },
};

const SIGNAL_LABELS = {
  extreme_heat:    "Calor extremo (dias Tmax > 35°C)",
  severe_heat:     "Calor severo  (dias Tmax > 40°C)",
  tropical_nights: "Noches tropicales (Tmin > 20°C)",
  drought:         "Sequia / estres hidrico",
  extreme_rain:    "Lluvia extrema (rx5day / rx1day)",
  temp_increase:   "Temperatura media (delta)",
  flood_risk:      "Riesgo de inundacion",
};

export default function ProjectionScenarioCard({ scenario = "SSP245 / SSP585", climateData = null, signals = [], traceability = null }) {
  const projectedSignals = signals.filter(s => !["enso_phase","landslide_risk","huayco_risk"].includes(s.signalType)).slice(0, 6);
  const sspKey = (traceability?.scenario || scenario || "").toLowerCase().includes("585") ? "ssp585" : "ssp245";
  const sspMeta = SSP_META[sspKey] || SSP_META.ssp245;

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Proyecciones CMIP6</p>
          <h3 className="text-lg font-semibold mt-1">Escenario {scenario}</h3>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <ShieldCheck className="w-3 h-3" />
          {traceability?.confidence || climateData?.confidence || "medium"}
        </Badge>
      </div>

      {/* SSP scenario blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ScenarioBlock
          code="SSP2-4.5"
          badge="Moderado"
          period="2020–2059"
          desc="Emisiones intermedias · tendencias actuales · +2.1°C a +3.5°C hacia 2100"
          colorClass="text-amber-400"
          bgClass="bg-amber-400/5 border-amber-400/30"
        />
        <ScenarioBlock
          code="SSP5-8.5"
          badge="Pesimista"
          period="2020–2059"
          desc="Altas emisiones · desarrollo fosil · +3.3°C a +5.7°C hacia 2100"
          colorClass="text-red-400"
          bgClass="bg-red-400/5 border-red-400/30"
        />
      </div>

      {/* Detected signals */}
      {projectedSignals.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Senales proyectadas detectadas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {projectedSignals.map((signal, i) => (
              <SignalProjectionRow key={i} signal={signal} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Variables de referencia</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DEFAULT_SIGNALS.map((s, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary p-2.5">
                <div className="flex items-center gap-1.5">
                  <LineChart className="w-3 h-3 text-primary" />
                  <p className="text-[11px] font-medium text-secondary-foreground">{s.label}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{s.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3">
        Fuente: {traceability?.source || "CMIP6 ensemble via Supabase climate_cells / Open-Meteo"} ·
        Periodo: {traceability?.period || "2020–2059"} ·
        Escenario SSP: {scenario} ·
        Metadata: {traceability?.metadata || "ensamble multi-modelo, horizonte temporal, trazabilidad de fuente y confianza por senial"}
      </p>
    </div>
  );
}

function ScenarioBlock({ code, badge, period, desc, colorClass, bgClass }) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${bgClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold font-mono ${colorClass}`}>{code}</span>
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0.5 ${colorClass} border-current/40`}>{badge}</Badge>
      </div>
      <p className="text-[10px] text-muted-foreground">{period}</p>
      <p className="text-[10px] text-secondary-foreground/80 leading-snug">{desc}</p>
    </div>
  );
}

function SignalProjectionRow({ signal }) {
  const label = SIGNAL_LABELS[signal.signalType] || signal.signalType;
  const horizon = signal.horizon === "mid_term" ? "2040-2059" : "2020-2039";

  const historical = signal.historical != null ? Number(signal.historical).toFixed(1) : "—";
  const projected  = signal.projected  != null ? Number(signal.projected ).toFixed(1) : "—";
  const delta = signal.delta != null
    ? (signal.delta >= 0 ? `+${Number(signal.delta).toFixed(1)}` : Number(signal.delta).toFixed(1))
    : null;

  const Icon = signal.delta != null && signal.delta < 0 ? TrendingDown : TrendingUp;

  // Uncertainty spread from source_traceability
  const spread = signal.source_traceability?.uncertainty_spread;
  const hasSpread = spread?.p10 != null && spread?.p90 != null;

  return (
    <div className="rounded-lg border border-border bg-secondary p-2.5 space-y-1.5">
      <div className="flex items-start gap-1.5">
        <Icon className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-[11px] font-medium text-secondary-foreground leading-tight">{label}</p>
      </div>
      <div className="text-[10px] text-muted-foreground space-y-0.5">
        <p>Hist: <span className="text-secondary-foreground">{historical}</span> · Proy: <span className="text-secondary-foreground">{projected}</span>{delta ? ` · Delta: ${delta}` : ""}</p>
        <p>Horizonte: {horizon} · Conf: {signal.confidence || "—"}</p>
        {hasSpread && <p className="text-[9px] text-muted-foreground/70">Rango CMIP6: [{Number(spread.p10).toFixed(1)}, {Number(spread.p90).toFixed(1)}]</p>}
      </div>
    </div>
  );
}

const DEFAULT_SIGNALS = [
  { label: "Temperatura media",  note: "Delta vs historico 1980-2014 bajo SSP245/SSP585" },
  { label: "Lluvia extrema",     note: "Variabilidad proyectada en rx5day y rx1day" },
  { label: "Dias calurosos",     note: "Incremento en dias con Tmax > 35°C (hd35)" },
  { label: "Estres hidrico",     note: "Cambio en precipitacion anual (prpercnt)" },
];
