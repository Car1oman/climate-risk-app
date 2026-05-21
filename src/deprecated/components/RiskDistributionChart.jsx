/**
 * @deprecated — Sprint 1 — 2026-05-21
 * NOT_ALIGNED: Pie chart de distribución por risk_level calculado con H×E×I. Narrativa alarmista.
 * Ver: project-memory/CLEANUP_ANALYSIS.md — RiskDistributionChart.jsx — DEPRECATE
 * Eliminación física: Sprint 2 o posterior.
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const RISK_COLORS = {
  critico: "#ef4444",
  alto: "#f97316",
  medio: "#eab308",
  bajo: "#22c55e",
};

const LABELS = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
};

export default function RiskDistributionChart({ assets }) {
  const distribution = { critico: 0, alto: 0, medio: 0, bajo: 0 };
  assets.forEach((a) => {
    const level = a.risk_level || "bajo";
    distribution[level] = (distribution[level] || 0) + 1;
  });

  const data = Object.entries(distribution)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: LABELS[key],
      value,
      color: RISK_COLORS[key],
    }));

  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.value, 0);
  const criticalPercent = ((distribution.critico / total) * 100).toFixed(0);
  const highPercent = ((distribution.alto / total) * 100).toFixed(0);

  const getNarrative = () => {
    if (distribution.critico > 0) {
      return `Se han identificado ${distribution.critico} activo${distribution.critico > 1 ? 's' : ''} en riesgo crítico (${criticalPercent}%), lo que requiere atención inmediata para prevenir interrupciones operativas graves.`;
    } else if (distribution.alto > 0) {
      return `Hay ${distribution.alto} activo${distribution.alto > 1 ? 's' : ''} con alto riesgo (${highPercent}%). Se recomienda implementar medidas preventivas prioritarias.`;
    } else if (distribution.medio > 0) {
      return `La mayoría de los activos están en riesgo moderado. Mantener monitoreo continuo y prepararse para posibles eventos climáticos.`;
    } else {
      return `Buena distribución de riesgos. La mayoría de los activos tienen exposición baja, pero se deben mantener las precauciones básicas.`;
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Distribución de Riesgo
      </h3>
      <div className="flex items-center gap-6">
        <div className="w-32 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(222 44% 10%)",
                  border: "1px solid hsl(222 30% 16%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "hsl(210 40% 96%)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2.5 flex-1">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-sm text-foreground">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-semibold">{d.value}</span>
                <span className="text-xs text-muted-foreground">
                  ({((d.value / total) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {getNarrative()}
        </p>
      </div>
    </div>
  );
}
