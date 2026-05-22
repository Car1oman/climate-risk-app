// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Leaf } from "lucide-react";
import { SIGNAL_META } from "../constants";
import { fmtUSD } from "../utils";

export default function AdaptationPanel({ adaptations }) {
  const list = adaptations?.adaptations ?? [];
  if (!list.length) return null;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Leaf className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-foreground">Medidas de adaptación</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Sugeridas por señal detectada · incluye horizonte y costo estimado</p>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {list.map((adapt, i) => {
          const signalMeta = SIGNAL_META[adapt.risk_type] ?? { icon: "⚠️", label: adapt.risk_type };
          return (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm leading-none">{signalMeta.icon}</span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {signalMeta.label}
                </p>
                <Badge variant="outline" className="text-[10px] py-0 px-2">
                  Confianza {adapt.confidence ?? "medium"}
                </Badge>
              </div>
              <div className="space-y-1.5 pl-1">
                {(adapt.measures ?? []).slice(0, 3).map((m, j) => (
                  <div key={j} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">{m.nombre}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {m.horizonte_implementacion} plazo
                        {m.costo_estimado_rango && ` · ${fmtUSD(m.costo_estimado_rango.min_usd)}–${fmtUSD(m.costo_estimado_rango.max_usd)}`}
                      </p>
                      {m.donde_impacta && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 italic">{m.donde_impacta}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] py-0 px-1.5 flex-shrink-0 ${
                        m.efectividad === "alta"  ? "border-emerald-400 text-emerald-700 dark:text-emerald-300" :
                        m.efectividad === "media" ? "border-amber-400 text-amber-700 dark:text-amber-300" :
                                                    "border-slate-400 text-slate-500"
                      }`}
                    >
                      {m.efectividad}
                    </Badge>
                  </div>
                ))}
              </div>
              {i < list.length - 1 && <div className="border-t border-border" />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
