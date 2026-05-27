// @ts-nocheck
/**
 * RiskTimeline — Sprint 22.
 *
 * Driven by ConsolidatedRiskTimeline[] (produced by groupByRiskType() in the hook).
 * Shows how each risk type evolves across historical → mid-term → long-term
 * horizons as a visual narrative progression.
 *
 * Props:
 *   timelineRisks  ConsolidatedRiskTimeline[]  — timeline model from useClimateAnalysis
 *   activeScenario string                      — 'emisiones_moderadas' | 'altas_emisiones'
 */

import { RISK_TYPE_DISPLAY } from '@/constants/riskTypes';

// ─── Config ───────────────────────────────────────────────────────────────────

const PERIOD_NODE = {
  historical:  { label: 'Históricamente', period: '1980–2014', dotColor: 'bg-slate-400'  },
  shortTerm:   { label: 'Hacia 2030',     period: '2020–2039', dotColor: 'bg-yellow-400' },
  mediumTerm:  { label: 'Hacia 2050',     period: '2040–2059', dotColor: 'bg-amber-400'  },
  longTerm:    { label: 'Hacia 2070',     period: '2060–2079', dotColor: 'bg-orange-500' },
};

const PERIOD_ORDER = ['historical', 'shortTerm', 'mediumTerm', 'longTerm'];

// Map activeScenario slug to ConsolidatedRiskTimeline's scenario key
const SCENARIO_TO_KEY = {
  'emisiones_moderadas': 'moderateEmissions',
  'altas_emisiones':     'highEmissions',
};

/**
 * Extracts the narrative for a given period node from a ConsolidatedRiskTimeline,
 * respecting the active emission scenario for projection periods.
 */
function getTimelineNodeNarrative(timeline, period, activeScenario) {
  if (period === 'historical') return timeline.historical?.narrative ?? null;
  const scenarioKey = SCENARIO_TO_KEY[activeScenario] ?? 'moderateEmissions';
  if (period === 'shortTerm')  return timeline.shortTerm?.[scenarioKey]?.narrative ?? null;
  if (period === 'mediumTerm') return timeline.mediumTerm?.[scenarioKey]?.narrative ?? null;
  if (period === 'longTerm')   return timeline.longTerm?.[scenarioKey]?.narrative ?? null;
  return null;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TimelineNode({ nodeConfig, narrative, isLast }) {
  return (
    <div className="flex gap-3 relative">
      {/* Vertical line connector */}
      {!isLast && (
        <div
          className="absolute left-[9px] top-5 bottom-0 w-px bg-border/60"
          aria-hidden="true"
        />
      )}

      {/* Dot */}
      <div
        className={`w-[18px] h-[18px] rounded-full flex-shrink-0 mt-0.5 ring-2 ring-background ${nodeConfig.dotColor}`}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{nodeConfig.label}</span>
          <span className="text-[10px] font-mono text-muted-foreground bg-secondary border border-border px-1.5 py-0.5 rounded">
            {nodeConfig.period}
          </span>
        </div>
        {narrative && (
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{narrative}</p>
        )}
      </div>
    </div>
  );
}

function RiskTimelineRow({ timeline, activeScenario }) {
  const meta = RISK_TYPE_DISPLAY[timeline.riskType];
  if (!meta) return null;

  // Only render rows that span at least 2 temporal periods
  const presentPeriods = PERIOD_ORDER.filter(p => timeline[p] != null);
  if (presentPeriods.length < 2) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-border/50">
        <span className="text-base leading-none flex-shrink-0" aria-hidden="true">{meta.icon}</span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-tight ${meta.textColor}`}>{meta.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {timeline.evolutionSentence}
          </p>
        </div>
      </div>

      {/* Timeline nodes */}
      <div className="px-4 pt-3 pb-1">
        {presentPeriods.map((period, idx) => (
          <TimelineNode
            key={period}
            nodeConfig={PERIOD_NODE[period]}
            narrative={getTimelineNodeNarrative(timeline, period, activeScenario)}
            isLast={idx === presentPeriods.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RiskTimeline({ timelineRisks, activeScenario }) {
  if (!timelineRisks?.length) return null;

  // Only include risk types that span at least 2 temporal periods
  const multiPeriodTimelines = timelineRisks.filter(t => {
    const count = PERIOD_ORDER.filter(p => t[p] != null).length;
    return count >= 2;
  });

  if (multiPeriodTimelines.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Evolución del riesgo en el tiempo</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Cómo cambia cada fenómeno desde el pasado hacia las próximas décadas
        </p>
      </div>

      <div className="space-y-3">
        {multiPeriodTimelines.map(timeline => (
          <RiskTimelineRow
            key={timeline.riskType}
            timeline={timeline}
            activeScenario={activeScenario}
          />
        ))}
      </div>
    </section>
  );
}
