// @ts-nocheck
import { useState } from "react";
import ConsolidatedRiskCard from "./ConsolidatedRiskCard";

const PERIOD_CONFIG = {
  historico: {
    label: 'Riesgos históricos',
    description: 'Fenómenos observados en el período de referencia',
    period: '1980–2014',
    icon: '📊',
    showScenario: false,
  },
  mediano_plazo: {
    label: 'Mediano plazo',
    description: 'Proyecciones para las próximas décadas',
    period: '2040–2059',
    icon: '📈',
    showScenario: true,
  },
  largo_plazo: {
    label: 'Largo plazo',
    description: 'Proyecciones de cambio climático a largo plazo',
    period: '2060–2079',
    icon: '🔭',
    showScenario: true,
  },
};

const SCENARIOS = [
  { value: 'emisiones_moderadas', sspKey: 'ssp245', label: 'Emisiones moderadas' },
  { value: 'altas_emisiones',     sspKey: 'ssp585', label: 'Altas emisiones'    },
];

// Maps period slug → Layer9 narrative window key
const PERIOD_TO_WINDOW = {
  mediano_plazo: 'mid_term',
  largo_plazo:   'long_term',
};

/**
 * RiskPeriodSection — Sprint 16.
 * Reusable section for histórico / mediano plazo / largo plazo.
 *
 * @param {string}              period        - TemporalPeriod slug
 * @param {ConsolidatedRisk[]}  risks         - Risks filtered to this period
 * @param {string}              narrativeText - Plain-language summary from buildNarrativeReport
 * @param {object|null}         projections   - Layer9 buildProjectionContext() output (optional)
 */
export default function RiskPeriodSection({ period, risks, narrativeText, projections }) {
  const [activeScenario, setActiveScenario] = useState('emisiones_moderadas');

  const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG.historico;

  if (!risks?.length && !narrativeText) return null;

  const activeSSP  = SCENARIOS.find(s => s.value === activeScenario)?.sspKey ?? 'ssp245';
  const windowKey  = PERIOD_TO_WINDOW[period];

  // Scenario-specific narrative from Layer9 (projection periods only)
  const projNarrative = config.showScenario
    ? (projections?.narratives?.find(n => n.scenario === activeSSP && n.window === windowKey)?.text ?? null)
    : null;

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-base leading-none mt-0.5 flex-shrink-0">{config.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{config.description}</p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded-md flex-shrink-0">
          {config.period}
        </span>
      </div>

      {/* Scenario toggle — projection periods only */}
      {config.showScenario && (
        <div className="flex gap-1.5 p-1 rounded-lg border border-border bg-secondary" role="group" aria-label="Escenario de emisiones">
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

      {/* Narrative text — Layer9 scenario-specific takes priority */}
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
            <ConsolidatedRiskCard key={risk.id} risk={risk} />
          ))}
        </div>
      )}
    </section>
  );
}
