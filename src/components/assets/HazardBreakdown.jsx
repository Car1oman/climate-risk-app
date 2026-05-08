import { HAZARD_LABELS, HAZARD_WEIGHTS, HORIZON } from "@/lib/riskEngine";
import { cn } from "@/lib/utils";
import { Droplets, Waves, Activity, Mountain, CloudOff } from "lucide-react";

const ICONS = {
  hazard_flood: Droplets,
  hazard_elnino: Waves,
  hazard_earthquake: Activity,
  hazard_landslide: Mountain,
  hazard_drought: CloudOff,
};

const HORIZON_LABELS = { corto: "0–2 años", medio: "2–10 años", largo: "10–50 años" };

const LEVEL_LABELS = ["Sin riesgo", "Bajo", "Medio", "Alto", "Extremo"];
const LEVEL_COLORS = [
  "bg-muted text-muted-foreground",
  "bg-emerald-500/15 text-emerald-400",
  "bg-yellow-500/15 text-yellow-400",
  "bg-orange-500/15 text-orange-400",
  "bg-red-500/15 text-red-400",
];

const HAZARD_DESCRIPTIONS = {
  hazard_flood: "Inundaciones por lluvias intensas o desbordamiento de ríos",
  hazard_elnino: "Evento climático cíclico que afecta patrones de lluvia y temperatura",
  hazard_earthquake: "Movimientos sísmicos que pueden causar daños estructurales",
  hazard_landslide: "Deslizamientos de tierra en zonas inestables o con lluvias intensas",
  hazard_drought: "Períodos prolongados de sequía que afectan disponibilidad de agua",
};

export default function HazardBreakdown({ asset }) {
  return (
    <div className="space-y-4">
      {Object.entries(HAZARD_LABELS).map(([key, label]) => {
        const level = asset[key] || 0;
        const Icon = ICONS[key];
        const weight = HAZARD_WEIGHTS[key];
        const horizon = HORIZON[key];
        const description = HAZARD_DESCRIPTIONS[key] || "Amenaza climática identificada";

        // Narrativa basada en el nivel
        const getNarrative = () => {
          if (level === 0) return "No representa un riesgo significativo para esta ubicación.";
          if (level === 1) return "Riesgo bajo pero presente. Mantener monitoreo básico.";
          if (level === 2) return "Riesgo moderado. Se recomienda preparación preventiva.";
          if (level === 3) return "Alto riesgo identificado. Implementar medidas de mitigación.";
          if (level === 4) return "Riesgo extremo. Requiere acción inmediata y planes de contingencia.";
          return "";
        };

        return (
          <div key={key} className="p-4 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{label}</p>
                  <span className={cn("text-[10px] px-2 py-1 rounded-full font-medium", LEVEL_COLORS[level])}>
                    {LEVEL_LABELS[level]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(level / 4) * 100}%`,
                    backgroundColor: level >= 3 ? "#ef4444" : level >= 2 ? "#eab308" : level >= 1 ? "#22c55e" : "#6b7280",
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Peso: {(weight * 100).toFixed(0)}%</span>
                <span>Horizonte: {HORIZON_LABELS[horizon]}</span>
                <span>Nivel: {level}/4</span>
              </div>
            </div>
            <p className="text-xs text-foreground/75 leading-relaxed">
              {getNarrative()}
            </p>
          </div>
        );
      })}
    </div>
  );
}