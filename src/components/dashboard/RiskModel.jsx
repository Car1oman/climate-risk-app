import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertCircle, TrendingUp, BarChart3, Zap, Shield } from "lucide-react";

export default function RiskModel({ riskData, asset }) {
  if (!riskData) return null;

  const { H, E, I, R } = riskData.formula;

  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="flex items-center gap-3">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Modelo de Riesgo Climático</h3>
      </div>

      {/* Fórmula Aplicada */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fórmula de Cálculo</p>
        <div className="space-y-2">
          <p className="text-sm font-mono text-foreground">{riskData.formula.weights}</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-muted/50 p-2 rounded">
              <p className="text-muted-foreground">Hazard (H)</p>
              <p className="font-semibold">{H}%</p>
            </div>
            <div className="bg-muted/50 p-2 rounded">
              <p className="text-muted-foreground">Exposure (E)</p>
              <p className="font-semibold">{E}%</p>
            </div>
            <div className="bg-muted/50 p-2 rounded">
              <p className="text-muted-foreground">Impact (I)</p>
              <p className="font-semibold">{I}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Score Final */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Risk Score Final</p>
            <p className="text-4xl font-bold text-foreground">{R}</p>
            <p className="text-xs text-muted-foreground mt-1">Escala 0–100 (normalizada)</p>
          </div>
          <Badge className={cn(
            "px-3 py-1 text-sm font-semibold",
            riskData.riskLevel === "critico" ? "bg-red-500/20 text-red-400 border-red-500/30" :
            riskData.riskLevel === "alto" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
            riskData.riskLevel === "medio" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
            "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          )}>
            {riskData.riskLevel.charAt(0).toUpperCase() + riskData.riskLevel.slice(1)}
          </Badge>
        </div>
      </div>

      {/* Amenazas Dominantes */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amenazas Dominantes</p>
        <div className="space-y-2">
          {riskData.topHazards.length > 0 ? (
            riskData.topHazards.map((hazard, idx) => (
              <div key={idx} className="bg-card border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-warning" />
                    <span className="font-medium text-sm">{hazard.label}</span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 bg-muted rounded">{hazard.level}/4</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>Peso: {(hazard.weight * 100).toFixed(0)}%</p>
                  <p>Horizonte: {hazard.horizon}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No hay amenazas identificadas</p>
          )}
        </div>
      </div>

      {/* Impacto Financiero Estimado */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-warning" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Impacto Financiero Estimado</p>
        </div>
        <div className="text-2xl font-bold text-foreground">
          S/ {riskData.financialImpact.toLocaleString('es-PE')}
        </div>
        <p className="text-xs text-muted-foreground">
          Pérdida potencial en caso de evento climático en los próximos 12 meses
        </p>
      </div>

      {/* Insight Narrativo */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground leading-relaxed">{riskData.narrative}</p>
        </div>
      </div>

      {/* Recomendaciones */}
      {riskData.recommendations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recomendaciones de Adaptación</p>
          </div>
          <div className="space-y-2">
            {riskData.recommendations.map((rec, idx) => (
              <div key={idx} className="bg-card border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm">{rec.title}</h4>
                  <Badge variant="outline" className={cn(
                    "text-xs whitespace-nowrap",
                    rec.priority === "crítica" ? "border-red-500/30 text-red-400" :
                    rec.priority === "alta" ? "border-orange-500/30 text-orange-400" :
                    "border-yellow-500/30 text-yellow-400"
                  )}>
                    {rec.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{rec.description}</p>
                <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  ✓ {rec.impact}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
