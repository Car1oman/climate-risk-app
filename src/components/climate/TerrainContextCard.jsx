// @ts-nocheck
import { MapPinned, Mountain, Waves, AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SUSCEPTIBILITY_COLORS = {
  alta:  "text-red-400 bg-red-400/10 border-red-400/30",
  media: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  baja:  "text-green-400 bg-green-400/10 border-green-400/30",
};

export default function TerrainContextCard({ asset = null, terrain = null, traceability = null, terrainSignals = [] }) {
  // terrainSignals: signals of type landslide_risk or huayco_risk from Layer2 output
  const landslideSignal = terrainSignals.find(s => s.signalType === "landslide_risk");
  const huaycoSignal    = terrainSignals.find(s => s.signalType === "huayco_risk");

  // Extract terrain data from signal traceability when available
  const terrainRef = landslideSignal?.threshold_reference || huaycoSignal?.threshold_reference || null;
  const slope      = landslideSignal?.projected ?? null;
  const huaycoRisk = huaycoSignal?.projected    ?? null;
  const terrainConf = landslideSignal?.confidence || huaycoSignal?.confidence || "medium";

  const rows = [
    {
      icon:  MapPinned,
      label: "Ubicacion",
      value: asset?.district || "georreferenciada",
    },
    {
      icon:  Mountain,
      label: "Terreno / pendiente",
      value: slope != null
        ? `${slope}° de pendiente${terrainRef ? ` — ${terrainRef.split("—")[0]?.trim()}` : ""}`
        : terrain?.relief || "Contexto urbano costero / valle bajo",
    },
    {
      icon:  Waves,
      label: "Riesgo hidrologico",
      value: huaycoRisk != null
        ? `Riesgo huayco: ${huaycoSignal?.threshold_reference?.includes("alto") ? "alto" : huaycoSignal?.threshold_reference?.includes("medio") ? "medio" : "registrado"}`
        : terrain?.hydrology || "Drenaje urbano y cuencas cercanas en observacion",
    },
  ];

  const hasTerrain = landslideSignal || huaycoSignal;
  const susceptibility = terrainRef?.toLowerCase().includes("alto") ? "alta"
    : terrainRef?.toLowerCase().includes("medio") ? "media"
    : terrainRef?.toLowerCase().includes("bajo") ? "baja"
    : null;
  const suscColor = SUSCEPTIBILITY_COLORS[susceptibility] || "text-slate-400 bg-slate-400/10 border-slate-400/30";

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contexto topografico</p>
          <h3 className="text-lg font-semibold mt-1">Terreno y exposicion fisica</h3>
        </div>
        <div className="flex items-center gap-2">
          {hasTerrain && susceptibility && (
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0.5 ${suscColor}`}>
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              Suscept. {susceptibility}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            <ShieldCheck className="w-3 h-3 mr-0.5" />
            Conf. {terrainConf}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-secondary p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Icon className="w-3 h-3" />
              {label}
            </div>
            <p className="text-xs text-secondary-foreground mt-1 leading-snug">{value}</p>
          </div>
        ))}
      </div>

      {hasTerrain && (
        <div className="rounded-lg bg-secondary border border-border/50 p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Analisis topografico SRTM</p>
          {landslideSignal && (
            <p className="text-[11px] text-secondary-foreground leading-snug">
              Deslizamiento: pendiente {landslideSignal.projected != null ? `${landslideSignal.projected}°` : "—"} ·
              Umbral: {landslideSignal.threshold_reference || "INGEMMET/SENAMHI"}
            </p>
          )}
          {huaycoSignal && (
            <p className="text-[11px] text-secondary-foreground leading-snug">
              Huayco: score {huaycoSignal.projected != null ? Number(huaycoSignal.projected).toFixed(2) : "—"} ·
              Ref: {huaycoSignal.threshold_reference || "INGEMMET"}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/70">
            Fuente: SRTM 30m / NASA (2000) — susceptibilidad topografica; no incluye cambios de uso de suelo post-2000
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3">
        Fuente: {traceability?.source || "NASA SRTM 30m / OpenTopoData, GRI, capas climaticas"} ·
        Periodo: {traceability?.period || "topografia vigente (referencia 2000)"} ·
        Escenario SSP: {traceability?.scenario || "no aplica a terreno base"} ·
        Metadata: {traceability?.metadata || "coordenadas, pendiente, elevacion y distancia al dato climatico"}
      </p>
    </div>
  );
}
