// @ts-nocheck
import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronRight, ShieldCheck, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Inlined from server/scientific/projection.js ────────────────────────────

const SCENARIO_DEFS = {
  ssp245: {
    id:    'ssp245', label: 'SSP2-4.5', name: 'Emisiones intermedias',
    badge: 'Moderado', color_hint: 'amber',
    warming_2100_range: '+2.1°C a +3.5°C hacia 2100',
    ipcc_reference: 'IPCC AR6 WGI Tabla SPM.1',
  },
  ssp585: {
    id:    'ssp585', label: 'SSP5-8.5', name: 'Altas emisiones',
    badge: 'Alto', color_hint: 'red',
    warming_2100_range: '+3.3°C a +5.7°C hacia 2100',
    ipcc_reference: 'IPCC AR6 WGI Tabla SPM.1',
  },
};

const TIME_WINDOWS_UI = {
  near_term: { id: 'near_term', label: '2020–2039', short: 'Cercano' },
  mid_term:  { id: 'mid_term',  label: '2040–2059', short: 'Medio'   },
  far_term:  { id: 'far_term',  label: '2060–2079', short: 'Lejano'  },
};

const PROJ_DATA = {
  temperature_mean: {
    label: 'Temperatura media', unit: '°C', variable: 'tas', unitLabel: '°C',
    source: 'IPCC AR6 WGI Atlas — SAM / CMIP6',
    ssp245: {
      near_term: { median: 1.0, p10: 0.7, p90: 1.3, confidence: 'high',   n_models: 35 },
      mid_term:  { median: 1.4, p10: 1.1, p90: 1.8, confidence: 'high',   n_models: 35 },
      far_term:  { median: 1.8, p10: 1.4, p90: 2.3, confidence: 'high',   n_models: 35 },
    },
    ssp585: {
      near_term: { median: 1.1, p10: 0.8, p90: 1.5, confidence: 'high',   n_models: 35 },
      mid_term:  { median: 2.0, p10: 1.5, p90: 2.6, confidence: 'high',   n_models: 35 },
      far_term:  { median: 3.2, p10: 2.4, p90: 4.0, confidence: 'high',   n_models: 35 },
    },
  },
  extreme_heat_days: {
    label: 'Días Tmax > 35°C', unit: 'días/año', variable: 'hd35', unitLabel: 'días/año',
    source: 'IPCC AR6 WGI Cap. 11 / CMIP6 CCKP',
    ssp245: {
      near_term: { median:  8, p10:  3, p90: 16, confidence: 'medium', n_models: 32 },
      mid_term:  { median: 17, p10:  8, p90: 28, confidence: 'medium', n_models: 32 },
      far_term:  { median: 26, p10: 11, p90: 42, confidence: 'medium', n_models: 32 },
    },
    ssp585: {
      near_term: { median: 10, p10:  4, p90: 20, confidence: 'medium', n_models: 32 },
      mid_term:  { median: 28, p10: 14, p90: 46, confidence: 'medium', n_models: 32 },
      far_term:  { median: 55, p10: 29, p90: 85, confidence: 'medium', n_models: 32 },
    },
  },
  precipitation_change: {
    label: 'Precipitación media', unit: '%', variable: 'prpercnt', unitLabel: '%',
    source: 'IPCC AR6 WGI Atlas — SAM / CMIP6',
    note: 'Señal divergente entre modelos en la región andina',
    ssp245: {
      near_term: { median: -2, p10:  -8, p90:  5, confidence: 'low', n_models: 35 },
      mid_term:  { median: -3, p10: -10, p90:  6, confidence: 'low', n_models: 35 },
      far_term:  { median: -4, p10: -13, p90:  7, confidence: 'low', n_models: 35 },
    },
    ssp585: {
      near_term: { median: -3, p10: -10, p90:  6, confidence: 'low', n_models: 35 },
      mid_term:  { median: -5, p10: -14, p90:  8, confidence: 'low', n_models: 35 },
      far_term:  { median: -8, p10: -20, p90: 10, confidence: 'low', n_models: 35 },
    },
  },
  extreme_precipitation: {
    label: 'Precip. extrema (Rx5day)', unit: '%', variable: 'rx5day', unitLabel: '%',
    source: 'IPCC AR6 WGI Cap. 11 / CMIP6 CCKP',
    ssp245: {
      near_term: { median:  3, p10: -2, p90:  9, confidence: 'medium', n_models: 30 },
      mid_term:  { median:  5, p10: -3, p90: 13, confidence: 'medium', n_models: 30 },
      far_term:  { median:  8, p10: -2, p90: 18, confidence: 'medium', n_models: 30 },
    },
    ssp585: {
      near_term: { median:  4, p10: -2, p90: 12, confidence: 'medium', n_models: 30 },
      mid_term:  { median:  8, p10:  0, p90: 19, confidence: 'medium', n_models: 30 },
      far_term:  { median: 14, p10:  2, p90: 28, confidence: 'medium', n_models: 30 },
    },
  },
};

// ─── Narrative builder (mirrors server/scientific/projection.js) ──────────────

const SCENARIO_DESC = {
  ssp245: 'escenario de emisiones intermedias SSP2-4.5',
  ssp585: 'escenario de altas emisiones SSP5-8.5',
};
const CONF_ES = { high: 'alta confianza', medium: 'confianza media', low: 'baja confianza' };
const sign     = v => (v >= 0 ? `+${v}` : `${v}`);
const signTemp = v => { const f = v.toFixed(1); return v >= 0 ? `+${f}` : f; };

function buildNarrative(scenario, window) {
  const temp   = PROJ_DATA.temperature_mean[scenario][window];
  const heat   = PROJ_DATA.extreme_heat_days[scenario][window];
  const precip = PROJ_DATA.precipitation_change[scenario][window];
  const extP   = PROJ_DATA.extreme_precipitation[scenario][window];
  const win    = TIME_WINDOWS_UI[window];

  return (
    `Bajo el ${SCENARIO_DESC[scenario]}, el período ${win.label} proyecta ` +
    `una anomalía de temperatura media de ${signTemp(temp.median)}°C respecto al período de referencia ` +
    `1981–2014 (rango CMIP6: ${signTemp(temp.p10)}°C a ${signTemp(temp.p90)}°C; ` +
    `${CONF_ES[temp.confidence]}, ${temp.n_models} modelos). ` +
    `Los días con Tmax > 35°C se incrementarían en ${sign(heat.median)} días/año de mediana ` +
    `(rango: ${sign(heat.p10)} a ${sign(heat.p90)} días/año; ${CONF_ES[heat.confidence]}). ` +
    `La precipitación media proyecta ${sign(precip.median)}% ` +
    `(rango: ${sign(precip.p10)}% a ${sign(precip.p90)}%; ${CONF_ES[precip.confidence]} ` +
    `por divergencia entre modelos en la región andina). ` +
    `La precipitación extrema Rx5day proyecta ${sign(extP.median)}% ` +
    `(rango: ${sign(extP.p10)}% a ${sign(extP.p90)}%; ${CONF_ES[extP.confidence]}).`
  );
}

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

function ScenarioToggle({ active, onChange }) {
  return (
    <div className="flex gap-2">
      {Object.values(SCENARIO_DEFS).map(s => {
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

function TimeWindowTabs({ active, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-secondary p-1">
      {Object.values(TIME_WINDOWS_UI).map(w => (
        <button
          key={w.id}
          onClick={() => onChange(w.id)}
          className={`flex-1 rounded px-2 py-1.5 text-center transition-colors ${
            active === w.id
              ? 'bg-card border border-border text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <p className="text-[10px] font-semibold">{w.short}</p>
          <p className="text-[9px] text-muted-foreground">{w.label}</p>
        </button>
      ))}
    </div>
  );
}

function ProjectionRow({ varKey, meta, data }) {
  const isNegative = data.median < 0;
  const isNeutral  = data.median === 0;

  const Icon = isNeutral ? Minus : isNegative ? TrendingDown : TrendingUp;
  const trendColor = isNeutral
    ? 'text-muted-foreground'
    : varKey === 'precipitation_change' && isNegative
      ? 'text-amber-400'   // drying is notable but not inherently good/bad
      : isNegative
        ? 'text-blue-400'
        : 'text-rose-400';

  const medStr   = `${sign(data.median)}${meta.unitLabel}`;
  const rangeStr = `[${sign(data.p10)}, ${sign(data.p90)}] ${meta.unitLabel}`;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${trendColor}`} />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-secondary-foreground leading-tight">{meta.label}</p>
          {meta.note && (
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">{meta.note}</p>
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

export default function ProjectionScenarioCard({
  climateData   = null,
  signals       = [],
  traceability  = null,
}) {
  const [activeScenario, setActiveScenario] = useState('ssp245');
  const [activeWindow,   setActiveWindow]   = useState('near_term');
  const [showNarrative,  setShowNarrative]  = useState(false);

  const scenColors  = SCEN_COLORS[activeScenario];
  const narrative   = buildNarrative(activeScenario, activeWindow);
  const winMeta     = TIME_WINDOWS_UI[activeWindow];
  const scenMeta    = SCENARIO_DEFS[activeScenario];

  const confidence = traceability?.confidence ?? climateData?.confidence ?? 'medium';

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
      <ScenarioToggle active={activeScenario} onChange={setActiveScenario} />

      {/* Time Window Tabs */}
      <TimeWindowTabs active={activeWindow} onChange={setActiveWindow} />

      {/* Projection Rows */}
      <div className="space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Variables proyectadas · {scenMeta.label} · {winMeta.label}
        </p>
        {Object.entries(PROJ_DATA).map(([varKey, meta]) => (
          <ProjectionRow
            key={varKey}
            varKey={varKey}
            meta={meta}
            data={meta[activeScenario][activeWindow]}
          />
        ))}
      </div>

      {/* Narrative toggle */}
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

      {/* Uncertainty note */}
      <div className="flex gap-2 rounded-lg bg-secondary/50 border border-border/50 px-3 py-2">
        <Info className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-snug">
          <span className="text-emerald-400 font-medium">Temperatura: alta confianza</span>
          {' '}(señal robusta, 35 modelos CMIP6). {' '}
          <span className="text-rose-400 font-medium">Precipitación: baja confianza</span>
          {' '}— señal divergente en la región andina.
        </p>
      </div>

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3 leading-relaxed">
        Fuente: IPCC AR6 WGI Atlas (región SAM) / CMIP6 CCKP · Baseline: 1981–2014 ·
        Escenarios: {Object.values(SCENARIO_DEFS).map(s => s.label).join(' / ')} ·
        Ventanas: {Object.values(TIME_WINDOWS_UI).map(w => w.label).join(', ')}
      </p>

    </div>
  );
}
