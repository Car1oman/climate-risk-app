import { LineChart, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ProjectionScenarioCard({ scenario = "SSP245", climateData = null, signals = [], traceability = null }) {
  const projectedSignals = signals.slice(0, 4);

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Proyecciones CMIP6</p>
          <h3 className="text-lg font-semibold mt-1">Escenario {scenario}</h3>
        </div>
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="w-3 h-3" />
          {traceability?.confidence || climateData?.confidence || "medium"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(projectedSignals.length ? projectedSignals : fallbackSignals).map((signal, index) => (
          <div key={`${signal.signalType || signal.label}-${index}`} className="rounded-lg border border-border bg-secondary p-3">
            <div className="flex items-center gap-2">
              <LineChart className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-semibold text-secondary-foreground">
                {signal.label || signal.signalType || "Senal climatica"}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Historico: {formatValue(signal.historical)} · Proyectado: {formatValue(signal.projected)}
              {signal.horizon ? ` · Horizonte: ${signal.horizon}` : ""}
            </p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Fuente: {traceability?.source || climateData?.source || "CMIP6 via Open-Meteo / IPCC AR6"} · Periodo:
        {traceability?.period || " 2020-2059"} · Escenario SSP: {scenario} · Metadata cientifica:
        {traceability?.metadata || " ensamble climatico, horizonte temporal y trazabilidad de fuente"}
      </p>
    </div>
  );
}

const fallbackSignals = [
  { label: "Temperatura media", historical: "base historica", projected: "tendencia ascendente" },
  { label: "Lluvia extrema", historical: "eventos observados", projected: "variabilidad aumentada" },
];

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "sin dato";
  if (typeof value === "number") return Number(value).toFixed(1);
  return value;
}
