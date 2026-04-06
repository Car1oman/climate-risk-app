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

const LEVEL_LABELS = ["Ninguno", "Bajo", "Medio", "Alto", "Extremo"];
const LEVEL_COLORS = [
  "bg-muted text-muted-foreground",
  "bg-emerald-500/15 text-emerald-400",
  "bg-yellow-500/15 text-yellow-400",
  "bg-orange-500/15 text-orange-400",
  "bg-red-500/15 text-red-400",
];

export default function HazardBreakdown({ asset }) {
  return (
    <div className="space-y-3">
      {Object.entries(HAZARD_LABELS).map(([key, label]) => {
        const level = asset[key] || 0;
        const Icon = ICONS[key];
        const weight = HAZARD_WEIGHTS[key];
        const horizon = HORIZON[key];

        return (
          <div key={key} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{label}</p>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", LEVEL_COLORS[level])}>
                  {LEVEL_LABELS[level]}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(level / 4) * 100}%`,
                      backgroundColor: level >= 3 ? "#ef4444" : level >= 2 ? "#eab308" : "#22c55e",
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                  {level}/4
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <span>Peso: {(weight * 100).toFixed(0)}%</span>
                <span>·</span>
                <span>Horizonte: {HORIZON_LABELS[horizon]}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}