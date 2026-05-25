// @ts-nocheck
import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import MethodologyPanel from "@/components/climate/MethodologyPanel";
import TerritorialContextPanel from "./TerritorialContextPanel";
import AIPanel from "./AIPanel";

/**
 * ScientificFooter — Sprint 16.
 * Collapses all scientific / methodology content behind a single toggle.
 * Starts collapsed so the main executive view is uncluttered.
 *
 * @param {object|null} metadata       - Raw API metadata (passed to MethodologyPanel)
 * @param {object|null} territorialCtx - World Bank territorial data
 * @param {object|null} rawResponse    - Full API response (passed to AIPanel)
 * @param {object|null} docContext     - Document context (passed to AIPanel)
 */
export default function ScientificFooter({ metadata, territorialCtx, rawResponse, docContext }) {
  const [expanded, setExpanded] = useState(false);

  const hasContent = metadata || territorialCtx || rawResponse;
  if (!hasContent) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FlaskConical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Detalle científico y metodología</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Fuentes, escenarios y notas técnicas</p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-border/40 space-y-0">
          <MethodologyPanel metadata={metadata} />

          {territorialCtx && (
            <div className="px-4 pb-4">
              <TerritorialContextPanel data={territorialCtx} />
            </div>
          )}

          {rawResponse && (
            <div className="px-4 pb-4">
              <AIPanel analysis={rawResponse} docContext={docContext} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
