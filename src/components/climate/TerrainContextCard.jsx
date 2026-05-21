import { MapPinned, Mountain, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TerrainContextCard({ asset = null, terrain = null, traceability = null }) {
  const rows = [
    { icon: MapPinned, label: "Ubicacion", value: asset?.district || "georreferenciada" },
    { icon: Mountain, label: "Terreno", value: terrain?.relief || "contexto urbano costero / valle bajo" },
    { icon: Waves, label: "Hidrologia", value: terrain?.hydrology || "drenaje urbano y cuencas cercanas en observacion" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contexto territorial</p>
          <h3 className="text-lg font-semibold mt-1">Terreno y exposicion fisica</h3>
        </div>
        <Badge variant="outline">Confianza {traceability?.confidence || "medium"}</Badge>
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

      <p className="text-[10px] text-muted-foreground">
        Fuente: {traceability?.source || "OpenStreetMap, GRI, capas climaticas"} · Periodo:
        {traceability?.period || " vigente / historico"} · Escenario SSP:
        {traceability?.scenario || " no aplica a terreno base"} · Metadata cientifica:
        {traceability?.metadata || " coordenadas, fuente espacial y distancia al punto de dato"}
      </p>
    </div>
  );
}
