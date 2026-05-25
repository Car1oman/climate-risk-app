/**
 * Unit tests — normalizeRisks() semantic deduplication layer (Sprint 14).
 *
 * Tests pure normalization logic independently of Vite/React/TypeScript.
 * The SIGNAL_TO_CONSOLIDATED map and deduplication rules are replicated here
 * to avoid importing TypeScript files with import.meta.env dependencies.
 *
 * Run: node --test tests/frontend/normalizeRisks.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline the canonical mapping (mirrors src/domain/normalizeRisks.ts) ─────
// These constants must be kept in sync. If the TS source changes, update here.

const SIGNAL_TO_CONSOLIDATED = {
  extreme_rain:             'lluvias_extremas',
  flood_risk:               'lluvias_extremas',
  extreme_heat:             'calor_extremo',
  severe_heat:              'calor_extremo',
  tropical_nights:          'calor_extremo',
  temp_increase:            'calor_extremo',
  drought:                  'sequia',
  water_stress:             'sequia',
  landslide_susceptibility: 'deslizamiento',
  huayco_risk:              'deslizamiento',
  enso_phase:               'fenomeno_enso',
  enso:                     'fenomeno_enso',
  frost:                    'heladas',
  freeze:                   'heladas',
  flood:                    'lluvias_extremas',
  fluvial:                  'inundacion',
  pluvial:                  'lluvias_extremas',
  coastal:                  'inundacion',
  heat:                     'calor_extremo',
  heat_stress:              'calor_extremo',
  landslide:                'deslizamiento',
  lluvia_extrema:           'lluvias_extremas',
  calor_extremo:            'calor_extremo',
  sequia:                   'sequia',
  deslizamiento:            'deslizamiento',
  inundacion:               'inundacion',
};

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

const SCENARIO_SLUG_MAP = {
  'SSP1-2.6': 'bajas_emisiones',
  'SSP2-4.5': 'emisiones_moderadas',
  'SSP5-8.5': 'altas_emisiones',
  'ssp126':   'bajas_emisiones',
  'ssp245':   'emisiones_moderadas',
  'ssp585':   'altas_emisiones',
};

const KEYWORD_MAP = [
  { pattern: /lluvi|inundaci|precipitaci/i,  slug: 'lluvias_extremas' },
  { pattern: /calor|temperatura|t[eé]rmic/i, slug: 'calor_extremo'    },
  { pattern: /sequ[íi]a|h[íi]dric|agua/i,   slug: 'sequia'           },
  { pattern: /desliz|huayco|landslide/i,     slug: 'deslizamiento'    },
  { pattern: /helada|frost|fre[ae]ze/i,      slug: 'heladas'          },
  { pattern: /ni[ñn]o|ni[ñn]a|enso/i,       slug: 'fenomeno_enso'    },
];

// ─── Minimal normalizer (pure JS, mirrors TS logic without import.meta.env) ──

function getSignalTypeKey(signal) {
  const raw = signal.signal_type ?? signal.signalType ?? '';
  return raw.toLowerCase().trim();
}

function resolveSlug(key) {
  return SIGNAL_TO_CONSOLIDATED[key] ?? null;
}

function detectSlugFromText(text) {
  for (const { pattern, slug } of KEYWORD_MAP) {
    if (pattern.test(text)) return slug;
  }
  return null;
}

function toConfidence(raw) {
  const map = { high: 'alta', medium: 'media', low: 'baja', alta: 'alta', media: 'media', baja: 'baja' };
  if (typeof raw !== 'string') return 'media';
  return map[raw.toLowerCase().trim()] ?? 'media';
}

function toTemporalPeriod(raw) {
  if (!raw) return 'mediano_plazo';
  return HORIZON_TO_PERIOD[raw.trim()] ?? 'mediano_plazo';
}

function dedupeStrings(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function mergeEvidence(existing, incoming) {
  const seen = new Set(existing.map(e => e.sourceLabel));
  return [...existing, ...incoming.filter(e => !seen.has(e.sourceLabel))];
}

function buildEmpty(riskType, period, scenario, confidence) {
  return {
    id: `${riskType}_${period}`,
    riskType,
    displayName: riskType,
    period,
    scenario,
    confidence,
    narrativeText: '',
    keyMetric: null,
    impacts: [],
    evidence: [],
    adaptationMeasures: [],
    rawSources: [],
    scenarioVariants: {}, // Sprint 19: populated by buildScenarioVariants post-processing
  };
}

function normalizeRisks(apiResponse) {
  if (!apiResponse || typeof apiResponse !== 'object') return [];
  const map = new Map();

  const rawSignals = apiResponse.signals;
  const signalList = Array.isArray(rawSignals)
    ? rawSignals
    : Array.isArray(rawSignals?.signals) ? rawSignals.signals : [];

  for (const signal of signalList) {
    const typeKey = getSignalTypeKey(signal);
    if (!typeKey) continue;
    const riskType = resolveSlug(typeKey);
    if (!riskType) continue;
    const period = toTemporalPeriod(signal.horizon ?? signal.temporal_window ?? '');
    const scenario = SCENARIO_SLUG_MAP[(signal.scenario ?? '').trim()] ?? null;
    const confidence = toConfidence(signal.confidence);
    const key = `${riskType}_${period}`;
    if (!map.has(key)) map.set(key, buildEmpty(riskType, period, scenario, confidence));
    const entry = map.get(key);
    if (!entry.keyMetric) {
      const value = signal.projected ?? signal.value;
      if (value != null) entry.keyMetric = `${value} ${signal.unit ?? ''}`.trim();
    }
    if (!entry.rawSources.includes('signals')) entry.rawSources.push('signals');
  }

  const riskList = Array.isArray(apiResponse.risks) ? apiResponse.risks : [];
  for (const risk of riskList) {
    const nested = risk.signal;
    const typeKey = nested ? getSignalTypeKey(nested) : '';
    let riskType = typeKey ? resolveSlug(typeKey) : null;
    if (!riskType) riskType = detectSlugFromText(risk.title ?? risk.name ?? '');
    if (!riskType) continue;
    const matchedKey = [...map.keys()].find(k => k.startsWith(riskType));
    if (!matchedKey) continue;
    const entry = map.get(matchedKey);
    if (Array.isArray(risk.operational_impacts)) {
      entry.impacts = dedupeStrings([...entry.impacts, ...risk.operational_impacts]);
    }
    if (!entry.rawSources.includes('risks')) entry.rawSources.push('risks');
  }

  const griList = Array.isArray(apiResponse.gri_hazards) ? apiResponse.gri_hazards : [];
  for (const hazard of griList) {
    const typeKey = ((hazard.hazard ?? hazard.type ?? '')).toLowerCase().trim();
    const riskType = resolveSlug(typeKey);
    if (!riskType) continue;
    const matchedKey = [...map.keys()].find(k => k.startsWith(riskType));
    if (!matchedKey) continue;
    const entry = map.get(matchedKey);
    entry.evidence = mergeEvidence(entry.evidence, [{
      sourceLabel: 'GRI Oxford Infrastructure Resilience',
      period: 'presente',
      validationStatus: 'validado',
    }]);
    if (!entry.rawSources.includes('gri')) entry.rawSources.push('gri');
  }

  return [...map.values()];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normalizeRisks — SIGNAL_TO_CONSOLIDATED mapping', () => {
  it('covers all 10 Layer2 signal types', () => {
    const layer2Types = [
      'extreme_heat', 'severe_heat', 'tropical_nights', 'temp_increase',
      'drought', 'extreme_rain', 'flood_risk',
      'landslide_susceptibility', 'huayco_risk', 'enso_phase',
    ];
    for (const t of layer2Types) {
      assert.ok(SIGNAL_TO_CONSOLIDATED[t], `Missing mapping for signal type: ${t}`);
    }
  });

  it('covers all major GRI hazard types', () => {
    const griTypes = ['flood', 'heat', 'heat_stress', 'landslide', 'fluvial', 'coastal', 'pluvial'];
    for (const t of griTypes) {
      assert.ok(SIGNAL_TO_CONSOLIDATED[t], `Missing mapping for GRI hazard type: ${t}`);
    }
  });

  it('extreme_rain → lluvias_extremas', () => {
    assert.equal(SIGNAL_TO_CONSOLIDATED['extreme_rain'], 'lluvias_extremas');
  });

  it('flood → lluvias_extremas (GRI)', () => {
    assert.equal(SIGNAL_TO_CONSOLIDATED['flood'], 'lluvias_extremas');
  });

  it('heat_stress → calor_extremo (GRI)', () => {
    assert.equal(SIGNAL_TO_CONSOLIDATED['heat_stress'], 'calor_extremo');
  });

  it('water_stress → sequia', () => {
    assert.equal(SIGNAL_TO_CONSOLIDATED['water_stress'], 'sequia');
  });

  it('landslide → deslizamiento', () => {
    assert.equal(SIGNAL_TO_CONSOLIDATED['landslide'], 'deslizamiento');
  });
});

describe('normalizeRisks — deduplication (one phenomenon = one card)', () => {
  it('produces one entry when same risk comes from signals + GRI', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'extreme_rain', horizon: 'mid_term', confidence: 'high', projected: 78, unit: 'mm/día' },
      ],
      risks: [],
      gri_hazards: [
        { hazard: 'flood', baseline: { score: 'alto', probability: 0.67 } },
      ],
      adaptations: [],
    };

    const result = normalizeRisks(apiResponse);
    const rainEntries = result.filter(r => r.riskType === 'lluvias_extremas');
    assert.equal(rainEntries.length, 1, 'Should consolidate extreme_rain + flood into one entry');
  });

  it('merges GRI evidence into the existing signal entry', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'extreme_rain', horizon: 'mid_term', confidence: 'high', projected: 78, unit: 'mm' },
      ],
      risks: [],
      gri_hazards: [
        { hazard: 'flood', baseline: { score: 'alto' } },
      ],
      adaptations: [],
    };

    const result = normalizeRisks(apiResponse);
    const entry = result.find(r => r.riskType === 'lluvias_extremas');
    assert.ok(entry, 'Entry for lluvias_extremas must exist');
    assert.ok(entry.rawSources.includes('signals'), 'rawSources must include signals');
    assert.ok(entry.rawSources.includes('gri'), 'rawSources must include gri');
    assert.equal(entry.rawSources.length, 2, 'Must not duplicate rawSources');
  });

  it('uses deterministic id = riskType_period', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'drought', horizon: 'long_term', confidence: 'medium' },
      ],
      risks: [], gri_hazards: [], adaptations: [],
    };
    const result = normalizeRisks(apiResponse);
    assert.equal(result[0].id, 'sequia_largo_plazo');
  });

  it('does not create duplicate entries for same risk from risks[]', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'extreme_heat', horizon: 'mid_term', confidence: 'high', projected: 42 },
      ],
      risks: [
        { signal: { signalType: 'extreme_heat' }, operational_impacts: ['Reducción de productividad'] },
        { signal: { signalType: 'extreme_heat' }, operational_impacts: ['Daño a equipos'] },
      ],
      gri_hazards: [],
      adaptations: [],
    };

    const result = normalizeRisks(apiResponse);
    const heatEntries = result.filter(r => r.riskType === 'calor_extremo');
    assert.equal(heatEntries.length, 1, 'Must not create duplicate entries from risks[]');
    assert.equal(heatEntries[0].impacts.length, 2, 'Impacts from both risks[] entries must be merged');
  });

  it('separates same risk type for different periods', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'extreme_rain', horizon: 'mid_term',  confidence: 'high' },
        { signal_type: 'extreme_rain', horizon: 'long_term', confidence: 'medium' },
      ],
      risks: [], gri_hazards: [], adaptations: [],
    };

    const result = normalizeRisks(apiResponse);
    const rainEntries = result.filter(r => r.riskType === 'lluvias_extremas');
    assert.equal(rainEntries.length, 2, 'Mid-term and long-term must be separate entries');
    const periods = rainEntries.map(r => r.period).sort();
    assert.deepEqual(periods, ['largo_plazo', 'mediano_plazo']);
  });
});

describe('normalizeRisks — camelCase compatibility', () => {
  it('handles signalType (camelCase) from API', () => {
    const apiResponse = {
      signals: [{ signalType: 'extreme_heat', horizon: 'mid_term', confidence: 'high' }],
      risks: [], gri_hazards: [], adaptations: [],
    };
    const result = normalizeRisks(apiResponse);
    assert.equal(result.length, 1);
    assert.equal(result[0].riskType, 'calor_extremo');
  });

  it('handles nested signals object { signals: [...] }', () => {
    const apiResponse = {
      signals: { signals: [
        { signal_type: 'drought', horizon: 'long_term', confidence: 'low' },
      ]},
      risks: [], gri_hazards: [], adaptations: [],
    };
    const result = normalizeRisks(apiResponse);
    assert.equal(result.length, 1);
    assert.equal(result[0].riskType, 'sequia');
  });
});

describe('normalizeRisks — risk text detection', () => {
  it('detects risk type from Spanish free-text title', () => {
    const apiResponse = {
      signals: [],
      risks: [{ title: 'Riesgo de inundación por lluvias intensas', operational_impacts: ['Impacto en almacenes'] }],
      gri_hazards: [],
      adaptations: [],
    };
    // risks[] without a matching signal entry don't create new entries
    // (by design — they only enrich). So result should be empty.
    const result = normalizeRisks(apiResponse);
    assert.equal(result.length, 0, 'risks[] alone must not create new ConsolidatedRisk entries');
  });
});

describe('normalizeRisks — edge cases', () => {
  it('returns empty array for null input', () => {
    assert.deepEqual(normalizeRisks(null), []);
  });

  it('returns empty array for empty object', () => {
    assert.deepEqual(normalizeRisks({}), []);
  });

  it('returns empty array when all signal types are unknown', () => {
    const apiResponse = {
      signals: [{ signal_type: 'unknown_signal_xyz', horizon: 'mid_term', confidence: 'high' }],
      risks: [], gri_hazards: [], adaptations: [],
    };
    assert.deepEqual(normalizeRisks(apiResponse), []);
  });

  it('multiple diverse risks produce multiple entries', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'extreme_rain',  horizon: 'mid_term',  confidence: 'high'   },
        { signal_type: 'extreme_heat',  horizon: 'mid_term',  confidence: 'high'   },
        { signal_type: 'drought',       horizon: 'long_term', confidence: 'medium' },
        { signal_type: 'enso_phase',    horizon: 'historical',confidence: 'high'   },
      ],
      risks: [], gri_hazards: [], adaptations: [],
    };
    const result = normalizeRisks(apiResponse);
    assert.equal(result.length, 4);
    const slugs = result.map(r => r.riskType).sort();
    assert.deepEqual(slugs, ['calor_extremo', 'fenomeno_enso', 'lluvias_extremas', 'sequia']);
  });
});

describe('normalizeRisks — temporal period mapping', () => {
  const cases = [
    ['historical',    'historico'],
    ['short_term',    'corto_plazo'],
    ['mid_term',      'mediano_plazo'],
    ['long_term',     'largo_plazo'],
    ['historico',     'historico'],
    ['mediano_plazo', 'mediano_plazo'],
    [null,            'mediano_plazo'],   // fallback
    ['unknown_hz',    'mediano_plazo'],   // fallback
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      assert.equal(toTemporalPeriod(input), expected);
    });
  }
});

describe('normalizeRisks — scenario mapping', () => {
  const cases = [
    ['SSP2-4.5', 'emisiones_moderadas'],
    ['SSP5-8.5', 'altas_emisiones'],
    ['ssp245',   'emisiones_moderadas'],
    ['ssp585',   'altas_emisiones'],
    ['SSP1-2.6', 'bajas_emisiones'],
    ['ssp126',   'bajas_emisiones'],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      assert.equal(SCENARIO_SLUG_MAP[input], expected);
    });
  }
});

// ─── buildExecutiveSummary (inline mirror) ────────────────────────────────────

// Mirrors the updated normalizeRisks.ts buildExecutiveSummary (Sprint 18):
// deduplicates by riskType, no raw metrics in the summary.
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

  const adaptCount = risks.flatMap(r => r.adaptationMeasures || []).length;
  const adaptSentence =
    adaptCount > 0 ? ` Se identificaron ${adaptCount} medidas de adaptación prioritarias.` : '';

  return (
    `Para ${locationLabel}, el análisis identifica ${riskList} como los principales` +
    ` riesgos para las operaciones de ${sectorLabel}.` +
    adaptSentence
  );
}

const makeRisk = (overrides) => ({
  id: 'lluvias_extremas_mediano_plazo',
  riskType: 'lluvias_extremas',
  displayName: 'Lluvias extremas',
  period: 'mediano_plazo',
  scenario: 'emisiones_moderadas',
  confidence: 'alta',
  narrativeText: '',
  keyMetric: null,
  impacts: [],
  evidence: [],
  adaptationMeasures: [],
  rawSources: ['signals'],
  ...overrides,
});

describe('buildExecutiveSummary — no-risk scenarios', () => {
  it('returns no-risk message for empty array', () => {
    const s = buildExecutiveSummary([], 'Lima', 'Retail');
    assert.ok(s.includes('no identificó riesgos'));
    assert.ok(s.includes('Lima'));
  });

  it('returns no-risk message when all risks are baja confidence', () => {
    const s = buildExecutiveSummary([makeRisk({ confidence: 'baja' })], 'Lima', 'Retail');
    assert.ok(s.includes('no identificó riesgos'));
  });
});

describe('buildExecutiveSummary — normal scenarios', () => {
  it('mentions location and sector', () => {
    const s = buildExecutiveSummary([makeRisk()], 'Arequipa, Perú', 'Agroindustria');
    assert.ok(s.includes('Arequipa, Perú'));
    assert.ok(s.includes('Agroindustria'));
  });

  it('names a single risk without list formatting', () => {
    const s = buildExecutiveSummary([makeRisk({ displayName: 'Sequía' })], 'Lima', 'Retail');
    assert.ok(s.includes('sequía'));
    assert.ok(!s.includes(' y '));
  });

  it('joins two risks with " y "', () => {
    const risks = [
      makeRisk({ id: 'r1', riskType: 'lluvias_extremas', displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r2', riskType: 'calor_extremo',    displayName: 'Calor extremo', period: 'largo_plazo' }),
    ];
    const s = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(s.includes('lluvias extremas y calor extremo'));
  });

  it('caps risk list at 3 — 4th risk is excluded', () => {
    const risks = [
      makeRisk({ id: 'r1', displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r2', displayName: 'Calor extremo',   period: 'largo_plazo' }),
      makeRisk({ id: 'r3', displayName: 'Sequía',          period: 'historico' }),
      makeRisk({ id: 'r4', displayName: 'Deslizamiento',   period: 'corto_plazo' }),
    ];
    const s = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(!s.includes('deslizamiento'));
  });

  it('does NOT expose raw keyMetric in the summary', () => {
    const s = buildExecutiveSummary(
      [makeRisk({ keyMetric: '78 mm/día', period: 'mediano_plazo' })],
      'Lima', 'Retail'
    );
    assert.ok(!s.includes('78 mm/día'), 'raw metric must not appear in executive summary');
    assert.ok(s.includes('Lima'), 'location must still appear');
    assert.ok(s.includes('Retail'), 'sector must still appear');
  });

  it('deduplicates same riskType across different periods', () => {
    const risks = [
      makeRisk({ id: 'r1', riskType: 'lluvias_extremas', period: 'mediano_plazo', displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r2', riskType: 'lluvias_extremas', period: 'largo_plazo',   displayName: 'Lluvias extremas' }),
      makeRisk({ id: 'r3', riskType: 'sequia',           period: 'mediano_plazo', displayName: 'Sequía'           }),
    ];
    const s = buildExecutiveSummary(risks, 'Lima', 'Retail');
    const count = (s.match(/lluvias extremas/g) ?? []).length;
    assert.equal(count, 1, 'mismo riskType no debe duplicarse: "lluvias extremas, lluvias extremas y sequía"');
  });

  it('includes adaptation count when adaptationMeasures present', () => {
    const risks = [
      makeRisk({
        adaptationMeasures: [
          { id: 'a1', name: 'Drenaje', timeframe: 'mediano', effectiveness: 'alta' },
          { id: 'a2', name: 'Alerta',  timeframe: 'corto',   effectiveness: 'alta' },
        ],
      }),
    ];
    const s = buildExecutiveSummary(risks, 'Lima', 'Retail');
    assert.ok(s.includes('2 medidas de adaptación'));
  });
});

// ─── Sprint 19: scenarioVariants — inline mirrors ────────────────────────────

const MID_TERM_PROJECTION = {
  lluvias_extremas: 'lluvias más intensas y frecuentes',
  calor_extremo:    'temperaturas más extremas',
  sequia:           'períodos de sequía más extensos y severos',
  deslizamiento:    'mayor susceptibilidad a movimientos de terreno',
  heladas:          'episodios de heladas más intensos',
  fenomeno_enso:    'mayor variabilidad climática interanual',
  inundacion:       'mayor riesgo de desborde e inundaciones',
};

const MID_TERM_PROJECTION_HIGH = {
  lluvias_extremas: 'lluvias significativamente más intensas, con mayor frecuencia de eventos extremos',
  calor_extremo:    'temperaturas extremas con mayor frecuencia e intensidad sostenida',
  sequia:           'períodos de sequía más prolongados y severos, con escasez hídrica crítica',
};

const LONG_TERM_PROJECTION = {
  lluvias_extremas: 'un régimen de lluvias más intenso y variable',
  calor_extremo:    'condiciones de calor extremo más frecuentes e intensas',
  sequia:           'mayor escasez hídrica',
};

const LONG_TERM_PROJECTION_HIGH = {
  lluvias_extremas: 'un régimen de lluvias substancialmente más intenso, variable y disruptivo',
  calor_extremo:    'condiciones de calor extremo persistentes que impactarán gravemente la operación y el personal',
};

const HIGH_EMISSION_EXTRA_IMPACTS = {
  lluvias_extremas: ['daños estructurales más frecuentes y costosos', 'interrupciones logísticas prolongadas'],
  calor_extremo:    ['mayor riesgo de estrés térmico en personal expuesto', 'aumento significativo del consumo energético'],
  sequia:           ['restricciones hídricas severas con impacto en procesos productivos'],
};

const TEMPORAL_EVOLUTION = {
  lluvias_extremas: 'Las lluvias intensas ya se observan históricamente en esta zona, y podrían incrementarse en frecuencia e intensidad hacia mediados de siglo, con mayor severidad a largo plazo bajo altas emisiones.',
  calor_extremo:    'El calor extremo es un fenómeno ya registrado históricamente, con proyecciones de aumento significativo en frecuencia e intensidad durante las próximas décadas.',
  sequia:           'La sequía tiene antecedentes históricos en esta área, con mayor riesgo de déficit hídrico proyectado hacia 2050 y condiciones más severas a largo plazo.',
};

function buildScenarioNarrativeText(riskType, period, scenario) {
  if (period === 'historico') return '';
  if (period === 'mediano_plazo') {
    const phrase = scenario === 'altas_emisiones'
      ? MID_TERM_PROJECTION_HIGH[riskType]
      : MID_TERM_PROJECTION[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo altas emisiones, hacia mediados de siglo esta zona podría experimentar'
      : 'Hacia mediados de siglo, bajo emisiones moderadas, esta zona podría experimentar';
    return `${lead} ${phrase ?? riskType}.`;
  }
  if (period === 'largo_plazo') {
    const phrase = scenario === 'altas_emisiones'
      ? LONG_TERM_PROJECTION_HIGH[riskType]
      : LONG_TERM_PROJECTION[riskType];
    const lead = scenario === 'altas_emisiones'
      ? 'Bajo un escenario de altas emisiones a largo plazo, se proyecta'
      : 'A largo plazo, bajo emisiones moderadas, se proyecta';
    return `${lead} ${phrase ?? riskType}, con afectación sobre la infraestructura y las operaciones.`;
  }
  return '';
}

function buildScenarioVariants(riskType, period, baseImpacts) {
  if (period === 'historico') return {};
  const moderate = {
    narrativeText: buildScenarioNarrativeText(riskType, period, 'emisiones_moderadas'),
    impacts: baseImpacts.slice(),
    confidence: 'media',
  };
  const highExtra = HIGH_EMISSION_EXTRA_IMPACTS[riskType] ?? [];
  const allHigh = [...baseImpacts, ...highExtra].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  const high = {
    narrativeText: buildScenarioNarrativeText(riskType, period, 'altas_emisiones'),
    impacts: allHigh,
    confidence: 'alta',
  };
  return { emisiones_moderadas: moderate, altas_emisiones: high };
}

function buildTemporalEvolutionSentence(riskType) {
  return TEMPORAL_EVOLUTION[riskType] ?? 'Este fenómeno presenta variaciones proyectadas a lo largo de los horizontes temporales analizados.';
}

describe('buildScenarioVariants — Sprint 19', () => {
  it('returns empty object for historico period', () => {
    const variants = buildScenarioVariants('lluvias_extremas', 'historico', []);
    assert.deepEqual(variants, {});
  });

  it('produces two scenario keys for mediano_plazo', () => {
    const variants = buildScenarioVariants('lluvias_extremas', 'mediano_plazo', []);
    assert.ok('emisiones_moderadas' in variants, 'must have emisiones_moderadas key');
    assert.ok('altas_emisiones' in variants, 'must have altas_emisiones key');
  });

  it('produces two scenario keys for largo_plazo', () => {
    const variants = buildScenarioVariants('calor_extremo', 'largo_plazo', []);
    assert.ok('emisiones_moderadas' in variants);
    assert.ok('altas_emisiones' in variants);
  });

  it('moderate and high narratives differ from each other', () => {
    const variants = buildScenarioVariants('lluvias_extremas', 'mediano_plazo', []);
    assert.notEqual(
      variants.emisiones_moderadas.narrativeText,
      variants.altas_emisiones.narrativeText,
      'Scenario narratives must differ'
    );
  });

  it('altas_emisiones has more impacts than emisiones_moderadas when extras exist', () => {
    const base = ['Impacto operativo base'];
    const variants = buildScenarioVariants('lluvias_extremas', 'mediano_plazo', base);
    assert.ok(
      variants.altas_emisiones.impacts.length >= variants.emisiones_moderadas.impacts.length,
      'High emissions must have same or more impacts'
    );
  });

  it('altas_emisiones confidence is alta', () => {
    const variants = buildScenarioVariants('sequia', 'mediano_plazo', []);
    assert.equal(variants.altas_emisiones.confidence, 'alta');
  });

  it('emisiones_moderadas confidence is media', () => {
    const variants = buildScenarioVariants('sequia', 'mediano_plazo', []);
    assert.equal(variants.emisiones_moderadas.confidence, 'media');
  });

  it('altas_emisiones narrative contains "altas emisiones"', () => {
    const variants = buildScenarioVariants('calor_extremo', 'mediano_plazo', []);
    assert.ok(
      variants.altas_emisiones.narrativeText.toLowerCase().includes('altas emisiones'),
      'high-emissions narrative must mention "altas emisiones"'
    );
  });

  it('emisiones_moderadas narrative contains "moderadas"', () => {
    const variants = buildScenarioVariants('calor_extremo', 'largo_plazo', []);
    assert.ok(
      variants.emisiones_moderadas.narrativeText.toLowerCase().includes('moderadas'),
      'moderate narrative must mention "moderadas"'
    );
  });

  it('base impacts are preserved in both variants', () => {
    const base = ['acceso vial comprometido', 'daño estructural'];
    const variants = buildScenarioVariants('deslizamiento', 'mediano_plazo', base);
    for (const impact of base) {
      assert.ok(variants.emisiones_moderadas.impacts.includes(impact), `Moderate must include: ${impact}`);
      assert.ok(variants.altas_emisiones.impacts.includes(impact), `High must include: ${impact}`);
    }
  });

  it('no duplicate impacts in altas_emisiones', () => {
    const base = ['acceso vial comprometido'];
    const variants = buildScenarioVariants('lluvias_extremas', 'mediano_plazo', base);
    const impacts = variants.altas_emisiones.impacts;
    const uniqueImpacts = new Set(impacts);
    assert.equal(impacts.length, uniqueImpacts.size, 'No duplicate impacts in high-emissions variant');
  });
});

describe('buildTemporalEvolutionSentence — Sprint 19', () => {
  it('returns a non-empty string for known risk types', () => {
    const types = ['lluvias_extremas', 'calor_extremo', 'sequia', 'deslizamiento', 'heladas', 'fenomeno_enso', 'inundacion'];
    for (const rt of types) {
      const s = buildTemporalEvolutionSentence(rt);
      assert.ok(s.length > 20, `Empty or too short evolution sentence for ${rt}`);
    }
  });

  it('returns fallback for unknown risk type', () => {
    const s = buildTemporalEvolutionSentence('unknown_risk_xyz');
    assert.ok(s.includes('fenómeno'));
  });

  it('lluvias sentence mentions historical observation and future projection', () => {
    const s = buildTemporalEvolutionSentence('lluvias_extremas');
    assert.ok(s.toLowerCase().includes('históricamente') || s.toLowerCase().includes('históricament'));
    assert.ok(s.toLowerCase().includes('2050') || s.toLowerCase().includes('siglo') || s.toLowerCase().includes('largo'));
  });

  it('does not contain IPCC codes', () => {
    const types = ['lluvias_extremas', 'calor_extremo', 'sequia'];
    const BANNED = ['SSP', 'CMIP6', 'ssp245', 'ssp585', 'rx1day', 'anomalía'];
    for (const rt of types) {
      const s = buildTemporalEvolutionSentence(rt);
      for (const term of BANNED) {
        assert.ok(!s.includes(term), `"${term}" found in evolution sentence for ${rt}`);
      }
    }
  });
});

describe('normalizeRisks — no-duplicate validation (regression)', () => {
  it('never creates two entries with the same id', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'extreme_heat', horizon: 'mid_term', confidence: 'high'   },
        { signal_type: 'severe_heat',  horizon: 'mid_term', confidence: 'medium' },
      ],
      risks: [
        { signal: { signalType: 'extreme_heat' }, operational_impacts: ['Impacto A'] },
      ],
      gri_hazards: [
        { hazard: 'heat', baseline: {} },
      ],
      adaptations: [],
    };
    const result = normalizeRisks(apiResponse);
    const ids = result.map(r => r.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, 'Duplicate ids detected');
  });

  it('never shows raw signal codes in displayName (no technical labels)', () => {
    const apiResponse = {
      signals: [
        { signal_type: 'extreme_heat', horizon: 'mid_term', confidence: 'high' },
        { signal_type: 'extreme_rain', horizon: 'mid_term', confidence: 'high' },
      ],
      risks: [], gri_hazards: [], adaptations: [],
    };
    const result = normalizeRisks(apiResponse);
    const TECHNICAL_CODES = ['extreme_heat', 'extreme_rain', 'CMIP6', 'ssp245', 'SSP'];
    for (const entry of result) {
      for (const code of TECHNICAL_CODES) {
        assert.ok(
          !entry.displayName.includes(code),
          `Technical code "${code}" leaked into displayName: "${entry.displayName}"`
        );
      }
    }
  });
});
