import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { riskLevelStyle } from "./riskLevelStyles";

function PhenomenonCardV2({ phenomenon }) {
  const style = riskLevelStyle(phenomenon.risk_contribution?.level);
  return (
    <Card className="border-border">
      <CardContent className="py-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground capitalize">{phenomenon.name}</p>
          <Badge className={style.badge} variant="outline">{style.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{phenomenon.status}</p>
      </CardContent>
    </Card>
  );
}

/**
 * PhenomenaGridV2 — v2 counterpart of v1's RiskTimeline/RiskPeriodTabs.
 * The v2 pipeline does not yet group phenomena by temporal horizon or
 * scenario, so this is a flat current-state grid rather than a timeline.
 */
export default function PhenomenaGridV2({ phenomena }) {
  const list = phenomena || [];

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-8 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Sin fenómenos relevantes</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          El pipeline v2 no identificó fenómenos climáticos con riesgo asociado para esta ubicación y sector.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Fenómenos detectados
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((p, i) => (
          <PhenomenonCardV2 key={`${p.name}-${i}`} phenomenon={p} />
        ))}
      </div>
    </div>
  );
}
