import { useState, useEffect } from "react";
import { assets } from "@/data/assets";
import { formatCurrency, getRiskColor } from "@/lib/riskEngine";
import { Link } from "react-router-dom";
import { ArrowLeft, MapPin, Building2, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import RiskGauge from "@/components/assets/RiskGauge";
import HazardBreakdown from "@/components/assets/HazardBreakdown";
import ImpactBreakdown from "@/components/assets/ImpactBreakdown";
import { useToast } from "@/components/ui/use-toast";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const TYPE_LABELS = {
  supermercado_grande: "Supermercado Grande",
  supermercado_mediano: "Supermercado Mediano",
  centro_distribucion: "Centro de Distribución",
  tienda_express: "Tienda Express",
};

const RISK_LABELS = { critico: "Crítico", alto: "Alto", medio: "Medio", bajo: "Bajo" };

export default function AssetDetail() {
  const pathParts = window.location.pathname.split("/");
  const assetId = pathParts[pathParts.length - 1];

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [climate, setClimate] = useState(null);
  const { toast } = useToast();

  const asset = assets.find(a => a.id === assetId);

  const fetchClimate = async () => {
    try {
      const res = await fetch(
        `$https://climate-risk-app-91ev.onrender.com/api/climate?lat=${asset.lat}&lng=${asset.lng}`
      );
      const data = await res.json();
      setClimate(data);
    } catch (error) {
      console.error('Error obteniendo datos climáticos:', error);
    }
  };

  useEffect(() => {
    if (asset?.lat && asset?.lng) {
      fetchClimate();
    }
  }, [asset]);

  const generateRecommendations = async () => {
    if (!asset) return;
    setAiLoading(true);
    const prompt = `Eres un experto en gestión de riesgo climático para retail en Perú.

Tienda: ${asset.name}
Tipo: ${TYPE_LABELS[asset.type] || asset.type}
Distrito: ${asset.district}
Score de Riesgo: ${((asset.risk_score || 0) * 100).toFixed(0)}/100
Nivel: ${RISK_LABELS[asset.risk_level] || asset.risk_level}
Riesgo Principal: ${asset.top_risk || "Inundación"}
Ventas Mensuales: S/ ${(asset.monthly_sales || 0).toLocaleString()}
Área: ${asset.area_m2 || 0} m²
Condición: ${asset.condition || "propio"}
Impacto Financiero Estimado: S/ ${(asset.financial_impact || 0).toLocaleString()}

Genera exactamente 3 recomendaciones de adaptación climática específicas para esta tienda, priorizadas por costo-beneficio, para incluir en el plan ESG 2025–2026. Sé concreto y cuantifica beneficio esperado. Formato Markdown con bullets.`;

    try {
      const res = await fetch('https://climate-risk-app-91ev.onrender.com/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setAiResponse(data.response);
      toast({ title: "Recomendaciones generadas", description: "La IA ha analizado el perfil de riesgo del activo." });
    } catch (error) {
      console.error('Error generando recomendaciones:', error);
      toast({ title: "Error", description: "No se pudieron generar las recomendaciones." });
    } finally {
      setAiLoading(false);
    }
  };

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const rc = getRiskColor(asset.risk_level);
  const RISK_FILL = { critico: "#ef4444", alto: "#f97316", medio: "#eab308", bajo: "#22c55e" };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/assets" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Volver a activos
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="w-3 h-3" /> {asset.district}
            </div>
            {climate && (
              <div className="text-xs text-muted-foreground">
                🌡 {climate.temperature}°C | 🌧 {climate.precipitation} mm
              </div>
            )}
            <Badge variant="outline" className="text-xs">{TYPE_LABELS[asset.type] || asset.type}</Badge>
            <Badge variant="outline" className={cn("text-xs", rc.bg, rc.text, rc.border)}>
              {RISK_LABELS[asset.risk_level]}
            </Badge>
          </div>
        </div>
      </div>

      {/* Top Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk Gauge */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center">
          <RiskGauge score={asset.risk_score || 0} level={asset.risk_level || "bajo"} size="lg" />
          <div className="grid grid-cols-3 gap-4 mt-6 w-full">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Amenaza</p>
              <p className="text-lg font-mono font-bold">{((asset.hazard_score || 0) * 100).toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Exposición</p>
              <p className="text-lg font-mono font-bold">{((asset.exposure_score || 0) * 100).toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Impacto</p>
              <p className="text-lg font-mono font-bold">{((asset.impact_score || 0) * 100).toFixed(0)}</p>
            </div>
          </div>
        </div>

        {/* Mini Map */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {asset.lat && asset.lng ? (
            <MapContainer center={[asset.lat, asset.lng]} zoom={15} className="h-full min-h-[250px]" zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              <CircleMarker
                center={[asset.lat, asset.lng]}
                radius={12}
                pathOptions={{ color: RISK_FILL[asset.risk_level] || "#22c55e", fillColor: RISK_FILL[asset.risk_level] || "#22c55e", fillOpacity: 0.4, weight: 2 }}
              />
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Sin coordenadas
            </div>
          )}
        </div>

        {/* Key Metrics */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datos del Activo</h3>
          <div className="space-y-3">
            {[
              { label: "Ventas Mensuales", value: formatCurrency(asset.monthly_sales || 0) },
              { label: "Área", value: `${(asset.area_m2 || 0).toLocaleString()} m²` },
              { label: "Colaboradores", value: asset.num_employees || "—" },
              { label: "Condición", value: asset.condition === "alquilado" ? "Alquilado" : "Propio" },
              { label: "Impacto Financiero", value: formatCurrency(asset.financial_impact || 0) },
              { label: "Riesgo Principal", value: asset.top_risk || "—" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-medium font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hazard Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Desglose de Amenazas
          </h3>
          <HazardBreakdown asset={asset} />
        </div>

        {/* Impact Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Desglose de Impacto Financiero
          </h3>
          <ImpactBreakdown asset={asset} />
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Recomendaciones IA
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={generateRecommendations}
            disabled={aiLoading}
            className="gap-2"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {aiLoading ? "Analizando..." : "Generar Recomendaciones"}
          </Button>
        </div>
        {aiResponse ? (
          <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground/90 whitespace-pre-wrap">
            {aiResponse}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Haz clic en "Generar Recomendaciones" para obtener análisis IA personalizado.
          </p>
        )}
      </div>
    </div>
  );
}