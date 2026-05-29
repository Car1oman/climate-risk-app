// @ts-nocheck
import { useEffect, useMemo } from "react";
import RiskPeriodSection from "./RiskPeriodSection";

const PERIOD_TABS = [
  { key: 'historico',     label: 'Histórico',      period: '1980–2014' },
  { key: 'corto_plazo',   label: 'Corto plazo',    period: '2020–2039' },
  { key: 'mediano_plazo', label: 'Mediano plazo',   period: '2040–2059' },
  { key: 'largo_plazo',   label: 'Largo plazo',     period: '2060–2079' },
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
  shortTermRisks,
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
      corto_plazo:   shortTermRisks,
      mediano_plazo: midTermRisks,
      largo_plazo:   longTermRisks,
    };
    return PERIOD_TABS.filter(t => (map[t.key]?.length ?? 0) > 0);
  }, [historicalRisks, shortTermRisks, midTermRisks, longTermRisks]);

  // Resolve controlled selectedPeriod: if parent value isn't available, fall back to first tab.
  const activeTab = useMemo(() => {
    if (!available.length) return null;
    const keys = available.map(t => t.key);
    return keys.includes(selectedPeriod) ? selectedPeriod : keys[0];
  }, [available, selectedPeriod]);

  // Sync parent when activeTab was corrected (selectedPeriod not in available).
  // Runs only when activeTab or selectedPeriod changes; condition prevents loop.
  useEffect(() => {
    if (activeTab !== null && activeTab !== selectedPeriod) {
      onPeriodChange?.(activeTab);
    }
  }, [activeTab, selectedPeriod, onPeriodChange]);

  if (!available.length) {
    if (import.meta.env.DEV) {
      console.warn(
        '[RiskPeriodTabs] Sin tabs disponibles aunque el componente está montado. ' +
        `histórico=${historicalRisks?.length ?? 'nil'}, corto=${shortTermRisks?.length ?? 'nil'}, ` +
        `mediano=${midTermRisks?.length ?? 'nil'}, largo=${longTermRisks?.length ?? 'nil'}. ` +
        'Verificar claves de período en normalizeRisks().'
      );
      return (
        <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 px-5 py-6 text-center space-y-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">[DEV] RiskPeriodTabs: sin tabs disponibles</p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            histórico={historicalRisks?.length ?? 'nil'} · corto={shortTermRisks?.length ?? 'nil'} · mediano={midTermRisks?.length ?? 'nil'} · largo={longTermRisks?.length ?? 'nil'}
          </p>
          <p className="text-[10px] text-amber-500 dark:text-amber-500 mt-1">Ver normalizeRisks() → campo period</p>
        </div>
      );
    }
    return null;
  }

  const narrativeMap = {
    historico:     narrativeReport?.historicalNarrative,
    corto_plazo:   narrativeReport?.nearTermNarrative,
    mediano_plazo: narrativeReport?.midTermNarrative,
    largo_plazo:   narrativeReport?.longTermNarrative,
  };

  const risksMap = {
    historico:     historicalRisks,
    corto_plazo:   shortTermRisks,
    mediano_plazo: midTermRisks,
    largo_plazo:   longTermRisks,
  };

  const currentTab = available.find(t => t.key === activeTab) ?? available[0];

  if (import.meta.env.DEV) {
    if (!(currentTab.key in risksMap)) {
      console.warn(`[RiskPeriodTabs] Tab "${currentTab.key}" not in risksMap — add prop + map entry.`);
    }
    if (!(currentTab.key in narrativeMap)) {
      console.warn(`[RiskPeriodTabs] Tab "${currentTab.key}" not in narrativeMap — NarrativeReport field missing.`);
    }
  }

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
