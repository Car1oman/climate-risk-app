// @ts-nocheck
import { BookOpen, Database, ShieldCheck, TrendingUp, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SOURCE = "CMIP6 / IPCC AR6 / GRI / Open-Meteo";

const CONFIDENCE_COLORS = {
  high:   "text-green-400 border-green-400/40",
  medium: "text-amber-400 border-amber-400/40",
  low:    "text-slate-400 border-slate-400/40",
};

export default function ClimateStoryCard({ asset = null, climateData = null, evidence = null, traceability = null, signals = [] }) {
  const summary    = evidence?.summary    || climateData?.summary    || asset?.top_risk || "Senales climaticas en observacion";
  const source     = traceability?.source || climateData?.source     || SOURCE;
  const period     = traceability?.period || climateData?.period     || "Historico 1980-2014; proyeccion 2020-2059";
  const scenario   = traceability?.scenario || climateData?.scenario || "SSP245 / SSP585";
  const confidence = evidence?.confidence  || climateData?.confidence || "medium";

  const activeSignals = signals.filter(s => !["enso_phase", "landslide_risk", "huayco_risk"].includes(s.signalType));
  const ensoSignal    = signals.find(s => s.signalType === "enso_phase");
  const terrainSignal = signals.find(s => ["landslide_risk", "huayco_risk"].includes(s.signalType));

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storytelling climatico</p>
          <h3 className="text-lg font-semibold mt-1">{asset?.name || "Activo monitoreado"}</h3>
        </div>
        <Badge variant="outline" className={`gap-1 text-[10px] ${CONFIDENCE_COLORS[confidence] || CONFIDENCE_COLORS.medium}`}>
          <ShieldCheck className="w-3 h-3" />
          Confianza {confidence}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-foreground/85">
        {summary}. La lectura se presenta como evidencia descriptiva, sin convertir las senales
        en un score unico ni en impacto financiero estimado.
      </p>

      {activeSignals.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Senales detectadas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeSignals.slice(0, 4).map((signal, i) => (
              <SignalRow key={i} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {(ensoSignal || terrainSignal) && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contexto informacional</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ensoSignal    && <ContextRow label="ENSO" value={`Fase: ${ensoSignal.projected != null ? (ensoSignal.projected > 0 ? `El Nino (+${ensoSignal.projected.toFixed(2)}°C ONI)` : `La Nina (${ensoSignal.projected.toFixed(2)}°C ONI)`) : "activa"}`} />}
            {terrainSignal && <ContextRow label="Terreno" value={terrainSignal.threshold_reference || "Susceptibilidad topografica detectada"} />}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Meta icon={Database}   label="Fuente"        value={source} />
        <Meta icon={BookOpen}   label="Periodo"       value={period} />
        <Meta icon={ShieldCheck} label="Escenario SSP" value={scenario} />
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
        Interpretacion descriptiva basada en evidencia IPCC AR6, umbrales WRI/WMO y trazabilidad de fuentes.
        No representa ranking de riesgo, urgencia operativa ni perdida financiera estimada.
      </p>
    </div>
  );
}

function SignalRow({ signal }) {
  const labels = {
    extreme_heat:    "Calor extremo (Tmax > 35°C)",
    severe_heat:     "Calor severo (Tmax > 40°C)",
    tropical_nights: "Noches tropicales (Tmin > 20°C)",
    drought:         "Sequia / estres hidrico",
    extreme_rain:    "Lluvia extrema",
    temp_increase:   "Aumento temperatura media",
    flood_risk:      "Riesgo de inundacion",
  };
  const label = labels[signal.signalType] || signal.signalType;
  const delta = signal.delta != null
    ? (signal.delta >= 0 ? `+${Number(signal.delta).toFixed(1)}` : Number(signal.delta).toFixed(1))
    : null;
  const pct = signal.delta_pct != null
    ? (signal.delta_pct >= 0 ? `+${signal.delta_pct.toFixed(0)}%` : `${signal.delta_pct.toFixed(0)}%`)
    : null;
  const horizon = signal.horizon === "mid_term" ? "2040-2059" : "2020-2039";

  return (
    <div className="rounded-lg bg-secondary border border-border p-2.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="w-3 h-3 text-primary flex-shrink-0" />
        <p className="text-[11px] font-medium text-secondary-foreground leading-tight">{label}</p>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {delta ? `Delta: ${delta}` : ""}
        {pct    ? ` (${pct})` : ""}
        {` · ${horizon}`}
        {signal.confidence ? ` · Conf. ${signal.confidence}` : ""}
      </p>
    </div>
  );
}

function ContextRow({ label, value }) {
  return (
    <div className="rounded-lg bg-secondary border border-border p-2.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <p className="text-[11px] font-medium text-secondary-foreground">{label}</p>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{value}</p>
    </div>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-secondary p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <p className="text-xs text-secondary-foreground mt-1 leading-snug break-words">{value}</p>
    </div>
  );
}
