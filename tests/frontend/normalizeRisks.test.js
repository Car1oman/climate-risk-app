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
