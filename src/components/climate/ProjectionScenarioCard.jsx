// @ts-nocheck
import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronRight, ShieldCheck, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Short display units — UI concern only ────────────────────────────────────
// Full unit strings live in Layer9 PROJECTION_DATA on the server.
const UNIT_SHORT = {
  temperature_mean:      '°C',
  extreme_heat_days:     'días/año',
  precipitation_change:  '%',
  extreme_precipitation: '%',
};

// ─── Scenario color helpers ───────────────────────────────────────────────────

const SCEN_COLORS = {
  ssp245: {
    active:   'bg-amber-400/15 border-amber-400/50 text-amber-300',
    inactive: 'border-border text-muted-foreground hover:border-amber-400/30',
    badge:    'text-amber-400 border-amber-400/40',
    accent:   'text-amber-400',
  },
  ssp585: {
    active:   'bg-red-400/15 border-red-400/50 text-red-300',
    inactive: 'border-border text-muted-foreground hover:border-red-400/30',
    badge:    'text-red-400 border-red-400/40',
    accent:   'text-red-400',
  },
};

const CONF_COLORS = {
  high:   'text-emerald-400',
  medium: 'text-amber-400',
  low:    'text-rose-400',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScenarioToggle({ scenarios, active, onChange }) {
  return (
    <div className="flex gap-2">
      {Object.values(scenarios).map(s => {
        const colors = SCEN_COLORS[s.id];
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
              isActive ? colors.active : colors.inactive
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold font-mono">{s.label}</span>
              <Badge
                variant="outline"
                className={`text-[9px] px-1.5 py-0 ${isActive ? colors.badge : 'border-border text-muted-foreground'}`}
              >
                {s.badge}
              </Badge>
            </div>
            <p className="text-[10px] mt-0.5 opacity-75">{s.name}</p>
            {isActive && (
              <p className="text-[9px] mt-1 opacity-60">{s.warming_2100_range}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TimeWindowTabs({ timeWindows, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-secondary p-1">
      {Object.values(timeWindows).map(w => (
        <button
          key={w.id}
          onClick={() => onChange(w.id)}
          className={`flex-1 rounded px-2 py-1.5 text-center transition-colors ${
            active === w.id
              ? 'bg-card border border-border text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <p className="text-[10px] font-semibold">{w.short ?? w.id}</p>
          <p className="text-[9px] text-muted-foreground">{w.label}</p>
        </button>
      ))}
    </div>
  );
}

function ProjectionRow({ varKey, data }) {
  const unitLabel = UNIT_SHORT[varKey] ?? '';
  const sign      = v => (v >= 0 ? `+${v}` : `${v}`);
  const signF1    = v => { const f = Number(v).toFixed(1); return v >= 0 ? `+${f}` : f; };
  const isTemp    = varKey === 'temperature_mean';

  const medVal    = data.median ?? 0;
  const isNegative = medVal < 0;
  const isNeutral  = medVal === 0;
  const Icon       = isNeutral ? Minus : isNegative ? TrendingDown : TrendingUp;
  const trendColor = isNeutral
    ? 'text-muted-foreground'
    : varKey === 'precipitation_change' && isNegative
      ? 'text-amber-400'
      : isNegative
        ? 'text-blue-400'
        : 'text-rose-400';

  const medStr   = isTemp ? `${signF1(medVal)}${unitLabel}` : `${sign(medVal)}${unitLabel}`;
  const rangeStr = isTemp
    ? `[${signF1(data.p10)}, ${signF1(data.p90)}] ${unitLabel}`
    : `[${sign(data.p10)}, ${sign(data.p90)}] ${unitLabel}`;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${trendColor}`} />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-secondary-foreground leading-tight">
            {data.label}
          </p>
          {data.note && (
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">{data.note}</p>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-[13px] font-mono font-bold ${trendColor}`}>{medStr}</p>
        <p className="text-[9px] text-muted-foreground mt-0.5">{rangeStr}</p>
        <p className={`text-[9px] font-medium mt-0.5 ${CONF_COLORS[data.confidence]}`}>
          {data.confidence}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * ProjectionScenarioCard — Sprint 15 (connected to Layer9).
 *
 * @param {object|null} projectionContext  - Layer9 buildProjectionContext() output.
 *   Shape: { scenarios, time_windows, projections, narratives, uncertainty }
 *   Passed from useClimateAnalysis().projections.
 * @param {object|null} traceability       - Optional traceability metadata.
 */
export default function ProjectionScenarioCard({
  projectionContext = null,
  traceability      = null,
}) {
  const [activeScenario, setActiveScenario] = useState('ssp245');
  const [activeWindow,   setActiveWindow]   = useState('near_term');
  const [showNarrative,  setShowNarrative]  = useState(false);

  if (!projectionContext) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-[11px] text-muted-foreground">
          Proyecciones SSP no disponibles — ejecuta un análisis para cargar los escenarios CMIP6.
        </p>
      </div>
    );
  }

  const { scenarios, time_windows, projections, narratives, uncertainty } = projectionContext;

  const scenColors = SCEN_COLORS[activeScenario];
  const scenMeta   = scenarios[activeScenario];
  const winMeta    = time_windows[activeWindow];

  // Active window's data for all variables
  const windowData = projections?.[activeScenario]?.[activeWindow] ?? {};

  // Narrative for active scenario × window
  const narrative = narratives?.find(
    n => n.scenario === activeScenario && n.window === activeWindow
  )?.text ?? '';

  const confidence = traceability?.confidence ?? 'medium';

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Proyecciones CMIP6
          </p>
          <h3 className="text-base font-semibold mt-0.5">Escenarios SSP</h3>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] shrink-0">
          <ShieldCheck className="w-3 h-3" />
          {confidence}
        </Badge>
      </div>

      {/* Scenario Toggle */}
      <ScenarioToggle
        scenarios={scenarios}
        active={activeScenario}
        onChange={setActiveScenario}
      />

      {/* Time Window Tabs */}
      <TimeWindowTabs
        timeWindows={time_windows}
        active={activeWindow}
        onChange={setActiveWindow}
      />

      {/* Projection Rows */}
      <div className="space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Variables proyectadas · {scenMeta?.label} · {winMeta?.label}
        </p>
        {Object.entries(windowData).map(([varKey, data]) => (
          <ProjectionRow
            key={varKey}
            varKey={varKey}
            data={data}
          />
        ))}
      </div>

      {/* Narrative toggle */}
      {narrative && (
        <div>
          <button
            onClick={() => setShowNarrative(v => !v)}
            className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${scenColors.accent}`}
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${showNarrative ? 'rotate-90' : ''}`} />
            {showNarrative ? 'Ocultar interpretación' : 'Ver interpretación narrativa'}
          </button>
          {showNarrative && (
            <p className="mt-2 text-[11px] text-secondary-foreground/90 leading-relaxed border-l-2 border-border pl-3">
              {narrative}
            </p>
          )}
        </div>
      )}

      {/* Uncertainty note */}
      {uncertainty && (
        <div className="flex gap-2 rounded-lg bg-secondary/50 border border-border/50 px-3 py-2">
          <Info className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-snug">
            <span className="text-emerald-400 font-medium">
              Temperatura: {uncertainty.temperature_confidence === 'high' ? 'alta confianza' : uncertainty.temperature_confidence}
            </span>
            {' '}(señal robusta en el ensamble CMIP6).{' '}
            <span className="text-rose-400 font-medium">
              Precipitación: {uncertainty.precipitation_confidence === 'low' ? 'baja confianza' : uncertainty.precipitation_confidence}
            </span>
            {' '}— señal divergente en la región andina.
          </p>
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3 leading-relaxed">
        Fuente: IPCC AR6 WGI Atlas (región SAM) / CMIP6 CCKP · Baseline: 1981–2014 ·
        Escenarios: {Object.values(scenarios).map(s => s.label).join(' / ')} ·
        Ventanas: {Object.values(time_windows).map(w => w.label).join(', ')}
      </p>

    </div>
  );
}
