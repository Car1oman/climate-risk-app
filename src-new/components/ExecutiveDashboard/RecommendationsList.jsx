import * as React from "react";

export function RecommendationsList({ recommendations }) {
  if (!recommendations?.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Recomendaciones
      </h3>
      <ul className="space-y-2">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
              {i + 1}
            </span>
            <span className="pt-0.5 text-foreground leading-relaxed">{rec}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
