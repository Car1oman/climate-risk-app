// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { GRI_BADGE, GRI_ICONS } from "../constants";

export default function GRIThreatsPanel({ hazards }) {
  const filtered = (hazards ?? [])
    .filter(h => h.baseline?.score && h.baseline.score !== "sin data")
    .sort((a, b) => {
      const order = { alto: 3, medio: 2, bajo: 1 };
      return (order[b.baseline?.score] ?? 0) - (order[a.baseline?.score] ?? 0);
    });

  if (!filtered.length) return null;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-foreground">Exposición a amenazas</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Fuente: GRI Infrastructure Resilience · probabilidad histórica y proyecciones</p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {filtered.map(h => {
          const scoreKey    = (h.baseline?.score ?? "sin data").toLowerCase();
          const badgeCls    = GRI_BADGE[scoreKey] ?? GRI_BADGE["sin data"];
          const icon        = GRI_ICONS[h.hazard] ?? "⚠️";
          const futureScore = h.future_high_emissions?.score ?? h.future_low_emissions?.score;
          const hasChange   = futureScore && futureScore !== h.baseline?.score;

          return (
            <div key={h.hazard} className="rounded-lg border border-border p-3 flex items-center justify-between gap-3 bg-secondary">
              <div className="flex items-center gap-3">
                <span className="text-lg leading-none">{icon}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{h.hazard_name}</p>
                  {hasChange && (
                    <p className="text-[10px] text-muted-foreground">
                      Proyección: {h.baseline?.score} → {futureScore}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] py-0.5 px-2 font-semibold border flex-shrink-0 ${badgeCls}`}>
                {h.baseline?.score}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
