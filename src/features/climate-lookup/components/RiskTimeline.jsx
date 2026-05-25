// @ts-nocheck
/**
 * RiskTimeline — Sprint 19.
 *
 * Shows how each risk type evolves across historical → mid-term → long-term
 * horizons as a visual narrative progression.
 *
 * Props:
 *   consolidatedRisks  ConsolidatedRisk[]  — all risks (all periods)
 *   activeScenario     string              — 'emisiones_moderadas' | 'altas_emisiones'
 */

import { buildTemporalEvolutionSentence } from '@/domain/buildOperationalNarrative';
import { RISK_TYPE_DISPLAY } from '@/constants/riskTypes';

// ─── Config ───────────────────────────────────────────────────────────────────

const PERIOD_NODE = {
  historico:     { label: 'Históricamente', period: '1980–2014', dotColor: 'bg-slate-400'       },
  mediano_plazo: { label: 'Hacia 2050',     period: '2040–2059', dotColor: 'bg-amber-400'        },
  largo_plazo:   { label: 'Hacia 2070',     period: '2060–2079', dotColor: 'bg-orange-500'       },
};

const PERIOD_ORDER = ['historico', 'mediano_plazo', 'largo_plazo'];

// Short descriptive text per (riskType × period × scenario) — concise for inline use
function getNodeSummary(risk, activeScenario) {
  if (!risk) return null;
  if (risk.period === 'historico') {
    return risk.narrativeText;
  }
  const variant = activeScenario && risk.scenarioVariants?.[activeScenario];
  return variant?.narrativeText || risk.narrativeText;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TimelineNode({ nodeConfig, risk, activeScenario, isLast }) {
  if (!risk) return null;
  const summary = getNodeSummary(risk, activeScenario);

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
      <div className={`w-[18px] h-[18px] rounded-full flex-shrink-0 mt-0.5 ring-2 ring-background ${nodeConfig.dotColor}`} aria-hidden="true" />

      {/* Content */}
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{nodeConfig.label}</span>
          <span className="text-[10px] font-mono text-muted-foreground bg-secondary border border-border px-1.5 py-0.5 rounded">
            {nodeConfig.period}
          </span>
        </div>
        {summary && (
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
            {summary}
          </p>
        )}
      </div>
    </div>
  );
}

function RiskTimelineRow({ riskType, risksByPeriod, activeScenario }) {
  const meta = RISK_TYPE_DISPLAY[riskType];
  if (!meta) return null;

  const presentPeriods = PERIOD_ORDER.filter(p => risksByPeriod[p]);
  if (presentPeriods.length < 2) return null; // only show if ≥ 2 periods exist

  const evolutionSentence = buildTemporalEvolutionSentence(riskType);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-border/50">
        <span className="text-base leading-none flex-shrink-0" aria-hidden="true">{meta.icon}</span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-tight ${meta.textColor}`}>{meta.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{evolutionSentence}</p>
        </div>
      </div>

      {/* Timeline nodes */}
      <div className="px-4 pt-3 pb-1">
        {presentPeriods.map((period, idx) => (
          <TimelineNode
            key={period}
            nodeConfig={PERIOD_NODE[period]}
            risk={risksByPeriod[period]}
            activeScenario={activeScenario}
            isLast={idx === presentPeriods.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

/**
 * Groups consolidated risks by riskType and renders one timeline row per
 * phenomenon that spans multiple temporal periods.
 */
export default function RiskTimeline({ consolidatedRisks, activeScenario }) {
  if (!consolidatedRisks?.length) return null;

  // Build map: riskType → { historico?: risk, mediano_plazo?: risk, largo_plazo?: risk }
  const grouped = {};
  for (const risk of consolidatedRisks) {
    if (!grouped[risk.riskType]) grouped[risk.riskType] = {};
    grouped[risk.riskType][risk.period] = risk;
  }

  // Only include types that span at least 2 temporal periods
  const multiPeriodTypes = Object.keys(grouped).filter(rt => {
    const periods = Object.keys(grouped[rt]);
    return periods.length >= 2;
  });

  if (multiPeriodTypes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Evolución del riesgo en el tiempo</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Cómo cambia cada fenómeno desde el pasado hacia las próximas décadas
        </p>
      </div>

      <div className="space-y-3">
        {multiPeriodTypes.map(riskType => (
          <RiskTimelineRow
            key={riskType}
            riskType={riskType}
            risksByPeriod={grouped[riskType]}
            activeScenario={activeScenario}
          />
        ))}
      </div>
    </section>
  );
}
