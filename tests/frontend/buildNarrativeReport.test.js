/**
 * Unit tests — buildNarrativeReport() narrative assembly (Sprint 15).
 *
 * Mirrors the TS logic in src/domain/buildNarrativeReport.ts and
 * src/domain/normalizeRisks.ts (buildExecutiveSummary).  Pure JS so
 * Node --test can run it without Vite/TS transpilation.
 *
 * Run: node --test tests/frontend/buildNarrativeReport.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline: buildExecutiveSummary (mirrors normalizeRisks.ts) ───────────────

function buildExecutiveSummary(risks, locationLabel, sectorLabel) {
  const topRisks = risks
    .filter(r => r.confidence !== 'baja')
    .slice(0, 3)
    .map(r => r.displayName.toLowerCase());

  if (topRisks.length === 0) {
    return `Para ${locationLabel}, el análisis no identificó riesgos climáticos de alta o media confianza en el período evaluado.`;
  }

  const riskList =
    topRisks.length === 1
      ? topRisks[0]
      : topRisks.slice(0, -1).join(', ') + ' y ' + topRisks[topRisks.length - 1];

  const adaptCount = risks.flatMap(r => r.adaptationMeasures).length;
  const keyMetricRisk = risks.find(r => r.keyMetric);
  const metricSentence = keyMetricRisk?.keyMetric
    ? ` Las proyecciones estiman ${keyMetricRisk.keyMetric} hacia ${keyMetricRisk.period.replace('_', ' ')}.`
    : '';
  const adaptSentence =
    adaptCount > 0 ? ` Se identificaron ${adaptCount} medidas de adaptación prioritarias.` : '';

  return (
    `Para ${locationLabel}, el análisis climático identifica ${riskList} como los principales` +
    ` factores de riesgo para operaciones de ${sectorLabel}.` +
    metricSentence +
    adaptSentence
  );
}

// ─── Inline: buildNarrativeReport (mirrors buildNarrativeReport.ts) ──────────

const PERIOD_LABEL = {
  historico:     'período histórico de referencia',
  corto_plazo:   'corto plazo (2020–2039)',
  mediano_plazo: 'mediano plazo (2040–2059)',
  largo_plazo:   'largo plazo (2060–2079)',
};

function buildPeriodNarrative(risks, period) {
  const filtered = risks.filter(r => r.period === period && r.confidence !== 'baja');
  if (!filtered.length) return '';

  const parts = filtered.map(r => {
    const metric = r.keyMetric ? ` (${r.keyMetric})` : '';
    return `${r.displayName.toLowerCase()}${metric}`;
  });

  const riskList =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1];

  const adaptCount = filtered.flatMap(r => r.adaptationMeasures).length;
  const adaptSentence =
    adaptCount > 0
      ? ` Se disponen ${adaptCount} medida${adaptCount > 1 ? 's' : ''} de adaptación asociada${adaptCount > 1 ? 's' : ''}.`
      : '';

  return (
    `En el ${PERIOD_LABEL[period]}, el análisis identifica ${riskList} ` +
    `como fenómeno${filtered.length > 1 ? 's' : ''} relevante${filtered.length > 1 ? 's' : ''} ` +
    `para esta ubicación.` +
    adaptSentence
  );
}

function buildNarrativeReport(risks, locationLabel, sectorLabel, rawResponse) {
  const executiveSummary    = buildExecutiveSummary(risks, locationLabel, sectorLabel);
  const historicalNarrative = buildPeriodNarrative(risks, 'historico');
  const midTermNarrative    = buildPeriodNarrative(risks, 'mediano_plazo');
  const longTermNarrative   = buildPeriodNarrative(risks, 'largo_plazo');

  const primaryScenario = risks.find(r => r.scenario !== null)?.scenario ?? null;

  const confRank = { alta: 3, media: 2, baja: 1 };
  const topConfidence = risks.reduce(
    (best, r) => (confRank[r.confidence] > confRank[best] ? r.confidence : best),
    'baja'
  );

  const meta = rawResponse?.metadata;
  const analysisDate = meta?.generated_at ?? new Date().toISOString();

  return {
    locationLabel,
    executiveSummary,
    historicalNarrative,
    midTermNarrative,
    longTermNarrative,
    risks,
    sectorLabel,
    analysisDate,
    primaryScenario,
    confidence: topConfidence,
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeRisk = (overrides) => ({
  id:                 'lluvias_extremas_mediano_plazo',
  riskType:           'lluvias_extremas',
  displayName:        'Lluvias extremas',
  period:             'mediano_plazo',
  scenario:           'emisiones_moderadas',
  confidence:         'alta',
  narrativeText:      'Fenómeno de lluvia intensa.',
  keyMetric:          null,
  impacts:            [],
  evidence:           [],
  adaptationMeasures: [],
  rawSources:         ['signals'],
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildNarrativeReport — structure', () => {
  it('returns all required fields', () => {
    const risks = [makeRisk()];
    const report = buildNarrativeReport(risks, 'Lima, Perú', 'Retail');

    const REQUIRED = [
      'locationLabel', 'executiveSummary', 'historicalNarrative',
      'midTermNarrative', 'longTermNarrative', 'risks',
      'sectorLabel', 'analysisDate', 'primaryScenario', 'confidence',
    ];
    for (const field of REQUIRED) {
      assert.ok(field in report, `Missing field: ${field}`);
    }
  });

  it('preserves locationLabel and sectorLabel', () => {
    const report = buildNarrativeReport([makeRisk()], 'Arequipa, Perú', 'Agroindustria');
    assert.equal(report.locationLabel, 'Arequipa, Perú');
    assert.equal(report.sectorLabel, 'Agroindustria');
  });

  it('risks array matches the input', () => {
    const risks = [makeRisk(), makeRisk({ id: 'sequia_largo_plazo', riskType: 'sequia', period: 'largo_plazo' })];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.risks.length, 2);
  });
});

describe('buildNarrativeReport — period narratives', () => {
  it('historicalNarrative only includes historico risks', () => {
    const risks = [
      makeRisk({ id: 'r1', period: 'historico',     displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r2', period: 'mediano_plazo',  displayName: 'Calor extremo'   }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.historicalNarrative.includes('lluvias extremas'));
    assert.ok(!report.historicalNarrative.includes('calor extremo'));
  });

  it('midTermNarrative only includes mediano_plazo risks', () => {
    const risks = [
      makeRisk({ id: 'r1', period: 'historico',    displayName: 'Sequía'       }),
      makeRisk({ id: 'r2', period: 'mediano_plazo', displayName: 'Calor extremo' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.midTermNarrative.includes('calor extremo'));
    assert.ok(!report.midTermNarrative.includes('sequía'));
  });

  it('longTermNarrative only includes largo_plazo risks', () => {
    const risks = [
      makeRisk({ id: 'r1', period: 'mediano_plazo', displayName: 'Sequía'         }),
      makeRisk({ id: 'r2', period: 'largo_plazo',   displayName: 'Deslizamiento'  }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.longTermNarrative.includes('deslizamiento'));
    assert.ok(!report.longTermNarrative.includes('sequía'));
  });

  it('returns empty string for period with no risks', () => {
    const risks = [makeRisk({ period: 'mediano_plazo' })];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.historicalNarrative, '');
    assert.equal(report.longTermNarrative, '');
  });

  it('excludes baja-confidence risks from period narratives', () => {
    const risks = [
      makeRisk({ id: 'r1', period: 'historico', confidence: 'baja', displayName: 'Heladas' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.historicalNarrative, '', 'Low-confidence risks must not appear in narrative');
  });

  it('includes keyMetric in period narrative when present', () => {
    const risks = [
      makeRisk({ period: 'mediano_plazo', displayName: 'Lluvias extremas', keyMetric: '78 mm/día' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.midTermNarrative.includes('78 mm/día'));
  });

  it('mentions adaptation count when measures are present', () => {
    const risks = [
      makeRisk({
        period: 'historico',
        adaptationMeasures: [
          { id: 'a1', name: 'Drenaje', timeframe: 'mediano', effectiveness: 'alta' },
          { id: 'a2', name: 'Barreras', timeframe: 'largo', effectiveness: 'media' },
        ],
      }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.historicalNarrative.includes('2 medidas'));
  });
});

describe('buildNarrativeReport — confidence aggregation', () => {
  it('reports alta confidence when any risk is alta', () => {
    const risks = [
      makeRisk({ id: 'r1', confidence: 'alta'  }),
      makeRisk({ id: 'r2', confidence: 'media', period: 'largo_plazo' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.confidence, 'alta');
  });

  it('reports media confidence when highest is media', () => {
    const risks = [
      makeRisk({ id: 'r1', confidence: 'media' }),
      makeRisk({ id: 'r2', confidence: 'baja',  period: 'largo_plazo' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.confidence, 'media');
  });

  it('reports baja confidence when all risks are baja', () => {
    const risks = [makeRisk({ confidence: 'baja' })];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.confidence, 'baja');
  });
});

describe('buildNarrativeReport — primaryScenario', () => {
  it('picks scenario from first risk that has one', () => {
    const risks = [
      makeRisk({ id: 'r1', scenario: null }),
      makeRisk({ id: 'r2', scenario: 'altas_emisiones', period: 'largo_plazo' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.primaryScenario, 'altas_emisiones');
  });

  it('primaryScenario is null when all risks have null scenario', () => {
    const risks = [makeRisk({ scenario: null })];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.equal(report.primaryScenario, null);
  });
});

describe('buildNarrativeReport — analysisDate', () => {
  it('uses generated_at from rawResponse.metadata when provided', () => {
    const rawResponse = { metadata: { generated_at: '2025-06-01T12:00:00Z' } };
    const report = buildNarrativeReport([makeRisk()], 'Lima', 'Retail', rawResponse);
    assert.equal(report.analysisDate, '2025-06-01T12:00:00Z');
  });

  it('falls back to current ISO date when metadata is absent', () => {
    const report = buildNarrativeReport([makeRisk()], 'Lima', 'Retail');
    assert.ok(typeof report.analysisDate === 'string');
    assert.ok(report.analysisDate.length > 0);
    assert.ok(!Number.isNaN(Date.parse(report.analysisDate)));
  });
});

describe('buildExecutiveSummary — hero paragraph', () => {
  it('mentions location and sector', () => {
    const risks = [makeRisk({ confidence: 'alta' })];
    const summary = buildExecutiveSummary(risks, 'Trujillo, Perú', 'Logística');
    assert.ok(summary.includes('Trujillo, Perú'));
    assert.ok(summary.includes('Logística'));
  });

  it('returns no-risk message when all risks are baja confidence', () => {
    const risks = [makeRisk({ confidence: 'baja' })];
    const summary = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(summary.includes('no identificó riesgos'));
  });

  it('returns no-risk message for empty risks array', () => {
    const summary = buildExecutiveSummary([], 'Lima', 'Retail');
    assert.ok(summary.includes('no identificó riesgos'));
  });

  it('includes adaptation count when measures exist', () => {
    const risks = [
      makeRisk({
        confidence: 'alta',
        adaptationMeasures: [
          { id: 'a1', name: 'Drenaje', timeframe: 'mediano', effectiveness: 'alta' },
        ],
      }),
    ];
    const summary = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(summary.includes('1 medidas de adaptación'));
  });

  it('lists up to 3 top risks', () => {
    const risks = [
      makeRisk({ id: 'r1', riskType: 'lluvias_extremas', displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r2', riskType: 'calor_extremo',    displayName: 'Calor extremo',   period: 'largo_plazo'   }),
      makeRisk({ id: 'r3', riskType: 'sequia',           displayName: 'Sequía',          period: 'historico'     }),
      makeRisk({ id: 'r4', riskType: 'deslizamiento',    displayName: 'Deslizamiento',   period: 'corto_plazo'   }),
    ];
    const summary = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(summary.includes('lluvias extremas'));
    assert.ok(summary.includes('calor extremo'));
    assert.ok(summary.includes('sequía'));
    assert.ok(!summary.includes('deslizamiento'), '4th risk must be excluded (cap at 3)');
  });

  it('includes keyMetric in the summary when available', () => {
    const risks = [makeRisk({ confidence: 'alta', keyMetric: '42 °C', period: 'mediano_plazo' })];
    const summary = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(summary.includes('42 °C'));
  });
});
