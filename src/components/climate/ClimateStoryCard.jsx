// @ts-nocheck
import { useState } from "react";
import {
  BookOpen, Database, ShieldCheck, TrendingUp, AlertTriangle,
  ChevronDown, ChevronRight, Lightbulb, History, FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Confidence colour map ────────────────────────────────────────────────────

const CONF_COLORS = {
  high:   "text-green-400 border-green-400/40",
  medium: "text-amber-400 border-amber-400/40",
  low:    "text-slate-400 border-slate-400/40",
};

// ─── Helper sub-components ────────────────────────────────────────────────────

function SourceBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
      <Database className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

function AdaptationRow({ adaptation }) {
  const [expanded, setExpanded] = useState(false);

  const GROUP_ICONS = {
    heat_stress:             "🌡",
    precipitation_intensity: "🌧",
    water_stress:            "💧",
    terrain_instability:     "⛰",
    climate_mode:            "🌊",
  };

  const icon = GROUP_ICONS[adaptation.signal_group] ?? "•";

  return (
    <div className="rounded-lg border border-border bg-secondary p-3 space-y-1.5">
      <button
        className="w-full flex items-start gap-2 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-base leading-none mt-0.5">{icon}</span>
        <p className="text-xs text-secondary-foreground leading-snug flex-1">{adaptation.measure}</p>
        {expanded
          ? <ChevronDown  className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
        }
      </button>
      {expanded && (
        <p className="text-[10px] text-muted-foreground leading-relaxed pl-6 border-t border-border/50 pt-1.5">
          {adaptation.rationale}
        </p>
      )}
    </div>
  );
}

function HistoricalAnchor({ anchor }) {
  if (!anchor) return null;
  return (
    <div className="rounded-lg border border-border bg-secondary/60 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        <History className="w-3 h-3" />
        Referencia histórica
      </div>
      <p className="text-[11px] font-medium text-secondary-foreground">{anchor.label}</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">{anchor.description}</p>
      <p className="text-[10px] text-muted-foreground/70">{anchor.source}</p>
    </div>
  );
}

// ─── New storytelling-aware card ──────────────────────────────────────────────

function StorytellingCard({ storyContext, asset }) {
  const [showUncertainty, setShowUncertainty] = useState(false);

  const { narrative, adaptations, metadata, validation } = storyContext;
  const {
    paragraphs, sources_cited, scenario_label,
    horizon_label, uncertainty_note, historical_anchor,
  } = narrative;

  const confidence = validation?.citations_present ? "medium" : "low";

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Storytelling climático
          </p>
          <h3 className="text-lg font-semibold mt-1">{asset?.name ?? "Activo monitoreado"}</h3>
        </div>
        <Badge
          variant="outline"
          className={`gap-1 text-[10px] flex-shrink-0 ${CONF_COLORS[confidence] ?? CONF_COLORS.medium}`}
        >
          <ShieldCheck className="w-3 h-3" />
          {scenario_label} · {horizon_label}
        </Badge>
      </div>

      {/* Narrative paragraphs */}
      {paragraphs.length > 0 && (
        <div className="space-y-3">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-foreground/85">
              {para}
            </p>
          ))}
        </div>
      )}

      {/* Sources cited */}
      {sources_cited.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Fuentes citadas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sources_cited.map(src => <SourceBadge key={src} label={src} />)}
          </div>
        </div>
      )}

      {/* Uncertainty note — collapsible */}
      <div className="rounded-lg border border-border/50 bg-secondary/40 overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
          onClick={() => setShowUncertainty(v => !v)}
        >
          <FileText className="w-3 h-3 text-muted-foreground" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex-1">
            Nota de incertidumbre
          </p>
          {showUncertainty
            ? <ChevronDown  className="w-3 h-3 text-muted-foreground" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground" />
          }
        </button>
        {showUncertainty && (
          <p className="text-[10px] text-muted-foreground leading-relaxed px-3 pb-3">
            {uncertainty_note}
          </p>
        )}
      </div>

      {/* Adaptation measures */}
      {adaptations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Medidas de adaptación
              {metadata?.sector && metadata.sector !== "general" && (
                <span className="ml-1.5 normal-case text-muted-foreground/70">
                  · sector {metadata.sector}
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {adaptations.map((a, i) => <AdaptationRow key={i} adaptation={a} />)}
          </div>
        </div>
      )}

      {/* Historical anchor */}
      <HistoricalAnchor anchor={historical_anchor} />

      {/* Footer disclaimer */}
      <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
        Interpretación descriptiva basada en evidencia IPCC AR6, umbrales WMO / INGEMMET y
        trazabilidad de fuentes. No representa ranking de riesgo, urgencia operativa ni
        pérdida financiera estimada.
      </p>
    </div>
  );
}

// ─── Legacy card (Sprint 2 era props) ────────────────────────────────────────

function LegacyCard({ asset, climateData, evidence, traceability, signals }) {
  const summary    = evidence?.summary    || climateData?.summary    || asset?.top_risk || "Señales climáticas en observación";
  const source     = traceability?.source || climateData?.source     || "CMIP6 / IPCC AR6 / GRI / Open-Meteo";
  const period     = traceability?.period || climateData?.period     || "Histórico 1980–2014; proyección 2020–2059";
  const scenario   = traceability?.scenario || climateData?.scenario || "SSP2-4.5 / SSP5-8.5";
  const confidence = evidence?.confidence  || climateData?.confidence || "medium";

  const activeSignals = (signals ?? []).filter(
    s => !["enso_phase", "landslide_risk", "huayco_risk", "exposure", "vulnerability", "conditional_enso_risk", "adaptive_capacity"].includes(s.signalType)
  );
  const contextSignals = (signals ?? []).filter(
    s => ["enso_phase", "landslide_risk", "huayco_risk", "exposure", "vulnerability", "conditional_enso_risk", "adaptive_capacity"].includes(s.signalType)
  );
  const ensoSignal    = (signals ?? []).find(s => s.signalType === "enso_phase");
  const terrainSignal = (signals ?? []).find(s => ["landslide_risk", "huayco_risk"].includes(s.signalType));

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storytelling climático</p>
          <h3 className="text-lg font-semibold mt-1">{asset?.name ?? "Activo monitoreado"}</h3>
        </div>
        <Badge variant="outline" className={`gap-1 text-[10px] ${CONF_COLORS[confidence] ?? CONF_COLORS.medium}`}>
          <ShieldCheck className="w-3 h-3" />
          Confianza {confidence}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-foreground/85">
        {summary}. La lectura se presenta como evidencia descriptiva, sin convertir las señales
        en un score único ni en impacto financiero estimado.
      </p>

      {activeSignals.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Señales detectadas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeSignals.slice(0, 4).map((signal, i) => (
              <LegacySignalRow key={i} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {(ensoSignal || terrainSignal || contextSignals.length > 0) && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contexto informacional</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ensoSignal && (
              <LegacyContextRow
                label="ENSO"
                value={ensoSignal.projected != null
                  ? (ensoSignal.projected > 0
                    ? `El Niño (+${ensoSignal.projected.toFixed(2)}°C ONI)`
                    : `La Niña (${ensoSignal.projected.toFixed(2)}°C ONI)`)
                  : "Fase activa"}
              />
            )}
            {terrainSignal && (
              <LegacyContextRow
                label="Terreno"
                value={terrainSignal.threshold_reference ?? "Susceptibilidad topográfica detectada"}
              />
            )}
            {contextSignals.filter(s => !["enso_phase", "landslide_risk", "huayco_risk"].includes(s.signalType)).map((s, i) => (
              <LegacyContextRow
                key={i}
                label={s.signalType === "exposure" ? "Exposición" : s.signalType === "vulnerability" ? "Vulnerabilidad" : s.signalType === "conditional_enso_risk" ? "Riesgo ENSO" : s.signalType === "adaptive_capacity" ? "Cap. adaptativa" : s.signalType}
                value={s.threshold_reference ?? `Score: ${s.projected != null ? s.projected.toFixed(3) : "N/A"}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <LegacyMeta icon={Database}    label="Fuente"        value={source}   />
        <LegacyMeta icon={BookOpen}    label="Período"       value={period}   />
        <LegacyMeta icon={ShieldCheck} label="Escenario SSP" value={scenario} />
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
        Interpretación descriptiva basada en evidencia IPCC AR6, umbrales WRI/WMO y trazabilidad de fuentes.
        No representa ranking de riesgo, urgencia operativa ni pérdida financiera estimada.
      </p>
    </div>
  );
}

function LegacySignalRow({ signal }) {
  const labels = {
    extreme_heat:    "Calor extremo (Tmax > 35°C)",
    severe_heat:     "Calor severo (Tmax > 40°C)",
    tropical_nights: "Noches tropicales (Tmin > 20°C)",
    drought:         "Sequía / estrés hídrico",
    extreme_rain:    "Lluvia extrema",
    temp_increase:   "Aumento temperatura media",
    flood_risk:      "Riesgo de inundación",
    heat_stress:     "Estrés térmico (WBGT + AQI)",
    drought_composite: "Índice compuesto de sequía",
    calibrated_risk: "Riesgo calibrado (P×I/CA)",
  };
  const label   = labels[signal.signalType] ?? signal.signalType;
  const delta   = signal.delta != null
    ? (signal.delta >= 0 ? `+${Number(signal.delta).toFixed(1)}` : Number(signal.delta).toFixed(1))
    : null;
  const pct     = signal.delta_pct != null
    ? (signal.delta_pct >= 0 ? `+${signal.delta_pct.toFixed(0)}%` : `${signal.delta_pct.toFixed(0)}%`)
    : null;
  const horizon = signal.horizon === "mid_term" ? "2040–2059" : "2020–2039";

  return (
    <div className="rounded-lg bg-secondary border border-border p-2.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="w-3 h-3 text-primary flex-shrink-0" />
        <p className="text-[11px] font-medium text-secondary-foreground leading-tight">{label}</p>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {delta ? `Delta: ${delta}` : ""}
        {pct   ? ` (${pct})` : ""}
        {` · ${horizon}`}
        {signal.confidence ? ` · Conf. ${signal.confidence}` : ""}
      </p>
    </div>
  );
}

function LegacyContextRow({ label, value }) {
  return (
    <div className="rounded-lg bg-secondary border border-border p-2.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <p className="text-[11px] font-medium text-secondary-foreground">{label}</p>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{value}</p>
    </div>
  );
}

function LegacyMeta({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-secondary p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <p className="text-xs text-secondary-foreground mt-1 leading-snug break-words">{value}</p>
    </div>
  );
}

// ─── Public export — dispatcher ───────────────────────────────────────────────

/**
 * ClimateStoryCard
 *
 * Sprint 10 mode (preferred): pass `storyContext` (output of buildStorytellingContext()).
 * Legacy mode (backward-compatible): pass climateData, evidence, traceability, signals.
 */
export default function ClimateStoryCard({
  // Sprint 10 props
  storyContext = null,
  // Legacy props
  asset        = null,
  climateData  = null,
  evidence     = null,
  traceability = null,
  signals      = [],
}) {
  if (storyContext) {
    return <StorytellingCard storyContext={storyContext} asset={asset} />;
  }
  return (
    <LegacyCard
      asset={asset}
      climateData={climateData}
      evidence={evidence}
      traceability={traceability}
      signals={signals}
    />
  );
}
