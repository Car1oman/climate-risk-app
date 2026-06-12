// @ts-nocheck - react-leaflet prop types break due to leaflet module stub; runtime is correct
import { useState, useEffect } from "react";
import { useAssets } from "@/hooks/useAssets";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { getRiskColor } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useBatchAssetRisks } from "@/hooks/useAssetRisk";
import "leaflet/dist/leaflet.css";

const RISK_FILL = {
  critico: "#ef4444",
  alto: "#f97316",
  medio: "#eab308",
  bajo: "#22c55e",
};

const LABELS = {
  critico: "Observacion alta",
  alto: "Observacion alta",
  medio: "Monitoreo",
  bajo: "Seguimiento",
};

export default function RiskMap() {
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const { data: assets = [], isLoading: assetsLoading, error: assetsError } = useAssets();
  const { getRisk, isLoading: risksLoading, error: risksError, unavailable: risksUnavailable } = useBatchAssetRisks(assets);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const filtered = filter === "all" ? assets : assets.filter((a) => {
    const risk = getRisk(a);
    return risk.risk_level === filter;
  });

  if (isLoading || assetsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-3 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-sm">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Mapa Climatico</h1>
          <p className="text-xs text-muted-foreground">
            {filtered.length} activos visualizados con contexto descriptivo
            {risksLoading && " · evaluando riesgos..."}
          </p>
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

      {assetsError && (
        <div className="mx-6 mb-4 rounded-xl border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          No se pudieron cargar los activos. Verifica la conexion al backend.
        </div>
      )}
      {risksUnavailable && !risksLoading && (
        <div className="mx-6 mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-400">
          Analisis de riesgo V2 no disponible para algunos activos. Los marcadores en gris indican datos no disponibles.
        </div>
      )}

      <div className="flex-1 relative">
        <MapContainer center={[-12.046, -77.043]} zoom={12} className="h-full w-full" zoomControl>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          />
          {filtered.map((asset) => {
            if (!asset.lat || !asset.lng) return null;
            const risk = getRisk(asset);
            const isUnavailable = risk.unavailable;
            const color = isUnavailable ? "#71717a" : (RISK_FILL[risk.risk_level] || RISK_FILL.bajo);
            const statusLabel = isUnavailable ? "No disponible" : (LABELS[risk.risk_level] || "Sin clasificar");
            return (
              <CircleMarker
                key={asset.id}
                center={[asset.lat, asset.lng]}
                radius={10}
                pathOptions={{ color, fillColor: color, fillOpacity: isUnavailable ? 0.2 : 0.5, weight: 2, opacity: isUnavailable ? 0.5 : 0.8 }}
              >
                <Popup>
                  <div className="min-w-[220px]">
                    <p className="font-bold text-sm mb-1">{asset.name}</p>
                    <p className="text-xs opacity-70 mb-2">{asset.district}</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="opacity-70">Estado</span>
                        <span className={cn("font-semibold", isUnavailable ? "text-muted-foreground" : "text-foreground")}>{statusLabel}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="opacity-70">Senal</span>
                        <span>{asset.top_risk || "Contexto climatico"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="opacity-70">Fuente</span>
                        <span>GRI / CMIP6</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="opacity-70">Escenarios</span>
                        <span>SSP245 / SSP585</span>
                      </div>
                    </div>
                    <Link to={`/assets/${asset.id}`} className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:underline">
                      Ver detalle <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        <div className="absolute bottom-6 left-6 bg-card/90 backdrop-blur-sm border border-border rounded-xl p-3 z-[1000]">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Lectura descriptiva</p>
          <div className="space-y-1.5">
            {Object.entries(LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: RISK_FILL[key] }} />
                <span className="text-xs">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#71717a" }} />
              <span className="text-xs text-muted-foreground">No disponible</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
