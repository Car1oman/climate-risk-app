import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ShieldAlert } from "lucide-react";
import { riskLevelStyle } from "./riskLevelStyles";

/**
 * RiskSummaryV2 — executive hero card for the v2 pipeline result.
 * Mirrors ExecutiveSummaryCard's role in v1, but the v2 pipeline has no
 * temporal periods or scenarios yet: it produces a single, current-state
 * risk read per query.
 */
export default function RiskSummaryV2({ response }) {
  if (!response) return null;
  const { location, overall_risk, executive_summary, confidence_note } = response;
  const style = riskLevelStyle(overall_risk?.level);

  return (
    <Card className="border-border">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{location?.name}</span>
          </div>
          <Badge className={`gap-1.5 ${style.badge}`} variant="outline">
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
            Riesgo {style.label}
          </Badge>
        </div>

        <p className="text-sm text-foreground leading-relaxed">{executive_summary}</p>

        {confidence_note && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{confidence_note}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
