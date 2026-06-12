// @ts-nocheck - react-leaflet prop types break due to leaflet module stub; runtime is correct
import { useState, useEffect } from "react";
import { apiFetch, fetchAssetDetail } from "@/lib/api";
import { formatCurrency, getRiskColor, cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, MapPin, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import { useAssetRisk } from "@/hooks/useAssetRisk";
import ClimateStoryCard from "@/components/climate/ClimateStoryCard";
import HistoricalEventsCard from "@/components/climate/HistoricalEventsCard";
import ProjectionScenarioCard from "@/components/climate/ProjectionScenarioCard";
import ScientificEvidenceCard from "@/components/climate/ScientificEvidenceCard";
import TerrainContextCard from "@/components/climate/TerrainContextCard";
import "leaflet/dist/leaflet.css";

const TYPE_LABELS = {
  supermercado_grande: "Supermercado Grande",
  supermercado_mediano: "Supermercado Mediano",
  centro_distribucion: "Centro de Distribucion",
  tienda_express: "Tienda Express",
};

const STATUS_LABELS = {
  critico: "Observacion alta",
  alto: "Observacion alta",
  medio: "Monitoreo",
  bajo: "Seguimiento",
};

const STATUS_FILL = { critico: "#ef4444", alto: "#f97316", medio: "#eab308", bajo: "#22c55e" };

export default function AssetDetail() {
  const pathParts = window.location.pathname.split("/");
  const assetId = pathParts[pathParts.length - 1];

  const [asset, setAsset] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [climate, setClimate] = useState(null);
  const [climateLoading, setClimateLoading] = useState(false);
  const { toast } = useToast();

  const { computedRisk, isLoading: riskLoading, error: riskError, unavailable: riskUnavailable } = useAssetRisk(asset);

  useEffect(() => {
    const loadAsset = async () => {
      setDetailLoading(true);
      const data = await fetchAssetDetail(assetId);
      setAsset(data);
      setDetailLoading(false);
    };

    loadAsset();
  }, [assetId]);

  const fetchClimate = async () => {
    if (climateLoading || !asset?.lat || !asset?.lng) return;

    setClimateLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://climate-risk-app-91ev.onrender.com'}/api/climate?lat=${asset.lat}&lng=${asset.lng}`);
      if (!res.ok) throw new Error("Error en la API");
      setClimate(await res.json());
    } catch (error) {
      console.error("Error obteniendo datos climaticos:", error);
    } finally {
      setClimateLoading(false);
    }
  };

  useEffect(() => {
    if (asset?.lat && asset?.lng && !climate) fetchClimate();
  }, [asset?.lat, asset?.lng, climate]);

  const generateRecommendations = async () => {
    if (!asset) return;
    setAiLoading(true);
    const prompt = `Eres un experto en gestion de riesgo climatico para retail en Peru.

Tienda: ${asset.name}
Tipo: ${TYPE_LABELS[asset.type] || asset.type}
Distrito: ${asset.district}
Senal observada: ${asset.top_risk || "contexto climatico por revisar"}
Fuente esperada: CMIP6, IPCC AR6, GRI y Open-Meteo
Escenarios: SSP245 y SSP585
Ventas mensuales: ${formatCurrency(asset.monthly_sales || 0)}
Area: ${asset.area_m2 || 0} m2
Condicion: ${asset.condition || "propio"}

Genera exactamente 3 recomendaciones de adaptacion climatica especificas para esta tienda. No uses scores, urgencias numericas ni impacto financiero estimado. Enfocate en evidencia, senales observadas, trazabilidad y medidas operativas verificables. Formato Markdown con bullets.`;

    try {
      const res = await apiFetch('/api/ai', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setAiResponse(data.response);
      toast({ title: "Recomendaciones generadas", description: "La IA uso senales climaticas y trazabilidad." });
    } catch (error) {
      console.error("Error generando recomendaciones:", error);
      toast({ title: "Error", description: "No se pudieron generar las recomendaciones." });
    } finally {
      setAiLoading(false);
    }
  };

  if (detailLoading || !asset) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isRiskUnavailable = riskUnavailable || computedRisk?.unavailable === true;
  const riskLevel = isRiskUnavailable ? 'unknown' : (computedRisk?.risk_level ?? asset.risk_level ?? 'unknown');
  const rc = getRiskColor(riskLevel);
  const traceability = {
    source: "CMIP6, IPCC AR6, GRI, Open-Meteo",
    period: "1980-2014 / 2020-2059",
    scenario: "SSP245 / SSP585",
    confidence: "medium",
    metadata: `lat ${asset.lat || "s/d"}, lng ${asset.lng || "s/d"}, distrito ${asset.district || "s/d"}`,
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {isRiskUnavailable && !riskLoading && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-400">
          El analisis de riesgo V2 no esta disponible para este activo. Los datos mostrados son informativos.
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/assets" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Volver a activos
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {asset.name}
            {riskLoading && <Loader2 className="inline w-4 h-4 ml-2 animate-spin text-muted-foreground" />}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="w-3 h-3" /> {asset.district}
            </div>
            {climateLoading ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Cargando clima...
              </div>
            ) : climate ? (
              <div className="text-xs text-muted-foreground">
                Temp. {climate.temperature} C | Lluvia {climate.precipitation} mm
              </div>
            ) : null}
            <Badge variant="outline" className="text-xs">{TYPE_LABELS[asset.type] || asset.type}</Badge>
            {isRiskUnavailable ? (
              <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border">
                Riesgo no disponible
              </Badge>
            ) : (
              <Badge variant="outline" className={cn("text-xs", rc.bg, rc.text, rc.border)}>
                {STATUS_LABELS[riskLevel] || "Sin clasificar"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ClimateStoryCard
            asset={asset}
            climateData={climate}
            evidence={{ summary: computedRisk?.signals?.[0]?.signalType ?? asset.top_risk ?? "Senales climaticas del entorno requieren lectura contextual", confidence: "medium" }}
            traceability={traceability}
          />
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datos del activo</h3>
          <div className="space-y-3">
            {[
              { label: "Ventas mensuales", value: formatCurrency(asset.monthly_sales || 0) },
              { label: "Area", value: `${(asset.area_m2 || 0).toLocaleString()} m2` },
              { label: "Colaboradores", value: asset.num_employees || "-" },
              { label: "Condicion", value: asset.condition === "alquilado" ? "Alquilado" : "Propio" },
              { label: "Score de riesgo", value: isRiskUnavailable ? "-" : computedRisk?.risk_score != null ? `${Math.round(computedRisk.risk_score * 100)}%` : asset?.risk_score ? `${Math.round(asset.risk_score * 100)}%` : "-" },
              { label: "Senal observada", value: asset.top_risk || (computedRisk?.signals?.[0]?.signalType ?? "-") },
              { label: "Fuente", value: "V2 Pipeline: CMIP6 / GRI / ENSO" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-medium text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl overflow-hidden lg:col-span-1">
          {asset.lat && asset.lng ? (
            <MapContainer center={[asset.lat, asset.lng]} zoom={15} className="h-full min-h-[320px]" zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              <CircleMarker
                center={[asset.lat, asset.lng]}
                radius={12}
                pathOptions={{
                  color: isRiskUnavailable ? "#71717a" : (STATUS_FILL[riskLevel] || "#22c55e"),
                  fillColor: isRiskUnavailable ? "#71717a" : (STATUS_FILL[riskLevel] || "#22c55e"),
                  fillOpacity: isRiskUnavailable ? 0.2 : 0.4,
                  weight: 2,
                }}
              />
            </MapContainer>
          ) : (
            <div className="h-full min-h-[320px] flex items-center justify-center text-muted-foreground text-sm">
              Sin coordenadas
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          <TerrainContextCard asset={asset} traceability={traceability} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HistoricalEventsCard asset={asset} traceability={traceability} />
        <ProjectionScenarioCard scenario="SSP245 / SSP585" climateData={climate} traceability={traceability} />
      </div>

      <ScientificEvidenceCard traceability={traceability} evidence={{ confidence: "medium" }} />

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Recomendaciones IA
          </h3>
          <Button size="sm" variant="outline" onClick={generateRecommendations} disabled={aiLoading} className="gap-2">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {aiLoading ? "Analizando..." : "Generar recomendaciones"}
          </Button>
        </div>
        {aiResponse ? (
          <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground/90 whitespace-pre-wrap">
            {aiResponse}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Genera recomendaciones basadas en evidencia climatica, fuente y escenario SSP.
          </p>
        )}
      </div>
    </div>
  );
}
