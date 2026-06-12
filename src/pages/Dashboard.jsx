import { useState, useEffect } from "react";
import { useAssets } from "@/hooks/useAssets";
import { useAlerts } from "@/hooks/useAlerts";
import { useBatchAssetRisks } from "@/hooks/useAssetRisk";
import { Building2, Database, CloudSun, BookOpen, Loader2 } from "lucide-react";
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
  const { computedRisks, getRisk, isLoading: risksLoading, error: risksError, unavailable: risksUnavailable } = useBatchAssetRisks(assets);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const totalAssets = assets.length;
  const locatedAssets = assets.filter((a) => a.lat && a.lng).length;
  const districts = new Set(assets.map((a) => a.district).filter(Boolean)).size;
  const observedSignals = assets.filter((a) => {
    const risk = getRisk(a);
    return !risk.unavailable && (a.top_risk || (risk.risk_level && risk.risk_level !== 'bajo' && risk.risk_level !== 'unknown'));
  }).length;

  const hasNonBajo = assets.some(a => {
    const risk = getRisk(a);
    return !risk.unavailable && (risk.risk_level === 'alto' || risk.risk_level === 'critico');
  });

  const unavailableCount = assets.filter(a => {
    const risk = getRisk(a);
    return risk.unavailable;
  }).length;

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
          {risksLoading && <span className="ml-2 text-xs">· evaluando riesgos...</span>}
        </p>
      </div>

      {assetsError && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive">
          Error cargando activos desde backend. Verifica la conexion.
        </div>
      )}
      {risksUnavailable && !risksLoading && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-400">
          El analisis de riesgo V2 no esta disponible para {unavailableCount} activo{unavailableCount !== 1 ? 's' : ''}. Revisa el estado del pipeline.
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
          title="Senales Identificadas"
          value={observedSignals}
          subtitle="Riesgos calculados por pipeline V2"
          icon={BookOpen}
          trend={0}
          trendUp={false}
          className=""
        />
      </div>

      {risksLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-xl px-4 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Calculando niveles de riesgo mediante pipeline V2...
        </div>
      )}

      {hasNonBajo && !risksLoading && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400">
          Se detectaron activos con nivel de riesgo alto o crítico. Revisa la tabla de priorización.
        </div>
      )}

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
          <TopRisksTable assets={assets} computedRisks={computedRisks} />
        </div>
        <div className="space-y-4">
          <ScientificEvidenceCard />
          <AlertsFeed alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
