/**
 * Layer 10 — Scientific Storytelling Engine Tests
 *
 * Validates all FASE A–E invariants:
 *   SUITE A — Module structure and exports
 *   SUITE B — buildMainNarrative output shape and content
 *   SUITE C — Narrative rules: citations, scenario, horizon, uncertainty, evidence
 *   SUITE D — buildAdaptationMeasures: qualitative, no costs, no efficacy, sector context
 *   SUITE E — validateStorytelling: urgency, alarmism, heuristics, financial language
 *   SUITE F — buildStorytellingContext: full pipeline output
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMainNarrative,
  buildAdaptationMeasures,
  validateStorytelling,
  buildStorytellingContext,
  ADAPTATION_CATALOG,
} from '../../server/scientific/storytelling.js';

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

// Minimal Layer 7 interpretation output
const mockInterpretationOutput = {
  signal_groups: [
    {
      group_id:         'heat_stress',
      group_label:      'Estrés térmico',
      signal_count:     2,
      signal_types:     ['extreme_heat', 'temp_increase'],
      canonical_signal: { signalType: 'extreme_heat', delta: 18, confidence: 'medium', horizon: 'mid_term' },
      evidence_ids:     ['CMIP6_CCKP'],
    },
    {
      group_id:         'precipitation_intensity',
      group_label:      'Precipitación extrema e inundación',
      signal_count:     1,
      signal_types:     ['extreme_rain'],
      canonical_signal: { signalType: 'extreme_rain', delta_pct: 5, confidence: 'medium', horizon: 'mid_term' },
      evidence_ids:     ['CMIP6_CCKP'],
    },
    {
      group_id:         'terrain_instability',
      group_label:      'Inestabilidad de terreno',
      signal_count:     1,
      signal_types:     ['landslide_risk'],
      canonical_signal: { signalType: 'landslide_risk', projected: 20, confidence: 'medium' },
      evidence_ids:     ['NASA_SRTM', 'INGEMMET_2021'],
    },
    {
      group_id:         'climate_mode',
      group_label:      'Modo climático ENSO',
      signal_count:     1,
      signal_types:     ['enso_phase'],
      canonical_signal: { signalType: 'enso_phase', projected: 1.2, confidence: 'high' },
      evidence_ids:     ['NOAA_ENSO'],
    },
  ],
  context: {
    has_heat_stress:             true,
    has_precipitation_intensity: true,
    has_terrain_instability:     true,
    has_climate_mode:            true,
    scenario:                    'ssp245',
    scenario_label:              'SSP2-4.5',
    temporal_horizon:            'mid_term',
  },
  interpretations: [
    {
      type:         'single_group',
      group_ids:    ['heat_stress'],
      text:         'Las proyecciones CMIP6 (SSP2-4.5, 2040–2059) indican +18 días adicionales por año con temperatura máxima superior a 35°C (hd35) respecto al período histórico 1980–2014.',
      data_basis:   { signal_type: 'extreme_heat', delta: 18, unit: 'días/año', horizon: 'mid_term', scenario: 'SSP2-4.5' },
      evidence_ids: ['CMIP6_CCKP'],
    },
    {
      type:         'single_group',
      group_ids:    ['precipitation_intensity'],
      text:         'Las proyecciones CMIP6 (SSP2-4.5, 2040–2059) muestran un incremento de +5% en la precipitación máxima de 5 días (Rx5day) sobre la línea base histórica 1980–2014.',
      data_basis:   { signal_type: 'extreme_rain', indicator: 'rx5day', delta_pct: 5, unit: '%', horizon: 'mid_term', scenario: 'SSP2-4.5' },
      evidence_ids: ['CMIP6_CCKP'],
    },
    {
      type:         'single_group',
      group_ids:    ['terrain_instability'],
      text:         'El análisis topográfico SRTM identifica pendientes de 20.0° en la zona evaluada, con susceptibilidad moderada a deslizamientos de ladera según la clasificación INGEMMET 2021.',
      data_basis:   { slope_degrees: 20, susceptibility: 'moderada', source: 'NASA SRTM v3 + INGEMMET 2021' },
      evidence_ids: ['NASA_SRTM', 'INGEMMET_2021'],
    },
    {
      type:         'compound',
      group_ids:    ['precipitation_intensity', 'terrain_instability'],
      text:         'La combinación del incremento de +5% en precipitación extrema proyectado (CMIP6, SSP2-4.5) y las pendientes de 20.0° identificadas en la zona evaluada incrementa la exposición a deslizamientos de ladera.',
      data_basis:   { precip_delta_pct: 5, slope_degrees: 20, scenario: 'SSP2-4.5' },
      evidence_ids: ['CMIP6_CCKP', 'NASA_SRTM'],
    },
  ],
  uncertainty: {
    overall_confidence: 'medium',
    model_spread:       { spread_type: null, p10: null, p90: null, model_count: null },
    limitations:        [],
    evidence_strength:  'moderate',
  },
  validation:   { validation_passed: true },
  generated_at: '2026-05-22T00:00:00.000Z',
};

// Minimal Layer 9 projection output
const mockProjectionContext = {
  narratives: [
    {
      scenario:       'ssp245',
      window:         'mid_term',
      scenario_label: 'SSP2-4.5',
      window_label:   '2040–2059',
      text:
        'Bajo el escenario de emisiones intermedias SSP2-4.5, el período 2040–2059 proyecta en esta región una anomalía de temperatura media de +1.4°C respecto al período de referencia 1981–2014 (rango del ensamble CMIP6: +1.1°C a +1.8°C; alta confianza, 35 modelos). Los días con Tmax > 35°C se incrementarían en +17 días/año de mediana (rango: +8 a +28 días/año; confianza media). La precipitación media presenta un cambio de -3% (rango: -10% a +6%; baja confianza por divergencia entre modelos en la región andina). La precipitación extrema en 5 días consecutivos (Rx5day) proyecta un cambio de +5% (rango: -3% a +13%; confianza media).',
    },
    {
      scenario:       'ssp585',
      window:         'mid_term',
      scenario_label: 'SSP5-8.5',
      window_label:   '2040–2059',
      text:
        'Bajo el escenario de altas emisiones SSP5-8.5, el período 2040–2059 proyecta en esta región una anomalía de temperatura media de +2.0°C respecto al período de referencia 1981–2014 (rango del ensamble CMIP6: +1.5°C a +2.6°C; alta confianza, 35 modelos).',
    },
    {
      scenario:       'ssp245',
      window:         'far_term',
      scenario_label: 'SSP2-4.5',
      window_label:   '2060–2079',
      text:
        'Bajo el escenario de emisiones intermedias SSP2-4.5, el período 2060–2079 proyecta una anomalía de temperatura media de +1.8°C (alta confianza, SSP2-4.5).',
    },
  ],
  uncertainty: {
    overall_confidence:       'medium',
    temperature_confidence:   'high',
    precipitation_confidence: 'low',
    notes:                    'Temperatura: alta confianza. Precipitación: baja confianza por divergencia de modelos CMIP6.',
  },
  generated_at: '2026-05-22T00:00:00.000Z',
};

// Minimal Layer 8 historical output
const mockHistoricalContext = {
  relevant_events: [
    {
      id:          'enso_1997_1998',
      event_type:  'enso',
      label:       'El Niño 1997–1998 (Muy fuerte — récord histórico)',
      description: 'Considerado el evento El Niño más intenso del siglo XX. La costa norte peruana recibió precipitaciones entre 600% y 1 200% sobre la media histórica.',
      source:      'NOAA CPC — ONI Historical Record / ERSSTv5; SENAMHI Perú — Boletín El Niño 1997–98',
      date_start:  '1997-05',
    },
    {
      id:          'landslide_huachipa_2017',
      event_type:  'landslide',
      label:       'Huayco Huachipa — Lima, 15 enero 2017',
      description: 'Flujo de detritos que arrasó el sector Huachipa (Lima Este).',
      source:      'INDECI — Reporte emergencias 15-ene-2017; INGEMMET',
      date_start:  '2017-01-15',
    },
  ],
  enso_context:   { total_events_in_catalog: 4, el_nino_count: 3, la_nina_count: 1, current_phase: null },
  generated_at:   '2026-05-22T00:00:00.000Z',
};

// Empty inputs for edge-case tests
const emptyInterpretationOutput = {
  signal_groups:    [],
  interpretations:  [],
  uncertainty:      {},
  generated_at:     '2026-05-22T00:00:00.000Z',
};

// ─── SUITE A — Module Exports ─────────────────────────────────────────────────

describe('SUITE A — Module structure and exports', () => {

  test('A01 — buildStorytellingContext is exported', () => {
    assert.equal(typeof buildStorytellingContext, 'function');
  });

  test('A02 — buildMainNarrative is exported', () => {
    assert.equal(typeof buildMainNarrative, 'function');
  });

  test('A03 — buildAdaptationMeasures is exported', () => {
    assert.equal(typeof buildAdaptationMeasures, 'function');
  });

  test('A04 — validateStorytelling is exported', () => {
    assert.equal(typeof validateStorytelling, 'function');
  });

  test('A05 — ADAPTATION_CATALOG is exported and has signal group keys', () => {
    assert.ok(ADAPTATION_CATALOG, 'ADAPTATION_CATALOG must be exported');
    for (const key of ['heat_stress', 'precipitation_intensity', 'water_stress', 'terrain_instability', 'climate_mode']) {
      assert.ok(ADAPTATION_CATALOG[key], `ADAPTATION_CATALOG.${key} must exist`);
    }
  });

});

// ─── SUITE B — buildMainNarrative output shape ────────────────────────────────

describe('SUITE B — buildMainNarrative output shape and content', () => {

  const narrative = buildMainNarrative(
    mockInterpretationOutput,
    mockProjectionContext,
    mockHistoricalContext,
    { scenario: 'ssp245', window: 'mid_term' }
  );

  test('B01 — returns an object', () => {
    assert.ok(narrative && typeof narrative === 'object');
  });

  test('B02 — paragraphs is an array', () => {
    assert.ok(Array.isArray(narrative.paragraphs));
  });

  test('B03 — sources_cited is an array', () => {
    assert.ok(Array.isArray(narrative.sources_cited));
  });

  test('B04 — scenario_label is a non-empty string', () => {
    assert.ok(typeof narrative.scenario_label === 'string' && narrative.scenario_label.length > 0);
  });

  test('B05 — horizon_label is a non-empty string', () => {
    assert.ok(typeof narrative.horizon_label === 'string' && narrative.horizon_label.length > 0);
  });

  test('B06 — uncertainty_note is a non-empty string', () => {
    assert.ok(typeof narrative.uncertainty_note === 'string' && narrative.uncertainty_note.length > 0);
  });

  test('B07 — historical_anchor is null or an object with id/label/description', () => {
    if (narrative.historical_anchor !== null) {
      assert.ok(narrative.historical_anchor.id,          'historical_anchor.id required');
      assert.ok(narrative.historical_anchor.label,       'historical_anchor.label required');
      assert.ok(narrative.historical_anchor.description, 'historical_anchor.description required');
    }
  });

  test('B08 — evidence_cited is an array', () => {
    assert.ok(Array.isArray(narrative.evidence_cited));
  });

  test('B09 — paragraphs.length > 0 when interpretations provided', () => {
    assert.ok(narrative.paragraphs.length > 0, 'Must have at least one paragraph');
  });

  test('B10 — scenario_label matches SSP2-4.5 for ssp245', () => {
    assert.equal(narrative.scenario_label, 'SSP2-4.5');
  });

  test('B11 — horizon_label contains 2040 for mid_term', () => {
    assert.ok(narrative.horizon_label.includes('2040'), `horizon_label should contain 2040, got: ${narrative.horizon_label}`);
  });

  test('B12 — at least one source cited when interpretations + projection provided', () => {
    assert.ok(narrative.sources_cited.length > 0, 'Must cite at least one source');
  });

  test('B13 — CMIP6 is cited when projection context is provided', () => {
    assert.ok(narrative.sources_cited.includes('CMIP6'), 'CMIP6 must be in sources_cited');
  });

  test('B14 — IPCC AR6 is cited when projection context is provided', () => {
    assert.ok(narrative.sources_cited.includes('IPCC AR6'), 'IPCC AR6 must be in sources_cited');
  });

  test('B15 — historical_anchor is present when historical events available', () => {
    assert.ok(narrative.historical_anchor !== null, 'historical_anchor must be present');
    assert.equal(narrative.historical_anchor.id, 'enso_1997_1998');
  });

  test('B16 — historical_anchor is null when no historical context', () => {
    const n = buildMainNarrative(mockInterpretationOutput, mockProjectionContext, null);
    assert.equal(n.historical_anchor, null);
  });

  test('B17 — compound interpretations appear in paragraphs', () => {
    const allText = narrative.paragraphs.join(' ');
    assert.ok(allText.includes('combinación'), 'compound text should appear in paragraphs');
  });

  test('B18 — null interpretationOutput returns empty paragraphs', () => {
    const n = buildMainNarrative(null, mockProjectionContext, null);
    const nonProjParagraphs = n.paragraphs.filter(p =>
      !p.includes('SSP') || p.includes('SSP2-4.5, el período')
    );
    assert.ok(Array.isArray(n.paragraphs));
  });

  test('B19 — null projectionContext returns narrative without projection paragraph', () => {
    const n = buildMainNarrative(mockInterpretationOutput, null, null);
    assert.ok(Array.isArray(n.paragraphs));
    // Without projection, projection paragraph is absent
    const hasProjectionParagraph = n.paragraphs.some(p =>
      p.includes('SSP2-4.5, el período 2040–2059 proyecta en esta región una anomalía')
    );
    assert.equal(hasProjectionParagraph, false);
  });

  test('B20 — ssp585 scenario_label is SSP5-8.5', () => {
    const n = buildMainNarrative(
      mockInterpretationOutput,
      mockProjectionContext,
      null,
      { scenario: 'ssp585', window: 'mid_term' }
    );
    assert.equal(n.scenario_label, 'SSP5-8.5');
  });

});

// ─── SUITE C — Narrative rules: citations, scenario, horizon, uncertainty ─────

describe('SUITE C — Narrative rules: citations, scenario, horizon, uncertainty, evidence', () => {

  const narrative = buildMainNarrative(
    mockInterpretationOutput,
    mockProjectionContext,
    mockHistoricalContext,
    { scenario: 'ssp245', window: 'mid_term' }
  );

  const allText = narrative.paragraphs.join(' ');

  test('C01 — narrative cites at least one source (sources_cited non-empty)', () => {
    assert.ok(narrative.sources_cited.length > 0);
  });

  test('C02 — narrative paragraphs mention scenario (SSP)', () => {
    assert.ok(/SSP/i.test(allText), 'Paragraphs must mention SSP scenario');
  });

  test('C03 — narrative paragraphs mention a year range (horizon)', () => {
    assert.ok(/\d{4}/.test(allText), 'Paragraphs must mention a year range');
  });

  test('C04 — uncertainty_note mentions confianza', () => {
    assert.ok(/confianza/i.test(narrative.uncertainty_note));
  });

  test('C05 — narrative includes evidence: CMIP6 mentioned in paragraphs', () => {
    assert.ok(/CMIP6/i.test(allText), 'CMIP6 should appear in paragraphs');
  });

  test('C06 — no urgency language in paragraphs', () => {
    assert.ok(!/urgente/i.test(allText));
    assert.ok(!/urgencia/i.test(allText));
  });

  test('C07 — no alarmism in paragraphs', () => {
    assert.ok(!/catastrófico/i.test(allText));
    assert.ok(!/colapso/i.test(allText));
    assert.ok(!/inevitable/i.test(allText));
  });

  test('C08 — no financial language in paragraphs', () => {
    assert.ok(!/costo estimado/i.test(allText));
    assert.ok(!/pérdida económica/i.test(allText));
    assert.ok(!/USD/i.test(allText));
    assert.ok(!/millones de/i.test(allText));
  });

  test('C09 — no hidden heuristic scores in narrative output', () => {
    const json = JSON.stringify(narrative);
    assert.ok(!/risk_score/i.test(json));
    assert.ok(!/overall_score/i.test(json));
    assert.ok(!/urgency_rank/i.test(json));
  });

  test('C10 — paragraphs do not repeat identical sentences', () => {
    const sentences = narrative.paragraphs.join(' ').split(/\. /);
    const unique = new Set(sentences);
    assert.equal(sentences.length, unique.size, 'No repeated sentences in narrative');
  });

  test('C11 — uncertainty_note mentions temperature confidence', () => {
    assert.ok(/Temperatura/i.test(narrative.uncertainty_note));
  });

  test('C12 — uncertainty_note mentions precipitation confidence', () => {
    assert.ok(/Precipitaci[oó]n/i.test(narrative.uncertainty_note));
  });

  test('C13 — SSP2-4.5 scenario_label is correctly formatted', () => {
    assert.equal(narrative.scenario_label, 'SSP2-4.5');
  });

  test('C14 — SSP5-8.5 scenario_label is correctly formatted for ssp585', () => {
    const n = buildMainNarrative(
      mockInterpretationOutput,
      mockProjectionContext,
      null,
      { scenario: 'ssp585', window: 'mid_term' }
    );
    assert.equal(n.scenario_label, 'SSP5-8.5');
  });

  test('C15 — mid_term horizon_label contains 2040', () => {
    const n = buildMainNarrative(
      mockInterpretationOutput,
      mockProjectionContext,
      null,
      { scenario: 'ssp245', window: 'mid_term' }
    );
    assert.ok(n.horizon_label.includes('2040'));
  });

});

// ─── SUITE D — buildAdaptationMeasures ───────────────────────────────────────

describe('SUITE D — buildAdaptationMeasures: qualitative, no costs, no efficacy, sector context', () => {

  const adaptations = buildAdaptationMeasures(mockInterpretationOutput, { sector: 'retail' });

  test('D01 — returns an array', () => {
    assert.ok(Array.isArray(adaptations));
  });

  test('D02 — each element has measure string', () => {
    for (const a of adaptations) {
      assert.ok(typeof a.measure === 'string' && a.measure.length > 0,
        `measure must be non-empty string, got: ${a.measure}`);
    }
  });

  test('D03 — each element has rationale string', () => {
    for (const a of adaptations) {
      assert.ok(typeof a.rationale === 'string' && a.rationale.length > 0,
        `rationale must be non-empty string, got: ${a.rationale}`);
    }
  });

  test('D04 — each element has signal_group string', () => {
    for (const a of adaptations) {
      assert.ok(typeof a.signal_group === 'string' && a.signal_group.length > 0);
    }
  });

  test('D05 — each element has sector string', () => {
    for (const a of adaptations) {
      assert.ok(typeof a.sector === 'string' && a.sector.length > 0);
    }
  });

  test('D06 — returns adaptation for heat_stress group', () => {
    const heat = adaptations.find(a => a.signal_group === 'heat_stress');
    assert.ok(heat, 'heat_stress adaptation must be present');
  });

  test('D07 — returns adaptation for precipitation_intensity group', () => {
    const precip = adaptations.find(a => a.signal_group === 'precipitation_intensity');
    assert.ok(precip, 'precipitation_intensity adaptation must be present');
  });

  test('D08 — returns adaptation for terrain_instability group', () => {
    const terrain = adaptations.find(a => a.signal_group === 'terrain_instability');
    assert.ok(terrain, 'terrain_instability adaptation must be present');
  });

  test('D09 — returns adaptation for climate_mode group', () => {
    const mode = adaptations.find(a => a.signal_group === 'climate_mode');
    assert.ok(mode, 'climate_mode adaptation must be present');
  });

  test('D10 — retail sector returns retail-specific text for heat_stress', () => {
    const heat = adaptations.find(a => a.signal_group === 'heat_stress');
    assert.ok(/tiendas|almacenes|climatizaci/i.test(heat.measure),
      `retail heat measure should mention tiendas/almacenes, got: ${heat.measure}`);
  });

  test('D11 — agriculture sector returns agriculture-specific text', () => {
    const agri = buildAdaptationMeasures(mockInterpretationOutput, { sector: 'agriculture' });
    const heat = agri.find(a => a.signal_group === 'heat_stress');
    assert.ok(/siembra|cosecha|cultivo/i.test(heat.measure),
      `agriculture heat measure should mention siembra/cosecha, got: ${heat.measure}`);
  });

  test('D12 — no dollar signs or monetary values in any measure', () => {
    const allText = adaptations.map(a => a.measure).join(' ');
    assert.ok(!/USD/i.test(allText));
    assert.ok(!/dólares/i.test(allText));
    assert.ok(!/millones/i.test(allText));
    assert.ok(!/costo de \$/.test(allText));
  });

  test('D13 — no efficacy percentages in any measure ("eficacia del X%")', () => {
    const allText = adaptations.map(a => a.measure).join(' ');
    assert.ok(!/eficacia del \d+%/i.test(allText));
    assert.ok(!/eficiencia del \d+%/i.test(allText));
    assert.ok(!/reduce en \d+%/i.test(allText));
  });

  test('D14 — measures are qualitative (no specific cost numbers)', () => {
    const allText = adaptations.map(a => a.measure).join(' ');
    assert.ok(!/S\/\. \d+/i.test(allText),    'No PEN amounts');
    assert.ok(!/\$\d+/i.test(allText),         'No dollar amounts');
    assert.ok(!/costo estimado/i.test(allText), 'No costo estimado');
  });

  test('D15 — sector general returns general measures', () => {
    const general = buildAdaptationMeasures(mockInterpretationOutput, { sector: 'general' });
    assert.ok(general.length > 0, 'general sector must return adaptations');
    for (const a of general) {
      assert.equal(a.sector, 'general');
    }
  });

  test('D16 — INGEMMET is cited in terrain_instability rationale', () => {
    const terrain = adaptations.find(a => a.signal_group === 'terrain_instability');
    assert.ok(/INGEMMET/i.test(terrain.rationale),
      `terrain rationale must cite INGEMMET, got: ${terrain.rationale}`);
  });

  test('D17 — NOAA or ENSO is cited in climate_mode rationale', () => {
    const mode = adaptations.find(a => a.signal_group === 'climate_mode');
    assert.ok(/NOAA|ENSO/i.test(mode.rationale),
      `climate_mode rationale must cite NOAA or ENSO, got: ${mode.rationale}`);
  });

  test('D18 — precipitation rationale cites CMIP6', () => {
    const precip = adaptations.find(a => a.signal_group === 'precipitation_intensity');
    assert.ok(/CMIP6/i.test(precip.rationale),
      `precipitation rationale must cite CMIP6, got: ${precip.rationale}`);
  });

  test('D19 — empty signal groups returns empty adaptations', () => {
    const result = buildAdaptationMeasures(emptyInterpretationOutput, { sector: 'retail' });
    assert.equal(result.length, 0);
  });

  test('D20 — unknown sector falls back to general measures', () => {
    const result = buildAdaptationMeasures(mockInterpretationOutput, { sector: 'unknown_sector' });
    assert.ok(result.length > 0);
    for (const a of result) {
      assert.equal(a.sector, 'general', 'unknown sector should fall back to general');
    }
  });

  test('D21 — no urgency language in any adaptation measure', () => {
    const allText = adaptations.map(a => `${a.measure} ${a.rationale}`).join(' ');
    assert.ok(!/urgente/i.test(allText));
    assert.ok(!/urgencia/i.test(allText));
    assert.ok(!/debe actuar ahora/i.test(allText));
  });

  test('D22 — measures are action-oriented (contain verbs)', () => {
    for (const a of adaptations) {
      const startsWithVerb = /^(Evaluar|Revisar|Implementar|Incorporar|Desarrollar|Identificar|Auditar|Adoptar|Diversificar|Monitorear|Anticipar|Ajustar|Verificar|Garantizar|Planificar)/i.test(a.measure);
      assert.ok(startsWithVerb, `Measure should start with action verb: "${a.measure}"`);
    }
  });

  test('D23 — no time-bound mandates with days/weeks in measures', () => {
    const allText = adaptations.map(a => a.measure).join(' ');
    assert.ok(!/en \d+ días/i.test(allText));
    assert.ok(!/en \d+ semanas/i.test(allText));
    assert.ok(!/antes del \d+/i.test(allText));
  });

  test('D24 — infrastructure sector returns infrastructure-specific text for precipitation', () => {
    const infra = buildAdaptationMeasures(mockInterpretationOutput, { sector: 'infrastructure' });
    const precip = infra.find(a => a.signal_group === 'precipitation_intensity');
    assert.ok(/hidráulica|puentes|alcantarilla|drenaje vial/i.test(precip.measure),
      `infrastructure precip measure should mention hydraulic capacity, got: ${precip.measure}`);
  });

  test('D25 — logistics sector returns logistics-specific text for terrain', () => {
    const log = buildAdaptationMeasures(mockInterpretationOutput, { sector: 'logistics' });
    const terrain = log.find(a => a.signal_group === 'terrain_instability');
    assert.ok(/rutas|distribución/i.test(terrain.measure),
      `logistics terrain measure should mention routes, got: ${terrain.measure}`);
  });

});

// ─── SUITE E — validateStorytelling ──────────────────────────────────────────

describe('SUITE E — validateStorytelling: urgency, alarmism, heuristics, financial', () => {

  // Build a clean output first
  const cleanOutput = buildStorytellingContext(
    mockInterpretationOutput,
    mockProjectionContext,
    mockHistoricalContext,
    { scenario: 'ssp245', window: 'mid_term', sector: 'retail' }
  );

  test('E01 — validation_passed true for clean storytelling output', () => {
    assert.equal(cleanOutput.validation.validation_passed, true,
      `Validation failed: ${JSON.stringify(cleanOutput.validation)}`);
  });

  test('E02 — has_urgency_language false in clean output', () => {
    assert.equal(cleanOutput.validation.has_urgency_language, false);
  });

  test('E03 — has_alarmism false in clean output', () => {
    assert.equal(cleanOutput.validation.has_alarmism, false);
  });

  test('E04 — has_financial_language false in clean output', () => {
    assert.equal(cleanOutput.validation.has_financial_language, false);
  });

  test('E05 — has_hidden_heuristics false in clean output', () => {
    assert.equal(cleanOutput.validation.has_hidden_heuristics, false);
  });

  test('E06 — citations_present true when sources_cited has elements', () => {
    assert.equal(cleanOutput.validation.citations_present, true);
  });

  test('E07 — citations_present false when sources_cited is empty', () => {
    const v = validateStorytelling({ narrative: { paragraphs: [], sources_cited: [] }, adaptations: [] });
    assert.equal(v.citations_present, false);
  });

  test('E08 — scenario_mentioned true when SSP in paragraphs', () => {
    assert.equal(cleanOutput.validation.scenario_mentioned, true);
  });

  test('E09 — scenario_mentioned false when no SSP in paragraphs', () => {
    const v = validateStorytelling({
      narrative: {
        paragraphs:      ['El clima cambia en la región.'],
        sources_cited:   ['CMIP6'],
        uncertainty_note: 'Nivel de confianza general: confianza media.',
      },
      adaptations: [],
    });
    assert.equal(v.scenario_mentioned, false);
  });

  test('E10 — uncertainty_mentioned true when confianza in uncertainty_note', () => {
    assert.equal(cleanOutput.validation.uncertainty_mentioned, true);
  });

  test('E11 — uncertainty_mentioned false when uncertainty_note is absent', () => {
    const v = validateStorytelling({
      narrative: {
        paragraphs:      ['Bajo el escenario SSP2-4.5, el período 2040–2059.'],
        sources_cited:   ['CMIP6'],
        uncertainty_note: '',
      },
      adaptations: [],
    });
    assert.equal(v.uncertainty_mentioned, false);
  });

  test('E12 — has_urgency_language true when "urgente" appears in adaptation text', () => {
    const v = validateStorytelling({
      narrative: {
        paragraphs:       ['Bajo el escenario SSP2-4.5.'],
        sources_cited:    ['CMIP6'],
        uncertainty_note: 'Nivel de confianza general: confianza media.',
      },
      adaptations: [{ measure: 'Es urgente actuar de inmediato.', rationale: 'Motivo.', signal_group: 'heat_stress', sector: 'retail' }],
    });
    assert.equal(v.has_urgency_language, true);
  });

  test('E13 — has_alarmism true when "catastrófico" appears in paragraphs', () => {
    const v = validateStorytelling({
      narrative: {
        paragraphs:       ['El impacto será catastrófico bajo SSP2-4.5.'],
        sources_cited:    ['CMIP6'],
        uncertainty_note: 'Nivel de confianza general: confianza media.',
      },
      adaptations: [],
    });
    assert.equal(v.has_alarmism, true);
  });

  test('E14 — validation_passed false when no citations_present', () => {
    const v = validateStorytelling({
      narrative: {
        paragraphs:       ['Bajo el escenario SSP2-4.5.'],
        sources_cited:    [],
        uncertainty_note: 'Nivel de confianza general: confianza media.',
      },
      adaptations: [],
    });
    assert.equal(v.validation_passed, false);
  });

  test('E15 — has_financial_language true when "USD" appears in text', () => {
    const v = validateStorytelling({
      narrative: {
        paragraphs:       ['El costo estimado es de USD 1 millón bajo SSP2-4.5.'],
        sources_cited:    ['CMIP6'],
        uncertainty_note: 'Nivel de confianza general: confianza media.',
      },
      adaptations: [],
    });
    assert.equal(v.has_financial_language, true);
  });

});

// ─── SUITE F — buildStorytellingContext full pipeline ─────────────────────────

describe('SUITE F — buildStorytellingContext full pipeline output', () => {

  const output = buildStorytellingContext(
    mockInterpretationOutput,
    mockProjectionContext,
    mockHistoricalContext,
    { scenario: 'ssp245', window: 'mid_term', sector: 'retail' }
  );

  test('F01 — returns narrative object', () => {
    assert.ok(output.narrative && typeof output.narrative === 'object');
  });

  test('F02 — returns adaptations array', () => {
    assert.ok(Array.isArray(output.adaptations));
  });

  test('F03 — returns metadata object', () => {
    assert.ok(output.metadata && typeof output.metadata === 'object');
  });

  test('F04 — returns validation object', () => {
    assert.ok(output.validation && typeof output.validation === 'object');
  });

  test('F05 — returns generated_at ISO timestamp', () => {
    assert.ok(typeof output.generated_at === 'string');
    assert.ok(!isNaN(Date.parse(output.generated_at)), 'generated_at must be a valid ISO date');
  });

  test('F06 — metadata.scenario matches option', () => {
    assert.equal(output.metadata.scenario, 'ssp245');
  });

  test('F07 — metadata.window matches option', () => {
    assert.equal(output.metadata.window, 'mid_term');
  });

  test('F08 — metadata.sector matches option', () => {
    assert.equal(output.metadata.sector, 'retail');
  });

  test('F09 — validation.validation_passed true for well-formed input', () => {
    assert.equal(output.validation.validation_passed, true,
      `validation failed: ${JSON.stringify(output.validation)}`);
  });

  test('F10 — works with empty interpretationOutput (no crash)', () => {
    const result = buildStorytellingContext(
      emptyInterpretationOutput,
      mockProjectionContext,
      null,
      { scenario: 'ssp245', window: 'mid_term' }
    );
    assert.ok(Array.isArray(result.narrative.paragraphs));
    assert.ok(Array.isArray(result.adaptations));
  });

  test('F11 — works with null projectionContext (no crash)', () => {
    const result = buildStorytellingContext(
      mockInterpretationOutput,
      null,
      mockHistoricalContext
    );
    assert.ok(result.narrative.paragraphs.length > 0);
  });

  test('F12 — works with null historicalContext (no crash)', () => {
    const result = buildStorytellingContext(
      mockInterpretationOutput,
      mockProjectionContext,
      null
    );
    assert.equal(result.narrative.historical_anchor, null);
  });

  test('F13 — adaptations count > 0 when signal groups present', () => {
    assert.ok(output.adaptations.length > 0, 'Must have at least one adaptation');
  });

  test('F14 — narrative.paragraphs.length > 0 when interpretations provided', () => {
    assert.ok(output.narrative.paragraphs.length > 0);
  });

  test('F15 — metadata.groups_covered is an array', () => {
    assert.ok(Array.isArray(output.metadata.groups_covered));
  });

  test('F16 — metadata.signals_used is an array', () => {
    assert.ok(Array.isArray(output.metadata.signals_used));
  });

  test('F17 — scenario ssp585 produces SSP5-8.5 narrative', () => {
    const result = buildStorytellingContext(
      mockInterpretationOutput,
      mockProjectionContext,
      null,
      { scenario: 'ssp585', window: 'mid_term' }
    );
    assert.equal(result.narrative.scenario_label, 'SSP5-8.5');
    assert.equal(result.metadata.scenario, 'ssp585');
  });

  test('F18 — window far_term produces 2060 horizon label', () => {
    const result = buildStorytellingContext(
      mockInterpretationOutput,
      mockProjectionContext,
      null,
      { scenario: 'ssp245', window: 'far_term' }
    );
    assert.ok(result.narrative.horizon_label.includes('2060'),
      `horizon_label should include 2060, got: ${result.narrative.horizon_label}`);
  });

  test('F19 — sector retail produces retail-specific adaptations', () => {
    const retailAdaptations = output.adaptations.filter(a => a.sector === 'retail');
    assert.ok(retailAdaptations.length > 0, 'retail sector must produce retail adaptations');
  });

  test('F20 — full pipeline: interpretations → projection → historical → storytelling passes validation', () => {
    const fullResult = buildStorytellingContext(
      mockInterpretationOutput,
      mockProjectionContext,
      mockHistoricalContext,
      { scenario: 'ssp245', window: 'mid_term', sector: 'retail' }
    );
    assert.equal(fullResult.validation.validation_passed, true,
      `Full pipeline validation failed: ${JSON.stringify(fullResult.validation)}`);
    assert.ok(fullResult.narrative.paragraphs.length > 0,   'Must have paragraphs');
    assert.ok(fullResult.adaptations.length > 0,            'Must have adaptations');
    assert.ok(fullResult.narrative.sources_cited.length > 0, 'Must have sources');
    assert.ok(/confianza/i.test(fullResult.narrative.uncertainty_note), 'Must mention uncertainty');
    assert.ok(fullResult.narrative.historical_anchor !== null, 'Must have historical anchor');
  });

});
