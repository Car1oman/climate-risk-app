// @ts-nocheck
import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import MethodologyPanel from "@/components/climate/MethodologyPanel";
import TerritorialContextPanel from "./TerritorialContextPanel";
import AIPanel from "./AIPanel";

/**
 * ScientificFooter — Sprint 16/18.
 * Collapses all scientific / methodology content behind a single toggle.
 * Visually secondary: low contrast, minimal padding, smaller hierarchy.
 * Contains all IPCC/SSP/CMIP6 technical detail — invisible until expanded.
 */
export default function ScientificFooter({ metadata, territorialCtx, rawResponse, docContext }) {
  const [expanded, setExpanded] = useState(false);

  const hasContent = metadata || territorialCtx || rawResponse;
  if (!hasContent) return null;

  return (
    <div className="rounded-lg border border-border/25 bg-transparent overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls="scientific-footer-content"
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" aria-hidden="true" />
          <p className="text-[10px] font-medium text-muted-foreground/70">
            Detalle científico y metodología
          </p>
        </div>
        <ChevronDown
          className={`w-3 h-3 text-muted-foreground/50 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id="scientific-footer-content" className="border-t border-border/20 space-y-0">
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
