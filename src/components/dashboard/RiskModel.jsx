import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertCircle, TrendingUp, Info, CheckCircle2, Cloud, Building2, DollarSign } from "lucide-react";

export default function RiskModel({ riskData, asset }) {
  if (!riskData) return null;

  const { H, E, I, R } = riskData.formula;
  const riskLevelLabels = {
    critico: { label: "Crítico", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", advice: "Requiere acción inmediata" },
    alto: { label: "Alto", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", advice: "Implementar medidas urgentes" },
    medio: { label: "Medio", color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", advice: "Monitorear y prepararse" },
    bajo: { label: "Bajo", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30", advice: "Mantener precauciones básicas" },
  };

  const levelInfo = riskLevelLabels[riskData.riskLevel] || riskLevelLabels.bajo;

  return (
    <div className="space-y-6">
      {/* Título Principal - Menos Técnico */}
      <div className="flex items-center gap-3">
        <AlertCircle className={cn("w-6 h-6", levelInfo.color)} />
        <div>
          <h3 className="text-xl font-bold text-foreground">¿Cuál es el Riesgo Climático de esta Tienda?</h3>
          <p className="text-sm text-muted-foreground mt-1">Análisis de vulnerabilidad y recomendaciones</p>
        </div>
      </div>

      {/* Nivel de Riesgo Principal - Destacado */}
      <div className={cn(
        "rounded-lg p-6 border space-y-3",
        levelInfo.bg,
        levelInfo.border
      )}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Nivel de Riesgo Total</p>
            <p className={cn("text-5xl font-bold", levelInfo.color)}>{R}</p>
            <p className="text-xs text-muted-foreground mt-2">de 100 (escala de riesgo)</p>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={cn(
              "px-4 py-2 text-sm font-semibold border",
              levelInfo.bg,
              levelInfo.color,
              levelInfo.border
            )}>
              {levelInfo.label}
            </Badge>
            <p className="text-xs text-muted-foreground mt-3">{levelInfo.advice}</p>
          </div>
        </div>
      </div>

      {/* Explicación: ¿Cómo se calcula? */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="font-medium text-sm text-foreground">¿Cómo se calcula este riesgo?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              El nivel de riesgo se calcula considerando tres factores principales que se combinan matematicamente:
            </p>
            <div className="space-y-2 mt-3">
              <div className="flex gap-2 text-xs">
                <span className="font-semibold text-blue-400 min-w-fit">1. Amenazas:</span>
                <span className="text-muted-foreground">Las condiciones climáticas que podrían afectar la zona (como inundaciones, terremotos o calor extremo)</span>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="font-semibold text-blue-400 min-w-fit">2. Exposición:</span>
                <span className="text-muted-foreground">Qué tan vulnerable es esta tienda por su tamaño, tipo de negocio y características</span>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="font-semibold text-blue-400 min-w-fit">3. Impacto:</span>
                <span className="text-muted-foreground">Cuánto afectaría económicamente un evento climático a la operación</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desglose de Factores - Amigable */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">¿Qué compone este riesgo?</p>
        
        {/* Factor 1: Amenazas */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-sky-400" />
            <div className="flex-1">
              <p className="font-medium text-sm">Amenazas Climáticas en la Zona</p>
              <p className="text-xs text-muted-foreground">{H}% de influencia en el riesgo total</p>
            </div>
          </div>
          <div className="bg-muted/40 rounded p-3 space-y-2">
            <p className="text-xs font-medium text-foreground mb-2">Se han identificado estas condiciones:</p>
            {riskData.topHazards.length > 0 ? (
              <div className="space-y-2">
                {riskData.topHazards.map((hazard, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{hazard.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{hazard.level}/4</span>
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-sky-500 transition-all"
                          style={{ width: `${(hazard.level / 4) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin amenazas significativas</p>
            )}
          </div>
        </div>

        {/* Factor 2: Exposición */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-sm">Vulnerabilidad de la Tienda</p>
              <p className="text-xs text-muted-foreground">{E}% de influencia en el riesgo total</p>
            </div>
          </div>
          <div className="bg-muted/40 rounded p-3">
            <p className="text-xs text-muted-foreground mb-2">
              {E > 75 ? "Esta tienda tiene una exposición muy alta debido a:" :
               E > 50 ? "Esta tienda tiene una exposición moderada-alta debido a:" :
               E > 25 ? "Esta tienda tiene una exposición moderada debido a:" :
               "Esta tienda tiene una exposición baja debido a:"}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Tamaño: {asset.area_m2?.toLocaleString() || "1000"} m²</li>
              <li>Tipo: {asset.type === "Centro distribución" ? "Centro de Distribución (Alto volumen)" : 
                        asset.type === "supermercado_grande" ? "Supermercado Grande (Gran volumen)" :
                        asset.type === "supermercado_mediano" ? "Supermercado Mediano" : "Tienda Express"}</li>
              <li>Volumen de ventas: {asset.monthly_sales ? `S/ ${(asset.monthly_sales / 1000000).toFixed(1)}M mensuales` : "No especificado"}</li>
            </ul>
          </div>
        </div>

        {/* Factor 3: Impacto Financiero */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <div className="flex-1">
              <p className="font-medium text-sm">Impacto Financiero Potencial</p>
              <p className="text-xs text-muted-foreground">{I}% de influencia en el riesgo total</p>
            </div>
          </div>
          <div className="bg-muted/40 rounded p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-muted-foreground">Pérdida potencial en 12 meses:</p>
              <p className="text-lg font-bold text-emerald-400">S/ {riskData.financialImpact.toLocaleString('es-PE')}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              En caso de evento climático grave, este es el monto estimado que podría perderse por cierre operativo, daños y recuperación.
            </p>
          </div>
        </div>
      </div>

      {/* Insight Narrativo - Consultivo */}
      <div className={cn(
        "rounded-lg p-4 border",
        levelInfo.bg,
        levelInfo.border
      )}>
        <div className="flex gap-3">
          <AlertCircle className={cn("w-5 h-5 flex-shrink-0 mt-0.5", levelInfo.color)} />
          <div className="space-y-2">
            <p className="font-semibold text-sm text-foreground">Análisis y Recomendación</p>
            <p className="text-sm leading-relaxed text-foreground">{riskData.narrative}</p>
          </div>
        </div>
      </div>

      {/* Recomendaciones - Enfocadas en Acción */}
      {riskData.recommendations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <p className="font-semibold text-sm text-foreground">¿Qué puedes hacer al respecto?</p>
          </div>
          <div className="space-y-2">
            {riskData.recommendations.map((rec, idx) => (
              <div key={idx} className="bg-card border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-foreground">{rec.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    rec.priority === "crítica" ? "border-red-500/50 text-red-400 bg-red-500/5" :
                    rec.priority === "alta" ? "border-orange-500/50 text-orange-400 bg-orange-500/5" :
                    "border-yellow-500/50 text-yellow-400 bg-yellow-500/5"
                  )}>
                    {rec.priority === "crítica" ? "🔴 Urgente" :
                     rec.priority === "alta" ? "🟠 Prioridad Alta" : "🟡 Deseable"}
                  </Badge>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2 flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-400 font-medium">{rec.impact}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicador de Confianza */}
      <div className="bg-muted/50 border border-border rounded-lg p-3">
        <div className="flex gap-2">
          <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Nota sobre este análisis:</span> Este cálculo se basa en datos climáticos actuales y características del negocio. Se actualiza conforme hay nueva información disponible. Para decisiones de inversión importantes, se recomienda consultar con especialistas en gestión de riesgos climáticos.
          </p>
        </div>
      </div>
    </div>
  );
}
