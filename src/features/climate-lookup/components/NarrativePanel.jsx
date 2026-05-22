// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart3, AlertTriangle } from "lucide-react";

export default function NarrativePanel({ narrative, location, metadata }) {
  const summary = narrative?.executive_summary;
  const metrics = narrative?.key_metrics ?? {};
  const distKm  = location?.distanceKm ?? metadata?.distance_km;

  if (!summary) return null;

  return (
    <Card className="border-2 border-primary/30 bg-card shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary flex-shrink-0" />
            Evaluación de riesgo climático
          </CardTitle>
          <Badge variant="outline" className="text-[10px] py-0 px-2">Evidencia descriptiva</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        <p className="text-sm leading-relaxed text-secondary-foreground">{summary}</p>

        {(metrics.total_señales > 0 || metadata?.scenario || metadata?.data_sources?.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {metrics.total_señales > 0 && (
              <div className="rounded-lg bg-secondary border border-border p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Señales</p>
                <p className="text-lg font-bold text-foreground">{metrics.total_señales}</p>
              </div>
            )}
            <div className="rounded-lg bg-secondary border border-border p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Escenario</p>
              <p className="text-sm font-bold text-foreground">{metadata?.scenario || "SSP245 / SSP585"}</p>
            </div>
            <div className="rounded-lg bg-secondary border border-border p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Confianza</p>
              <p className="text-sm font-bold text-foreground">{metadata?.confidence || "medium"}</p>
            </div>
          </div>
        )}

        {distKm != null && distKm > 30 && (
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/40 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <AlertDescription className="text-xs text-blue-900 dark:text-blue-200">
              Punto de datos más cercano: {distKm.toFixed(0)} km. Los resultados son orientativos.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-[10px] text-muted-foreground">
          Fuentes: {(metadata?.data_sources ?? []).join(" · ") || "climate_cells · GRI · Open-Meteo · World Bank"}
          {metadata?.scenario && ` · ${metadata.scenario}`}
        </p>
      </CardContent>
    </Card>
  );
}
