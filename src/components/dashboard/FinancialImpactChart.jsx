import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatCurrency } from "@/lib/riskEngine";

export default function FinancialImpactChart({ assets }) {
  const byDistrict = {};
  assets.forEach((a) => {
    const d = a.district || "Sin distrito";
    byDistrict[d] = (byDistrict[d] || 0) + (a.financial_impact || 0);
  });

  const data = Object.entries(byDistrict)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Impacto Financiero por Distrito
      </h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 14%)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCurrency(v)}
              tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="name"
              type="category"
              width={90}
              tick={{ fontSize: 11, fill: "hsl(210 40% 80%)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v) => [formatCurrency(v), "Impacto"]}
              contentStyle={{
                background: "hsl(222 44% 10%)",
                border: "1px solid hsl(222 30% 16%)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "hsl(210 40% 96%)",
              }}
            />
            <Bar dataKey="value" fill="hsl(213 94% 55%)" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}