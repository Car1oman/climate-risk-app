import { Badge } from "@/components/ui/badge";
import { cn, getRiskColor } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ExternalLink, BookOpen, MapPin, ShieldCheck } from "lucide-react";

const LEVEL_ORDER = { critico: 0, alto: 1, medio: 2, bajo: 3 };
const LEVEL_LABELS = { critico: "observacion alta", alto: "observacion alta", medio: "monitoreo", bajo: "seguimiento" };

export default function TopRisksTable({ assets }) {
  const sorted = [...assets]
    .sort((a, b) => (LEVEL_ORDER[a.risk_level] ?? 9) - (LEVEL_ORDER[b.risk_level] ?? 9))
    .slice(0, 8);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Activos con senales para revisar
        </h3>
        <Link to="/assets" className="text-xs text-primary hover:underline flex items-center gap-1">
          Ver todos <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-3">
        {sorted.map((asset) => {
          const rc = getRiskColor(asset.risk_level);
          const signal = asset.top_risk || "Senales climaticas por contextualizar";

          return (
            <Link
              key={asset.id}
              to={`/assets/${asset.id}`}
              className="block p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0", rc.dot)} />
                    <h4 className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                      {asset.name}
                    </h4>
                    <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", rc.bg, rc.text, rc.border)}>
                      {LEVEL_LABELS[asset.risk_level] || "sin clasificar"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-2">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {asset.district || "Sin distrito"}
                    </div>
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Confianza media
                    </div>
                  </div>
                  <p className="text-xs text-foreground/75 leading-relaxed">
                    Senal observada: {signal}. Fuente: GRI / CMIP6 / Open-Meteo. Periodo: historico 1980-2014 y
                    proyeccion 2020-2059. Escenarios: SSP245 y SSP585.
                  </p>
                </div>
                <BookOpen className={cn("w-5 h-5 flex-shrink-0", rc.color)} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
