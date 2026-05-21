import { BookOpen, Database, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SOURCE = "CMIP6 / IPCC AR6 / GRI / Open-Meteo";

export default function ClimateStoryCard({ asset = null, climateData = null, evidence = null, traceability = null }) {
  const summary = evidence?.summary || climateData?.summary || asset?.top_risk || "Senales climaticas en observacion";
  const source = traceability?.source || climateData?.source || SOURCE;
  const period = traceability?.period || climateData?.period || "Historico 1980-2014; proyeccion 2020-2059";
  const scenario = traceability?.scenario || climateData?.scenario || "SSP245 / SSP585";
  const confidence = evidence?.confidence || climateData?.confidence || "medium";

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storytelling climatico</p>
          <h3 className="text-lg font-semibold mt-1">{asset?.name || "Activo monitoreado"}</h3>
        </div>
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="w-3 h-3" />
          Confianza {confidence}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-foreground/85">
        {summary}. La lectura se presenta como evidencia descriptiva, sin convertir las senales en un score
        unico ni en impacto financiero estimado.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Meta icon={Database} label="Fuente" value={source} />
        <Meta icon={BookOpen} label="Periodo" value={period} />
        <Meta icon={ShieldCheck} label="Escenario SSP" value={scenario} />
      </div>
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
