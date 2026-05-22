/**
 * Regression tests — Layer8 Historical Climate Engine (Sprint 8)
 *
 * Validates:
 *   FASE A — Event catalog structure and taxonomy
 *   FASE B — Threshold validation (authority, value, exceeds_explanation)
 *   FASE C — Traceability (source, date, temporal/spatial resolution)
 *   FASE D — Query functions (getHistoricalEventsByType, getHistoricalEventsByRegion)
 *   FASE E — buildHistoricalContext() output shape and signal matching
 *   FASE F — Integration invariants
 *
 * All inputs are deterministic synthetic objects. No DB or network calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORICAL_EVENTS,
  EVENT_TYPES,
  getHistoricalEventsByType,
  getHistoricalEventsByRegion,
  buildHistoricalContext,
  getThresholdFields,
} from '../../server/scientific/historical.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSignalOutput(signalTypes = []) {
  return {
    signals: signalTypes.map(st => ({ signalType: st })),
  };
}

function makeFused({ ensoPhase = null } = {}) {
  return {
    ensoData:    ensoPhase ? { phase: ensoPhase, oni: ensoPhase === 'el_nino' ? 1.4 : -1.2 } : null,
    terrainData: null,
  };
}

// ─── FASE A — Event Catalog Structure ────────────────────────────────────────

describe('FASE A — Event catalog structure', () => {

  it('HISTORICAL_EVENTS is a non-empty array', () => {
    assert.ok(Array.isArray(HISTORICAL_EVENTS));
    assert.ok(HISTORICAL_EVENTS.length > 0, 'catalog must have events');
  });

  it('HISTORICAL_EVENTS has at least 18 events', () => {
    assert.ok(HISTORICAL_EVENTS.length >= 18, `expected >= 18, got ${HISTORICAL_EVENTS.length}`);
  });

  it('all events have required string fields', () => {
    const required = ['id', 'event_type', 'label', 'description', 'date_start',
                      'temporal_resolution', 'spatial_resolution', 'region',
                      'observed_unit', 'threshold_unit', 'threshold_authority',
                      'threshold_description', 'exceeds_explanation', 'source', 'source_id', 'reference'];
    for (const evt of HISTORICAL_EVENTS) {
      for (const field of required) {
        assert.ok(
          typeof evt[field] === 'string' && evt[field].length > 0,
          `event ${evt.id}: field "${field}" must be a non-empty string`
        );
      }
    }
  });

  it('all events have numeric observed_value and threshold_value', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.equal(typeof evt.observed_value, 'number', `event ${evt.id}: observed_value must be number`);
      assert.equal(typeof evt.threshold_value, 'number', `event ${evt.id}: threshold_value must be number`);
    }
  });

  it('all events have boolean exceeds_threshold', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.equal(typeof evt.exceeds_threshold, 'boolean', `event ${evt.id}: exceeds_threshold must be boolean`);
    }
  });

  it('all event_types are keys in EVENT_TYPES', () => {
    const knownTypes = new Set(Object.keys(EVENT_TYPES));
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(knownTypes.has(evt.event_type), `event ${evt.id}: unknown event_type "${evt.event_type}"`);
    }
  });

  it('all event ids are unique', () => {
    const ids = HISTORICAL_EVENTS.map(e => e.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'duplicate event IDs found');
  });

  it('EVENT_TYPES contains all 5 required categories', () => {
    const required = ['extreme_rain', 'enso', 'thermal_anomaly', 'landslide', 'drought'];
    for (const cat of required) {
      assert.ok(cat in EVENT_TYPES, `EVENT_TYPES missing category "${cat}"`);
    }
  });

  it('each EVENT_TYPE category has at least 2 events in catalog', () => {
    for (const type of Object.keys(EVENT_TYPES)) {
      const count = HISTORICAL_EVENTS.filter(e => e.event_type === type).length;
      assert.ok(count >= 2, `event_type "${type}" has only ${count} events — need >= 2`);
    }
  });

  it('catalog contains at least 3 ENSO events', () => {
    const count = HISTORICAL_EVENTS.filter(e => e.event_type === 'enso').length;
    assert.ok(count >= 3, `expected >= 3 ENSO events, got ${count}`);
  });

});

// ─── FASE B — Threshold Validation ───────────────────────────────────────────

describe('FASE B — Threshold validation', () => {

  it('getThresholdFields() returns the required 5 fields', () => {
    const fields = getThresholdFields();
    assert.ok(Array.isArray(fields));
    assert.ok(fields.includes('threshold_value'));
    assert.ok(fields.includes('threshold_unit'));
    assert.ok(fields.includes('threshold_authority'));
    assert.ok(fields.includes('threshold_description'));
    assert.ok(fields.includes('exceeds_explanation'));
  });

  it('all events have a non-empty exceeds_explanation', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        typeof evt.exceeds_explanation === 'string' && evt.exceeds_explanation.length > 20,
        `event ${evt.id}: exceeds_explanation too short or missing`
      );
    }
  });

  it('exceeds_explanation contains at least one number or unit', () => {
    // Explanations must be grounded in observed values
    const numOrUnit = /\d|°C|mm|%|m\.s\.n\.m/;
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        numOrUnit.test(evt.exceeds_explanation),
        `event ${evt.id}: exceeds_explanation has no numeric value or unit`
      );
    }
  });

  it('exceeds_explanation contains a threshold authority reference', () => {
    // Each explanation should mention either the authority name or a threshold concept
    for (const evt of HISTORICAL_EVENTS) {
      const hasRef = evt.threshold_authority.split('/').some(auth =>
        evt.exceeds_explanation.includes(auth.trim().split(' ')[0])
      );
      assert.ok(hasRef, `event ${evt.id}: exceeds_explanation does not reference threshold authority`);
    }
  });

  it('events with exceeds_threshold:true have non-empty explanation', () => {
    const trueEvents = HISTORICAL_EVENTS.filter(e => e.exceeds_threshold === true);
    for (const evt of trueEvents) {
      assert.ok(evt.exceeds_explanation.length > 20, `event ${evt.id}: must have detailed explanation when exceeds_threshold is true`);
    }
  });

  it('events with exceeds_threshold:false still have an explanation', () => {
    const falseEvents = HISTORICAL_EVENTS.filter(e => e.exceeds_threshold === false);
    for (const evt of falseEvents) {
      assert.ok(evt.exceeds_explanation.length > 10, `event ${evt.id}: must have explanation even when exceeds_threshold is false`);
    }
  });

  it('all El Niño ENSO events have observed_value > 0', () => {
    const elNinos = HISTORICAL_EVENTS.filter(e =>
      e.event_type === 'enso' && e.label.includes('El Niño') && !e.label.includes('La Niña')
    );
    assert.ok(elNinos.length > 0, 'must have El Niño events');
    for (const evt of elNinos) {
      assert.ok(evt.observed_value > 0, `event ${evt.id}: El Niño must have positive observed_value`);
    }
  });

  it('all La Niña ENSO events have observed_value < 0', () => {
    const laNinas = HISTORICAL_EVENTS.filter(e =>
      e.event_type === 'enso' && e.label.includes('La Niña')
    );
    assert.ok(laNinas.length > 0, 'must have La Niña events');
    for (const evt of laNinas) {
      assert.ok(evt.observed_value < 0, `event ${evt.id}: La Niña must have negative observed_value`);
    }
  });

  it('all El Niño ENSO events have exceeds_threshold:true', () => {
    const elNinos = HISTORICAL_EVENTS.filter(e =>
      e.event_type === 'enso' && e.observed_value > 0
    );
    for (const evt of elNinos) {
      assert.ok(evt.exceeds_threshold === true, `event ${evt.id}: El Niño event must exceed threshold`);
    }
  });

  it('all La Niña ENSO events have exceeds_threshold:true', () => {
    const laNinas = HISTORICAL_EVENTS.filter(e =>
      e.event_type === 'enso' && e.observed_value < 0
    );
    for (const evt of laNinas) {
      assert.ok(evt.exceeds_threshold === true, `event ${evt.id}: La Niña event must exceed threshold`);
    }
  });

  it('threshold_description is > 30 characters for all events', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        evt.threshold_description.length > 30,
        `event ${evt.id}: threshold_description too short (${evt.threshold_description.length} chars)`
      );
    }
  });

});

// ─── FASE C — Traceability ───────────────────────────────────────────────────

describe('FASE C — Traceability', () => {

  const VALID_TEMPORAL = new Set(['daily', 'monthly', 'annual']);
  const VALID_SPATIAL  = new Set(['point', 'local', 'regional', 'national']);
  const DATE_PATTERN   = /^\d{4}(-\d{2}(-\d{2})?)?$/;

  it('all events have temporal_resolution in valid set', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        VALID_TEMPORAL.has(evt.temporal_resolution),
        `event ${evt.id}: invalid temporal_resolution "${evt.temporal_resolution}"`
      );
    }
  });

  it('all events have spatial_resolution in valid set', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        VALID_SPATIAL.has(evt.spatial_resolution),
        `event ${evt.id}: invalid spatial_resolution "${evt.spatial_resolution}"`
      );
    }
  });

  it('all events have date_start in YYYY, YYYY-MM, or YYYY-MM-DD format', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        DATE_PATTERN.test(evt.date_start),
        `event ${evt.id}: invalid date_start "${evt.date_start}"`
      );
    }
  });

  it('all events have a non-empty source', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        typeof evt.source === 'string' && evt.source.length > 5,
        `event ${evt.id}: source is missing or too short`
      );
    }
  });

  it('all events have a non-empty reference', () => {
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        typeof evt.reference === 'string' && evt.reference.length > 10,
        `event ${evt.id}: reference is missing or too short`
      );
    }
  });

  it('all source_ids reference known evidence keys', () => {
    const knownSources = new Set(['CMIP6_CCKP', 'GRI_OXFORD', 'WRI_AQUEDUCT', 'NOAA_ENSO', 'NASA_SRTM', 'OPEN_METEO', 'WORLD_BANK']);
    for (const evt of HISTORICAL_EVENTS) {
      assert.ok(
        knownSources.has(evt.source_id),
        `event ${evt.id}: unknown source_id "${evt.source_id}"`
      );
    }
  });

  it('ENSO events use NOAA_ENSO as source_id', () => {
    const ensoEvents = HISTORICAL_EVENTS.filter(e => e.event_type === 'enso');
    for (const evt of ensoEvents) {
      assert.equal(evt.source_id, 'NOAA_ENSO', `ENSO event ${evt.id} should use NOAA_ENSO source_id`);
    }
  });

  it('landslide events use NASA_SRTM as source_id', () => {
    const ls = HISTORICAL_EVENTS.filter(e => e.event_type === 'landslide');
    for (const evt of ls) {
      assert.equal(evt.source_id, 'NASA_SRTM', `landslide event ${evt.id} should use NASA_SRTM source_id`);
    }
  });

});

// ─── FASE D — Query Functions ─────────────────────────────────────────────────

describe('FASE D — Query functions', () => {

  it('getHistoricalEventsByType("enso") returns only ENSO events', () => {
    const result = getHistoricalEventsByType('enso');
    assert.ok(result.length > 0, 'must return ENSO events');
    for (const e of result) {
      assert.equal(e.event_type, 'enso', 'all returned events must be type enso');
    }
  });

  it('getHistoricalEventsByType("extreme_rain") returns only extreme_rain events', () => {
    const result = getHistoricalEventsByType('extreme_rain');
    assert.ok(result.length > 0, 'must return extreme_rain events');
    for (const e of result) {
      assert.equal(e.event_type, 'extreme_rain');
    }
  });

  it('getHistoricalEventsByType("thermal_anomaly") returns only thermal_anomaly events', () => {
    const result = getHistoricalEventsByType('thermal_anomaly');
    assert.ok(result.length > 0);
    for (const e of result) assert.equal(e.event_type, 'thermal_anomaly');
  });

  it('getHistoricalEventsByType("landslide") returns only landslide events', () => {
    const result = getHistoricalEventsByType('landslide');
    assert.ok(result.length > 0);
    for (const e of result) assert.equal(e.event_type, 'landslide');
  });

  it('getHistoricalEventsByType("drought") returns only drought events', () => {
    const result = getHistoricalEventsByType('drought');
    assert.ok(result.length > 0);
    for (const e of result) assert.equal(e.event_type, 'drought');
  });

  it('getHistoricalEventsByType("unknown") returns empty array', () => {
    const result = getHistoricalEventsByType('unknown_type');
    assert.deepEqual(result, []);
  });

  it('getHistoricalEventsByRegion("costa_norte") returns costa_norte + nacional events', () => {
    const result = getHistoricalEventsByRegion('costa_norte');
    assert.ok(result.length > 0);
    for (const e of result) {
      assert.ok(
        e.region === 'costa_norte' || e.region === 'nacional',
        `unexpected region "${e.region}" for costa_norte query`
      );
    }
  });

  it('getHistoricalEventsByRegion("sierra_sur") returns sierra_sur + nacional events', () => {
    const result = getHistoricalEventsByRegion('sierra_sur');
    assert.ok(result.length > 0);
    for (const e of result) {
      assert.ok(e.region === 'sierra_sur' || e.region === 'nacional');
    }
  });

  it('getHistoricalEventsByRegion("amazonia") returns amazonia + nacional events', () => {
    const result = getHistoricalEventsByRegion('amazonia');
    assert.ok(result.length > 0);
    for (const e of result) {
      assert.ok(e.region === 'amazonia' || e.region === 'nacional');
    }
  });

  it('getHistoricalEventsByRegion("nonexistent_region") returns only nacional events', () => {
    const result = getHistoricalEventsByRegion('nonexistent_region');
    for (const e of result) {
      assert.equal(e.region, 'nacional', 'only nacional events should match unknown region');
    }
  });

  it('getHistoricalEventsByType and getHistoricalEventsByRegion do not mutate the catalog', () => {
    const before = HISTORICAL_EVENTS.length;
    getHistoricalEventsByType('enso');
    getHistoricalEventsByRegion('costa_norte');
    assert.equal(HISTORICAL_EVENTS.length, before, 'catalog length must not change after queries');
  });

});

// ─── FASE E — buildHistoricalContext ─────────────────────────────────────────

describe('FASE E — buildHistoricalContext()', () => {

  it('returns expected output shape', () => {
    const result = buildHistoricalContext(makeSignalOutput([]), makeFused());
    assert.ok('relevant_events'      in result, 'must have relevant_events');
    assert.ok('enso_context'         in result, 'must have enso_context');
    assert.ok('threshold_context'    in result, 'must have threshold_context');
    assert.ok('total_events_matched' in result, 'must have total_events_matched');
    assert.ok('generated_at'         in result, 'must have generated_at');
  });

  it('relevant_events is an array', () => {
    const result = buildHistoricalContext(makeSignalOutput([]), makeFused());
    assert.ok(Array.isArray(result.relevant_events));
  });

  it('relevant_events has at most 8 items', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['extreme_rain', 'drought', 'extreme_heat', 'landslide_risk', 'enso_phase']),
      makeFused({ ensoPhase: 'el_nino' })
    );
    assert.ok(result.relevant_events.length <= 8, `expected <= 8, got ${result.relevant_events.length}`);
  });

  it('with extreme_rain signal → includes extreme_rain events', () => {
    const result = buildHistoricalContext(makeSignalOutput(['extreme_rain']), makeFused());
    const hasRain = result.relevant_events.some(e => e.event_type === 'extreme_rain');
    assert.ok(hasRain, 'must include extreme_rain events when signal is extreme_rain');
  });

  it('with flood_risk signal → includes extreme_rain events', () => {
    const result = buildHistoricalContext(makeSignalOutput(['flood_risk']), makeFused());
    const hasRain = result.relevant_events.some(e => e.event_type === 'extreme_rain');
    assert.ok(hasRain, 'flood_risk signal must pull extreme_rain events');
  });

  it('with drought signal → includes drought events', () => {
    const result = buildHistoricalContext(makeSignalOutput(['drought']), makeFused());
    const hasDrought = result.relevant_events.some(e => e.event_type === 'drought');
    assert.ok(hasDrought, 'must include drought events when signal is drought');
  });

  it('with landslide_risk signal → includes landslide events', () => {
    const result = buildHistoricalContext(makeSignalOutput(['landslide_risk']), makeFused());
    const hasLandslide = result.relevant_events.some(e => e.event_type === 'landslide');
    assert.ok(hasLandslide, 'must include landslide events when signal is landslide_risk');
  });

  it('with huayco_risk signal → includes landslide events', () => {
    const result = buildHistoricalContext(makeSignalOutput(['huayco_risk']), makeFused());
    const hasLandslide = result.relevant_events.some(e => e.event_type === 'landslide');
    assert.ok(hasLandslide, 'huayco_risk must map to landslide events');
  });

  it('with heat signal → includes thermal_anomaly events', () => {
    const result = buildHistoricalContext(makeSignalOutput(['extreme_heat']), makeFused());
    const hasThermal = result.relevant_events.some(e => e.event_type === 'thermal_anomaly');
    assert.ok(hasThermal, 'extreme_heat must pull thermal_anomaly events');
  });

  it('with temp_increase signal → includes thermal_anomaly events', () => {
    const result = buildHistoricalContext(makeSignalOutput(['temp_increase']), makeFused());
    const hasThermal = result.relevant_events.some(e => e.event_type === 'thermal_anomaly');
    assert.ok(hasThermal, 'temp_increase must pull thermal_anomaly events');
  });

  it('empty signals still returns enso events (always included)', () => {
    const result = buildHistoricalContext(makeSignalOutput([]), makeFused());
    const hasEnso = result.relevant_events.some(e => e.event_type === 'enso');
    assert.ok(hasEnso, 'ENSO events must always be included even with empty signals');
  });

  it('with El Niño phase → El Niño events appear before La Niña events in relevant_events', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['enso_phase']),
      makeFused({ ensoPhase: 'el_nino' })
    );
    const ensoInResult = result.relevant_events.filter(e => e.event_type === 'enso');
    if (ensoInResult.length >= 2) {
      const firstIsElNino = ensoInResult[0].observed_value > 0;
      assert.ok(firstIsElNino, 'first ENSO event should be El Niño when current phase is el_nino');
    }
  });

  it('with La Niña phase → La Niña events appear before El Niño events', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['enso_phase']),
      makeFused({ ensoPhase: 'la_nina' })
    );
    const ensoInResult = result.relevant_events.filter(e => e.event_type === 'enso');
    if (ensoInResult.length >= 2) {
      const firstIsLaNina = ensoInResult[0].observed_value < 0;
      assert.ok(firstIsLaNina, 'first ENSO event should be La Niña when current phase is la_nina');
    }
  });

  it('enso_context has required fields', () => {
    const result = buildHistoricalContext(makeSignalOutput([]), makeFused());
    const ec = result.enso_context;
    assert.ok('total_events_in_catalog' in ec);
    assert.ok('el_nino_count'           in ec);
    assert.ok('la_nina_count'           in ec);
    assert.ok('current_phase'           in ec);
    assert.ok('current_phase_match'     in ec);
  });

  it('enso_context.el_nino_count + la_nina_count <= total_events_in_catalog', () => {
    const result = buildHistoricalContext(makeSignalOutput([]), makeFused());
    const ec = result.enso_context;
    assert.ok(
      ec.el_nino_count + ec.la_nina_count <= ec.total_events_in_catalog,
      'el_nino + la_nina counts should not exceed total'
    );
  });

  it('threshold_context is an array of {authority, events_count} objects', () => {
    const result = buildHistoricalContext(makeSignalOutput(['extreme_rain']), makeFused());
    assert.ok(Array.isArray(result.threshold_context));
    for (const tc of result.threshold_context) {
      assert.ok('authority'    in tc, 'threshold_context item must have authority');
      assert.ok('events_count' in tc, 'threshold_context item must have events_count');
      assert.ok(typeof tc.events_count === 'number' && tc.events_count > 0);
    }
  });

  it('generated_at is a valid ISO 8601 timestamp', () => {
    const result = buildHistoricalContext(makeSignalOutput([]), makeFused());
    const parsed = new Date(result.generated_at);
    assert.ok(!isNaN(parsed.getTime()), 'generated_at must be a valid date');
    assert.ok(result.generated_at.includes('T'), 'generated_at must be ISO 8601');
  });

  it('null signalOutput defaults to empty signals (no crash)', () => {
    assert.doesNotThrow(() => buildHistoricalContext(null, null));
  });

  it('missing signals array defaults gracefully (no crash)', () => {
    assert.doesNotThrow(() => buildHistoricalContext({}, null));
  });

});

// ─── FASE F — Integration Invariants ─────────────────────────────────────────

describe('FASE F — Integration invariants', () => {

  it('total_events_matched does not exceed HISTORICAL_EVENTS.length', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['extreme_rain', 'drought', 'extreme_heat', 'landslide_risk']),
      makeFused()
    );
    assert.ok(
      result.total_events_matched <= HISTORICAL_EVENTS.length,
      'matched count cannot exceed catalog size'
    );
  });

  it('relevant_events.length <= total_events_matched', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['extreme_rain', 'drought']),
      makeFused()
    );
    assert.ok(
      result.relevant_events.length <= result.total_events_matched,
      'slice cannot exceed matched count'
    );
  });

  it('all relevant_events items have id, event_type, label, exceeds_explanation', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['extreme_rain', 'enso_phase', 'drought']),
      makeFused({ ensoPhase: 'el_nino' })
    );
    for (const e of result.relevant_events) {
      assert.ok(e.id,                 `relevant event missing id`);
      assert.ok(e.event_type,         `relevant event ${e.id} missing event_type`);
      assert.ok(e.label,              `relevant event ${e.id} missing label`);
      assert.ok(e.exceeds_explanation,`relevant event ${e.id} missing exceeds_explanation`);
    }
  });

  it('buildHistoricalContext does not mutate HISTORICAL_EVENTS catalog', () => {
    const before = HISTORICAL_EVENTS.length;
    buildHistoricalContext(makeSignalOutput(['extreme_rain']), makeFused({ ensoPhase: 'el_nino' }));
    assert.equal(HISTORICAL_EVENTS.length, before, 'catalog must not be mutated');
  });

  it('calling buildHistoricalContext twice with same input produces same relevant_events ids', () => {
    const signals = makeSignalOutput(['extreme_rain', 'drought']);
    const fused   = makeFused({ ensoPhase: 'el_nino' });
    const r1 = buildHistoricalContext(signals, fused);
    const r2 = buildHistoricalContext(signals, fused);
    const ids1 = r1.relevant_events.map(e => e.id);
    const ids2 = r2.relevant_events.map(e => e.id);
    assert.deepEqual(ids1, ids2, 'same input must produce same ordering (deterministic)');
  });

  it('enso_context.current_phase_match is 0 when phase is null', () => {
    const result = buildHistoricalContext(makeSignalOutput([]), makeFused());
    assert.equal(result.enso_context.current_phase,       null);
    assert.equal(result.enso_context.current_phase_match, 0);
  });

  it('enso_context.current_phase_match > 0 when El Niño phase active', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['enso_phase']),
      makeFused({ ensoPhase: 'el_nino' })
    );
    assert.ok(result.enso_context.current_phase_match > 0, 'must match El Niño events');
  });

  it('enso_context.current_phase_match > 0 when La Niña phase active', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['enso_phase']),
      makeFused({ ensoPhase: 'la_nina' })
    );
    assert.ok(result.enso_context.current_phase_match > 0, 'must match La Niña events');
  });

  it('no invented numbers — all observed values in relevant_events are finite numbers', () => {
    const result = buildHistoricalContext(
      makeSignalOutput(['extreme_rain', 'thermal_anomaly']),
      makeFused()
    );
    for (const e of result.relevant_events) {
      assert.ok(isFinite(e.observed_value), `event ${e.id}: observed_value must be finite`);
      assert.ok(isFinite(e.threshold_value),`event ${e.id}: threshold_value must be finite`);
    }
  });

});
