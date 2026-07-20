import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ShieldAlert, Info } from "lucide-react";
import { riskLevelStyle } from "./riskLevelStyles";

/**
 * RiskSummaryV2 — executive hero card for the v2 pipeline result.
 * Mirrors ExecutiveSummaryCard's role in v1. Ya no asume "escenario único
 * sin etiqueta": muestra el escenario realmente usado (scenario_requested,
 * proyectado por Stage 07 — auditoría de brecha funcional D1 §2) y, cuando
 * el propio pipeline declara que no cumple su cobertura de evaluación
 * multi-escenario/horizonte (overall_risk.evaluation_coverage_summary), lo
 * hace visible en vez de ocultarlo — mismo principio de "no ocultar
 * incertidumbre" de la auditoría de transformación de datos.
 */
export default function RiskSummaryV2({ response }) {
  if (!response) return null;
  const { location, overall_risk, executive_summary, confidence_note, scenario_requested_label } = response;
  const style = riskLevelStyle(overall_risk?.level);
  const coverage = overall_risk?.evaluation_coverage_summary;

  return (
    <Card className="border-border">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{location?.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {scenario_requested_label && (
              <Badge variant="secondary" className="text-[11px]">{scenario_requested_label}</Badge>
            )}
            <Badge className={`gap-1.5 ${style.badge}`} variant="outline">
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
              Riesgo {style.label}
            </Badge>
          </div>
        </div>

        <p className="text-sm text-foreground leading-relaxed">{executive_summary}</p>

        {confidence_note && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{confidence_note}</span>
          </div>
        )}

        {coverage && coverage.meets_contract === false && (
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-secondary/20 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{coverage.reason}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
