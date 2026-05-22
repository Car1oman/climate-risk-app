/**
 * Regression tests — Layer7 Scientific Interpretation Engine (Sprint 7)
 *
 * Validates:
 *   FASE A — Signal deduplication into semantic groups
 *   FASE B — Contextual fusion object
 *   FASE C — Interpretation text generation (grounded, no invented numbers)
 *   FASE D — Uncertainty metadata
 *   FASE E — Invariant validation (no scores, urgency, financial impacts)
 *
 * All inputs are deterministic synthetic objects. No DB or network calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { interpretSignals } from '../../server/scientific/interpretation.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSignal({
  signalType,
  indicator   = 'hd35',
  historical  = 20,
  projected   = 40,
  delta       = 20,
  delta_pct   = null,
  confidence  = 'high',
  horizon     = 'short_term',
  threshold_reference = 'IPCC AR6',
} = {}) {
  return {
    signalType,
    indicator,
    historical,
    projected,
    delta,
    delta_pct,
    confidence,
    horizon,
    threshold_reference,
    exceeds_threshold: true,
    source_traceability: {
      source:             'CMIP6 ensemble / climate_cells',
      confidence_level:   confidence,
      validation_status:  'validated',
      uncertainty_spread: {
        spread_type: 'ensemble_percentile',
        p10:         15,
        p90:         25,
        spread_note: 'CMIP6 ensemble 10th–90th percentile for hd35: [15.0, 25.0] — median 20.0',
        model_count: 49,
      },
    },
  };
}

function makeFused({
  scenario    = 'ssp245',
  ensoData    = null,
  terrainData = null,
  climateSource = 'climate_cells',
} = {}) {
  return { scenario, climateSource, ensoData, terrainData };
}

// ─── FASE A — Signal Deduplication ───────────────────────────────────────────

describe('FASE A — Signal deduplication', () => {

  it('groups extreme_rain and flood_risk into precipitation_intensity', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_rain', indicator: 'rx5day', delta: null, delta_pct: 25 }),
      makeSignal({ signalType: 'flood_risk',   indicator: 'flood_probability', projected: 0.4, delta: null }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    const precipGroup = result.signal_groups.find(g => g.group_id === 'precipitation_intensity');
    assert.ok(precipGroup, 'precipitation_intensity group must exist');
    assert.ok(precipGroup.signal_types.includes('extreme_rain'), 'must include extreme_rain');
    assert.ok(precipGroup.signal_types.includes('flood_risk'),   'must include flood_risk');
    assert.equal(precipGroup.signal_count, 2);
  });

  it('groups landslide_risk and huayco_risk into terrain_instability', () => {
    const signals = [
      makeSignal({ signalType: 'landslide_risk', indicator: 'slope_degrees', projected: 25, delta: null }),
      makeSignal({ signalType: 'huayco_risk',    indicator: 'terrain_huayco', projected: 0.7, delta: null }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    const terrainGroup = result.signal_groups.find(g => g.group_id === 'terrain_instability');
    assert.ok(terrainGroup, 'terrain_instability group must exist');
    assert.ok(terrainGroup.signal_count >= 1);
  });

  it('groups extreme_heat, severe_heat and tropical_nights into heat_stress', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_heat',    indicator: 'hd35', delta: 15 }),
      makeSignal({ signalType: 'severe_heat',     indicator: 'hd40', delta: 7 }),
      makeSignal({ signalType: 'tropical_nights', indicator: 'tr',   delta: 22 }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    const heatGroup = result.signal_groups.find(g => g.group_id === 'heat_stress');
    assert.ok(heatGroup, 'heat_stress group must exist');
    assert.equal(heatGroup.signal_count, 3);
  });

  it('groups drought into water_stress', () => {
    const signals = [
      makeSignal({ signalType: 'drought', indicator: 'cdd', delta: 20 }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    const droughtGroup = result.signal_groups.find(g => g.group_id === 'water_stress');
    assert.ok(droughtGroup, 'water_stress group must exist');
  });

  it('groups enso_phase into climate_mode', () => {
    const signals = [
      makeSignal({ signalType: 'enso_phase', indicator: 'oni', projected: 1.3, delta: 1.3, delta_pct: null }),
    ];
    const result = interpretSignals({ signals }, makeFused({ ensoData: { phase: 'el_nino', oni_latest: 1.3 } }));
    const ensoGroup = result.signal_groups.find(g => g.group_id === 'climate_mode');
    assert.ok(ensoGroup, 'climate_mode group must exist');
  });

  it('returns empty groups when no signals provided', () => {
    const result = interpretSignals({ signals: [] }, makeFused());
    assert.deepEqual(result.signal_groups, []);
  });

  it('selects canonical signal with highest confidence when multiple present', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_heat', indicator: 'hd35', delta: 10, confidence: 'low' }),
      makeSignal({ signalType: 'extreme_heat', indicator: 'hd35', delta: 12, confidence: 'high' }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    const heatGroup = result.signal_groups.find(g => g.group_id === 'heat_stress');
    assert.equal(heatGroup.canonical_signal.confidence, 'high', 'canonical must be highest confidence');
  });

  it('tie-breaks canonical selection by highest absolute delta', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_heat', indicator: 'hd35', delta: 10, confidence: 'high' }),
      makeSignal({ signalType: 'extreme_heat', indicator: 'hd35', delta: 18, confidence: 'high' }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    const heatGroup = result.signal_groups.find(g => g.group_id === 'heat_stress');
    assert.equal(heatGroup.canonical_signal.delta, 18, 'canonical must have highest delta when confidence is tied');
  });

  it('group label is a non-empty string', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 12 })];
    const result = interpretSignals({ signals }, makeFused());
    for (const g of result.signal_groups) {
      assert.ok(typeof g.group_label === 'string' && g.group_label.length > 0);
    }
  });

  it('each group has non-empty evidence_ids array', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 12 })];
    const result = interpretSignals({ signals }, makeFused());
    for (const g of result.signal_groups) {
      assert.ok(Array.isArray(g.evidence_ids));
      assert.ok(g.evidence_ids.length > 0, `group ${g.group_id} must have at least one evidence_id`);
    }
  });
});

// ─── FASE B — Contextual Fusion ───────────────────────────────────────────────

describe('FASE B — Contextual fusion', () => {

  it('sets has_precipitation_intensity when extreme_rain signal present', () => {
    const signals = [makeSignal({ signalType: 'extreme_rain', indicator: 'rx5day', delta_pct: 22, delta: null })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.context.has_precipitation_intensity, true);
    assert.equal(result.context.has_heat_stress, false);
  });

  it('sets has_terrain_instability when landslide_risk signal present', () => {
    const signals = [makeSignal({ signalType: 'landslide_risk', indicator: 'slope_degrees', delta: null })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.context.has_terrain_instability, true);
  });

  it('sets has_heat_stress when temp_increase signal present', () => {
    const signals = [makeSignal({ signalType: 'temp_increase', indicator: 'tas', delta: 1.8 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.context.has_heat_stress, true);
  });

  it('sets has_water_stress when drought signal present', () => {
    const signals = [makeSignal({ signalType: 'drought', indicator: 'cdd', delta: 18 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.context.has_water_stress, true);
  });

  it('sets has_climate_mode when enso_phase signal present', () => {
    const signals = [makeSignal({ signalType: 'enso_phase', indicator: 'oni', projected: 1.2, delta: 1.2, delta_pct: null })];
    const result  = interpretSignals({ signals }, makeFused({ ensoData: { phase: 'el_nino', oni_latest: 1.2 } }));
    assert.equal(result.context.has_climate_mode, true);
  });

  it('populates enso_phase and enso_oni from fusedData.ensoData', () => {
    const fused  = makeFused({ ensoData: { phase: 'el_nino', oni_latest: 1.5 } });
    const result = interpretSignals({ signals: [] }, fused);
    assert.equal(result.context.enso_phase, 'el_nino');
    assert.equal(result.context.enso_oni,   1.5);
  });

  it('populates terrain fields from fusedData.terrainData', () => {
    const fused  = makeFused({
      terrainData: { slope_degrees: 22, terrain_region: 'ladera andina', susceptibility: 'moderada', huayco_risk: 'medio' },
    });
    const result = interpretSignals({ signals: [] }, fused);
    assert.equal(result.context.terrain_slope_deg,      22);
    assert.equal(result.context.terrain_region,         'ladera andina');
    assert.equal(result.context.terrain_susceptibility, 'moderada');
    assert.equal(result.context.terrain_huayco_risk,    'medio');
  });

  it('reflects SSP585 scenario in scenario_label', () => {
    const result = interpretSignals({ signals: [] }, makeFused({ scenario: 'ssp585' }));
    assert.equal(result.context.scenario_label, 'SSP5-8.5');
  });

  it('reflects SSP245 scenario in scenario_label', () => {
    const result = interpretSignals({ signals: [] }, makeFused({ scenario: 'ssp245' }));
    assert.equal(result.context.scenario_label, 'SSP2-4.5');
  });

  it('sets temporal_horizon to first non-null canonical signal horizon', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 12, horizon: 'mid_term' })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.context.temporal_horizon, 'mid_term');
    assert.equal(result.context.temporal_horizon_label, '2040–2059');
  });

  it('all presence flags are false when no signals provided', () => {
    const result = interpretSignals({ signals: [] }, makeFused());
    assert.equal(result.context.has_heat_stress,             false);
    assert.equal(result.context.has_precipitation_intensity, false);
    assert.equal(result.context.has_water_stress,            false);
    assert.equal(result.context.has_terrain_instability,     false);
    assert.equal(result.context.has_climate_mode,            false);
  });
});

// ─── FASE C — Interpretation text generation ─────────────────────────────────

describe('FASE C — Interpretation text generation', () => {

  it('generates text for temp_increase with numeric delta', () => {
    const signals = [makeSignal({ signalType: 'temp_increase', indicator: 'tas', delta: 1.8 })];
    const result  = interpretSignals({ signals }, makeFused());
    const interp  = result.interpretations.find(i => i.group_ids.includes('heat_stress'));
    assert.ok(interp, 'interpretation for heat_stress must exist');
    assert.ok(interp.text.includes('1.8'), 'text must contain numeric delta value 1.8');
    assert.ok(interp.text.includes('°C'),  'text must include unit °C');
  });

  it('generates text for extreme_heat with days delta', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', indicator: 'hd35', delta: 14 })];
    const result  = interpretSignals({ signals }, makeFused());
    const interp  = result.interpretations.find(i => i.group_ids.includes('heat_stress'));
    assert.ok(interp.text.includes('14'), 'text must include delta days value');
    assert.ok(interp.text.includes('35°C'), 'text must reference 35°C threshold');
  });

  it('generates text for tropical_nights with nights delta', () => {
    const signals = [makeSignal({ signalType: 'tropical_nights', indicator: 'tr', delta: 20 })];
    const result  = interpretSignals({ signals }, makeFused());
    const interp  = result.interpretations.find(i => i.group_ids.includes('heat_stress'));
    assert.ok(interp.text.includes('20'), 'text must include delta nights value');
    assert.ok(interp.text.includes('20°C'), 'text must reference 20°C threshold');
  });

  it('generates text for extreme_rain rx5day with delta_pct', () => {
    const signals = [makeSignal({ signalType: 'extreme_rain', indicator: 'rx5day', delta: null, delta_pct: 28 })];
    const result  = interpretSignals({ signals }, makeFused());
    const interp  = result.interpretations.find(i => i.group_ids.includes('precipitation_intensity'));
    assert.ok(interp, 'interpretation for precipitation_intensity must exist');
    assert.ok(interp.text.includes('28'), 'text must include delta_pct value');
    assert.ok(interp.text.includes('Rx5day'), 'text must reference Rx5day indicator');
  });

  it('generates combined text when both extreme_rain and flood_risk present', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_rain', indicator: 'rx5day', delta: null, delta_pct: 25 }),
      makeSignal({ signalType: 'flood_risk',   indicator: 'flood_probability', projected: 0.42, delta: null }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    const interp = result.interpretations.find(i => i.group_ids.includes('precipitation_intensity'));
    assert.ok(interp.text.includes('GRI') || interp.text.includes('inundación'), 'text must reference flood source');
    assert.ok(interp.text.includes('42') || interp.text.includes('CMIP6'), 'text must include probability or CMIP6');
  });

  it('generates text for terrain with slope degrees from fusedData.terrainData', () => {
    const signals = [makeSignal({ signalType: 'landslide_risk', indicator: 'slope_degrees', delta: null, projected: 25 })];
    const fused   = makeFused({
      terrainData: { slope_degrees: 25.3, terrain_region: 'ladera andina', susceptibility: 'moderada', huayco_risk: 'bajo' },
    });
    const result = interpretSignals({ signals }, fused);
    const interp = result.interpretations.find(i => i.group_ids.includes('terrain_instability'));
    assert.ok(interp, 'interpretation for terrain_instability must exist');
    assert.ok(interp.text.includes('25.3'), 'text must include actual slope from terrainData');
    assert.ok(interp.text.includes('ladera andina'), 'text must include region name');
  });

  it('generates text for drought cdd with delta days', () => {
    const signals = [makeSignal({ signalType: 'drought', indicator: 'cdd', delta: 18 })];
    const result  = interpretSignals({ signals }, makeFused());
    const interp  = result.interpretations.find(i => i.group_ids.includes('water_stress'));
    assert.ok(interp, 'interpretation for water_stress must exist');
    assert.ok(interp.text.includes('18'), 'text must include CDD delta days');
    assert.ok(interp.text.includes('CDD'), 'text must reference CDD indicator');
  });

  it('generates text for drought prpercnt with percentage reduction', () => {
    const signals = [makeSignal({ signalType: 'drought', indicator: 'prpercnt', delta: null, delta_pct: -18 })];
    const result  = interpretSignals({ signals }, makeFused());
    const interp  = result.interpretations.find(i => i.group_ids.includes('water_stress'));
    assert.ok(interp.text.includes('18'), 'text must include percentage value');
    assert.ok(interp.text.includes('%'),  'text must include percent sign');
  });

  it('generates text for ENSO El Niño with ONI value', () => {
    const signals = [makeSignal({ signalType: 'enso_phase', indicator: 'oni', projected: 1.3, delta: 1.3, delta_pct: null })];
    const fused   = makeFused({ ensoData: { phase: 'el_nino', oni_latest: 1.3 } });
    const result  = interpretSignals({ signals }, fused);
    const interp  = result.interpretations.find(i => i.group_ids.includes('climate_mode'));
    assert.ok(interp, 'interpretation for climate_mode must exist');
    assert.ok(interp.text.includes('El Niño'), 'text must mention El Niño');
    assert.ok(interp.text.includes('1.30') || interp.text.includes('1.3'), 'text must include ONI value');
  });

  it('generates compound interpretation for precipitation + terrain', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_rain',   indicator: 'rx5day',       delta: null, delta_pct: 28 }),
      makeSignal({ signalType: 'landslide_risk', indicator: 'slope_degrees', delta: null, projected: 22 }),
    ];
    const fused  = makeFused({
      terrainData: { slope_degrees: 22, terrain_region: 'ladera andina', susceptibility: 'moderada', huayco_risk: 'medio' },
    });
    const result   = interpretSignals({ signals }, fused);
    const compound = result.interpretations.find(
      i => i.type === 'compound' && i.group_ids.includes('terrain_instability')
    );
    assert.ok(compound, 'compound interpretation for precip+terrain must exist');
    assert.ok(compound.text.includes('22'), 'compound text must include slope value');
    assert.ok(compound.group_ids.includes('precipitation_intensity'), 'must reference precipitation group');
  });

  it('generates compound ENSO amplification for El Niño + precipitation', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_rain', indicator: 'rx5day', delta: null, delta_pct: 25 }),
      makeSignal({ signalType: 'enso_phase',   indicator: 'oni', projected: 1.5, delta: 1.5, delta_pct: null }),
    ];
    const fused  = makeFused({ ensoData: { phase: 'el_nino', oni_latest: 1.5 } });
    const result = interpretSignals({ signals }, fused);
    const compound = result.interpretations.find(
      i => i.type === 'compound' && i.group_ids.includes('climate_mode') && i.group_ids.includes('precipitation_intensity')
    );
    assert.ok(compound, 'ENSO amplification compound must exist');
    assert.ok(compound.text.includes('El Niño'), 'must mention El Niño in compound text');
  });

  it('generates compound La Niña + drought when both groups present', () => {
    const signals = [
      makeSignal({ signalType: 'drought',    indicator: 'cdd', delta: 20 }),
      makeSignal({ signalType: 'enso_phase', indicator: 'oni', projected: -1.1, delta: -1.1, delta_pct: null }),
    ];
    const fused  = makeFused({ ensoData: { phase: 'la_nina', oni_latest: -1.1 } });
    const result = interpretSignals({ signals }, fused);
    const compound = result.interpretations.find(
      i => i.type === 'compound' && i.group_ids.includes('climate_mode') && i.group_ids.includes('water_stress')
    );
    assert.ok(compound, 'La Niña drought compound must exist');
    assert.ok(compound.text.includes('La Niña'), 'must mention La Niña');
  });

  it('generates compound heat-drought when both groups present', () => {
    const signals = [
      makeSignal({ signalType: 'temp_increase', indicator: 'tas', delta: 2.1 }),
      makeSignal({ signalType: 'drought',       indicator: 'cdd', delta: 18 }),
    ];
    const result   = interpretSignals({ signals }, makeFused());
    const compound = result.interpretations.find(
      i => i.type === 'compound' && i.group_ids.includes('heat_stress') && i.group_ids.includes('water_stress')
    );
    assert.ok(compound, 'heat-drought compound must exist');
    assert.ok(compound.text.includes('2.1'), 'must include temp delta');
  });

  it('does NOT generate ENSO compound when phase is neutral', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_rain', indicator: 'rx5day', delta: null, delta_pct: 22 }),
      makeSignal({ signalType: 'enso_phase',   indicator: 'oni', projected: 0.3, delta: 0.3, delta_pct: null }),
    ];
    const fused  = makeFused({ ensoData: { phase: 'neutral', oni_latest: 0.3 } });
    const result = interpretSignals({ signals }, fused);
    const compound = result.interpretations.find(
      i => i.type === 'compound' && i.group_ids.includes('climate_mode')
    );
    assert.equal(compound, undefined, 'no ENSO compound when phase is neutral');
  });

  it('all interpretation texts are non-empty strings', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_heat',  delta: 12 }),
      makeSignal({ signalType: 'drought',       indicator: 'cdd', delta: 20 }),
      makeSignal({ signalType: 'landslide_risk',indicator: 'slope_degrees', delta: null }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    for (const interp of result.interpretations) {
      assert.ok(typeof interp.text === 'string' && interp.text.length > 20,
        `interpretation text must be non-trivial string, got: "${interp.text}"`);
    }
  });

  it('each interpretation has group_ids array, text, data_basis and evidence_ids', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 12 })];
    const result  = interpretSignals({ signals }, makeFused());
    for (const interp of result.interpretations) {
      assert.ok(Array.isArray(interp.group_ids), 'group_ids must be array');
      assert.ok(typeof interp.text === 'string',  'text must be string');
      assert.ok(typeof interp.data_basis === 'object', 'data_basis must be object');
      assert.ok(Array.isArray(interp.evidence_ids), 'evidence_ids must be array');
    }
  });
});

// ─── FASE D — Uncertainty metadata ───────────────────────────────────────────

describe('FASE D — Uncertainty metadata', () => {

  it('sets overall_confidence to high when all canonical signals are high confidence', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', confidence: 'high', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.uncertainty.overall_confidence, 'high');
  });

  it('sets overall_confidence to medium when mixed high and low confidence', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_heat', confidence: 'high', delta: 15 }),
      makeSignal({ signalType: 'drought',      indicator: 'cdd', confidence: 'low', delta: 18 }),
    ];
    const result = interpretSignals({ signals }, makeFused());
    assert.equal(result.uncertainty.overall_confidence, 'medium');
  });

  it('sets overall_confidence to low when no high confidence signals', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', confidence: 'low', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.uncertainty.overall_confidence, 'low');
  });

  it('includes limitations as non-empty array when signals present', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.ok(Array.isArray(result.uncertainty.limitations));
    assert.ok(result.uncertainty.limitations.length > 0, 'must have at least one limitation');
  });

  it('limitations array is empty when no signals provided', () => {
    const result = interpretSignals({ signals: [] }, makeFused());
    assert.ok(Array.isArray(result.uncertainty.limitations));
    // No signals → no evidence IDs → no limitations from registry
    assert.equal(result.uncertainty.limitations.length, 0);
  });

  it('includes evidence_strength in allowed values', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.ok(['strong', 'moderate', 'limited'].includes(result.uncertainty.evidence_strength),
      `evidence_strength must be strong/moderate/limited, got: ${result.uncertainty.evidence_strength}`);
  });

  it('returns strong evidence_strength when all signals are validated', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.uncertainty.evidence_strength, 'strong',
      'all validated signals should yield strong evidence_strength');
  });

  it('includes model_spread with description field', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.ok(typeof result.uncertainty.model_spread === 'object');
    assert.ok(typeof result.uncertainty.model_spread.description === 'string');
    assert.ok(result.uncertainty.model_spread.description.length > 0);
  });

  it('model_spread includes p10 and p90 when uncertainty_spread is present in traceability', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })]; // makeSignal adds p10:15, p90:25
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.uncertainty.model_spread.p10, 15);
    assert.equal(result.uncertainty.model_spread.p90, 25);
    assert.equal(result.uncertainty.model_spread.model_count, 49);
  });
});

// ─── FASE E — Validation ─────────────────────────────────────────────────────

describe('FASE E — Invariant validation', () => {

  it('validation_passed is true for standard signals', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.validation.validation_passed, true);
  });

  it('has_scores is false', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.validation.has_scores, false);
  });

  it('has_urgency is false', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.validation.has_urgency, false);
  });

  it('has_financial_impacts is false', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.validation.has_financial_impacts, false);
  });

  it('has_invented_numbers is false', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(result.validation.has_invented_numbers, false);
  });

  it('output JSON contains no risk_score field', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    assert.equal(JSON.stringify(result).includes('risk_score'), false);
  });

  it('no financial impact data in interpretation texts', () => {
    const signals = [makeSignal({ signalType: 'extreme_heat', delta: 15 })];
    const result  = interpretSignals({ signals }, makeFused());
    // validation flag must be false
    assert.equal(result.validation.has_financial_impacts, false);
    // interpretation texts must not contain financial/cost language
    const interpText = result.interpretations.map(i => i.text).join(' ').toLowerCase();
    assert.equal(/impacto\s+financiero|p[eé]rdida\s+econ[oó]mica|costo\s+estimado|\busd\b/i.test(interpText), false,
      'interpretation texts must not contain financial language');
    // output must not contain Layer3 financial_impact_range field
    assert.equal(JSON.stringify(result).includes('financial_impact_range'), false);
  });

  it('output JSON contains no urgencia / urgente strings', () => {
    const signals = [makeSignal({ signalType: 'flood_risk', projected: 0.5, delta: null })];
    const result  = interpretSignals({ signals }, makeFused());
    const text = result.interpretations.map(i => i.text).join(' ').toLowerCase();
    assert.equal(text.includes('urgente'), false, 'urgency language must not appear in text');
  });
});

// ─── Output structure ─────────────────────────────────────────────────────────

describe('Output structure', () => {

  it('returns all top-level fields', () => {
    const result = interpretSignals({ signals: [] }, makeFused());
    assert.ok('signal_groups'    in result);
    assert.ok('context'          in result);
    assert.ok('interpretations'  in result);
    assert.ok('uncertainty'      in result);
    assert.ok('validation'       in result);
    assert.ok('generated_at'     in result);
  });

  it('generated_at is a valid ISO date string', () => {
    const result = interpretSignals({ signals: [] }, makeFused());
    assert.ok(typeof result.generated_at === 'string');
    assert.ok(!isNaN(new Date(result.generated_at).getTime()), 'generated_at must parse as valid date');
  });

  it('handles null signalOutput gracefully', () => {
    assert.doesNotThrow(() => interpretSignals(null, makeFused()));
  });

  it('handles null fusedData gracefully', () => {
    assert.doesNotThrow(() => interpretSignals({ signals: [] }, null));
  });

  it('handles completely empty inputs gracefully', () => {
    assert.doesNotThrow(() => interpretSignals({}, {}));
  });
});

// ─── Integration — compound scenario ─────────────────────────────────────────

describe('Integration — compound precipitation + terrain + ENSO scenario (El Niño)', () => {

  it('produces complete structured output with compound interpretations', () => {
    const signals = [
      makeSignal({ signalType: 'extreme_rain',   indicator: 'rx5day',       delta: null, delta_pct: 30 }),
      makeSignal({ signalType: 'flood_risk',     indicator: 'flood_probability', projected: 0.45, delta: null }),
      makeSignal({ signalType: 'landslide_risk', indicator: 'slope_degrees', projected: 28, delta: null }),
      makeSignal({ signalType: 'huayco_risk',    indicator: 'terrain_huayco', projected: 0.8, delta: null }),
      makeSignal({ signalType: 'enso_phase',     indicator: 'oni', projected: 1.4, delta: 1.4, delta_pct: null }),
    ];
    const fused = makeFused({
      scenario: 'ssp585',
      ensoData: { phase: 'el_nino', oni_latest: 1.4 },
      terrainData: { slope_degrees: 28, terrain_region: 'ladera andina norteña', susceptibility: 'alta', huayco_risk: 'alto' },
    });

    const result = interpretSignals({ signals }, fused);

    // Structure
    assert.ok(Array.isArray(result.signal_groups));
    assert.ok(Array.isArray(result.interpretations));
    assert.ok(typeof result.context === 'object');
    assert.ok(typeof result.uncertainty === 'object');
    assert.ok(typeof result.validation === 'object');

    // Groups
    assert.ok(result.signal_groups.find(g => g.group_id === 'precipitation_intensity'));
    assert.ok(result.signal_groups.find(g => g.group_id === 'terrain_instability'));
    assert.ok(result.signal_groups.find(g => g.group_id === 'climate_mode'));

    // At least one compound interpretation
    const compounds = result.interpretations.filter(i => i.type === 'compound');
    assert.ok(compounds.length >= 1, 'must have at least one compound interpretation');

    // Validation passes
    assert.equal(result.validation.validation_passed, true);

    // No forbidden content
    const json = JSON.stringify(result);
    assert.equal(json.includes('risk_score'),             false);
    assert.equal(json.includes('financial_impact_range'), false);
    assert.equal(json.includes('urgente'),                false);
  });
});
