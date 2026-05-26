// @ts-nocheck
import { useMemo } from "react";
import RiskPeriodSection from "./RiskPeriodSection";

const PERIOD_TABS = [
  { key: 'historico',     label: 'Histórico',     period: '1980–2014' },
  { key: 'mediano_plazo', label: 'Mediano plazo',  period: '2040–2059' },
  { key: 'largo_plazo',   label: 'Largo plazo',    period: '2060–2079' },
];

/**
 * RiskPeriodTabs — Sprint 20.
 * Collapses histórico / mediano plazo / largo plazo into a single tabbed section.
 * Eliminates ~60% of vertical scroll caused by three consecutive full-height sections.
 *
 * Props:
 * @param {ConsolidatedRisk[]} historicalRisks
 * @param {ConsolidatedRisk[]} midTermRisks
 * @param {ConsolidatedRisk[]} longTermRisks
 * @param {NarrativeReport}    narrativeReport
 * @param {object|null}        projections       - Layer9 projection context
 * @param {string}             selectedPeriod    - controlled from ClimateRiskLookup
 * @param {function}           onPeriodChange    - elevates tab selection to parent
 * @param {string}             activeScenario    - shared scenario state
 * @param {function}           onScenarioChange  - update shared scenario state
 */
export default function RiskPeriodTabs({
  historicalRisks,
  midTermRisks,
  longTermRisks,
  narrativeReport,
  projections,
  selectedPeriod,
  onPeriodChange,
  activeScenario,
  onScenarioChange,
}) {
  const available = useMemo(() => {
    const map = {
      historico:     historicalRisks,
      mediano_plazo: midTermRisks,
      largo_plazo:   longTermRisks,
    };
    return PERIOD_TABS.filter(t => (map[t.key]?.length ?? 0) > 0);
  }, [historicalRisks, midTermRisks, longTermRisks]);

  // Resolve controlled selectedPeriod: if parent value isn't available, fall back to first tab.
  const activeTab = useMemo(() => {
    if (!available.length) return null;
    const keys = available.map(t => t.key);
    return keys.includes(selectedPeriod) ? selectedPeriod : keys[0];
  }, [available, selectedPeriod]);

  if (!available.length) return null;

  const narrativeMap = {
    historico:     narrativeReport?.historicalNarrative,
    mediano_plazo: narrativeReport?.midTermNarrative,
    largo_plazo:   narrativeReport?.longTermNarrative,
  };

  const risksMap = {
    historico:     historicalRisks,
    mediano_plazo: midTermRisks,
    largo_plazo:   longTermRisks,
  };

  const currentTab = available.find(t => t.key === activeTab) ?? available[0];

  return (
    <section className="space-y-4">
      {/* Period tab selector */}
      <div
        className="flex gap-1 p-1 rounded-lg bg-secondary border border-border"
        role="tablist"
        aria-label="Período de análisis"
      >
        {available.map(tab => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={currentTab.key === tab.key}
            onClick={() => onPeriodChange?.(tab.key)}
            className={`flex-1 flex flex-col items-center py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
              currentTab.key === tab.key
                ? 'bg-card border border-border text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[9px] font-mono mt-0.5 ${
              currentTab.key === tab.key ? 'text-muted-foreground' : 'text-muted-foreground/50'
            }`}>{tab.period}</span>
          </button>
        ))}
      </div>

      {/* Active period content */}
      <div role="tabpanel" aria-label={currentTab.label}>
        <RiskPeriodSection
          period={currentTab.key}
          risks={risksMap[currentTab.key]}
          narrativeText={narrativeMap[currentTab.key]}
          projections={projections}
          activeScenario={activeScenario}
          onScenarioChange={onScenarioChange}
        />
      </div>
    </section>
  );
}
