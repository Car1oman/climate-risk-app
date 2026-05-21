/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED: Muestra desglose financiero inventado (lostSales, staffCost, rehabCost).
 * Ver: project-memory/CLEANUP_ANALYSIS.md — ImpactBreakdown.jsx — DEPRECATE
 * Eliminación física: Sprint 2 o posterior.
 */
import { formatCurrency, calculateFinancialImpact } from "@/lib/riskEngine";
import { DollarSign, Users, Truck, Wrench, Clock } from "lucide-react";

export default function ImpactBreakdown({ asset }) {
  const impact = calculateFinancialImpact(asset);

  const items = [
    {
      icon: DollarSign,
      label: "Pérdida de Ventas",
      value: impact.lostSales,
      color: "text-red-400",
      description: "Ingresos no generados durante el período de cierre por falta de operación."
    },
    {
      icon: Users,
      label: "Costo de Personal",
      value: impact.staffCost,
      color: "text-orange-400",
      description: "Gastos en salarios y beneficios durante el tiempo de inactividad."
    },
    {
      icon: Truck,
      label: "Logística / Supply Chain",
      value: impact.logisticsCost,
      color: "text-yellow-400",
      description: "Costos adicionales por interrupciones en la cadena de suministro."
    },
    {
      icon: Wrench,
      label: "Rehabilitación",
      value: impact.rehabCost,
      color: "text-blue-400",
      description: "Gastos para reparar daños y restaurar la operación normal."
    },
  ];

  const total = impact.total;
  const closureDays = impact.closureDays;

  const getTotalNarrative = () => {
    if (total === 0) return "No se esperan impactos financieros significativos.";
    if (total < 100000) return "Impacto financiero manejable con planes de contingencia adecuados.";
    if (total < 500000) return "Impacto moderado que requiere preparación financiera preventiva.";
    return "Impacto financiero significativo. Se recomienda inversión en medidas de mitigación.";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
        <Clock className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <span className="text-sm">Días de cierre estimados: <strong className="font-mono">{closureDays}</strong></span>
          <p className="text-xs text-muted-foreground mt-1">
            Tiempo aproximado de interrupción operativa en caso de evento climático grave.
          </p>
        </div>
      </div>
      {items.map((item) => (
        <div key={item.label} className="p-3 bg-muted/30 rounded-lg space-y-2">
          <div className="flex items-center gap-3">
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-sm font-mono font-semibold">{formatCurrency(item.value)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
            </div>
          </div>
        </div>
      ))}
      <div className="p-3 bg-card border border-border rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Impacto Total Estimado</span>
          <span className="text-lg font-mono font-bold text-primary">{formatCurrency(total)}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {getTotalNarrative()}
        </p>
      </div>
    </div>
  );
}
