// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, BookOpen, ExternalLink } from "lucide-react";
import {
  DATA_SOURCES,
  SSP_SCENARIOS,
  TEMPORAL_HORIZONS,
  COMPOSITE_SCORE_FORMULA,
  HXE_FORMULA,
  ANALYSIS_LIMITATIONS,
  RESPONSIBLE_INSTITUTIONS,
  resolveSourceKey,
} from "@/lib/methodologyConfig";

// ── Style maps ────────────────────────────────────────────────────────────────

const SOURCE_BADGE = {
  climate_cells: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700",
  gri:           "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/50 dark:text-violet-200 dark:border-violet-700",
  open_meteo:    "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/50 dark:text-sky-200 dark:border-sky-700",
  world_bank:    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700",
  enso:          "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700",
  terrain:       "bg-stone-100 text-stone-800 border-stone-300 dark:bg-stone-700/50 dark:text-stone-200 dark:border-stone-600",
  ssp245:        "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/50 dark:text-teal-200 dark:border-teal-700",
  ssp585:        "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-700",
};

const CONFIDENCE_BADGE = {
  high:   "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700",
  medium: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700",
  low:    "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-700/50 dark:text-zinc-300 dark:border-zinc-600",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionToggle({ icon, title, expanded, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2.5 text-left group"
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
        <span>{icon}</span>
        {title}
      </span>
      {expanded
        ? <ChevronUp   className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 flex-shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 flex-shrink-0" />}
    </button>
  );
}

function Divider() {
  return <div className="border-t border-zinc-100 dark:border-zinc-800" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MethodologyPanel({ metadata }) {
  const [open, setOpen]       = useState(false);
  const [sections, setSections] = useState({
    sources:      true,
    scoring:      false,
    scenarios:    false,
    horizons:     false,
    institutions: false,
    limitations:  false,
  });

  const toggle = (key) => setSections((s) => ({ ...s, [key]: !s[key] }));

  // Resolve active source keys from raw backend metadata
  const rawSources  = metadata?.data_sources ?? [];
  const activeKeys  = rawSources.length > 0
    ? rawSources.map(resolveSourceKey).filter(Boolean)
    : [];

  const scenarioKey = metadata?.scenario === "pesimista"
    ? "ssp585"
    : metadata?.scenario === "optimista"
    ? "ssp245"
    : null;

  // Badge row: active sources + scenario, or all sources when no analysis yet
  const badgeIds = activeKeys.length > 0
    ? [...new Set([...activeKeys, ...(scenarioKey ? [scenarioKey] : ["ssp245", "ssp585"])])]
    : ["climate_cells", "gri", "open_meteo", "world_bank", "enso", "terrain", "ssp245", "ssp585"];

  const isActive = (id) =>
    activeKeys.length === 0 ||
    activeKeys.includes(id) ||
    id === scenarioKey ||
    (DATA_SOURCES[id]?.type === "scenario" && !scenarioKey);

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      {/* ── Header (always visible) ── */}
      <CardHeader className="pb-0 pt-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-start justify-between gap-3 group"
        >
          <div className="flex-1 text-left">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                Panel de Metodología y Fuentes
              </span>
            </CardTitle>
            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
              Fuentes, escenarios, fórmulas y limitaciones del análisis climático
            </p>
          </div>
          <span className="flex-shrink-0 mt-0.5">
            {open
              ? <ChevronUp   className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
              : <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />}
          </span>
        </button>

        {/* Dynamic source badges — always visible */}
        <div className="flex flex-wrap gap-1.5 pb-3 pt-2">
          {badgeIds.map((id) => {
            const src = DATA_SOURCES[id];
            if (!src) return null;
            return (
              <Badge
                key={id}
                variant="outline"
                title={src.description}
                className={`text-[10px] py-0.5 px-2 border font-medium transition-opacity cursor-default ${
                  SOURCE_BADGE[id] ?? "bg-zinc-100 text-zinc-600 border-zinc-300"
                } ${isActive(id) ? "opacity-100" : "opacity-35"}`}
              >
                {src.icon} {src.label}
              </Badge>
            );
          })}
        </div>
      </CardHeader>

      {/* ── Expandable body ── */}
      {open && (
        <CardContent className="space-y-0 pb-4 pt-0">
          <Divider />

          {/* ── 1. Fuentes utilizadas ── */}
          <SectionToggle
            icon="🔗"
            title="Fuentes utilizadas en este análisis"
            expanded={sections.sources}
            onToggle={() => toggle("sources")}
          />
          {sections.sources && (
            <div className="space-y-2 pb-3">
              {Object.values(DATA_SOURCES)
                .filter((s) => s.type !== "scenario")
                .map((src) => (
                  <div
                    key={src.id}
                    className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 space-y-1.5 transition-opacity ${
                      activeKeys.length > 0 && !activeKeys.includes(src.id)
                        ? "opacity-35"
                        : "opacity-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {src.icon} {src.label}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] py-0 px-1.5 flex-shrink-0 border ${CONFIDENCE_BADGE[src.confidenceLevel]}`}
                      >
                        {src.confidence}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {src.description}
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                      {src.institution}
                    </p>
                  </div>
                ))}
            </div>
          )}

          <Divider />

          {/* ── 2. ¿Cómo se calculó este resultado? ── */}
          <SectionToggle
            icon="🧮"
            title="¿Cómo se calculó este resultado?"
            expanded={sections.scoring}
            onToggle={() => toggle("scoring")}
          />
          {sections.scoring && (
            <div className="space-y-3 pb-3">
              {/* Composite score */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 space-y-2.5">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  {COMPOSITE_SCORE_FORMULA.title}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Referencia: {COMPOSITE_SCORE_FORMULA.reference}
                </p>
                <div className="rounded bg-zinc-100 dark:bg-zinc-900/70 px-3 py-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">
                  {COMPOSITE_SCORE_FORMULA.formula}
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Escala: {COMPOSITE_SCORE_FORMULA.scale}
                </p>
                <div className="space-y-1.5">
                  {COMPOSITE_SCORE_FORMULA.components.map((c) => (
                    <div key={c.key} className="flex items-start gap-2">
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 flex-shrink-0 border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 font-mono"
                      >
                        {c.weight}
                      </Badge>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{c.label}: </span>
                        {c.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Urgency levels */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                  Significado del score — niveles de urgencia
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {COMPOSITE_SCORE_FORMULA.urgency_levels.map((u) => (
                    <div
                      key={u.level}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2"
                    >
                      <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 capitalize">
                        {u.level} · {u.threshold}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {u.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* H×E×I formula */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 space-y-2.5">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  {HXE_FORMULA.title}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Referencia: {HXE_FORMULA.reference}
                </p>
                <div className="rounded bg-zinc-100 dark:bg-zinc-900/70 px-3 py-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {HXE_FORMULA.formula}
                </div>
                <div className="space-y-1.5">
                  {HXE_FORMULA.components.map((c) => (
                    <div key={c.key} className="flex items-start gap-2">
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 flex-shrink-0 border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 font-mono"
                      >
                        {c.weight}
                      </Badge>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {c.key} — {c.label}:{" "}
                        </span>
                        {c.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Divider />

          {/* ── 3. Escenarios climáticos ── */}
          <SectionToggle
            icon="📡"
            title="Escenarios climáticos (SSP)"
            expanded={sections.scenarios}
            onToggle={() => toggle("scenarios")}
          />
          {sections.scenarios && (
            <div className="space-y-2 pb-3">
              {Object.values(SSP_SCENARIOS).map((s) => {
                const key = s.code === "SSP5-8.5" ? "ssp585" : "ssp245";
                return (
                  <div
                    key={s.code}
                    className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 space-y-2 transition-opacity ${
                      scenarioKey && scenarioKey !== key ? "opacity-35" : "opacity-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {s.code} — {s.name}
                      </p>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                        {s.nickname}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Forzamiento", value: s.forcing },
                        { label: "Temp. 2100",  value: s.temp_range },
                        { label: "CO₂ 2100",   value: s.co2_2100 },
                      ].map((m) => (
                        <div key={m.label} className="text-center">
                          <p className="text-[9px] text-zinc-400 uppercase tracking-widest">{m.label}</p>
                          <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">{m.value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{s.description}</p>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                        Impactos en Perú
                      </p>
                      <ul className="space-y-0.5">
                        {s.peru_impacts.map((imp, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400"
                          >
                            <span className="w-1 h-1 rounded-full bg-zinc-400 flex-shrink-0 mt-1.5" />
                            {imp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Divider />

          {/* ── 4. Horizonte temporal ── */}
          <SectionToggle
            icon="🕐"
            title="Horizonte temporal del análisis"
            expanded={sections.horizons}
            onToggle={() => toggle("horizons")}
          />
          {sections.horizons && (
            <div className="space-y-1.5 pb-3">
              {TEMPORAL_HORIZONS.map((h) => (
                <div
                  key={h.code}
                  className="flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5"
                >
                  <div className="flex-shrink-0 w-24 text-right">
                    <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">{h.label}</p>
                    <p className="text-[10px] text-zinc-400 font-mono">{h.period}</p>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {h.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          <Divider />

          {/* ── 5. Instituciones responsables ── */}
          <SectionToggle
            icon="🏛️"
            title="Instituciones responsables"
            expanded={sections.institutions}
            onToggle={() => toggle("institutions")}
          />
          {sections.institutions && (
            <div className="space-y-1.5 pb-3">
              {RESPONSIBLE_INSTITUTIONS.map((inst) => (
                <div
                  key={inst.name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5"
                >
                  <div>
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{inst.name}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{inst.role}</p>
                  </div>
                  <a
                    href={inst.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}

          <Divider />

          {/* ── 6. Limitaciones ── */}
          <SectionToggle
            icon="⚠️"
            title="Limitaciones del análisis"
            expanded={sections.limitations}
            onToggle={() => toggle("limitations")}
          />
          {sections.limitations && (
            <div className="pb-1">
              <ul className="space-y-1.5">
                {ANALYSIS_LIMITATIONS.map((lim, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[11px] text-zinc-500 dark:text-zinc-400"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                    {lim}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
