// @ts-nocheck
import ConsolidatedRiskCard from "./ConsolidatedRiskCard";
import { buildExecutiveNarrative } from '@/domain/sanitizeNarrative';

const PERIOD_CONFIG = {
  historico: {
    description: 'Fenómenos observados en el período de referencia (1980–2014)',
    showScenario: false,
  },
  mediano_plazo: {
    description: 'Proyecciones para 2040–2059',
    showScenario: true,
  },
  largo_plazo: {
    description: 'Proyecciones de cambio climático para 2060–2079',
    showScenario: true,
  },
};

const SCENARIOS = [
  { value: 'emisiones_moderadas', sspKey: 'ssp245', label: 'Emisiones moderadas' },
  { value: 'altas_emisiones',     sspKey: 'ssp585', label: 'Altas emisiones'    },
];

const PERIOD_TO_WINDOW = {
  mediano_plazo: 'mid_term',
  largo_plazo:   'long_term',
};

/**
 * RiskPeriodSection — Sprint 20.
 * Simplified header (emoji-free) — rendered inside a RiskPeriodTabs context.
 *
 * @param {string}             period
 * @param {ConsolidatedRisk[]} risks
 * @param {string}             narrativeText
 * @param {object|null}        projections
 * @param {string}             activeScenario
 * @param {function}           onScenarioChange
 */
export default function RiskPeriodSection({
  period,
  risks,
  narrativeText,
  projections,
  activeScenario = 'emisiones_moderadas',
  onScenarioChange,
}) {
  const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG.historico;
  const setActiveScenario = onScenarioChange ?? (() => {});

  if (!risks?.length && !narrativeText) return null;

  const activeSSP = SCENARIOS.find(s => s.value === activeScenario)?.sspKey ?? 'ssp245';
  const windowKey = PERIOD_TO_WINDOW[period];

  // Layer9 scenario-specific narrative — sanitized to remove IPCC codes before display.
  // buildExecutiveNarrative returns '' when text is empty or entirely technical codes,
  // causing the fallback `narrativeText` (operational language) to render instead.
  const rawProjNarrative = config.showScenario
    ? (projections?.narratives?.find(n => n.scenario === activeSSP && n.window === windowKey)?.text ?? null)
    : null;
  const projNarrative = rawProjNarrative ? buildExecutiveNarrative(rawProjNarrative) : null;

  return (
    <section className="space-y-3">
      {/* Compact description — tab already provides label/period */}
      <p className="text-[11px] text-muted-foreground">{config.description}</p>

      {/* Scenario toggle — projection periods only */}
      {config.showScenario && (
        <div
          className="flex gap-1 p-1 rounded-lg border border-border bg-secondary"
          role="group"
          aria-label="Escenario de emisiones"
        >
          {SCENARIOS.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => setActiveScenario(s.value)}
              aria-pressed={activeScenario === s.value}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                activeScenario === s.value
                  ? 'bg-card border border-border text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Narrative — Layer9 scenario takes priority over operational narrative */}
      {projNarrative ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
          {projNarrative}
        </p>
      ) : narrativeText ? (
        <p className="text-sm text-muted-foreground leading-relaxed">{narrativeText}</p>
      ) : null}

      {/* Risk cards */}
      {risks?.length > 0 && (
        <div className="space-y-3">
          {risks.map(risk => (
            <ConsolidatedRiskCard
              key={risk.id}
              risk={risk}
              activeScenario={config.showScenario ? activeScenario : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
