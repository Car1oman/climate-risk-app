// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { SIGNAL_META } from "../constants";
import { TraceBadges, TraceabilityDetails } from "./TraceabilityWidgets";

function RiskCard({ risk }) {
  const [expanded, setExpanded] = useState(false);
  const signalMeta = SIGNAL_META[risk.signal?.signalType] ?? { icon: "⚠️", label: risk.signal?.signalType ?? "Riesgo" };
  const trace = risk.source_traceability ?? risk.signal?.source_traceability;

  return (
    <div className="rounded-lg border border-border bg-secondary overflow-hidden">
      <div className="p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none flex-shrink-0">{signalMeta.icon}</span>
            <p className="text-xs font-semibold text-foreground truncate">{signalMeta.label}</p>
          </div>
          <Badge variant="outline" className="text-[10px] py-0 px-2">Senal observada</Badge>
        </div>

        <TraceBadges trace={trace} />

        {risk.operational_impacts?.length > 0 && (
          <ul className="space-y-1">
            {risk.operational_impacts.slice(0, expanded ? undefined : 3).map((imp, j) => (
              <li key={j} className="flex items-start gap-1.5 text-[11px] text-secondary-foreground">
                <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0 mt-1.5" />
                {imp}
              </li>
            ))}
          </ul>
        )}
      </div>

      {trace && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Metadata cientifica</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {expanded && (
            <div className="px-3 pb-3">
              <TraceabilityDetails trace={trace} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RisksPanel({ risks }) {
  if (!risks?.length) return null;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-500" />
          <span className="font-semibold text-foreground">Senales climaticas para revisar</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Lectura descriptiva con fuente, periodo, escenario SSP y trazabilidad cientifica
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5 pb-4">
        {risks.map((r, i) => <RiskCard key={i} risk={r} />)}
      </CardContent>
    </Card>
  );
}
