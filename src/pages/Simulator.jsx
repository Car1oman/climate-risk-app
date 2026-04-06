import { useState, useEffect, useMemo } from "react";
import { assets } from "@/data/assets";
import { calculateRiskScore, formatCurrency, getRiskColor } from "@/lib/riskEngine";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Waves, AlertTriangle, Building2, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const RISK_FILL = { critico: "#ef4444", alto: "#f97316", medio: "#eab308", bajo: "#22c55e" };
const RISK_LABELS = { critico: "Crítico", alto: "Alto", medio: "Medio", bajo: "Bajo" };

const SCENARIOS = [
  { label: "Actual", multiplier: 1.0, description: "Condiciones climáticas actuales" },
  { label: "El Niño Moderado", multiplier: 1.5, description: "Similar a El Niño 2015-16" },
  { label: "El Niño Fuerte", multiplier: 2.5, description: "Similar a El Niño 1997-98" },
  { label: "El Niño Extremo", multiplier: 3.5, description: "Escenario hipotético peor caso" },
];

export default function Simulator() {
  const [isLoading, setIsLoading] = useState(true);
  const [intensity, setIntensity] = useState([1.0]);
  const multiplier = intensity[0];

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const currentScenario = SCENARIOS.reduce((prev, curr) =>
    Math.abs(curr.multiplier - multiplier) < Math.abs(prev.multiplier - multiplier) ? curr : prev
  );

  const simulatedAssets = useMemo(() => {
    return assets.map((asset) => {
      const result = calculateRiskScore(asset, 5000, multiplier);
      return { ...asset, ...result, sim_risk_score: result.riskScore, sim_risk_level: result.riskLevel, sim_financial_impact: result.financialImpact };
    });
  }, [multiplier]);

  const baseAssets = useMemo(() => {
    return assets.map((asset) => {
      const result = calculateRiskScore(asset, 5000, 1.0);
      return { ...asset, base_risk_score: result.riskScore, base_risk_level: result.riskLevel, base_financial_impact: result.financialImpact };
    });
  }, []);

  const totalBaseImpact = baseAssets.reduce((s, a) => s + (a.base_financial_impact || 0), 0);
  const totalSimImpact = simulatedAssets.reduce((s, a) => s + (a.sim_financial_impact || 0), 0);
  const impactDelta = totalSimImpact - totalBaseImpact;

  const distribution = { critico: 0, alto: 0, medio: 0, bajo: 0 };
  simulatedAssets.forEach((a) => { distribution[a.sim_risk_level]++; });

  const chartData = Object.entries(distribution).map(([key, value]) => ({
    name: RISK_LABELS[key],
    value,
    fill: RISK_FILL[key],
  }));

  const topAffected = [...simulatedAssets]
    .sort((a, b) => (b.sim_financial_impact || 0) - (a.sim_financial_impact || 0))
    .slice(0, 6);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Simulador El Niño</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Simula el impacto de diferentes intensidades del Fenómeno El Niño en tu portafolio
        </p>
      </div>

      {/* Slider Card */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <Waves className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold">{currentScenario.label}</p>
            <p className="text-xs text-muted-foreground">{currentScenario.description}</p>
          </div>
          <Badge variant="outline" className="ml-auto text-xs font-mono">
            Multiplicador: {multiplier.toFixed(1)}x
          </Badge>
        </div>
        <Slider
          value={intensity}
          onValueChange={setIntensity}
          min={1.0}
          max={4.0}
          step={0.1}
          className="mt-2"
        />
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>Normal (1.0x)</span>
          <span>Moderado (1.5x)</span>
          <span>Fuerte (2.5x)</span>
          <span>Extremo (4.0x)</span>
        </div>
      </div>

      {/* Impact KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Impacto Base</p>
          <p className="text-xl font-mono font-bold mt-1">{formatCurrency(totalBaseImpact)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Impacto Simulado</p>
          <p className="text-xl font-mono font-bold mt-1 text-accent">{formatCurrency(totalSimImpact)}</p>
        </div>
        <div className={cn("bg-card border rounded-xl p-5", impactDelta > 0 ? "border-red-500/30" : "border-border")}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Delta</p>
          <p className={cn("text-xl font-mono font-bold mt-1", impactDelta > 0 ? "text-red-400" : "text-emerald-400")}>
            {impactDelta > 0 ? "+" : ""}{formatCurrency(impactDelta)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribution */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Distribución Simulada
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 14%)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(210 40% 80%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(222 44% 10%)", border: "1px solid hsl(222 30% 16%)", borderRadius: "8px", fontSize: "12px", color: "hsl(210 40% 96%)" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Affected */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Activos Más Afectados
          </h3>
          <div className="space-y-2">
            {topAffected.map((asset) => {
              const rc = getRiskColor(asset.sim_risk_level);
              return (
                <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0", rc.dot)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">{asset.district}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatCurrency(asset.sim_financial_impact || 0)}
                    </span>
                    <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", rc.bg, rc.text, rc.border)}>
                      {((asset.sim_risk_score || 0) * 100).toFixed(0)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}