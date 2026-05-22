// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Thermometer } from "lucide-react";
import { SIGNAL_META, HORIZON_LABEL } from "../constants";
import { fmtNum } from "../utils";
import { TraceBadges, TraceabilityDetails } from "./TraceabilityWidgets";

function SignalRow({ signal }) {
  const meta  = SIGNAL_META[signal.signalType] ?? { icon: "⚠️", label: signal.signalType, unit: "" };
  const isGRI = signal.indicator?.startsWith("gri_");
  const trace = signal.source_traceability;
  const sign  = (signal.delta ?? 0) >= 0 ? "+" : "";
  const conf  = signal.confidence;
  const confColor = conf === "high"
    ? "text-emerald-600 dark:text-emerald-400"
    : conf === "medium" ? "text-amber-600 dark:text-amber-400"
    : "text-slate-400";

  const fmtVal   = (v) => v == null ? "—" : isGRI ? `${(v * 100).toFixed(0)}%` : fmtNum(v);
  const unit     = isGRI ? "" : meta.unit;
  const fmtDelta = (v) => v == null ? null : isGRI
    ? `${sign}${(v * 100).toFixed(0)}pp`
    : `${sign}${fmtNum(v)}`;

  return (
    <div className="rounded-lg border border-border bg-secondary p-3 space-y-2">
      <TraceBadges trace={trace} />

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <span className="text-base leading-none">{meta.icon}</span>
          {meta.label}
          {isGRI && <span className="text-[9px] font-normal text-slate-400 ml-1">GRI</span>}
        </span>
        <span className={`text-[10px] font-semibold ${confColor}`}>{conf}</span>
      </div>

      <div className="flex items-center gap-2 font-mono text-xs text-secondary-foreground">
        <span className="tabular-nums">{fmtVal(signal.historical)}</span>
        <span className="text-border">→</span>
        <span className="tabular-nums font-bold text-foreground">{fmtVal(signal.projected)}</span>
        {unit && <span className="text-muted-foreground font-sans">{unit}</span>}
        {signal.delta != null && (
          <span className="ml-auto text-muted-foreground">({fmtDelta(signal.delta)})</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">{HORIZON_LABEL[signal.horizon] ?? signal.horizon}</p>
        {signal.threshold_reference && (
          <p className="text-[10px] text-muted-foreground truncate max-w-[55%] text-right" title={signal.threshold_reference}>
            {signal.threshold_reference.slice(0, 45)}…
          </p>
        )}
      </div>

      <TraceabilityDetails trace={trace} />
    </div>
  );
}

export default function SignalsPanel({ signals }) {
  const list = signals?.signals ?? [];
  if (!list.length) return null;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-foreground">
            Señales climáticas detectadas
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">({list.length})</span>
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Cuantitativas (IPCC AR6 / WRI Aqueduct) + cualitativas GRI · histórico vs. proyectado
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-4">
        {list.map((s, i) => <SignalRow key={i} signal={s} />)}
      </CardContent>
    </Card>
  );
}
