import { formatCurrency, calculateFinancialImpact } from "@/lib/riskEngine";
import { DollarSign, Users, Truck, Wrench, Clock } from "lucide-react";

export default function ImpactBreakdown({ asset }) {
  const impact = calculateFinancialImpact(asset);

  const items = [
    { icon: DollarSign, label: "Pérdida de Ventas", value: impact.lostSales, color: "text-red-400" },
    { icon: Users, label: "Costo de Personal", value: impact.staffCost, color: "text-orange-400" },
    { icon: Truck, label: "Logística / Supply Chain", value: impact.logisticsCost, color: "text-yellow-400" },
    { icon: Wrench, label: "Rehabilitación", value: impact.rehabCost, color: "text-blue-400" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
        <Clock className="w-4 h-4 text-primary" />
        <span className="text-sm">Días de cierre estimados: <strong className="font-mono">{impact.closureDays}</strong></span>
      </div>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-3">
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <span className="text-sm">{item.label}</span>
          </div>
          <span className="text-sm font-mono font-semibold">{formatCurrency(item.value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
        <span className="text-sm font-semibold">Impacto Total Estimado</span>
        <span className="text-lg font-mono font-bold text-primary">{formatCurrency(impact.total)}</span>
      </div>
    </div>
  );
}