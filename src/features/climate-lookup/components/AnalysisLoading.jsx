// @ts-nocheck
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function AnalysisLoading() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-6 flex flex-col items-center gap-3 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <div>
          <p className="text-sm font-medium text-secondary-foreground">Ejecutando análisis climático</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consultando climate_cells · GRI · Open-Meteo · World Bank
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
