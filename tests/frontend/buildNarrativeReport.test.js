/**
 * Unit tests — buildNarrativeReport() / buildOperationalNarrative (Sprint 18).
 *
 * Mirrors the TS logic in:
 *   src/domain/buildNarrativeReport.ts
 *   src/domain/buildOperationalNarrative.ts  (Sprint 18: no raw metrics, no IPCC codes)
 *   src/domain/normalizeRisks.ts             (buildExecutiveSummary — deduplicated)
 *
 * Pure JS so Node --test can run without Vite/TS transpilation.
 * Run: node --test tests/frontend/buildNarrativeReport.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline: buildOperationalNarrative (mirrors buildOperationalNarrative.ts) ─

const IMPACT_DOMAINS = {
  lluvias_extremas: ['accesos y logística', 'continuidad operativa'],
  calor_extremo:    ['productividad del personal', 'demanda energética'],
  sequia:           ['abastecimiento hídrico', 'cadena de suministro'],
  deslizamiento:    ['vías de acceso', 'infraestructura crítica'],
  heladas:          ['instalaciones expuestas', 'operaciones en campo'],
  fenomeno_enso:    ['logística', 'planificación operativa'],
  inundacion:       ['instalaciones', 'rutas logísticas'],
};

const MID_TERM_PROJECTION = {
  lluvias_extremas: 'lluvias más intensas y frecuentes',
  calor_extremo:    'temperaturas más extremas',
  sequia:           'períodos de sequía más extensos y severos',
  deslizamiento:    'mayor susceptibilidad a movimientos de terreno',
  heladas:          'episodios de heladas más intensos',
  fenomeno_enso:    'mayor variabilidad climática interanual',
  inundacion:       'mayor riesgo de desborde e inundaciones',
};

const LONG_TERM_PROJECTION = {
  lluvias_extremas: 'un régimen de lluvias más intenso y variable',
  calor_extremo:    'condiciones de calor extremo más frecuentes e intensas',
  sequia:           'mayor escasez hídrica',
  deslizamiento:    'riesgo incrementado de deslizamientos',
  heladas:          'variabilidad en el riesgo de heladas',
  fenomeno_enso:    'variabilidad climática de largo plazo amplificada',
  inundacion:       'mayor exposición a inundaciones',
};

const SCENARIO_PHRASE = {
  emisiones_moderadas: 'bajo un escenario de emisiones moderadas',
  altas_emisiones:     'bajo un escenario de altas emisiones',
  bajas_emisiones:     'bajo un escenario de bajas emisiones',
};

function formatList(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}

function dedupeByRiskType(risks) {
  const seen = new Set();
  return risks.filter(r => {
    if (seen.has(r.riskType)) return false;
    seen.add(r.riskType);
    return true;
  });
}

function buildOperationalExecutiveSummary(risks, locationLabel, sectorLabel) {
  const qualifying = risks.filter(r => r.confidence !== 'baja');
  const unique = dedupeByRiskType(qualifying).slice(0, 3);

  if (unique.length === 0) {
    return `Para ${locationLabel}, el análisis no identificó riesgos climáticos de alta o media confianza en el período evaluado.`;
  }

  const riskNames = unique.map(r => r.displayName.toLowerCase());
  const riskList = formatList(riskNames);

  const domains = unique
    .flatMap(r => IMPACT_DOMAINS[r.riskType] ?? [])
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3);

  const impactSentence = domains.length > 0
    ? ` Esto podría afectar ${formatList(domains)}.`
    : '';

  const adaptCount = risks.flatMap(r => r.adaptationMeasures).length;
  const adaptSentence = adaptCount > 0
    ? ` Se identificaron ${adaptCount} medidas de adaptación prioritarias.`
    : '';

  return (
    `Para ${locationLabel}, el análisis identifica ${riskList} como los principales` +
    ` riesgos para las operaciones de ${sectorLabel}.` +
    impactSentence +
    adaptSentence
  );
}

function buildOperationalPeriodNarrative(risks, period) {
  const filtered = risks.filter(r => r.period === period && r.confidence !== 'baja');
  if (!filtered.length) return '';

  const unique = dedupeByRiskType(filtered);
  const adaptCount = filtered.flatMap(r => r.adaptationMeasures).length;
  const adaptSuffix = adaptCount > 0
    ? ` Se disponen ${adaptCount} medida${adaptCount > 1 ? 's' : ''} de adaptación.`
    : '';

  if (period === 'historico') {
    const names = unique.map(r => r.displayName.toLowerCase());
    const list = formatList(names);
    const domains = unique
      .flatMap(r => IMPACT_DOMAINS[r.riskType] ?? [])
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 2);
    const domainSuffix = domains.length > 0
      ? `, con potencial afectación sobre ${formatList(domains)}`
      : '';
    return `En el período de referencia, se han identificado ${list} en esta zona${domainSuffix}.${adaptSuffix}`;
  }

  if (period === 'mediano_plazo') {
    const projections = unique.map(
      r => MID_TERM_PROJECTION[r.riskType] ?? r.displayName.toLowerCase()
    );
    const projList = formatList(projections);
    const scenario = unique[0]?.scenario;
    const scenarioPart = scenario && SCENARIO_PHRASE[scenario]
      ? `${SCENARIO_PHRASE[scenario]}, esta zona`
      : 'esta zona';
    return `Hacia mediados de siglo, ${scenarioPart} podría experimentar ${projList}.${adaptSuffix}`;
  }

  if (period === 'largo_plazo') {
    const projections = unique.map(
      r => LONG_TERM_PROJECTION[r.riskType] ?? r.displayName.toLowerCase()
    );
    const projList = formatList(projections);
    const scenario = unique[0]?.scenario;
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo un escenario de altas emisiones'
      : 'A largo plazo';
    return `${lead}, se proyecta ${projList}, con mayor afectación sobre la infraestructura y las operaciones.${adaptSuffix}`;
  }

  const names = unique.map(r => r.displayName.toLowerCase());
  return `En el corto plazo se anticipan ${formatList(names)} con potencial de impacto operativo.${adaptSuffix}`;
}

// ─── Inline: buildNarrativeReport (mirrors buildNarrativeReport.ts) ───────────

function buildNarrativeReport(risks, locationLabel, sectorLabel, rawResponse) {
  const executiveSummary    = buildOperationalExecutiveSummary(risks, locationLabel, sectorLabel);
  const historicalNarrative = buildOperationalPeriodNarrative(risks, 'historico');
  const midTermNarrative    = buildOperationalPeriodNarrative(risks, 'mediano_plazo');
  const longTermNarrative   = buildOperationalPeriodNarrative(risks, 'largo_plazo');

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

// ─── Legacy buildExecutiveSummary (mirrors normalizeRisks.ts — deduplicated) ──

function buildExecutiveSummary(risks, locationLabel, sectorLabel) {
  const seen = new Set();
  const topRisks = risks
    .filter(r => r.confidence !== 'baja')
    .filter(r => {
      if (seen.has(r.riskType)) return false;
      seen.add(r.riskType);
      return true;
    })
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
  const adaptSentence =
    adaptCount > 0 ? ` Se identificaron ${adaptCount} medidas de adaptación prioritarias.` : '';

  return (
    `Para ${locationLabel}, el análisis identifica ${riskList} como los principales` +
    ` riesgos para las operaciones de ${sectorLabel}.` +
    adaptSentence
  );
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
  scenarioVariants:   {}, // Sprint 19: populated by buildScenarioVariants
  ...overrides,
});

// ─── Tests — buildNarrativeReport structure ───────────────────────────────────

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

// ─── Tests — period narratives ────────────────────────────────────────────────

describe('buildNarrativeReport — period narratives', () => {
  it('historicalNarrative only includes historico risks', () => {
    const risks = [
      makeRisk({ id: 'r1', period: 'historico',     riskType: 'lluvias_extremas', displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r2', period: 'mediano_plazo',  riskType: 'calor_extremo',    displayName: 'Calor extremo'   }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.historicalNarrative.includes('lluvias extremas'));
    assert.ok(!report.historicalNarrative.includes('calor extremo'));
  });

  it('midTermNarrative uses operational projection language for mediano_plazo risks', () => {
    const risks = [
      makeRisk({ id: 'r1', period: 'historico',     riskType: 'sequia',        displayName: 'Sequía'        }),
      makeRisk({ id: 'r2', period: 'mediano_plazo',  riskType: 'calor_extremo', displayName: 'Calor extremo' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.midTermNarrative.includes('temperaturas más extremas'), 'debe usar proyección operacional');
    assert.ok(!report.midTermNarrative.includes('sequía'), 'no debe incluir riesgos de otro período');
  });

  it('longTermNarrative uses operational projection language for largo_plazo risks', () => {
    const risks = [
      makeRisk({ id: 'r1', period: 'mediano_plazo', riskType: 'sequia',          displayName: 'Sequía'        }),
      makeRisk({ id: 'r2', period: 'largo_plazo',   riskType: 'deslizamiento',   displayName: 'Deslizamiento' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(report.longTermNarrative.includes('deslizamiento'), 'debe mencionar el fenómeno');
    assert.ok(!report.longTermNarrative.includes('sequía'), 'no debe incluir riesgos de otro período');
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

  it('period narrative does NOT include raw metrics', () => {
    const risks = [
      makeRisk({ period: 'mediano_plazo', riskType: 'lluvias_extremas', displayName: 'Lluvias extremas', keyMetric: '78 mm/día' }),
    ];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(!report.midTermNarrative.includes('78 mm/día'), 'keyMetric no debe aparecer en la narrativa');
    assert.ok(report.midTermNarrative.length > 0, 'la narrativa debe existir aunque sin métrica cruda');
  });

  it('period narrative does NOT include IPCC codes', () => {
    const risks = [makeRisk({ period: 'mediano_plazo', riskType: 'lluvias_extremas' })];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    const technicalTerms = ['SSP245', 'SSP585', 'SSP2-4.5', 'CMIP6', 'rx1day', 'Rx5day', 'anomalía'];
    for (const term of technicalTerms) {
      assert.ok(!report.midTermNarrative.includes(term), `"${term}" no debe aparecer en la narrativa`);
    }
  });

  it('midTermNarrative includes scenario plain label when scenario is set', () => {
    const risks = [makeRisk({ period: 'mediano_plazo', scenario: 'emisiones_moderadas' })];
    const report = buildNarrativeReport(risks, 'Lima', 'Retail');
    assert.ok(
      report.midTermNarrative.includes('emisiones moderadas'),
      'debe mencionar el escenario en lenguaje llano'
    );
    assert.ok(!report.midTermNarrative.includes('SSP'), 'no debe exponer el código SSP');
  });

  it('mentions adaptation count when measures are present', () => {
    const risks = [
      makeRisk({
        period: 'historico',
        riskType: 'lluvias_extremas',
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

// ─── Tests — confidence aggregation ──────────────────────────────────────────

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

// ─── Tests — primaryScenario ──────────────────────────────────────────────────

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

// ─── Tests — analysisDate ─────────────────────────────────────────────────────

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

// ─── Tests — buildExecutiveSummary (legacy, deduplicated) ────────────────────

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

  it('lists up to 3 top risks, capped and deduplicated by riskType', () => {
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

  it('deduplicates risks with the same riskType across periods', () => {
    const risks = [
      makeRisk({ id: 'r1', riskType: 'lluvias_extremas', period: 'mediano_plazo', displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r2', riskType: 'lluvias_extremas', period: 'largo_plazo',   displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r3', riskType: 'sequia',           period: 'mediano_plazo', displayName: 'Sequía'           }),
    ];
    const summary = buildExecutiveSummary(risks, 'Lima', 'Retail');
    // "lluvias extremas" must appear only once, not "lluvias extremas, lluvias extremas y sequía"
    const count = (summary.match(/lluvias extremas/g) ?? []).length;
    assert.equal(count, 1, 'el mismo riskType no debe duplicarse en el resumen');
    assert.ok(summary.includes('sequía'));
  });

  it('summary uses operational language — no raw metrics', () => {
    const risks = [makeRisk({ confidence: 'alta', keyMetric: '42 °C', period: 'mediano_plazo' })];
    const summary = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(!summary.includes('42 °C'), 'raw keyMetric must not appear in summary');
    assert.ok(summary.includes('Lima'), 'location label must appear');
    assert.ok(summary.includes('Retail'), 'sector label must appear');
  });

  it('summary has no IPCC/SSP codes', () => {
    const risks = [makeRisk({ confidence: 'alta' })];
    const summary = buildExecutiveSummary(risks, 'Lima', 'Retail');
    const forbidden = ['SSP245', 'SSP585', 'CMIP6', 'rx1day', 'Rx5day', 'ONI', 'anomalía'];
    for (const term of forbidden) {
      assert.ok(!summary.includes(term), `"${term}" must not appear in executive summary`);
    }
  });
});

// ─── Tests — buildOperationalExecutiveSummary ────────────────────────────────

describe('buildOperationalExecutiveSummary — operational hero', () => {
  it('includes operational impact domains', () => {
    const risks = [makeRisk({ confidence: 'alta', riskType: 'lluvias_extremas' })];
    const summary = buildOperationalExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(
      summary.includes('accesos y logística') || summary.includes('continuidad operativa'),
      'debe mencionar dominios operativos'
    );
  });

  it('deduplicates riskType across periods in the hero', () => {
    const risks = [
      makeRisk({ id: 'r1', riskType: 'lluvias_extremas', period: 'mediano_plazo' }),
      makeRisk({ id: 'r2', riskType: 'lluvias_extremas', period: 'largo_plazo'   }),
    ];
    const summary = buildOperationalExecutiveSummary(risks, 'Lima', 'Retail');
    const count = (summary.match(/lluvias extremas/g) ?? []).length;
    assert.equal(count, 1, 'el mismo fenómeno no debe aparecer dos veces');
  });
});

// ─── Tests — buildOperationalPeriodNarrative ─────────────────────────────────

describe('buildOperationalPeriodNarrative — period language', () => {
  it('historical uses observation language without raw metrics', () => {
    const risks = [makeRisk({ period: 'historico', riskType: 'lluvias_extremas', displayName: 'Lluvias extremas' })];
    const text = buildOperationalPeriodNarrative(risks, 'historico');
    assert.ok(text.includes('lluvias extremas'), 'debe mencionar el fenómeno');
    assert.ok(text.includes('período de referencia'), 'debe usar lenguaje histórico');
    assert.ok(!text.includes('SSP'), 'no debe exponer código SSP');
  });

  it('mid-term uses projection language with scenario plain label', () => {
    const risks = [makeRisk({ period: 'mediano_plazo', riskType: 'calor_extremo', scenario: 'emisiones_moderadas' })];
    const text = buildOperationalPeriodNarrative(risks, 'mediano_plazo');
    assert.ok(text.includes('temperaturas más extremas'), 'debe usar proyección operacional');
    assert.ok(text.includes('mediados de siglo'), 'debe ubicar temporalmente');
    assert.ok(text.includes('emisiones moderadas'), 'debe mencionar escenario en lenguaje llano');
    assert.ok(!text.includes('SSP245') && !text.includes('ssp245'), 'no debe exponer código SSP');
  });

  it('long-term uses projection language', () => {
    const risks = [makeRisk({ period: 'largo_plazo', riskType: 'sequia', scenario: 'altas_emisiones' })];
    const text = buildOperationalPeriodNarrative(risks, 'largo_plazo');
    assert.ok(text.includes('mayor escasez hídrica') || text.includes('escasez'), 'debe usar proyección operacional');
    assert.ok(text.includes('altas emisiones'), 'debe mencionar escenario en lenguaje llano');
    assert.ok(!text.includes('SSP585'), 'no debe exponer código SSP');
  });

  it('returns empty for period with no risks', () => {
    const text = buildOperationalPeriodNarrative([], 'mediano_plazo');
    assert.equal(text, '');
  });

  it('excludes baja-confidence risks', () => {
    const risks = [makeRisk({ period: 'historico', confidence: 'baja' })];
    const text = buildOperationalPeriodNarrative(risks, 'historico');
    assert.equal(text, '');
  });
});

// ─── Sprint 19: ScenarioVariant integration ───────────────────────────────────

const MID_TERM_PROJ_MOD = {
  lluvias_extremas: 'lluvias más intensas y frecuentes',
  calor_extremo:    'temperaturas más extremas',
  sequia:           'períodos de sequía más extensos y severos',
};

const MID_TERM_PROJ_HIGH = {
  lluvias_extremas: 'lluvias significativamente más intensas, con mayor frecuencia de eventos extremos',
  calor_extremo:    'temperaturas extremas con mayor frecuencia e intensidad sostenida',
};

const LONG_TERM_PROJ_MOD = {
  sequia:        'mayor escasez hídrica',
  deslizamiento: 'riesgo incrementado de deslizamientos',
};

const LONG_TERM_PROJ_HIGH = {
  sequia:        'escasez hídrica crónica con restricciones operativas estructurales',
  deslizamiento: 'un riesgo elevado y persistente de deslizamientos sobre infraestructura crítica',
};

function buildScenarioNarrativeText19(riskType, period, scenario) {
  if (period === 'historico') return '';
  if (period === 'mediano_plazo') {
    const phrase = scenario === 'altas_emisiones' ? MID_TERM_PROJ_HIGH[riskType] : MID_TERM_PROJ_MOD[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo altas emisiones, hacia mediados de siglo esta zona podría experimentar'
      : 'Hacia mediados de siglo, bajo emisiones moderadas, esta zona podría experimentar';
    return `${lead} ${phrase ?? riskType}.`;
  }
  if (period === 'largo_plazo') {
    const phrase = scenario === 'altas_emisiones' ? LONG_TERM_PROJ_HIGH[riskType] : LONG_TERM_PROJ_MOD[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo un escenario de altas emisiones a largo plazo, se proyecta'
      : 'A largo plazo, bajo emisiones moderadas, se proyecta';
    return `${lead} ${phrase ?? riskType}, con afectación sobre la infraestructura y las operaciones.`;
  }
  return '';
}

describe('buildScenarioVariants — Sprint 19 narrative', () => {
  it('mid-term moderate scenario uses plain language without SSP codes', () => {
    const text = buildScenarioNarrativeText19('lluvias_extremas', 'mediano_plazo', 'emisiones_moderadas');
    assert.ok(text.length > 10, 'Moderate narrative must not be empty');
    assert.ok(!text.includes('SSP245'), 'Must not expose SSP codes');
    assert.ok(!text.includes('ssp245'), 'Must not expose ssp codes');
    assert.ok(text.toLowerCase().includes('moderadas'), 'Must mention moderadas');
  });

  it('mid-term high-emissions scenario uses plain language without SSP codes', () => {
    const text = buildScenarioNarrativeText19('lluvias_extremas', 'mediano_plazo', 'altas_emisiones');
    assert.ok(text.length > 10, 'High narrative must not be empty');
    assert.ok(!text.includes('SSP585'), 'Must not expose SSP codes');
    assert.ok(text.toLowerCase().includes('altas emisiones'), 'Must mention altas emisiones');
  });

  it('long-term high-emissions narrative is more severe than moderate', () => {
    const modText  = buildScenarioNarrativeText19('sequia', 'largo_plazo', 'emisiones_moderadas');
    const highText = buildScenarioNarrativeText19('sequia', 'largo_plazo', 'altas_emisiones');
    assert.notEqual(modText, highText, 'Scenarios must produce different narratives');
    // High scenario should have a stronger word
    assert.ok(
      highText.includes('crónica') || highText.includes('estructurales') || highText.length > modText.length,
      'High-emissions narrative should be more severe'
    );
  });

  it('historico period returns empty string for both scenarios', () => {
    assert.equal(buildScenarioNarrativeText19('lluvias_extremas', 'historico', 'emisiones_moderadas'), '');
    assert.equal(buildScenarioNarrativeText19('lluvias_extremas', 'historico', 'altas_emisiones'), '');
  });

  it('deslizamiento has distinct long-term narratives per scenario', () => {
    const mod  = buildScenarioNarrativeText19('deslizamiento', 'largo_plazo', 'emisiones_moderadas');
    const high = buildScenarioNarrativeText19('deslizamiento', 'largo_plazo', 'altas_emisiones');
    assert.notEqual(mod, high);
    assert.ok(high.includes('elevado') || high.includes('crítica') || high.length >= mod.length);
  });
});

describe('NarrativeReport — scenarioVariants field presence (regression)', () => {
  it('makeRisk fixture includes scenarioVariants field', () => {
    const risk = makeRisk();
    assert.ok('scenarioVariants' in risk, 'ConsolidatedRisk must have scenarioVariants field');
  });

  it('historico risks have empty scenarioVariants by default', () => {
    const risk = makeRisk({ period: 'historico', scenarioVariants: {} });
    assert.deepEqual(risk.scenarioVariants, {});
  });

  it('buildNarrativeReport passes through risks with scenarioVariants intact', () => {
    const variants = {
      emisiones_moderadas: { narrativeText: 'Moderado', impacts: [], confidence: 'media' },
      altas_emisiones:     { narrativeText: 'Alto',     impacts: ['daño estructural'], confidence: 'alta' },
    };
    const risk = makeRisk({ period: 'mediano_plazo', scenarioVariants: variants });
    const report = buildNarrativeReport([risk], 'Lima', 'Retail');
    const resultRisk = report.risks[0];
    assert.deepEqual(resultRisk.scenarioVariants, variants, 'scenarioVariants must be preserved in the report');
  });
});

// ─── I-3 fix: corto_plazo scenario narratives ────────────────────────────────
// Mirrors the SHORT_TERM_PROJECTION / SHORT_TERM_PROJECTION_HIGH pattern
// added to buildOperationalNarrative.ts.  These inline copies validate the
// architectural contract without importing the TypeScript module.

const SHORT_TERM_PROJ_MOD = {
  lluvias_extremas: 'mayor frecuencia de lluvias intensas',
  calor_extremo:    'temperaturas más elevadas con mayor frecuencia de episodios cálidos',
  sequia:           'períodos de déficit hídrico más frecuentes',
};

const SHORT_TERM_PROJ_HIGH = {
  lluvias_extremas: 'mayor frecuencia e intensidad de lluvias extremas',
  calor_extremo:    'temperaturas significativamente más elevadas con mayor frecuencia de eventos extremos',
  sequia:           'déficit hídrico más acentuado y frecuente',
};

function buildScenarioNarrativeTextCorto(riskType, period, scenario) {
  if (period === 'historico') return '';
  if (period === 'mediano_plazo') {
    const phrase = scenario === 'altas_emisiones' ? MID_TERM_PROJ_HIGH[riskType] : MID_TERM_PROJ_MOD[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo altas emisiones, hacia mediados de siglo esta zona podría experimentar'
      : 'Hacia mediados de siglo, bajo emisiones moderadas, esta zona podría experimentar';
    return `${lead} ${phrase ?? riskType}.`;
  }
  if (period === 'largo_plazo') {
    const phrase = scenario === 'altas_emisiones' ? LONG_TERM_PROJ_HIGH[riskType] : LONG_TERM_PROJ_MOD[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo un escenario de altas emisiones a largo plazo, se proyecta'
      : 'A largo plazo, bajo emisiones moderadas, se proyecta';
    return `${lead} ${phrase ?? riskType}, con afectación sobre la infraestructura y las operaciones.`;
  }
  if (period === 'corto_plazo') {
    const phrase = scenario === 'altas_emisiones' ? SHORT_TERM_PROJ_HIGH[riskType] : SHORT_TERM_PROJ_MOD[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo altas emisiones, en el corto plazo se anticipa'
      : 'En el corto plazo, bajo emisiones moderadas, se anticipa';
    return `${lead} ${phrase ?? riskType}.`;
  }
  return '';
}

describe('buildScenarioVariants — corto_plazo scenario narratives (I-3 fix)', () => {
  it('corto_plazo moderate narrative is non-empty', () => {
    const text = buildScenarioNarrativeTextCorto('lluvias_extremas', 'corto_plazo', 'emisiones_moderadas');
    assert.ok(text.length > 10, 'corto_plazo moderate narrative must not be empty (was always "" before fix)');
  });

  it('corto_plazo high-emissions narrative is non-empty', () => {
    const text = buildScenarioNarrativeTextCorto('lluvias_extremas', 'corto_plazo', 'altas_emisiones');
    assert.ok(text.length > 10, 'corto_plazo high narrative must not be empty');
  });

  it('corto_plazo moderate uses "En el corto plazo" lead', () => {
    const text = buildScenarioNarrativeTextCorto('sequia', 'corto_plazo', 'emisiones_moderadas');
    assert.ok(
      text.toLowerCase().includes('corto plazo'),
      'Must include "corto plazo" — not mid/long temporal framing'
    );
    assert.ok(text.toLowerCase().includes('moderadas'), 'Must mention emisiones moderadas');
  });

  it('corto_plazo high uses "altas emisiones" lead', () => {
    const text = buildScenarioNarrativeTextCorto('calor_extremo', 'corto_plazo', 'altas_emisiones');
    assert.ok(text.toLowerCase().includes('altas emisiones'), 'Must mention altas emisiones');
    assert.ok(text.toLowerCase().includes('corto plazo'), 'Must include "corto plazo" horizon');
  });

  it('corto_plazo moderate and high produce different texts', () => {
    const mod  = buildScenarioNarrativeTextCorto('lluvias_extremas', 'corto_plazo', 'emisiones_moderadas');
    const high = buildScenarioNarrativeTextCorto('lluvias_extremas', 'corto_plazo', 'altas_emisiones');
    assert.notEqual(mod, high, 'Scenarios must produce different narratives for corto_plazo');
  });

  it('corto_plazo does NOT use mediados de siglo framing', () => {
    const text = buildScenarioNarrativeTextCorto('sequia', 'corto_plazo', 'emisiones_moderadas');
    assert.ok(!text.includes('mediados de siglo'), 'corto_plazo must not use mid-century framing');
    assert.ok(!text.includes('largo plazo'), 'corto_plazo must not use long-term framing');
  });

  it('historico still returns empty string (no regression)', () => {
    assert.equal(buildScenarioNarrativeTextCorto('lluvias_extremas', 'historico', 'emisiones_moderadas'), '');
    assert.equal(buildScenarioNarrativeTextCorto('lluvias_extremas', 'historico', 'altas_emisiones'), '');
  });

  it('mediano_plazo still uses mid-century framing (no regression)', () => {
    const text = buildScenarioNarrativeTextCorto('lluvias_extremas', 'mediano_plazo', 'emisiones_moderadas');
    assert.ok(text.includes('mediados de siglo'), 'mediano_plazo must still use mid-century framing');
  });

  it('largo_plazo still uses long-term framing (no regression)', () => {
    const text = buildScenarioNarrativeTextCorto('sequia', 'largo_plazo', 'emisiones_moderadas');
    assert.ok(
      text.includes('largo plazo') || text.includes('A largo'),
      'largo_plazo must still use long-term framing'
    );
  });
});
