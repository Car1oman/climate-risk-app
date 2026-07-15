import * as React from "react";

const STATUS_COLORS = {
  available: "text-green-600 bg-green-50 border-green-200",
  failed: "text-red-600 bg-red-50 border-red-200",
  out_of_coverage: "text-yellow-600 bg-yellow-50 border-yellow-200",
};

export function SourceList({ stages }) {
  const acquisition = stages?.find(s => s.stage_name === "Acquisition");
  if (!acquisition?.output?.sources_consulted) return null;

  const sources = acquisition.output.sources_consulted;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Fuentes consultadas ({sources.length})
      </h3>
      <div className="space-y-1.5">
        {sources.map((source, i) => {
          const status = source.coverage_status || "failed";
          const colors = STATUS_COLORS[status] || STATUS_COLORS.failed;
          return (
            <div
              key={`${source.source_name}-${i}`}
              className={`flex items-center justify-between px-3 py-2 rounded-md border text-sm ${colors}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{source.source_name}</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {source.source_domain}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {source.spatial_distance_km != null && (
                  <span className="text-xs tabular-nums">
                    {source.spatial_distance_km.toFixed(1)} km
                  </span>
                )}
                {source.duration_ms > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {source.duration_ms}ms
                  </span>
                )}
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  status === "available" ? "bg-green-100 text-green-700" :
                  status === "out_of_coverage" ? "bg-yellow-100 text-yellow-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {status === "available" ? "Disponible" :
                   status === "out_of_coverage" ? "Sin cobertura" : "Error"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
