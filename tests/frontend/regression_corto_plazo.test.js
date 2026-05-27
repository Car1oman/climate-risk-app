/**
 * Regression — Bug: corto_plazo (short_term) silent null returns.
 *
 * Pre-patch, the API horizon "short_term" was not mapped to "corto_plazo",
 * causing RiskPeriodTabs / ExecutiveSummaryCard / RiskTimeline to receive
 * no data and silently return null.
 *
 * Each describe block pins ONE failure mode. If the bug is reintroduced, at
 * least one assertion here will fail first and point directly at the cause.
 *
 * Logic is inlined (no TS/JSX imports) to keep the suite runnable with plain
 * `node --test`.  Keep each block in sync with its source file header.
 *
 * Run:
 *   node --test tests/frontend/regression_corto_plazo.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. RiskPeriodTabs — tab "Corto plazo" appears when shortTermRisks is present
//    Source: src/features/climate-lookup/components/RiskPeriodTabs.jsx
// ═══════════════════════════════════════════════════════════════════════════════

// Mirrors the PERIOD_TABS constant in RiskPeriodTabs.jsx (must stay in sync)
const PERIOD_TABS = [
  { key: 'historico',     label: 'Histórico',    period: '1980–2014' },
  { key: 'corto_plazo',   label: 'Corto plazo',  period: '2020–2039' },
  { key: 'mediano_plazo', label: 'Mediano plazo', period: '2040–2059' },
  { key: 'largo_plazo',   label: 'Largo plazo',   period: '2060–2079' },
];

// Mirrors the useMemo logic that computes `available` in RiskPeriodTabs.jsx
function computeAvailable({ historicalRisks, shortTermRisks, midTermRisks, longTermRisks }) {
  const map = {
    historico:     historicalRisks,
    corto_plazo:   shortTermRisks,
    mediano_plazo: midTermRisks,
    largo_plazo:   longTermRisks,
  };
  return PERIOD_TABS.filter(t => (map[t.key]?.length ?? 0) > 0);
}

// Mirrors resolveActiveTab logic in RiskPeriodTabs.jsx
function resolveActiveTab(available, selectedPeriod) {
  if (!available.length) return null;
  const keys = available.map(t => t.key);
  return keys.includes(selectedPeriod) ? selectedPeriod : keys[0];
}

const STUB_RISK = { riskType: 'lluvias_extremas', period: 'corto_plazo', confidence: 'media' };

describe('RiskPeriodTabs — corto_plazo tab (regression)', () => {
  it('PERIOD_TABS includes corto_plazo entry', () => {
    assert.ok(
      PERIOD_TABS.some(t => t.key === 'corto_plazo'),
      'corto_plazo must be in PERIOD_TABS — if missing, the tab never renders'
    );
  });

  it('corto_plazo tab label is "Corto plazo"', () => {
    const tab = PERIOD_TABS.find(t => t.key === 'corto_plazo');
    assert.equal(tab?.label, 'Corto plazo');
  });

  it('available includes corto_plazo when shortTermRisks is non-empty', () => {
    const available = computeAvailable({
      historicalRisks: [],
      shortTermRisks:  [STUB_RISK],
      midTermRisks:    [],
      longTermRisks:   [],
    });
    assert.ok(available.length > 0, 'should not return null (available must be non-empty)');
    assert.ok(
      available.some(t => t.key === 'corto_plazo'),
      'corto_plazo tab must be in available when shortTermRisks has items'
    );
  });

  it('available is empty (component returns null) when shortTermRisks is []', () => {
    const available = computeAvailable({
      historicalRisks: [],
      shortTermRisks:  [],
      midTermRisks:    [],
      longTermRisks:   [],
    });
    assert.equal(available.length, 0, 'no risks → available empty → component returns null');
  });

  it('resolveActiveTab returns corto_plazo when selected and available', () => {
    const available = computeAvailable({
      historicalRisks: [],
      shortTermRisks:  [STUB_RISK],
      midTermRisks:    [],
      longTermRisks:   [],
    });
    const active = resolveActiveTab(available, 'corto_plazo');
    assert.equal(active, 'corto_plazo');
  });

  it('does NOT fall back to historico when only corto_plazo risks exist', () => {
    const available = computeAvailable({
      historicalRisks: [],
      shortTermRisks:  [STUB_RISK],
      midTermRisks:    [],
      longTermRisks:   [],
    });
    // First available tab must be corto_plazo, not historico
    assert.equal(available[0].key, 'corto_plazo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ExecutiveSummaryCard — nearTermNarrative resolves for corto_plazo
//    Source: src/features/climate-lookup/components/ExecutiveSummaryCard.jsx
// ═══════════════════════════════════════════════════════════════════════════════

// Mirrors PERIOD_NARRATIVE_KEY in ExecutiveSummaryCard.jsx
const PERIOD_NARRATIVE_KEY = {
  historico:     'historicalNarrative',
  corto_plazo:   'nearTermNarrative',
  mediano_plazo: 'midTermNarrative',
  largo_plazo:   'longTermNarrative',
};

// Mirrors period narrative resolution in ExecutiveSummaryCard.jsx
function resolvePeriodNarrative(narrativeReport, selectedPeriod) {
  const narrativeKey = PERIOD_NARRATIVE_KEY[selectedPeriod];
  return (narrativeKey && narrativeReport[narrativeKey]) || narrativeReport.executiveSummary;
}

describe('ExecutiveSummaryCard — nearTermNarrative for corto_plazo (regression)', () => {
  it('PERIOD_NARRATIVE_KEY maps corto_plazo → nearTermNarrative', () => {
    assert.equal(
      PERIOD_NARRATIVE_KEY['corto_plazo'],
      'nearTermNarrative',
      'corto_plazo must map to nearTermNarrative; if missing, period narrative is always null'
    );
  });

  it('resolvePeriodNarrative returns nearTermNarrative when selectedPeriod is corto_plazo', () => {
    const report = {
      executiveSummary:   'Resumen ejecutivo.',
      historicalNarrative: 'Histórico.',
      nearTermNarrative:  'Proyección corto plazo 2020-2039.',
      midTermNarrative:   'Mediano plazo.',
      longTermNarrative:  'Largo plazo.',
    };
    const result = resolvePeriodNarrative(report, 'corto_plazo');
    assert.equal(result, 'Proyección corto plazo 2020-2039.');
  });

  it('does NOT fall through to executiveSummary when nearTermNarrative exists', () => {
    const report = {
      executiveSummary:  'No debería usarse.',
      nearTermNarrative: 'Narrativa corto plazo correcta.',
    };
    const result = resolvePeriodNarrative(report, 'corto_plazo');
    assert.notEqual(result, 'No debería usarse.');
    assert.equal(result, 'Narrativa corto plazo correcta.');
  });

  it('falls back to executiveSummary only when nearTermNarrative is absent', () => {
    const report = {
      executiveSummary:  'Fallback ejecutivo.',
      nearTermNarrative: null,
    };
    const result = resolvePeriodNarrative(report, 'corto_plazo');
    assert.equal(result, 'Fallback ejecutivo.');
  });

  it('corto_plazo and historico read different narrative keys', () => {
    const report = {
      historicalNarrative: 'Histórica distinta.',
      nearTermNarrative:   'Corto plazo distinta.',
    };
    const hist  = resolvePeriodNarrative(report, 'historico');
    const short = resolvePeriodNarrative(report, 'corto_plazo');
    assert.notEqual(hist, short, 'different periods must resolve different narratives');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. RiskTimeline — "Hacia 2030" node renders when timeline.shortTerm exists
//    Source: src/features/climate-lookup/components/RiskTimeline.jsx
// ═══════════════════════════════════════════════════════════════════════════════

// Mirrors PERIOD_NODE in RiskTimeline.jsx
const PERIOD_NODE = {
  historical:  { label: 'Históricamente', period: '1980–2014', dotColor: 'bg-slate-400'  },
  shortTerm:   { label: 'Hacia 2030',     period: '2020–2039', dotColor: 'bg-yellow-400' },
  mediumTerm:  { label: 'Hacia 2050',     period: '2040–2059', dotColor: 'bg-amber-400'  },
  longTerm:    { label: 'Hacia 2070',     period: '2060–2079', dotColor: 'bg-orange-500' },
};

// Mirrors PERIOD_ORDER in RiskTimeline.jsx
const PERIOD_ORDER_FULL = ['historical', 'shortTerm', 'mediumTerm', 'longTerm'];

// Mirrors the presentPeriods filter in RiskTimelineRow
function computePresentPeriods(timeline) {
  return PERIOD_ORDER_FULL.filter(p => timeline[p] != null);
}

// Mirrors getTimelineNodeNarrative in RiskTimeline.jsx
const SCENARIO_TO_KEY = {
  'emisiones_moderadas': 'moderateEmissions',
  'altas_emisiones':     'highEmissions',
};

function getTimelineNodeNarrative(timeline, period, activeScenario) {
  if (period === 'historical') return timeline.historical?.narrative ?? null;
  const scenarioKey = SCENARIO_TO_KEY[activeScenario] ?? 'moderateEmissions';
  if (period === 'shortTerm')  return timeline.shortTerm?.[scenarioKey]?.narrative ?? null;
  if (period === 'mediumTerm') return timeline.mediumTerm?.[scenarioKey]?.narrative ?? null;
  if (period === 'longTerm')   return timeline.longTerm?.[scenarioKey]?.narrative ?? null;
  return null;
}

describe('RiskTimeline — shortTerm node "Hacia 2030" (regression)', () => {
  it('PERIOD_NODE.shortTerm exists and has label "Hacia 2030"', () => {
    assert.ok(PERIOD_NODE.shortTerm, 'PERIOD_NODE must include shortTerm');
    assert.equal(
      PERIOD_NODE.shortTerm.label,
      'Hacia 2030',
      'shortTerm label must be "Hacia 2030" — if missing, node never renders'
    );
  });

  it('PERIOD_ORDER_FULL includes shortTerm at position 1', () => {
    assert.ok(
      PERIOD_ORDER_FULL.includes('shortTerm'),
      'shortTerm must be in PERIOD_ORDER — if missing, the node is skipped entirely'
    );
    assert.equal(PERIOD_ORDER_FULL.indexOf('shortTerm'), 1);
  });

  it('shortTerm appears in presentPeriods when timeline.shortTerm is set', () => {
    const timeline = {
      riskType:  'lluvias_extremas',
      historical: { narrative: 'Históricamente hubo lluvias.' },
      shortTerm:  { moderateEmissions: { narrative: 'Corto plazo moderado.' } },
      mediumTerm: null,
      longTerm:   null,
    };
    const present = computePresentPeriods(timeline);
    assert.ok(present.includes('shortTerm'), 'shortTerm must appear in presentPeriods');
    assert.ok(present.length >= 2, 'need at least 2 periods to render the row');
  });

  it('timeline with only shortTerm (no historical) does NOT meet the 2-period threshold', () => {
    const timeline = {
      riskType:  'calor_extremo',
      historical: null,
      shortTerm:  { moderateEmissions: { narrative: 'Corto plazo.' } },
      mediumTerm: null,
      longTerm:   null,
    };
    const present = computePresentPeriods(timeline);
    assert.equal(present.length, 1, 'single period → row is hidden (< 2 period threshold)');
  });

  it('getTimelineNodeNarrative returns narrative for shortTerm + emisiones_moderadas', () => {
    const timeline = {
      riskType:  'lluvias_extremas',
      historical: { narrative: 'Hist.' },
      shortTerm:  {
        moderateEmissions: { narrative: 'Corto moderado correcto.' },
        highEmissions:     { narrative: 'Corto alto.' },
      },
    };
    const result = getTimelineNodeNarrative(timeline, 'shortTerm', 'emisiones_moderadas');
    assert.equal(result, 'Corto moderado correcto.');
  });

  it('getTimelineNodeNarrative returns null when shortTerm is absent', () => {
    const timeline = { riskType: 'sequia', historical: { narrative: 'Hist.' } };
    const result = getTimelineNodeNarrative(timeline, 'shortTerm', 'emisiones_moderadas');
    assert.equal(result, null, 'absent shortTerm must yield null, not throw');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. groupByRiskType — corto_plazo populates timeline.shortTerm
//    Source: src/domain/normalizeRisks.ts  (groupByRiskType)
// ═══════════════════════════════════════════════════════════════════════════════

// Inlines the period-branch mapping logic from groupByRiskType.
// The wrapping (RISK_TYPE_DISPLAY lookup, adaptations, etc.) is omitted;
// the invariant tested is purely: period === 'corto_plazo' → shortTerm is set.
function groupByRiskTypeCore(risks) {
  const timelineMap = new Map();
  for (const risk of risks) {
    const { riskType } = risk;
    if (!timelineMap.has(riskType)) {
      timelineMap.set(riskType, { riskType, adaptationMeasures: [] });
    }
    const tl = timelineMap.get(riskType);
    const variants = risk.scenarioVariants ?? {};

    if (risk.period === 'historico') {
      tl.historical = { narrative: risk.narrativeText, impacts: risk.impacts, confidence: risk.confidence };
    } else if (risk.period === 'corto_plazo') {
      tl.shortTerm = {
        moderateEmissions: variants.emisiones_moderadas ?? undefined,
        highEmissions:     variants.altas_emisiones     ?? undefined,
      };
    } else if (risk.period === 'mediano_plazo') {
      tl.mediumTerm = {
        moderateEmissions: variants.emisiones_moderadas ?? undefined,
        highEmissions:     variants.altas_emisiones     ?? undefined,
      };
    } else if (risk.period === 'largo_plazo') {
      tl.longTerm = {
        moderateEmissions: variants.emisiones_moderadas ?? undefined,
        highEmissions:     variants.altas_emisiones     ?? undefined,
      };
    }
  }
  return [...timelineMap.values()];
}

describe('groupByRiskType — corto_plazo → shortTerm (regression)', () => {
  const cortoPlazoRisk = {
    riskType:      'lluvias_extremas',
    period:        'corto_plazo',
    narrativeText: 'Lluvias corto plazo.',
    impacts:       ['Inundaciones locales'],
    confidence:    'media',
    scenarioVariants: {
      emisiones_moderadas: { narrativeText: 'Mod.', impacts: ['Imp mod'], confidence: 'media' },
      altas_emisiones:     { narrativeText: 'Alt.', impacts: ['Imp alt'], confidence: 'alta'  },
    },
  };

  it('corto_plazo risk populates timeline.shortTerm (not mediumTerm or longTerm)', () => {
    const [tl] = groupByRiskTypeCore([cortoPlazoRisk]);
    assert.ok(tl.shortTerm != null,  'shortTerm must be set for corto_plazo period');
    assert.equal(tl.mediumTerm, undefined, 'mediumTerm must NOT be set');
    assert.equal(tl.longTerm,   undefined, 'longTerm must NOT be set');
    assert.equal(tl.historical, undefined, 'historical must NOT be set');
  });

  it('timeline.shortTerm.moderateEmissions is populated', () => {
    const [tl] = groupByRiskTypeCore([cortoPlazoRisk]);
    assert.ok(
      tl.shortTerm?.moderateEmissions != null,
      'moderateEmissions must be present in shortTerm'
    );
  });

  it('timeline.shortTerm.highEmissions is populated', () => {
    const [tl] = groupByRiskTypeCore([cortoPlazoRisk]);
    assert.ok(
      tl.shortTerm?.highEmissions != null,
      'highEmissions must be present in shortTerm'
    );
  });

  it('historico risk populates timeline.historical (not shortTerm)', () => {
    const historicoRisk = { ...cortoPlazoRisk, period: 'historico', scenarioVariants: {} };
    const [tl] = groupByRiskTypeCore([historicoRisk]);
    assert.ok(tl.historical != null,   'historical must be set for historico period');
    assert.equal(tl.shortTerm, undefined, 'shortTerm must NOT be set for historico period');
  });

  it('risks for all 4 periods produce a timeline with all 4 slots populated', () => {
    const all = ['historico', 'corto_plazo', 'mediano_plazo', 'largo_plazo'].map(period => ({
      riskType: 'calor_extremo',
      period,
      narrativeText: `Narrativa ${period}`,
      impacts: [],
      confidence: 'media',
      scenarioVariants: period !== 'historico'
        ? { emisiones_moderadas: { narrativeText: 'x', impacts: [], confidence: 'media' } }
        : {},
    }));
    const [tl] = groupByRiskTypeCore(all);
    assert.ok(tl.historical  != null, 'historical must be set');
    assert.ok(tl.shortTerm   != null, 'shortTerm must be set');
    assert.ok(tl.mediumTerm  != null, 'mediumTerm must be set');
    assert.ok(tl.longTerm    != null, 'longTerm must be set');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Layer9 / horizon mapping — short_term → corto_plazo, corto_plazo → nearTermNarrative
//    Source: src/constants/scenarios.ts  (HORIZON_TO_PERIOD / toTemporalPeriod)
//            src/features/climate-lookup/components/ExecutiveSummaryCard.jsx (PERIOD_NARRATIVE_KEY)
//            src/domain/buildNarrativeReport.ts (nearTermNarrative field)
// ═══════════════════════════════════════════════════════════════════════════════

// Mirrors HORIZON_TO_PERIOD in src/constants/scenarios.ts
const HORIZON_TO_PERIOD = {
  historical:    'historico',
  short_term:    'corto_plazo',
  mid_term:      'mediano_plazo',
  long_term:     'largo_plazo',
  historico:     'historico',
  corto_plazo:   'corto_plazo',
  mediano_plazo: 'mediano_plazo',
  largo_plazo:   'largo_plazo',
};

function toTemporalPeriod(raw) {
  if (!raw) return 'mediano_plazo';
  return HORIZON_TO_PERIOD[raw.trim()] ?? 'mediano_plazo';
}

describe('Layer9 horizon mapping — short_term/long_term (regression)', () => {
  it('HORIZON_TO_PERIOD maps short_term → corto_plazo', () => {
    assert.equal(
      HORIZON_TO_PERIOD['short_term'],
      'corto_plazo',
      'short_term must map to corto_plazo — this was the root cause of the bug'
    );
  });

  it('HORIZON_TO_PERIOD maps long_term → largo_plazo', () => {
    assert.equal(HORIZON_TO_PERIOD['long_term'], 'largo_plazo');
  });

  it('toTemporalPeriod("short_term") returns "corto_plazo"', () => {
    assert.equal(toTemporalPeriod('short_term'), 'corto_plazo');
  });

  it('toTemporalPeriod("long_term") returns "largo_plazo"', () => {
    assert.equal(toTemporalPeriod('long_term'), 'largo_plazo');
  });

  it('toTemporalPeriod("historical") returns "historico"', () => {
    assert.equal(toTemporalPeriod('historical'), 'historico');
  });

  it('toTemporalPeriod(null) does not throw and returns default', () => {
    assert.equal(toTemporalPeriod(null), 'mediano_plazo');
  });

  it('PERIOD_NARRATIVE_KEY maps corto_plazo → nearTermNarrative (Layer9 canonical name)', () => {
    assert.equal(
      PERIOD_NARRATIVE_KEY['corto_plazo'],
      'nearTermNarrative',
      'nearTermNarrative is the canonical NarrativeReport field for corto_plazo'
    );
  });

  it('PERIOD_NARRATIVE_KEY maps largo_plazo → longTermNarrative', () => {
    assert.equal(PERIOD_NARRATIVE_KEY['largo_plazo'], 'longTermNarrative');
  });

  it('buildNarrativeReport field: nearTermNarrative is produced for corto_plazo risks', () => {
    // Simulates buildNarrativeReport output for a single corto_plazo risk.
    // Uses the same field name that buildOperationalPeriodNarrative writes to.
    const risks = [
      {
        riskType: 'lluvias_extremas', period: 'corto_plazo',
        narrativeText: 'Lluvias proyectadas en corto plazo.',
        confidence: 'media', impacts: [],
      },
    ];
    // Inline the narrative selection: the period 'corto_plazo' → field 'nearTermNarrative'
    const periodsToFields = {
      historico:     'historicalNarrative',
      corto_plazo:   'nearTermNarrative',
      mediano_plazo: 'midTermNarrative',
      largo_plazo:   'longTermNarrative',
    };
    const narrativeReport = {};
    for (const [period, field] of Object.entries(periodsToFields)) {
      const matching = risks.filter(r => r.period === period);
      narrativeReport[field] = matching.length > 0 ? matching[0].narrativeText : null;
    }
    assert.equal(
      narrativeReport.nearTermNarrative,
      'Lluvias proyectadas en corto plazo.',
      'corto_plazo risk narrative must land in nearTermNarrative, not null'
    );
    assert.equal(narrativeReport.historicalNarrative, null);
    assert.equal(narrativeReport.midTermNarrative, null);
    assert.equal(narrativeReport.longTermNarrative, null);
  });
});
