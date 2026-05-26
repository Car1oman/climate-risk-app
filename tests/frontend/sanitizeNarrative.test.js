/**
 * Unit tests — sanitizeNarrative (Sprint 21).
 *
 * Validates that all Layer9 technical terms are replaced with executive
 * operational language before reaching the UI.
 *
 * Pure JS mirror of src/domain/sanitizeNarrative.ts — no TypeScript,
 * no import.meta.env, runnable with: node --test tests/frontend/sanitizeNarrative.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline mirror of NARRATIVE_REPLACEMENTS ──────────────────────────────────
// Must be kept in sync with src/domain/sanitizeNarrative.ts

const NARRATIVE_REPLACEMENTS = [
  // SSP scenario codes
  [/SSP\s*2[-–]4\.5/gi,                    'escenario de emisiones moderadas'],
  [/SSP\s*5[-–]8\.5/gi,                    'escenario de altas emisiones'],
  [/SSP\s*1[-–]2\.6/gi,                    'escenario de bajas emisiones'],
  [/\bssp\s*245\b/gi,                       'emisiones moderadas'],
  [/\bssp\s*585\b/gi,                       'altas emisiones'],
  [/\bssp\s*126\b/gi,                       'bajas emisiones'],
  [/bajo\s+SSP\s*2[-–]4\.5/gi,             'bajo emisiones moderadas'],
  [/bajo\s+SSP\s*5[-–]8\.5/gi,             'bajo altas emisiones'],

  // Dataset / model references
  [/CMIP6\s+ensemble\s+spread/gi,           ''],
  [/CMIP6\s+ensemble/gi,                    ''],
  [/\bCMIP6\b/gi,                           ''],
  [/\bensemble\s+spread\b/gi,               ''],
  [/\bensemble\b/gi,                        ''],
  [/\bGCM\b/gi,                             ''],
  [/modelos?\s+climáticos?\s+globales?/gi,  ''],

  // Precipitation variables
  [/\bRx5day\b/gi,                          'lluvias intensas persistentes'],
  [/\bRx1day\b/gi,                          'precipitaciones extremas diarias'],
  [/\brx5day\b/gi,                          'lluvias intensas persistentes'],
  [/\brx1day\b/gi,                          'precipitaciones extremas diarias'],
  [/\bprecipitación\s+máxima\s+en\s+5\s+días\b/gi, 'lluvias intensas persistentes'],
  [/\bprecipitación\s+máxima\s+diaria\b/gi, 'precipitación extrema'],

  // Temperature variables
  [/\bTmax\s*[>≥]\s*\d+\s*°?C\b/gi,        'episodios de calor extremo'],
  [/\bTmax\s*[>≥]\s*\d+\b/gi,              'episodios de calor extremo'],
  [/\bTmax\b/gi,                            'temperatura máxima'],
  [/\btasmax\b/gi,                          'temperatura máxima'],
  [/\btasmin\b/gi,                          'temperatura mínima'],
  [/\btas\b/gi,                             'temperatura media'],
  [/\bhd\d{2}\b/gi,                         'días de calor extremo'],
  [/\bhd35\b/gi,                            'días de calor extremo'],
  [/\bhd40\b/gi,                            'días de calor muy extremo'],

  // Drought / hydric variables
  [/\bSPEI[-\s]?\d*\b/gi,                   'índice de estrés hídrico'],
  [/\bSPI[-\s]?\d*\b/gi,                    'indicador de sequía'],
  [/\bPDSI\b/gi,                            'indicador de sequía'],

  // ENSO codes
  [/\bONI\b/g,                              'índice El Niño/La Niña'],
  [/\bENSO\b/gi,                            'Fenómeno El Niño / La Niña'],

  // Statistical / baseline references
  [/baseline\s+\d{4}[–-]\d{4}/gi,          ''],
  [/\d{4}[–-]\d{4}\s+baseline/gi,          ''],
  [/\bbaseline\s+\d{4}\b/gi,               ''],   // single-year form
  [/\bbaseline\b/gi,                        ''],   // any remaining standalone baseline
  [/per[íi]odo\s+de\s+referencia\s+\d{4}[–-]\d{4}/gi, 'período histórico de referencia'],
  [/percentil\s+\d+/gi,                     'nivel de referencia'],
  [/percentile\s+\d+/gi,                    'reference threshold'],
  [/p\d{2}\s+percentile/gi,                 'reference threshold'],
  [/\bpercentil\b/gi,                       'nivel de referencia'],
  [/\bpercentile\b/gi,                      'reference threshold'],

  // Uncertainty / confidence language
  [/confidence\s+interval/gi,               'margen de incertidumbre'],
  [/intervalo\s+de\s+confianza/gi,          'margen de incertidumbre'],
  [/spread\s+de?\s+incertidumbre/gi,        'nivel de incertidumbre'],

  // Anomaly language
  [/anomal[íi]a\s+de\s+temperatura/gi,      'incremento de temperatura'],
  [/anomal[íi]a\s+de\s+precipitaci[oó]n/gi, 'variación en precipitación'],
  [/anomal[íi]a\s+t[eé]rmica/gi,            'variación de temperatura'],
  [/\banomal[íi]a\b/gi,                     'variación proyectada'],
  [/\banomal[íi]as\b/gi,                    'variaciones proyectadas'],
  [/\banomaly\b/gi,                         'projected change'],

  // Raw numeric values with climate units
  [/\d+\.?\d*\s*mm\/d[íi]a/gi,             ''],
  [/\d+\.?\d*\s*mm\/día/gi,                ''],
  [/\d+\.?\d*°C\s+de\s+(incremento|aumento|elevación|anomal[íi]a)/gi, 'incremento de temperatura'],
];

const BANNED_TERMS = [
  'SSP2-4.5', 'SSP5-8.5', 'SSP1-2.6',
  'ssp245', 'ssp585', 'ssp126',
  'CMIP6', 'ensemble spread', 'ensemble',
  'Rx5day', 'Rx1day', 'rx5day', 'rx1day',
  'Tmax', 'tasmax', 'tasmin',
  'SPEI', 'PDSI',
  'hd35', 'hd40',
  'percentil', 'percentile',
  'anomalía', 'anomalias', 'anomaly',
  'ONI', 'ENSO',
  'baseline 1981', 'baseline 1980',
  'confidence interval', 'intervalo de confianza',
];

function sanitizeScientificTerms(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const [pattern, replacement] of NARRATIVE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/,\s*,/g, ',')
    .trim();
  return result;
}

function buildExecutiveNarrative(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  const sanitized = sanitizeScientificTerms(rawText);
  if (sanitized.length < 10) return '';
  return sanitized;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sanitizeScientificTerms — SSP scenario codes', () => {
  it('replaces SSP2-4.5 with escenario de emisiones moderadas', () => {
    const result = sanitizeScientificTerms('Bajo SSP2-4.5 se proyecta un incremento.');
    assert.ok(!result.includes('SSP2-4.5'), 'SSP2-4.5 must be removed');
    assert.ok(result.toLowerCase().includes('moderadas'), 'must contain "moderadas"');
  });

  it('replaces SSP5-8.5 with escenario de altas emisiones', () => {
    const result = sanitizeScientificTerms('Bajo SSP5-8.5 las temperaturas aumentan.');
    assert.ok(!result.includes('SSP5-8.5'), 'SSP5-8.5 must be removed');
    assert.ok(result.toLowerCase().includes('altas emisiones'), 'must contain "altas emisiones"');
  });

  it('replaces ssp245 (lowercase) with emisiones moderadas', () => {
    const result = sanitizeScientificTerms('El escenario ssp245 muestra mejoras.');
    assert.ok(!result.includes('ssp245'), 'ssp245 must be removed');
    assert.ok(result.toLowerCase().includes('moderadas'), 'must mention "moderadas"');
  });

  it('replaces ssp585 (lowercase) with altas emisiones', () => {
    const result = sanitizeScientificTerms('En ssp585 el riesgo aumenta.');
    assert.ok(!result.includes('ssp585'), 'ssp585 must be removed');
    assert.ok(result.toLowerCase().includes('altas emisiones'), 'must mention "altas emisiones"');
  });

  it('replaces SSP1-2.6 with escenario de bajas emisiones', () => {
    const result = sanitizeScientificTerms('SSP1-2.6 representa la trayectoria más optimista.');
    assert.ok(!result.includes('SSP1-2.6'), 'SSP1-2.6 must be removed');
    assert.ok(result.toLowerCase().includes('bajas emisiones'), 'must contain "bajas emisiones"');
  });
});

describe('sanitizeScientificTerms — CMIP6 / ensemble references', () => {
  it('removes CMIP6 ensemble spread', () => {
    const result = sanitizeScientificTerms('El CMIP6 ensemble spread indica incertidumbre alta.');
    assert.ok(!result.includes('CMIP6'), 'CMIP6 must be removed');
    assert.ok(!result.includes('ensemble spread'), 'ensemble spread must be removed');
  });

  it('removes standalone CMIP6', () => {
    const result = sanitizeScientificTerms('Los modelos CMIP6 proyectan un aumento.');
    assert.ok(!result.includes('CMIP6'), 'CMIP6 must be removed');
  });

  it('removes standalone ensemble', () => {
    const result = sanitizeScientificTerms('El ensemble de modelos muestra variabilidad.');
    assert.ok(!result.includes('ensemble'), 'ensemble must be removed');
  });
});

describe('sanitizeScientificTerms — precipitation variables', () => {
  it('replaces Rx5day with lluvias intensas persistentes', () => {
    const result = sanitizeScientificTerms('El índice Rx5day supera el umbral histórico.');
    assert.ok(!result.includes('Rx5day'), 'Rx5day must be removed');
    assert.ok(result.includes('lluvias intensas persistentes'), 'must include replacement');
  });

  it('replaces Rx1day with precipitaciones extremas diarias', () => {
    const result = sanitizeScientificTerms('El Rx1day muestra un incremento.');
    assert.ok(!result.includes('Rx1day'), 'Rx1day must be removed');
    assert.ok(result.includes('precipitaciones extremas diarias'), 'must include replacement');
  });

  it('replaces precipitación máxima diaria (Spanish long form)', () => {
    const result = sanitizeScientificTerms('La precipitación máxima diaria aumenta un 15%.');
    assert.ok(
      !result.includes('precipitación máxima diaria') || result.includes('precipitación extrema'),
      'long-form must be simplified'
    );
  });

  it('removes raw mm/día values', () => {
    const result = sanitizeScientificTerms('Se proyectan 78.3 mm/día bajo SSP5-8.5.');
    assert.ok(!result.match(/\d+\.?\d*\s*mm\/d/), 'raw mm/día values must be removed');
  });
});

describe('sanitizeScientificTerms — temperature variables', () => {
  it('replaces Tmax > 35°C with episodios de calor extremo', () => {
    const result = sanitizeScientificTerms('Los días con Tmax > 35°C aumentarán.');
    assert.ok(!result.includes('Tmax'), 'Tmax must be removed');
    assert.ok(result.includes('episodios de calor extremo'), 'must include replacement');
  });

  it('replaces Tmax without threshold with temperatura máxima', () => {
    const result = sanitizeScientificTerms('La variable Tmax presenta anomalías.');
    assert.ok(!result.includes('Tmax'), 'Tmax must be removed');
  });

  it('replaces tasmax with temperatura máxima', () => {
    const result = sanitizeScientificTerms('tasmax proyectado para 2050.');
    assert.ok(!result.includes('tasmax'), 'tasmax must be removed');
  });

  it('replaces hd35 with días de calor extremo', () => {
    const result = sanitizeScientificTerms('El indicador hd35 supera la media histórica.');
    assert.ok(!result.includes('hd35'), 'hd35 must be removed');
    assert.ok(result.includes('días de calor extremo'), 'must include replacement');
  });
});

describe('sanitizeScientificTerms — drought / hydric variables', () => {
  it('replaces SPEI with índice de estrés hídrico', () => {
    const result = sanitizeScientificTerms('El SPEI-12 indica condiciones de sequía severa.');
    assert.ok(!result.includes('SPEI'), 'SPEI must be removed');
    assert.ok(result.includes('índice de estrés hídrico'), 'must include replacement');
  });

  it('replaces PDSI with indicador de sequía', () => {
    const result = sanitizeScientificTerms('Valores de PDSI negativos.');
    assert.ok(!result.includes('PDSI'), 'PDSI must be removed');
  });
});

describe('sanitizeScientificTerms — ENSO codes', () => {
  it('replaces ONI with índice El Niño/La Niña', () => {
    const result = sanitizeScientificTerms('El ONI supera +0.5 en el trimestre.');
    assert.ok(!result.includes('ONI'), 'ONI must be removed');
    assert.ok(result.includes('El Niño'), 'must include El Niño reference');
  });

  it('replaces ENSO with Fenómeno El Niño / La Niña', () => {
    const result = sanitizeScientificTerms('La fase ENSO actual es neutra.');
    assert.ok(!result.includes('ENSO'), 'ENSO must be removed');
    assert.ok(result.includes('El Niño'), 'must include El Niño reference');
  });
});

describe('sanitizeScientificTerms — statistical / baseline terms', () => {
  it('removes baseline YYYY-YYYY references', () => {
    const result = sanitizeScientificTerms('El análisis usa baseline 1981–2014 como referencia.');
    assert.ok(!result.includes('baseline 1981'), 'baseline reference must be removed');
  });

  it('replaces percentil with nivel de referencia', () => {
    const result = sanitizeScientificTerms('Se supera el percentil 95 histórico.');
    assert.ok(!result.includes('percentil'), 'percentil must be removed');
    assert.ok(result.includes('nivel de referencia'), 'must include replacement');
  });

  it('replaces confidence interval with margen de incertidumbre', () => {
    const result = sanitizeScientificTerms('El confidence interval es amplio.');
    assert.ok(!result.includes('confidence interval'), 'confidence interval must be removed');
    assert.ok(result.includes('margen de incertidumbre'), 'must include replacement');
  });

  it('replaces intervalo de confianza with margen de incertidumbre', () => {
    const result = sanitizeScientificTerms('El intervalo de confianza del 90%.');
    assert.ok(!result.includes('intervalo de confianza'), 'must be removed');
    assert.ok(result.includes('margen de incertidumbre'), 'must include replacement');
  });
});

describe('sanitizeScientificTerms — anomaly language', () => {
  it('replaces anomalía de temperatura with incremento de temperatura', () => {
    const result = sanitizeScientificTerms('La anomalía de temperatura es de +1.5°C.');
    assert.ok(!result.includes('anomalía de temperatura'), 'must be replaced');
    assert.ok(result.includes('incremento de temperatura'), 'must include replacement');
  });

  it('replaces standalone anomalía with variación proyectada', () => {
    const result = sanitizeScientificTerms('La anomalía se proyecta positiva.');
    assert.ok(!result.includes('anomalía'), 'anomalía must be replaced');
  });

  it('replaces anomalía de precipitación with variación en precipitación', () => {
    const result = sanitizeScientificTerms('La anomalía de precipitación es significativa.');
    assert.ok(!result.includes('anomalía de precipitación'), 'must be replaced');
    assert.ok(result.includes('variación en precipitación'), 'must include replacement');
  });
});

describe('sanitizeScientificTerms — compound scenarios', () => {
  it('sanitizes a full Layer9 technical narrative completely', () => {
    const raw = 'Bajo SSP2-4.5, el CMIP6 ensemble proyecta un Rx5day de 78.3 mm/día. ' +
                'La anomalía de temperatura supera el percentil 95 del baseline 1981–2014. ' +
                'El SPEI-12 indica sequía severa con hd35 aumentando un 30%.';

    const result = sanitizeScientificTerms(raw);

    // None of the banned terms should remain
    for (const term of ['SSP2-4.5', 'CMIP6', 'ensemble', 'Rx5day', 'anomalía', 'percentil', 'baseline', 'SPEI', 'hd35']) {
      assert.ok(
        !result.includes(term),
        `Banned term "${term}" should not appear in sanitized output`
      );
    }
    // Result should not be empty — the underlying content should survive
    assert.ok(result.length > 10, 'Sanitized text must preserve meaningful content');
  });

  it('sanitizes SSP5-8.5 narrative with Tmax and ensemble spread', () => {
    const raw = 'El escenario SSP5-8.5 con el CMIP6 ensemble spread sugiere que los días Tmax > 40°C aumentarán.';
    const result = sanitizeScientificTerms(raw);
    assert.ok(!result.includes('SSP5-8.5'), 'SSP5-8.5 must go');
    assert.ok(!result.includes('CMIP6'), 'CMIP6 must go');
    assert.ok(!result.includes('ensemble spread'), 'ensemble spread must go');
    assert.ok(!result.includes('Tmax'), 'Tmax must go');
  });
});

describe('sanitizeScientificTerms — text integrity and cleanup', () => {
  it('collapses multiple spaces after empty replacements', () => {
    const raw = 'Proyección CMIP6  ensemble spread  bajo SSP5-8.5.';
    const result = sanitizeScientificTerms(raw);
    assert.ok(!result.match(/\s{2,}/), 'No double spaces should remain');
  });

  it('handles null input safely', () => {
    assert.equal(sanitizeScientificTerms(null), null);
  });

  it('handles empty string safely', () => {
    assert.equal(sanitizeScientificTerms(''), '');
  });

  it('does not modify text without technical terms', () => {
    const clean = 'Esta zona podría experimentar lluvias más intensas hacia mediados de siglo.';
    const result = sanitizeScientificTerms(clean);
    assert.equal(result, clean, 'Clean text must be returned unchanged');
  });

  it('preserves meaningful content after sanitization', () => {
    const raw = 'Bajo SSP2-4.5, esta zona podría experimentar lluvias más intensas.';
    const result = sanitizeScientificTerms(raw);
    assert.ok(result.includes('podría experimentar'), 'operational content must survive');
    assert.ok(result.includes('lluvias más intensas'), 'risk description must survive');
  });
});

describe('buildExecutiveNarrative — Layer9 fallback behavior', () => {
  it('returns empty string for null input', () => {
    assert.equal(buildExecutiveNarrative(null), '');
  });

  it('returns empty string for empty string input', () => {
    assert.equal(buildExecutiveNarrative(''), '');
  });

  it('returns empty string when sanitized result is too short (only codes)', () => {
    // After sanitizing, if nothing meaningful remains (< 10 chars), return ''
    const onlyCodes = 'CMIP6 ensemble';
    const result = buildExecutiveNarrative(onlyCodes);
    assert.ok(result.length < 10, 'Nearly-empty sanitized text must return empty string');
  });

  it('returns sanitized text when meaningful content remains', () => {
    const raw = 'Bajo SSP5-8.5, esta zona podría experimentar lluvias más intensas y frecuentes.';
    const result = buildExecutiveNarrative(raw);
    assert.ok(result.length > 10, 'Meaningful text must be returned');
    assert.ok(!result.includes('SSP5-8.5'), 'SSP code must be removed');
    assert.ok(result.includes('lluvias más intensas'), 'content must survive');
  });

  it('does not modify already-clean narratives', () => {
    const clean = 'Hacia mediados de siglo, bajo altas emisiones, podrían intensificarse las lluvias.';
    const result = buildExecutiveNarrative(clean);
    assert.equal(result, clean, 'Clean narrative must pass through unchanged');
  });
});

describe('sanitizeScientificTerms — banned terms exhaustive check', () => {
  const BANNED = [
    'SSP2-4.5', 'SSP5-8.5', 'SSP1-2.6',
    'CMIP6', 'ensemble spread',
    'Rx5day', 'Rx1day',
    'Tmax', 'tasmax',
    'hd35', 'hd40',
    'SPEI', 'PDSI',
    'ONI', 'ENSO',
    'percentil', 'anomalía',
    'confidence interval', 'intervalo de confianza',
  ];

  for (const term of BANNED) {
    it(`"${term}" is eliminated from a sentence containing it`, () => {
      const raw = `El análisis muestra ${term} en los resultados del período proyectado.`;
      const result = sanitizeScientificTerms(raw);
      assert.ok(
        !result.includes(term),
        `"${term}" should not survive sanitization but found in: "${result}"`
      );
    });
  }
});

describe('groupByRiskType — inline mirror', () => {
  // Minimal mirror of groupByRiskType logic for pure-JS testing
  function makeRisk(overrides) {
    return {
      id: `${overrides.riskType ?? 'lluvias_extremas'}_${overrides.period ?? 'mediano_plazo'}`,
      riskType: 'lluvias_extremas',
      displayName: 'Lluvias extremas',
      period: 'mediano_plazo',
      scenario: 'emisiones_moderadas',
      confidence: 'alta',
      narrativeText: 'Precipitaciones intensas observadas.',
      keyMetric: null,
      impacts: [],
      evidence: [],
      adaptationMeasures: [],
      rawSources: ['signals'],
      scenarioVariants: {},
      ...overrides,
    };
  }

  function groupByRiskType(risks) {
    if (!risks?.length) return [];
    const map = new Map();
    for (const risk of risks) {
      const { riskType } = risk;
      if (!map.has(riskType)) {
        map.set(riskType, {
          riskType,
          displayName: risk.displayName,
          adaptationMeasures: [],
        });
      }
      const timeline = map.get(riskType);
      const existingIds = new Set(timeline.adaptationMeasures.map(a => a.id));
      for (const m of risk.adaptationMeasures) {
        if (!existingIds.has(m.id)) {
          timeline.adaptationMeasures.push(m);
          existingIds.add(m.id);
        }
      }
      if (risk.period === 'historico') {
        timeline.historical = { narrative: risk.narrativeText, impacts: risk.impacts, evidence: risk.evidence, confidence: risk.confidence };
      } else if (risk.period === 'mediano_plazo') {
        const v = risk.scenarioVariants;
        timeline.mediumTerm = {
          moderateEmissions: v?.emisiones_moderadas ? { narrative: v.emisiones_moderadas.narrativeText, impacts: v.emisiones_moderadas.impacts, confidence: v.emisiones_moderadas.confidence, trendDirection: 'increasing' } : undefined,
          highEmissions: v?.altas_emisiones ? { narrative: v.altas_emisiones.narrativeText, impacts: v.altas_emisiones.impacts, confidence: v.altas_emisiones.confidence, trendDirection: 'increasing' } : undefined,
        };
      } else if (risk.period === 'largo_plazo') {
        const v = risk.scenarioVariants;
        timeline.longTerm = {
          moderateEmissions: v?.emisiones_moderadas ? { narrative: v.emisiones_moderadas.narrativeText, impacts: v.emisiones_moderadas.impacts, confidence: v.emisiones_moderadas.confidence, trendDirection: 'increasing' } : undefined,
          highEmissions: v?.altas_emisiones ? { narrative: v.altas_emisiones.narrativeText, impacts: v.altas_emisiones.impacts, confidence: v.altas_emisiones.confidence, trendDirection: 'increasing' } : undefined,
        };
      }
    }
    return [...map.values()];
  }

  it('returns empty array for empty input', () => {
    assert.deepEqual(groupByRiskType([]), []);
  });

  it('returns empty array for null input', () => {
    assert.deepEqual(groupByRiskType(null), []);
  });

  it('produces one timeline per unique riskType', () => {
    const risks = [
      makeRisk({ riskType: 'lluvias_extremas', period: 'historico' }),
      makeRisk({ riskType: 'lluvias_extremas', period: 'mediano_plazo' }),
      makeRisk({ riskType: 'calor_extremo',    period: 'mediano_plazo', displayName: 'Calor extremo' }),
    ];
    const result = groupByRiskType(risks);
    assert.equal(result.length, 2, 'Must produce one timeline per unique riskType');
  });

  it('populates historical field when historico period exists', () => {
    const risks = [makeRisk({ period: 'historico', narrativeText: 'Obs histórica.' })];
    const result = groupByRiskType(risks);
    assert.ok(result[0].historical, 'historical must be populated');
    assert.equal(result[0].historical.narrative, 'Obs histórica.');
  });

  it('populates mediumTerm field when mediano_plazo exists', () => {
    const variants = {
      emisiones_moderadas: { narrativeText: 'Moderado medio.', impacts: [], confidence: 'media' },
      altas_emisiones:     { narrativeText: 'Alto medio.',     impacts: [], confidence: 'alta'  },
    };
    const risks = [makeRisk({ period: 'mediano_plazo', scenarioVariants: variants })];
    const result = groupByRiskType(risks);
    assert.ok(result[0].mediumTerm, 'mediumTerm must be populated');
    assert.ok(result[0].mediumTerm.moderateEmissions, 'moderateEmissions must be set');
    assert.ok(result[0].mediumTerm.highEmissions, 'highEmissions must be set');
  });

  it('populates longTerm field when largo_plazo exists', () => {
    const variants = {
      emisiones_moderadas: { narrativeText: 'Moderado largo.', impacts: [], confidence: 'media' },
      altas_emisiones:     { narrativeText: 'Alto largo.',     impacts: [], confidence: 'alta'  },
    };
    const risks = [makeRisk({ period: 'largo_plazo', scenarioVariants: variants })];
    const result = groupByRiskType(risks);
    assert.ok(result[0].longTerm, 'longTerm must be populated');
  });

  it('moderateEmissions and highEmissions narratives differ in timeline', () => {
    const variants = {
      emisiones_moderadas: { narrativeText: 'Moderado texto.', impacts: [], confidence: 'media' },
      altas_emisiones:     { narrativeText: 'Alto texto diferente.', impacts: [], confidence: 'alta' },
    };
    const risks = [makeRisk({ period: 'mediano_plazo', scenarioVariants: variants })];
    const result = groupByRiskType(risks);
    const medium = result[0].mediumTerm;
    assert.notEqual(
      medium.moderateEmissions.narrative,
      medium.highEmissions.narrative,
      'Scenario narratives must differ in the timeline'
    );
  });

  it('deduplicates adaptation measures across periods', () => {
    const adapt = [{ id: 'a1', name: 'Drenaje', timeframe: 'mediano', effectiveness: 'alta' }];
    const risks = [
      makeRisk({ period: 'mediano_plazo', adaptationMeasures: adapt }),
      makeRisk({ period: 'largo_plazo',   adaptationMeasures: adapt }),
    ];
    const result = groupByRiskType(risks);
    assert.equal(result[0].adaptationMeasures.length, 1, 'Same adaptation must not be duplicated across periods');
  });

  it('timeline with 3 periods covers historical + mediumTerm + longTerm', () => {
    const risks = [
      makeRisk({ period: 'historico',    scenarioVariants: {} }),
      makeRisk({ period: 'mediano_plazo', scenarioVariants: {
        emisiones_moderadas: { narrativeText: 'M.', impacts: [], confidence: 'media' },
      }}),
      makeRisk({ period: 'largo_plazo', scenarioVariants: {
        altas_emisiones: { narrativeText: 'A.', impacts: [], confidence: 'alta' },
      }}),
    ];
    const result = groupByRiskType(risks);
    assert.ok(result[0].historical, 'historical must exist');
    assert.ok(result[0].mediumTerm, 'mediumTerm must exist');
    assert.ok(result[0].longTerm, 'longTerm must exist');
  });
});

describe('sanitizeScientificTerms — no banned terms after sanitization (regression)', () => {
  it('confirms BANNED_TERMS list is comprehensive: all terms are eliminated', () => {
    for (const term of BANNED_TERMS) {
      const sentence = `El análisis utiliza ${term} como indicador de riesgo climático.`;
      const result = sanitizeScientificTerms(sentence);
      assert.ok(
        !result.includes(term),
        `Regression: "${term}" survived sanitization in: "${result}"`
      );
    }
  });
});
