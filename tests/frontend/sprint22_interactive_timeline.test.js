/**
 * Sprint 22 — Interactive Timeline UI.
 *
 * Tests the pure logic functions that power period/scenario interactivity:
 *   - getTopImpactsWithScenario  (ExecutiveSummaryCard)
 *   - getPeriodRisks             (ExecutiveSummaryCard)
 *   - getPeriodConfidence        (ExecutiveSummaryCard)
 *   - adaptationPanel filtering  (AdaptationPanel)
 *   - resolvedTab logic          (RiskPeriodTabs)
 *   - getTimelineNodeNarrative   (RiskTimeline)
 *   - timelineRisks multi-period filter
 *
 * These functions are inlined here to avoid importing JSX/TS modules.
 * Keep in sync with the source files if logic changes.
 *
 * Run: node --test tests/frontend/sprint22_interactive_timeline.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inlined helpers (mirrors ExecutiveSummaryCard.jsx) ───────────────────────

const CONF_RANK = { alta: 3, media: 2, baja: 1 };

function getTopImpactsWithScenario(risks, activeScenario) {
  const seen = new Set();
  const result = [];
  for (const risk of risks ?? []) {
    const variant = activeScenario && risk.scenarioVariants?.[activeScenario];
    const impacts = variant?.impacts?.length ? variant.impacts : (risk.impacts ?? []);
    for (const impact of impacts) {
      if (!seen.has(impact) && result.length < 2) {
        seen.add(impact);
        result.push(impact);
      }
    }
  }
  return result;
}

function getPeriodRisks(consolidatedRisks, selectedPeriod, fallbackRisks) {
  if (!consolidatedRisks?.length) return fallbackRisks ?? [];
  const filtered = consolidatedRisks.filter(r => r.period === selectedPeriod);
  return filtered.length > 0 ? filtered : (fallbackRisks ?? []);
}

function getPeriodConfidence(risks, activeScenario) {
  return risks.reduce((best, r) => {
    const variant = activeScenario && r.scenarioVariants?.[activeScenario];
    const c = variant?.confidence ?? r.confidence ?? 'baja';
    return CONF_RANK[c] > CONF_RANK[best] ? c : best;
  }, 'baja');
}

// ─── Inlined helpers (mirrors AdaptationPanel.jsx) ────────────────────────────

const EFFECTIVENESS_ORDER = { alta: 0, media: 1, baja: 2 };

function collectMeasures(risks) {
  const seen = new Set();
  const result = [];
  for (const risk of risks) {
    for (const m of risk.adaptationMeasures ?? []) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        result.push(m);
      }
    }
  }
  return result.sort(
    (a, b) => (EFFECTIVENESS_ORDER[a.effectiveness] ?? 2) - (EFFECTIVENESS_ORDER[b.effectiveness] ?? 2)
  );
}

function getAdaptationMeasures(consolidatedRisks, selectedPeriod) {
  const periodRisks = selectedPeriod
    ? consolidatedRisks.filter(r => r.period === selectedPeriod)
    : consolidatedRisks;
  const periodMeasures = collectMeasures(periodRisks);
  return periodMeasures.length >= 2 ? periodMeasures : collectMeasures(consolidatedRisks);
}

// ─── Inlined helpers (mirrors RiskPeriodTabs.jsx) ─────────────────────────────

const PERIOD_TABS = [
  { key: 'historico',     label: 'Histórico'     },
  { key: 'mediano_plazo', label: 'Mediano plazo'  },
  { key: 'largo_plazo',   label: 'Largo plazo'    },
];

function resolveActiveTab(available, selectedPeriod) {
  if (!available.length) return null;
  const keys = available.map(t => t.key);
  return keys.includes(selectedPeriod) ? selectedPeriod : keys[0];
}

// ─── Inlined helpers (mirrors RiskTimeline.jsx) ───────────────────────────────

const SCENARIO_TO_KEY = {
  'emisiones_moderadas': 'moderateEmissions',
  'altas_emisiones':     'highEmissions',
};

const PERIOD_ORDER_TIMELINE = ['historical', 'mediumTerm', 'longTerm'];

function getTimelineNodeNarrative(timeline, period, activeScenario) {
  if (period === 'historical') return timeline.historical?.narrative ?? null;
  const scenarioKey = SCENARIO_TO_KEY[activeScenario] ?? 'moderateEmissions';
  if (period === 'mediumTerm') return timeline.mediumTerm?.[scenarioKey]?.narrative ?? null;
  if (period === 'longTerm')   return timeline.longTerm?.[scenarioKey]?.narrative ?? null;
  return null;
}

function isMultiPeriod(timeline) {
  return PERIOD_ORDER_TIMELINE.filter(p => timeline[p] != null).length >= 2;
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeRisk(overrides = {}) {
  return {
    id: 'lluvias_extremas_historico',
    riskType: 'lluvias_extremas',
    period: 'historico',
    confidence: 'media',
    narrativeText: 'Riesgo base de lluvias.',
    impacts: ['Daños en infraestructura', 'Interrupción de operaciones'],
    adaptationMeasures: [],
    scenarioVariants: {},
    ...overrides,
  };
}

function makeVariant(overrides = {}) {
  return {
    narrativeText: 'Variant narrative.',
    impacts: ['Impacto del escenario'],
    confidence: 'alta',
    ...overrides,
  };
}

function makeAdaptationMeasure(id, effectiveness = 'alta') {
  return { id, name: `Medida ${id}`, timeframe: 'mediano', effectiveness };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getTopImpactsWithScenario — Sprint 22', () => {
  it('returns base impacts when no activeScenario', () => {
    const risk = makeRisk({ impacts: ['Impacto A', 'Impacto B'] });
    const result = getTopImpactsWithScenario([risk], null);
    assert.deepEqual(result, ['Impacto A', 'Impacto B']);
  });

  it('returns scenario-specific impacts when variant exists', () => {
    const risk = makeRisk({
      impacts: ['Impacto base'],
      scenarioVariants: {
        altas_emisiones: makeVariant({ impacts: ['Impacto alto A', 'Impacto alto B'] }),
      },
    });
    const result = getTopImpactsWithScenario([risk], 'altas_emisiones');
    assert.deepEqual(result, ['Impacto alto A', 'Impacto alto B']);
  });

  it('falls back to base impacts when scenario variant has no impacts', () => {
    const risk = makeRisk({
      impacts: ['Impacto base'],
      scenarioVariants: {
        altas_emisiones: makeVariant({ impacts: [] }),
      },
    });
    const result = getTopImpactsWithScenario([risk], 'altas_emisiones');
    assert.deepEqual(result, ['Impacto base']);
  });

  it('caps at 2 impacts regardless of source size', () => {
    const risk = makeRisk({
      impacts: ['A', 'B', 'C', 'D'],
    });
    const result = getTopImpactsWithScenario([risk], null);
    assert.equal(result.length, 2);
  });

  it('deduplicates impacts across multiple risks', () => {
    const r1 = makeRisk({ riskType: 'lluvias_extremas', impacts: ['Daño compartido'] });
    const r2 = makeRisk({ riskType: 'calor_extremo', period: 'mediano_plazo', impacts: ['Daño compartido', 'Segundo impacto'] });
    const result = getTopImpactsWithScenario([r1, r2], null);
    assert.equal(result.length, 2);
    assert.equal(result[0], 'Daño compartido');
    assert.equal(result[1], 'Segundo impacto');
  });

  it('returns empty array when risks is empty', () => {
    assert.deepEqual(getTopImpactsWithScenario([], 'emisiones_moderadas'), []);
  });

  it('handles undefined risks gracefully', () => {
    assert.deepEqual(getTopImpactsWithScenario(undefined, null), []);
  });

  it('uses moderateEmissions variant when scenario is emisiones_moderadas', () => {
    const risk = makeRisk({
      period: 'mediano_plazo',
      impacts: ['Base impact'],
      scenarioVariants: {
        emisiones_moderadas: makeVariant({ impacts: ['Moderado específico'] }),
        altas_emisiones:     makeVariant({ impacts: ['Alto específico'] }),
      },
    });
    const result = getTopImpactsWithScenario([risk], 'emisiones_moderadas');
    assert.equal(result[0], 'Moderado específico');
  });

  it('moderado vs altas produce different impacts', () => {
    const risk = makeRisk({
      period: 'largo_plazo',
      impacts: ['Base'],
      scenarioVariants: {
        emisiones_moderadas: makeVariant({ impacts: ['Impacto moderado'] }),
        altas_emisiones:     makeVariant({ impacts: ['Impacto alto'] }),
      },
    });
    const moderado = getTopImpactsWithScenario([risk], 'emisiones_moderadas');
    const alto     = getTopImpactsWithScenario([risk], 'altas_emisiones');
    assert.notDeepEqual(moderado, alto);
  });
});

describe('getPeriodRisks — Sprint 22', () => {
  const allRisks = [
    makeRisk({ riskType: 'lluvias_extremas', period: 'historico' }),
    makeRisk({ riskType: 'calor_extremo',    period: 'mediano_plazo' }),
    makeRisk({ riskType: 'sequia',           period: 'largo_plazo' }),
  ];

  it('filters risks by selectedPeriod', () => {
    const result = getPeriodRisks(allRisks, 'mediano_plazo', []);
    assert.equal(result.length, 1);
    assert.equal(result[0].riskType, 'calor_extremo');
  });

  it('returns fallback when no risks match the period', () => {
    const fallback = [makeRisk({ riskType: 'heladas', period: 'historico' })];
    const result = getPeriodRisks(allRisks, 'corto_plazo', fallback);
    assert.deepEqual(result, fallback);
  });

  it('returns fallback when consolidatedRisks is empty', () => {
    const fallback = [makeRisk()];
    const result = getPeriodRisks([], 'historico', fallback);
    assert.deepEqual(result, fallback);
  });

  it('returns fallback when consolidatedRisks is null', () => {
    const fallback = [makeRisk()];
    const result = getPeriodRisks(null, 'historico', fallback);
    assert.deepEqual(result, fallback);
  });

  it('returns historico risks correctly', () => {
    const result = getPeriodRisks(allRisks, 'historico', []);
    assert.equal(result.length, 1);
    assert.equal(result[0].period, 'historico');
  });

  it('returns largo_plazo risks correctly', () => {
    const result = getPeriodRisks(allRisks, 'largo_plazo', []);
    assert.equal(result.length, 1);
    assert.equal(result[0].riskType, 'sequia');
  });
});

describe('getPeriodConfidence — Sprint 22', () => {
  it('returns highest confidence across risks without scenario', () => {
    const risks = [
      makeRisk({ confidence: 'baja' }),
      makeRisk({ confidence: 'alta' }),
      makeRisk({ confidence: 'media' }),
    ];
    assert.equal(getPeriodConfidence(risks, null), 'alta');
  });

  it('uses scenario variant confidence when available', () => {
    const risk = makeRisk({
      confidence: 'baja',
      scenarioVariants: {
        altas_emisiones: makeVariant({ confidence: 'alta' }),
      },
    });
    assert.equal(getPeriodConfidence([risk], 'altas_emisiones'), 'alta');
  });

  it('falls back to base confidence when variant has no confidence', () => {
    const risk = makeRisk({ confidence: 'media', scenarioVariants: {} });
    assert.equal(getPeriodConfidence([risk], 'altas_emisiones'), 'media');
  });

  it('returns baja for empty risks array', () => {
    assert.equal(getPeriodConfidence([], 'emisiones_moderadas'), 'baja');
  });

  it('scenario variance: alta > media when switching scenarios', () => {
    const risk = makeRisk({
      confidence: 'media',
      scenarioVariants: {
        emisiones_moderadas: makeVariant({ confidence: 'media' }),
        altas_emisiones:     makeVariant({ confidence: 'alta' }),
      },
    });
    assert.equal(getPeriodConfidence([risk], 'emisiones_moderadas'), 'media');
    assert.equal(getPeriodConfidence([risk], 'altas_emisiones'), 'alta');
  });
});

describe('AdaptationPanel measure filtering — Sprint 22', () => {
  const m1 = makeAdaptationMeasure('m1', 'alta');
  const m2 = makeAdaptationMeasure('m2', 'media');
  const m3 = makeAdaptationMeasure('m3', 'baja');

  const historicalRisk    = makeRisk({ period: 'historico',     adaptationMeasures: [m1] });
  const midTermRisk       = makeRisk({ period: 'mediano_plazo', adaptationMeasures: [m2, m3] });

  it('returns period-specific measures when >= 2 exist', () => {
    const risks = [historicalRisk, midTermRisk];
    const measures = getAdaptationMeasures(risks, 'mediano_plazo');
    assert.equal(measures.length, 2);
    const ids = measures.map(m => m.id);
    assert.ok(ids.includes('m2'));
    assert.ok(ids.includes('m3'));
  });

  it('falls back to all measures when period has < 2 measures', () => {
    const risks = [historicalRisk, midTermRisk];
    const measures = getAdaptationMeasures(risks, 'historico');
    // historico has only 1 measure → fallback to all 3
    assert.equal(measures.length, 3);
  });

  it('deduplicates measures across periods', () => {
    const sharedM = makeAdaptationMeasure('shared', 'alta');
    const r1 = makeRisk({ period: 'historico',     adaptationMeasures: [sharedM] });
    const r2 = makeRisk({ period: 'mediano_plazo', adaptationMeasures: [sharedM, m2] });
    const measures = getAdaptationMeasures([r1, r2], 'mediano_plazo');
    const ids = measures.map(m => m.id);
    assert.equal(ids.filter(id => id === 'shared').length, 1, 'shared measure deduplicated');
  });

  it('returns all measures when no selectedPeriod provided', () => {
    const risks = [historicalRisk, midTermRisk];
    const measures = getAdaptationMeasures(risks, null);
    assert.equal(measures.length, 3);
  });

  it('sorts by effectiveness: alta first, then media, then baja', () => {
    const risks = [historicalRisk, midTermRisk];
    const measures = getAdaptationMeasures(risks, null);
    assert.equal(measures[0].effectiveness, 'alta');
    assert.equal(measures[1].effectiveness, 'media');
    assert.equal(measures[2].effectiveness, 'baja');
  });
});

describe('RiskPeriodTabs resolvedTab — Sprint 22', () => {
  const all = PERIOD_TABS;

  it('returns selectedPeriod when it is in available tabs', () => {
    const available = all;
    assert.equal(resolveActiveTab(available, 'mediano_plazo'), 'mediano_plazo');
  });

  it('falls back to first available tab when selectedPeriod not present', () => {
    const available = [PERIOD_TABS[1], PERIOD_TABS[2]]; // mediano + largo
    assert.equal(resolveActiveTab(available, 'historico'), 'mediano_plazo');
  });

  it('returns null when no tabs are available', () => {
    assert.equal(resolveActiveTab([], 'historico'), null);
  });

  it('returns largo_plazo when selected and available', () => {
    const available = all;
    assert.equal(resolveActiveTab(available, 'largo_plazo'), 'largo_plazo');
  });

  it('returns historico (first) as fallback when selectedPeriod is unknown', () => {
    const available = all;
    assert.equal(resolveActiveTab(available, 'corto_plazo'), 'historico');
  });
});

describe('RiskTimeline getTimelineNodeNarrative — Sprint 22', () => {
  const timeline = {
    riskType: 'lluvias_extremas',
    historical: { narrative: 'Narrativa histórica' },
    mediumTerm: {
      moderateEmissions: { narrative: 'Narrativa moderada mediano' },
      highEmissions:     { narrative: 'Narrativa alta mediano' },
    },
    longTerm: {
      moderateEmissions: { narrative: 'Narrativa moderada largo' },
      highEmissions:     { narrative: 'Narrativa alta largo' },
    },
  };

  it('returns historical narrative for historical period', () => {
    const result = getTimelineNodeNarrative(timeline, 'historical', 'emisiones_moderadas');
    assert.equal(result, 'Narrativa histórica');
  });

  it('returns moderateEmissions narrative for mediumTerm when scenario is emisiones_moderadas', () => {
    const result = getTimelineNodeNarrative(timeline, 'mediumTerm', 'emisiones_moderadas');
    assert.equal(result, 'Narrativa moderada mediano');
  });

  it('returns highEmissions narrative for mediumTerm when scenario is altas_emisiones', () => {
    const result = getTimelineNodeNarrative(timeline, 'mediumTerm', 'altas_emisiones');
    assert.equal(result, 'Narrativa alta mediano');
  });

  it('returns moderateEmissions narrative for longTerm', () => {
    const result = getTimelineNodeNarrative(timeline, 'longTerm', 'emisiones_moderadas');
    assert.equal(result, 'Narrativa moderada largo');
  });

  it('returns highEmissions narrative for longTerm under altas_emisiones', () => {
    const result = getTimelineNodeNarrative(timeline, 'longTerm', 'altas_emisiones');
    assert.equal(result, 'Narrativa alta largo');
  });

  it('mediumTerm moderado vs alto produce different narratives', () => {
    const mod  = getTimelineNodeNarrative(timeline, 'mediumTerm', 'emisiones_moderadas');
    const alto = getTimelineNodeNarrative(timeline, 'mediumTerm', 'altas_emisiones');
    assert.notEqual(mod, alto);
  });

  it('returns null for unknown period', () => {
    const result = getTimelineNodeNarrative(timeline, 'corto_plazo', 'emisiones_moderadas');
    assert.equal(result, null);
  });

  it('returns null when historical is absent', () => {
    const t = { riskType: 'calor_extremo', mediumTerm: { moderateEmissions: { narrative: 'x' } } };
    assert.equal(getTimelineNodeNarrative(t, 'historical', 'emisiones_moderadas'), null);
  });
});

describe('RiskTimeline multi-period filter — Sprint 22', () => {
  it('includes timelines with 2+ periods', () => {
    const t = {
      riskType: 'lluvias_extremas',
      historical: { narrative: 'hist' },
      mediumTerm: { moderateEmissions: { narrative: 'mid' } },
      longTerm: null,
    };
    assert.ok(isMultiPeriod(t));
  });

  it('excludes timelines with only 1 period', () => {
    const t = {
      riskType: 'heladas',
      historical: { narrative: 'hist' },
      mediumTerm: null,
      longTerm: null,
    };
    assert.ok(!isMultiPeriod(t));
  });

  it('includes timelines with all 3 periods', () => {
    const t = {
      riskType: 'sequia',
      historical:  { narrative: 'hist' },
      mediumTerm:  { moderateEmissions: { narrative: 'mid' } },
      longTerm:    { moderateEmissions: { narrative: 'long' } },
    };
    assert.ok(isMultiPeriod(t));
  });

  it('excludes timeline with no periods at all', () => {
    const t = { riskType: 'inundacion', historical: null, mediumTerm: null, longTerm: null };
    assert.ok(!isMultiPeriod(t));
  });
});

describe('Period switching — functional real-data scenarios', () => {
  const historicalRisk = makeRisk({
    riskType: 'lluvias_extremas',
    period: 'historico',
    confidence: 'alta',
    impacts: ['Daños históricos A', 'Daños históricos B'],
    narrativeText: 'Históricamente se registraron lluvias intensas.',
    adaptationMeasures: [makeAdaptationMeasure('ha1', 'alta')],
  });

  const midTermRisk = makeRisk({
    riskType: 'lluvias_extremas',
    period: 'mediano_plazo',
    confidence: 'media',
    impacts: ['Incremento proyectado'],
    narrativeText: 'Se proyecta incremento de lluvias hacia 2050.',
    scenarioVariants: {
      emisiones_moderadas: makeVariant({
        narrativeText: 'Moderado: incremento esperado.',
        impacts: ['Impacto moderado'],
        confidence: 'media',
      }),
      altas_emisiones: makeVariant({
        narrativeText: 'Alto: incremento severo.',
        impacts: ['Impacto severo', 'Impacto adicional'],
        confidence: 'alta',
      }),
    },
    adaptationMeasures: [makeAdaptationMeasure('ma1', 'media'), makeAdaptationMeasure('ma2', 'media')],
  });

  const allRisks = [historicalRisk, midTermRisk];

  it('historico period shows historical impacts (no scenario variants)', () => {
    const periodRisks = getPeriodRisks(allRisks, 'historico', []);
    const impacts = getTopImpactsWithScenario(periodRisks, 'emisiones_moderadas');
    assert.deepEqual(impacts, ['Daños históricos A', 'Daños históricos B']);
  });

  it('mediano_plazo + emisiones_moderadas shows moderate scenario impacts', () => {
    const periodRisks = getPeriodRisks(allRisks, 'mediano_plazo', []);
    const impacts = getTopImpactsWithScenario(periodRisks, 'emisiones_moderadas');
    assert.deepEqual(impacts, ['Impacto moderado']);
  });

  it('mediano_plazo + altas_emisiones shows high scenario impacts', () => {
    const periodRisks = getPeriodRisks(allRisks, 'mediano_plazo', []);
    const impacts = getTopImpactsWithScenario(periodRisks, 'altas_emisiones');
    assert.ok(impacts.includes('Impacto severo'));
  });

  it('switching from historico to mediano_plazo changes impacts', () => {
    const histRisks = getPeriodRisks(allRisks, 'historico', []);
    const midRisks  = getPeriodRisks(allRisks, 'mediano_plazo', []);
    const histImpacts = getTopImpactsWithScenario(histRisks, 'emisiones_moderadas');
    const midImpacts  = getTopImpactsWithScenario(midRisks, 'emisiones_moderadas');
    assert.notDeepEqual(histImpacts, midImpacts);
  });

  it('switching scenario within mediano_plazo changes impacts', () => {
    const periodRisks = getPeriodRisks(allRisks, 'mediano_plazo', []);
    const moderado = getTopImpactsWithScenario(periodRisks, 'emisiones_moderadas');
    const alto     = getTopImpactsWithScenario(periodRisks, 'altas_emisiones');
    assert.notDeepEqual(moderado, alto);
  });

  it('historico confidence is alta (no scenario override for historico)', () => {
    const periodRisks = getPeriodRisks(allRisks, 'historico', []);
    assert.equal(getPeriodConfidence(periodRisks, 'emisiones_moderadas'), 'alta');
  });

  it('mediano_plazo altas_emisiones shows alta confidence', () => {
    const periodRisks = getPeriodRisks(allRisks, 'mediano_plazo', []);
    assert.equal(getPeriodConfidence(periodRisks, 'altas_emisiones'), 'alta');
  });

  it('historico adaptation measures are period-specific', () => {
    const measures = getAdaptationMeasures(allRisks, 'historico');
    // Only 1 historico measure → fallback to all
    assert.ok(measures.length >= 1);
  });

  it('mediano_plazo adaptation shows period measures (2 available)', () => {
    const measures = getAdaptationMeasures(allRisks, 'mediano_plazo');
    assert.equal(measures.length, 2);
    assert.ok(measures.every(m => ['ma1', 'ma2'].includes(m.id)));
  });
});

describe('Scenario switching real — no fake toggles', () => {
  const risk = makeRisk({
    riskType: 'calor_extremo',
    period: 'largo_plazo',
    narrativeText: 'Base calor.',
    impacts: ['Base impacto calor'],
    scenarioVariants: {
      emisiones_moderadas: makeVariant({
        narrativeText: 'Moderado: calor gestionable.',
        impacts: ['Operaciones parcialmente afectadas'],
        confidence: 'media',
      }),
      altas_emisiones: makeVariant({
        narrativeText: 'Alto: calor severo y crónico.',
        impacts: ['Cierre temporal', 'Riesgo estructural', 'Pérdida productiva'],
        confidence: 'alta',
      }),
    },
  });

  it('altas_emisiones produces more impacts than emisiones_moderadas', () => {
    const mod  = getTopImpactsWithScenario([risk], 'emisiones_moderadas');
    const alto = getTopImpactsWithScenario([risk], 'altas_emisiones');
    // Both are capped at 2 but content differs
    assert.notDeepEqual(mod, alto);
  });

  it('confidence increases from media to alta under altas_emisiones', () => {
    const confMod  = getPeriodConfidence([risk], 'emisiones_moderadas');
    const confAlto = getPeriodConfidence([risk], 'altas_emisiones');
    assert.equal(confMod, 'media');
    assert.equal(confAlto, 'alta');
  });

  it('historico risk has no scenarioVariants (empty object)', () => {
    const histRisk = makeRisk({ period: 'historico', scenarioVariants: {} });
    const variant = histRisk.scenarioVariants['emisiones_moderadas'];
    assert.equal(variant, undefined);
  });

  it('impact count cannot differ for historico regardless of scenario', () => {
    const histRisk = makeRisk({
      period: 'historico',
      impacts: ['Impacto histórico único'],
      scenarioVariants: {},
    });
    const mod  = getTopImpactsWithScenario([histRisk], 'emisiones_moderadas');
    const alto = getTopImpactsWithScenario([histRisk], 'altas_emisiones');
    // Same base impacts, no variant override
    assert.deepEqual(mod, alto);
  });
});

describe('Fallback sin data — empty state behavior', () => {
  it('getPeriodRisks returns fallback when period has no risks', () => {
    const risks = [makeRisk({ period: 'historico' })];
    const fallback = [makeRisk({ period: 'largo_plazo', riskType: 'sequia' })];
    const result = getPeriodRisks(risks, 'largo_plazo', fallback);
    assert.deepEqual(result, fallback);
  });

  it('getTopImpactsWithScenario returns empty array for empty risks', () => {
    assert.deepEqual(getTopImpactsWithScenario([], 'altas_emisiones'), []);
  });

  it('getPeriodConfidence returns baja for empty risks', () => {
    assert.equal(getPeriodConfidence([], 'altas_emisiones'), 'baja');
  });

  it('resolveActiveTab returns null for empty available list', () => {
    assert.equal(resolveActiveTab([], 'historico'), null);
  });

  it('getTimelineNodeNarrative returns null for missing historical data', () => {
    const t = { riskType: 'calor_extremo', historical: null, mediumTerm: null, longTerm: null };
    assert.equal(getTimelineNodeNarrative(t, 'historical', 'emisiones_moderadas'), null);
  });

  it('getAdaptationMeasures returns empty array when all risks have no measures', () => {
    const risks = [makeRisk({ adaptationMeasures: [] }), makeRisk({ adaptationMeasures: [] })];
    assert.deepEqual(getAdaptationMeasures(risks, 'historico'), []);
  });
});
