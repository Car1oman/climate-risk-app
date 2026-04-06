import { getRiskColor, formatCurrency } from "@/lib/riskEngine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

export default function TopRisksTable({ assets }) {
  const sorted = [...assets]
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, 8);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Activos de Mayor Riesgo
        </h3>
        <Link to="/assets" className="text-xs text-primary hover:underline flex items-center gap-1">
          Ver todos <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {sorted.map((asset) => {
          const rc = getRiskColor(asset.risk_level);
          return (
            <Link
              key={asset.id}
              to={`/assets/${asset.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", rc.dot)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {asset.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{asset.district}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs font-mono text-muted-foreground">
                  {formatCurrency(asset.financial_impact || 0)}
                </span>
                <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", rc.bg, rc.text, rc.border)}>
                  {((asset.risk_score || 0) * 100).toFixed(0)}
                </Badge>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}