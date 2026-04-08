import { useState, useEffect } from "react";
import { useAssets } from "@/hooks/useAssets";
import { alerts } from "@/data/alerts";
import { formatCurrency } from "@/lib/riskEngine";
import { Building2, DollarSign, AlertTriangle, TrendingUp } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import RiskDistributionChart from "@/components/dashboard/RiskDistributionChart";
import FinancialImpactChart from "@/components/dashboard/FinancialImpactChart";
import TopRisksTable from "@/components/dashboard/TopRisksTable";
import AlertsFeed from "@/components/dashboard/AlertsFeed";

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const { data: assets = [], isLoading: assetsLoading, error: assetsError } = useAssets();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const totalAssets = assets.length;
  const criticalCount = assets.filter((a) => a.risk_level === "critico").length;
  const highCount = assets.filter((a) => a.risk_level === "alto").length;
  const totalImpact = assets.reduce((s, a) => s + (a.financial_impact || 0), 0);
  const avgScore = totalAssets > 0
    ? assets.reduce((s, a) => s + (a.risk_score || 0), 0) / totalAssets
    : 0;

  if (isLoading || assetsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Plataforma de Inteligencia Climática — Intercorp Retail
        </p>
      </div>

      {/* KPI Row */}
      {assetsError && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive">
          Error cargando activos desde backend. Verifica la conexión.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Activos"
          value={totalAssets}
          subtitle="Monitoreados en tiempo real"
          icon={Building2}
          trend={0}
          trendUp={false}
          className=""
        />
        <StatCard
          title="Riesgo Crítico / Alto"
          value={`${criticalCount + highCount}`}
          subtitle={`${criticalCount} críticos · ${highCount} altos`}
          icon={AlertTriangle}
          trend={0}
          trendUp={false}
          className=""
        />
        <StatCard
          title="Impacto Financiero Est."
          value={formatCurrency(totalImpact)}
          subtitle="Pérdida potencial agregada"
          icon={DollarSign}
          trend={0}
          trendUp={false}
          className=""
        />
        <StatCard
          title="Score Promedio"
          value={(avgScore * 100).toFixed(1)}
          subtitle="Índice de riesgo portafolio"
          icon={TrendingUp}
          trend={0}
          trendUp={false}
          className=""
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RiskDistributionChart assets={assets} />
        <FinancialImpactChart assets={assets} />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TopRisksTable assets={assets} />
        </div>
        <AlertsFeed alerts={alerts} />
      </div>
    </div>
  );
}