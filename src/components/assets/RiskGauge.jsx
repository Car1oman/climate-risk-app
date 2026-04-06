import { cn } from "@/lib/utils";
import { getRiskColor } from "@/lib/riskEngine";

export default function RiskGauge({ score, level, label, size = "lg" }) {
  const rc = getRiskColor(level);
  const pct = Math.round(score * 100);
  const radius = size === "lg" ? 54 : 36;
  const stroke = size === "lg" ? 8 : 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score * circumference);

  const RISK_LABELS = { critico: "Crítico", alto: "Alto", medio: "Medio", bajo: "Bajo" };

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={(radius + stroke) * 2} height={(radius + stroke) * 2} className="-rotate-90">
          <circle
            cx={radius + stroke}
            cy={radius + stroke}
            r={radius}
            fill="none"
            stroke="hsl(222 30% 14%)"
            strokeWidth={stroke}
          />
          <circle
            cx={radius + stroke}
            cy={radius + stroke}
            r={radius}
            fill="none"
            stroke={
              level === "critico" ? "#ef4444" :
              level === "alto" ? "#f97316" :
              level === "medio" ? "#eab308" : "#22c55e"
            }
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-mono font-bold", size === "lg" ? "text-2xl" : "text-lg")}>
            {pct}
          </span>
          {size === "lg" && (
            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", rc.text)}>
              {RISK_LABELS[level] || level}
            </span>
          )}
        </div>
      </div>
      {label && <p className="text-xs text-muted-foreground mt-2">{label}</p>}
    </div>
  );
}