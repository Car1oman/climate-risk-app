import { useState, useEffect } from "react";
import { useAssets } from "@/hooks/useAssets";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { getRiskColor, formatCurrency } from "@/lib/riskEngine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import "leaflet/dist/leaflet.css";

const RISK_FILL = {
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

export default function RiskMap() {
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const { data: assets = [], isLoading: assetsLoading, error: assetsError } = useAssets();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const filtered = filter === "all" ? assets : assets.filter((a) => a.risk_level === filter);

  if (isLoading || assetsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-sm">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Mapa de Riesgos</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} activos visualizados</p>
        </div>
        <div className="flex items-center gap-2">
          {["all", "critico", "alto", "medio", "bajo"].map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                filter === level
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {level === "all" ? "Todos" : LABELS[level]}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      {assetsError && (
        <div className="mx-6 mb-4 rounded-xl border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          No se pudieron cargar los activos. Verifica la conexión al backend.
        </div>
      )}
      <div className="flex-1 relative">
        <MapContainer
          center={[-12.046, -77.043]}
          zoom={12}
          className="h-full w-full"
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          />
          {filtered.map((asset) => {
            if (!asset.lat || !asset.lng) return null;
            const color = RISK_FILL[asset.risk_level] || RISK_FILL.bajo;
            const rc = getRiskColor(asset.risk_level);
            return (
              <CircleMarker
                key={asset.id}
                center={[asset.lat, asset.lng]}
                radius={8 + (asset.risk_score || 0) * 12}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.5,
                  weight: 2,
                  opacity: 0.8,
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <p className="font-bold text-sm mb-1">{asset.name}</p>
                    <p className="text-xs opacity-70 mb-2">{asset.district}</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="opacity-70">Risk Score</span>
                        <span className="font-mono font-bold">{((asset.risk_score || 0) * 100).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="opacity-70">Impacto</span>
                        <span className="font-mono">{formatCurrency(asset.financial_impact || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="opacity-70">Riesgo Principal</span>
                        <span>{asset.top_risk || "—"}</span>
                      </div>
                    </div>
                    <Link
                      to={`/assets/${asset.id}`}
                      className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:underline"
                    >
                      Ver detalle <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-6 left-6 bg-card/90 backdrop-blur-sm border border-border rounded-xl p-3 z-[1000]">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Nivel de Riesgo</p>
          <div className="space-y-1.5">
            {Object.entries(LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: RISK_FILL[key] }} />
                <span className="text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}