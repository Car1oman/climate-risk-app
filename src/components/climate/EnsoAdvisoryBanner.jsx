// @ts-nocheck
import { useState } from "react";
import {
  AlertTriangle, Info, ChevronDown, ChevronRight,
  ExternalLink, Waves, Droplets, TrendingUp, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnsoStatus } from "@/hooks/useEnsoStatus";

// ── Style maps ────────────────────────────────────────────────────────────────

const PHASE_STYLES = {
  el_nino_warning: {
    border:    "border-orange-500/40",
    bg:        "bg-orange-500/10",
    chipBg:    "bg-orange-500/20 text-orange-300 border-orange-500/40",
    iconColor: "text-orange-400",
    dot:       "bg-orange-400",
    Icon:      AlertTriangle,
  },
  el_nino_watch: {
    border:    "border-amber-500/40",
    bg:        "bg-amber-500/8",
    chipBg:    "bg-amber-500/20 text-amber-300 border-amber-500/40",
    iconColor: "text-amber-400",
    dot:       "bg-amber-400",
    Icon:      AlertTriangle,
  },
  la_nina_warning: {
    border:    "border-blue-500/40",
    bg:        "bg-blue-500/10",
    chipBg:    "bg-blue-500/20 text-blue-300 border-blue-500/40",
    iconColor: "text-blue-400",
    dot:       "bg-blue-400",
    Icon:      Waves,
  },
  la_nina_watch: {
    border:    "border-sky-500/40",
    bg:        "bg-sky-500/8",
    chipBg:    "bg-sky-500/20 text-sky-300 border-sky-500/40",
    iconColor: "text-sky-400",
    dot:       "bg-sky-400",
    Icon:      Waves,
  },
  neutral: {
    border:    "border-border",
    bg:        "bg-card",
    chipBg:    "bg-muted text-muted-foreground border-border",
    iconColor: "text-muted-foreground",
    dot:       "bg-muted-foreground",
    Icon:      Info,
  },
};

function getStyle(alertCode) {
  return PHASE_STYLES[alertCode] ?? PHASE_STYLES.neutral;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ONIBadge({ oni, phaseSource }) {
  if (oni == null) return null;
  const sign   = oni > 0 ? "+" : "";
  const isGap  = phaseSource === 'advisory' && Math.abs(oni) < 0.5;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-mono",
        isGap
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-border bg-secondary text-muted-foreground"
      )}
      title={isGap ? "ONI bajo umbral ±0.5 °C, pero NOAA emitió Advertencia oficial por acoplamiento océano-atmósfera" : undefined}
    >
      ONI {sign}{oni.toFixed(2)} °C
      {isGap && <span className="text-amber-400 font-sans">*</span>}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EnsoAdvisoryBanner({ className }) {
  const { data, isLoading, isError } = useEnsoStatus();
  const [expanded, setExpanded] = useState(false);

  if (isLoading || isError || !data?.enso) return null;

  const enso     = data.enso;
  const advisory = enso.advisory;

  // Only render when there's an advisory or a non-neutral phase
  if (!advisory?.is_active_alert && enso.phase === 'neutral') return null;

  const alertCode = advisory?.alert_code ?? (
    enso.phase === 'el_nino' ? 'el_nino_warning' : 'la_nina_warning'
  );
  const style     = getStyle(alertCode);
  const { Icon }  = style;
  const label     = advisory?.alert_label_es ?? (
    enso.phase === 'el_nino' ? 'El Niño activo' : 'La Niña activa'
  );

  const isPhaseMismatch = enso.phase_source === 'advisory' && enso.oni_phase !== enso.phase;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3",
        style.border, style.bg, className
      )}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={cn("mt-0.5 flex-shrink-0", style.iconColor)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded border", style.chipBg)}>
                {label}
              </span>
              <ONIBadge oni={enso.oni_latest} phaseSource={enso.phase_source} />
              {enso.trend === 'increasing' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-orange-400">
                  <TrendingUp className="w-3 h-3" /> en aumento
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              NOAA Climate Prediction Center
              {advisory?.issued_date && (
                <span className="ml-1">· {advisory.issued_date}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={expanded ? "Colapsar" : "Ver detalle"}
        >
          {expanded
            ? <ChevronDown  className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />
          }
        </button>
      </div>

      {/* ── Synopsis (always visible) ───────────────────────────────────────── */}
      {advisory?.synopsis && (
        <p className="text-xs text-foreground/80 leading-relaxed border-l-2 border-current border-opacity-20 pl-3">
          {advisory.synopsis}
        </p>
      )}

      {/* ── ONI gap note ────────────────────────────────────────────────────── */}
      {isPhaseMismatch && (
        <div className="flex items-start gap-2 text-[10px] text-amber-300/80 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
          <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>
            El índice ONI estacional muestra {enso.oni_latest > 0 ? "+" : ""}{enso.oni_latest?.toFixed(2)} °C
            (por debajo del umbral ±0.5 °C). NOAA emitió igualmente la <strong>{label}</strong> basándose
            en el acoplamiento océano-atmósfera: vientos ecuatoriales, contenido calórico subsuperficial
            y convección confirman la fase en desarrollo.
          </span>
        </div>
      )}

      {/* ── Expanded detail ────────────────────────────────────────────────── */}
      {expanded && (
        <div className="space-y-3 pt-1 border-t border-border/50">

          {/* Peru impacts */}
          {enso.operational_risks?.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Riesgos operacionales para Perú
              </p>
              <ul className="space-y-1">
                {enso.operational_risks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5", style.dot)} />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Affected regions */}
          {enso.affected_regions?.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Droplets className="w-3 h-3" /> Regiones afectadas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {enso.affected_regions.map((r, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* El Niño Costero note */}
          {enso.phase === 'el_nino' && (
            <div className="text-[10px] text-muted-foreground bg-secondary rounded-lg p-2.5 leading-relaxed">
              <strong className="text-foreground/80">Nota Perú:</strong> El índice ONI mide el
              El Niño global (Niño-3.4). El <strong>El Niño Costero</strong> es independiente y
              se detecta por la anomalía de TSM en Niño-1+2 frente a la costa peruana. Ambos
              pueden ocurrir simultáneamente y amplificar los impactos.
            </div>
          )}

          {/* Forecast / next discussion */}
          {advisory?.next_discussion && (
            <p className="text-[10px] text-muted-foreground">
              Próxima Discusión Diagnóstica ENSO programada para el{" "}
              <strong className="text-foreground/70">{advisory.next_discussion}</strong>.
            </p>
          )}

          {/* Source links */}
          <div className="flex flex-wrap gap-3 pt-1">
            {enso.advisory_url && (
              <a
                href={enso.advisory_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Discusión Diagnóstica ENSO (NOAA CPC — Español)
              </a>
            )}
            <a
              href={enso.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Datos ONI brutos (oni.ascii.txt)
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
