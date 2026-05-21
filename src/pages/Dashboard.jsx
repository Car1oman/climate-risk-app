import { useState, useEffect } from "react";
import { useAssets } from "@/hooks/useAssets";
import { useAlerts } from "@/hooks/useAlerts";
import { Building2, Database, CloudSun, BookOpen } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import TopRisksTable from "@/components/dashboard/TopRisksTable";
import AlertsFeed from "@/components/dashboard/AlertsFeed";
import ClimateStoryCard from "@/components/climate/ClimateStoryCard";
import ProjectionScenarioCard from "@/components/climate/ProjectionScenarioCard";
import ScientificEvidenceCard from "@/components/climate/ScientificEvidenceCard";

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const { data: assets = [], isLoading: assetsLoading, error: assetsError } = useAssets();
  const { data: alerts = [] } = useAlerts({ active: true });

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const totalAssets = assets.length;
  const locatedAssets = assets.filter((a) => a.lat && a.lng).length;
  const districts = new Set(assets.map((a) => a.district).filter(Boolean)).size;
  const observedSignals = assets.filter((a) => a.top_risk || a.risk_level).length;

  if (isLoading || assetsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Plataforma de inteligencia climatica basada en evidencia y trazabilidad
        </p>
      </div>

      {assetsError && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive">
          Error cargando activos desde backend. Verifica la conexion.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Activos"
          value={totalAssets}
          subtitle="Con trazabilidad operativa"
          icon={Building2}
          trend={0}
          trendUp={false}
          className=""
        />
        <StatCard
          title="Activos Georreferenciados"
          value={locatedAssets}
          subtitle="Listos para mapa y terreno"
          icon={CloudSun}
          trend={0}
          trendUp={false}
          className=""
        />
        <StatCard
          title="Distritos Cubiertos"
          value={districts}
          subtitle="Cobertura territorial del portafolio"
          icon={Database}
          trend={0}
          trendUp={false}
          className=""
        />
        <StatCard
          title="Senales Observadas"
          value={observedSignals}
          subtitle="Contexto descriptivo disponible"
          icon={BookOpen}
          trend={0}
          trendUp={false}
          className=""
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ClimateStoryCard
          evidence={{
            summary: "El portafolio se interpreta desde senales climaticas, contexto territorial y trazabilidad de fuentes",
            confidence: "medium",
          }}
          traceability={{
            source: "CMIP6, IPCC AR6, GRI, Open-Meteo",
            period: "1980-2014 / 2020-2059",
            scenario: "SSP245 / SSP585",
            metadata: "fuente, periodo, escenario y confianza",
          }}
        />
        <ProjectionScenarioCard
          scenario="SSP245 / SSP585"
          traceability={{
            source: "CMIP6 via Open-Meteo",
            period: "2020-2059",
            confidence: "medium",
            metadata: "ensamble climatico y horizonte temporal",
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TopRisksTable assets={assets} />
        </div>
        <div className="space-y-4">
          <ScientificEvidenceCard />
          <AlertsFeed alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
