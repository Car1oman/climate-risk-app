import { getRiskColor, formatCurrency } from "@/lib/riskEngine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ExternalLink, AlertTriangle, TrendingUp, MapPin } from "lucide-react";

export default function TopRisksTable({ assets }) {
  const sorted = [...assets]
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, 8);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Activos que requieren atención
        </h3>
        <Link to="/assets" className="text-xs text-primary hover:underline flex items-center gap-1">
          Ver todos <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-3">
        {sorted.map((asset) => {
          const rc = getRiskColor(asset.risk_level);
          const riskScore = (asset.risk_score || 0) * 100;
          const impact = asset.financial_impact || 0;

          // Narrativa simple basada en el nivel de riesgo
          const getNarrative = () => {
            if (asset.risk_level === "critico") {
              return `Riesgo extremo detectado. Requiere acción inmediata para mitigar impactos potenciales de hasta ${formatCurrency(impact)}.`;
            } else if (asset.risk_level === "alto") {
              return `Alto riesgo identificado. Se recomienda implementar medidas preventivas para proteger la operación.`;
            } else if (asset.risk_level === "medio") {
              return `Riesgo moderado presente. Monitoreo continuo recomendado para evitar escalada.`;
            } else {
              return `Riesgo bajo pero presente. Mantener precauciones básicas de gestión climática.`;
            }
          };

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
                      {riskScore.toFixed(0)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {asset.district}
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Impacto: {formatCurrency(impact)}
                    </div>
                  </div>
                  <p className="text-xs text-foreground/75 leading-relaxed">
                    {getNarrative()}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <AlertTriangle className={cn("w-5 h-5", rc.color)} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}