/**
 * Layer 9 — Projection Scenario Engine Tests
 *
 * Validates all FASE A–D invariants:
 *   SUITE A — Scenario Definitions structure and completeness
 *   SUITE B — Time Windows structure and year ranges
 *   SUITE C — Projection Data scientific validity + physical constraints
 *   SUITE D — buildProjectionContext output shape and completeness
 *   SUITE E — Narrative content: grounded numbers, no urgency, no financials
 *   SUITE F — Validation invariants + getProjectionForVariable lookup
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENARIO_DEFINITIONS,
  TIME_WINDOWS,
  PROJECTION_DATA,
  buildProjectionContext,
  getProjectionForVariable,
  validateProjection,
} from '../../server/scientific/projection.js';

// ─── Synthetic signal fixture ─────────────────────────────────────────────────

const makeSignal = (type, delta = 1.5, confidence = 'medium') => ({
  signalType:          type,
  detected:            true,
  delta,
  confidence,
  source_traceability: { confidence_level: confidence },
});

const mockSignalOutput = {
  signals: [
    makeSignal('extreme_heat',  12.0, 'medium'),
    makeSignal('temp_increase',  1.2, 'high'),
    makeSignal('extreme_rain',   8.5, 'medium'),
    makeSignal('drought',       -0.3, 'low'),
    makeSignal('enso_phase',     1.0, 'high'),
  ],
};

// ─── SUITE A — Scenario Definitions ──────────────────────────────────────────

describe('SUITE A — Scenario Definitions', () => {

  test('A01 — ssp245 exists in SCENARIO_DEFINITIONS', () => {
    assert.ok(SCENARIO_DEFINITIONS.ssp245, 'ssp245 must exist');
  });

  test('A02 — ssp585 exists in SCENARIO_DEFINITIONS', () => {
    assert.ok(SCENARIO_DEFINITIONS.ssp585, 'ssp585 must exist');
  });

  test('A03 — ssp245 has all required fields', () => {
    const s = SCENARIO_DEFINITIONS.ssp245;
    for (const field of ['id', 'label', 'name', 'description', 'warming_2100_range', 'warming_2100_median', 'badge', 'color_hint', 'ipcc_reference']) {
      assert.ok(s[field], `ssp245.${field} must be present and non-empty`);
    }
  });

  test('A04 — ssp585 has all required fields', () => {
    const s = SCENARIO_DEFINITIONS.ssp585;
    for (const field of ['id', 'label', 'name', 'description', 'warming_2100_range', 'warming_2100_median', 'badge', 'color_hint', 'ipcc_reference']) {
      assert.ok(s[field], `ssp585.${field} must be present and non-empty`);
    }
  });

  test('A05 — ssp245.id matches its key', () => {
    assert.equal(SCENARIO_DEFINITIONS.ssp245.id, 'ssp245');
  });

  test('A06 — ssp585.id matches its key', () => {
    assert.equal(SCENARIO_DEFINITIONS.ssp585.id, 'ssp585');
  });

  test('A07 — ssp245.badge is Moderado', () => {
    assert.equal(SCENARIO_DEFINITIONS.ssp245.badge, 'Moderado');
  });

  test('A08 — ssp585.badge is Alto', () => {
    assert.equal(SCENARIO_DEFINITIONS.ssp585.badge, 'Alto');
  });

  test('A09 — ssp245.color_hint is amber', () => {
    assert.equal(SCENARIO_DEFINITIONS.ssp245.color_hint, 'amber');
  });

  test('A10 — ssp585.color_hint is red', () => {
    assert.equal(SCENARIO_DEFINITIONS.ssp585.color_hint, 'red');
  });

  test('A11 — ipcc_reference contains IPCC for both scenarios', () => {
    assert.ok(SCENARIO_DEFINITIONS.ssp245.ipcc_reference.includes('IPCC'));
    assert.ok(SCENARIO_DEFINITIONS.ssp585.ipcc_reference.includes('IPCC'));
  });

  test('A12 — descriptions are substantive strings (> 30 chars)', () => {
    assert.ok(SCENARIO_DEFINITIONS.ssp245.description.length > 30);
    assert.ok(SCENARIO_DEFINITIONS.ssp585.description.length > 30);
  });

  test('A13 — warming_2100_range contains degree symbol for both scenarios', () => {
    assert.ok(SCENARIO_DEFINITIONS.ssp245.warming_2100_range.includes('°C'));
    assert.ok(SCENARIO_DEFINITIONS.ssp585.warming_2100_range.includes('°C'));
  });

});

// ─── SUITE B — Time Windows ───────────────────────────────────────────────────

describe('SUITE B — Time Windows', () => {

  test('B01 — near_term exists', () => {
    assert.ok(TIME_WINDOWS.near_term);
  });

  test('B02 — mid_term exists', () => {
    assert.ok(TIME_WINDOWS.mid_term);
  });

  test('B03 — far_term exists', () => {
    assert.ok(TIME_WINDOWS.far_term);
  });

  test('B04 — each window has id, label, description, years, horizon_key', () => {
    for (const [key, w] of Object.entries(TIME_WINDOWS)) {
      for (const field of ['id', 'label', 'description', 'years', 'horizon_key']) {
        assert.ok(w[field] !== undefined, `TIME_WINDOWS.${key}.${field} must exist`);
      }
    }
  });

  test('B05 — near_term.years is [2020, 2039]', () => {
    assert.deepEqual(TIME_WINDOWS.near_term.years, [2020, 2039]);
  });

  test('B06 — mid_term.years is [2040, 2059]', () => {
    assert.deepEqual(TIME_WINDOWS.mid_term.years, [2040, 2059]);
  });

  test('B07 — far_term.years is [2060, 2079]', () => {
    assert.deepEqual(TIME_WINDOWS.far_term.years, [2060, 2079]);
  });

  test('B08 — labels follow YYYY–YYYY format', () => {
    const pattern = /^\d{4}–\d{4}$/;
    for (const [key, w] of Object.entries(TIME_WINDOWS)) {
      assert.ok(pattern.test(w.label), `TIME_WINDOWS.${key}.label must match YYYY–YYYY`);
    }
  });

  test('B09 — window ids match their keys', () => {
    for (const [key, w] of Object.entries(TIME_WINDOWS)) {
      assert.equal(w.id, key, `TIME_WINDOWS.${key}.id must match key`);
    }
  });

  test('B10 — years arrays have length 2', () => {
    for (const [key, w] of Object.entries(TIME_WINDOWS)) {
      assert.equal(w.years.length, 2, `TIME_WINDOWS.${key}.years must have length 2`);
    }
  });

  test('B11 — start year < end year for all windows', () => {
    for (const [key, w] of Object.entries(TIME_WINDOWS)) {
      assert.ok(w.years[0] < w.years[1], `TIME_WINDOWS.${key} start must be before end`);
    }
  });

});

// ─── SUITE C — Projection Data Structure ─────────────────────────────────────

describe('SUITE C — Projection Data Structure', () => {

  const VARIABLES    = ['temperature_mean', 'extreme_heat_days', 'precipitation_change', 'extreme_precipitation'];
  const SCENARIOS    = ['ssp245', 'ssp585'];
  const WINDOWS      = ['near_term', 'mid_term', 'far_term'];
  const WINDOW_ENTRY_FIELDS = ['median', 'p10', 'p90', 'confidence', 'n_models'];

  test('C01 — PROJECTION_DATA has all 4 expected variables', () => {
    for (const v of VARIABLES) {
      assert.ok(PROJECTION_DATA[v], `PROJECTION_DATA.${v} must exist`);
    }
  });

  test('C02 — each variable has label, unit, variable, source, reference', () => {
    for (const v of VARIABLES) {
      for (const field of ['label', 'unit', 'variable', 'source', 'reference']) {
        assert.ok(PROJECTION_DATA[v][field], `PROJECTION_DATA.${v}.${field} must be non-empty`);
      }
    }
  });

  test('C03 — each variable has both ssp245 and ssp585 data', () => {
    for (const v of VARIABLES) {
      for (const s of SCENARIOS) {
        assert.ok(PROJECTION_DATA[v][s], `PROJECTION_DATA.${v}.${s} must exist`);
      }
    }
  });

  test('C04 — each scenario has all 3 time windows per variable', () => {
    for (const v of VARIABLES) {
      for (const s of SCENARIOS) {
        for (const w of WINDOWS) {
          assert.ok(PROJECTION_DATA[v][s][w], `PROJECTION_DATA.${v}.${s}.${w} must exist`);
        }
      }
    }
  });

  test('C05 — each window entry has all required fields', () => {
    for (const v of VARIABLES) {
      for (const s of SCENARIOS) {
        for (const w of WINDOWS) {
          const entry = PROJECTION_DATA[v][s][w];
          for (const field of WINDOW_ENTRY_FIELDS) {
            assert.ok(entry[field] !== undefined, `PROJECTION_DATA.${v}.${s}.${w}.${field} must exist`);
          }
        }
      }
    }
  });

  test('C06 — confidence values are high, medium, or low', () => {
    const valid = new Set(['high', 'medium', 'low']);
    for (const v of VARIABLES) {
      for (const s of SCENARIOS) {
        for (const w of WINDOWS) {
          const conf = PROJECTION_DATA[v][s][w].confidence;
          assert.ok(valid.has(conf), `PROJECTION_DATA.${v}.${s}.${w}.confidence must be high/medium/low, got: ${conf}`);
        }
      }
    }
  });

  test('C07 — n_models >= 1 for all entries', () => {
    for (const v of VARIABLES) {
      for (const s of SCENARIOS) {
        for (const w of WINDOWS) {
          const n = PROJECTION_DATA[v][s][w].n_models;
          assert.ok(n >= 1, `PROJECTION_DATA.${v}.${s}.${w}.n_models must be >= 1, got: ${n}`);
        }
      }
    }
  });

  test('C08 — p10 < p90 for all entries', () => {
    for (const v of VARIABLES) {
      for (const s of SCENARIOS) {
        for (const w of WINDOWS) {
          const entry = PROJECTION_DATA[v][s][w];
          assert.ok(entry.p10 < entry.p90,
            `${v}.${s}.${w}: p10 (${entry.p10}) must be < p90 (${entry.p90})`);
        }
      }
    }
  });

  test('C09 — temperature_mean median > 0 for all entries (net warming)', () => {
    for (const s of SCENARIOS) {
      for (const w of WINDOWS) {
        const median = PROJECTION_DATA.temperature_mean[s][w].median;
        assert.ok(median > 0, `temperature_mean.${s}.${w}.median must be > 0, got: ${median}`);
      }
    }
  });

  test('C10 — temperature_mean p10 > 0 for all entries', () => {
    for (const s of SCENARIOS) {
      for (const w of WINDOWS) {
        const p10 = PROJECTION_DATA.temperature_mean[s][w].p10;
        assert.ok(p10 > 0, `temperature_mean.${s}.${w}.p10 must be > 0, got: ${p10}`);
      }
    }
  });

  test('C11 — extreme_heat_days median >= 0 for all entries', () => {
    for (const s of SCENARIOS) {
      for (const w of WINDOWS) {
        const median = PROJECTION_DATA.extreme_heat_days[s][w].median;
        assert.ok(median >= 0, `extreme_heat_days.${s}.${w}.median must be >= 0, got: ${median}`);
      }
    }
  });

  test('C12 — temperature_mean SSP585 > SSP245 median for all windows (physical constraint)', () => {
    for (const w of WINDOWS) {
      const t245 = PROJECTION_DATA.temperature_mean.ssp245[w].median;
      const t585 = PROJECTION_DATA.temperature_mean.ssp585[w].median;
      assert.ok(t585 > t245,
        `temperature_mean.${w}: SSP585 (${t585}) must be > SSP245 (${t245})`);
    }
  });

  test('C13 — extreme_heat_days SSP585 > SSP245 median for all windows', () => {
    for (const w of WINDOWS) {
      const h245 = PROJECTION_DATA.extreme_heat_days.ssp245[w].median;
      const h585 = PROJECTION_DATA.extreme_heat_days.ssp585[w].median;
      assert.ok(h585 > h245,
        `extreme_heat_days.${w}: SSP585 (${h585}) must be > SSP245 (${h245})`);
    }
  });

  test('C14 — temperature_mean increases from near to far term (both scenarios)', () => {
    for (const s of SCENARIOS) {
      const near = PROJECTION_DATA.temperature_mean[s].near_term.median;
      const mid  = PROJECTION_DATA.temperature_mean[s].mid_term.median;
      const far  = PROJECTION_DATA.temperature_mean[s].far_term.median;
      assert.ok(near < mid, `temperature_mean.${s}: near (${near}) must be < mid (${mid})`);
      assert.ok(mid  < far, `temperature_mean.${s}: mid (${mid}) must be < far (${far})`);
    }
  });

  test('C15 — extreme_heat_days increases from near to far term (both scenarios)', () => {
    for (const s of SCENARIOS) {
      const near = PROJECTION_DATA.extreme_heat_days[s].near_term.median;
      const mid  = PROJECTION_DATA.extreme_heat_days[s].mid_term.median;
      const far  = PROJECTION_DATA.extreme_heat_days[s].far_term.median;
      assert.ok(near < mid, `extreme_heat_days.${s}: near (${near}) must be < mid (${mid})`);
      assert.ok(mid  < far, `extreme_heat_days.${s}: mid (${mid}) must be < far (${far})`);
    }
  });

  test('C16 — precipitation_change note present (signals high uncertainty)', () => {
    assert.ok(PROJECTION_DATA.precipitation_change.note, 'precipitation_change must have a note about uncertainty');
    assert.ok(PROJECTION_DATA.precipitation_change.note.length > 10);
  });

  test('C17 — temperature_mean confidence is high for all entries', () => {
    for (const s of SCENARIOS) {
      for (const w of WINDOWS) {
        assert.equal(PROJECTION_DATA.temperature_mean[s][w].confidence, 'high',
          `temperature_mean.${s}.${w} confidence must be high`);
      }
    }
  });

  test('C18 — precipitation_change confidence is low for all entries', () => {
    for (const s of SCENARIOS) {
      for (const w of WINDOWS) {
        assert.equal(PROJECTION_DATA.precipitation_change[s][w].confidence, 'low',
          `precipitation_change.${s}.${w} confidence must be low`);
      }
    }
  });

});

// ─── SUITE D — buildProjectionContext output shape ────────────────────────────

describe('SUITE D — buildProjectionContext output shape', () => {

  let ctx;
  test('D01 — buildProjectionContext returns an object', () => {
    ctx = buildProjectionContext(mockSignalOutput);
    assert.equal(typeof ctx, 'object');
    assert.ok(ctx !== null);
  });

  test('D02 — output has all top-level keys', () => {
    const required = ['scenarios', 'time_windows', 'projections', 'narratives',
                      'active_signal_count', 'uncertainty', 'validation', 'generated_at'];
    for (const key of required) {
      assert.ok(ctx[key] !== undefined, `output.${key} must exist`);
    }
  });

  test('D03 — output.scenarios has ssp245 and ssp585', () => {
    assert.ok(ctx.scenarios.ssp245);
    assert.ok(ctx.scenarios.ssp585);
  });

  test('D04 — output.time_windows has all 3 windows', () => {
    assert.ok(ctx.time_windows.near_term);
    assert.ok(ctx.time_windows.mid_term);
    assert.ok(ctx.time_windows.far_term);
  });

  test('D05 — output.projections has ssp245 and ssp585', () => {
    assert.ok(ctx.projections.ssp245);
    assert.ok(ctx.projections.ssp585);
  });

  test('D06 — output.projections.ssp245 has all 3 windows', () => {
    assert.ok(ctx.projections.ssp245.near_term);
    assert.ok(ctx.projections.ssp245.mid_term);
    assert.ok(ctx.projections.ssp245.far_term);
  });

  test('D07 — output.projections.ssp245.near_term has all 4 variables', () => {
    const nt = ctx.projections.ssp245.near_term;
    for (const v of ['temperature_mean', 'extreme_heat_days', 'precipitation_change', 'extreme_precipitation']) {
      assert.ok(nt[v], `projections.ssp245.near_term.${v} must exist`);
    }
  });

  test('D08 — each projection entry has median, p10, p90, confidence, n_models', () => {
    const entry = ctx.projections.ssp585.far_term.temperature_mean;
    for (const field of ['median', 'p10', 'p90', 'confidence', 'n_models']) {
      assert.ok(entry[field] !== undefined, `projection entry must have ${field}`);
    }
  });

  test('D09 — output.narratives is array of length 6', () => {
    assert.ok(Array.isArray(ctx.narratives));
    assert.equal(ctx.narratives.length, 6, 'must have 2 scenarios × 3 windows = 6 narratives');
  });

  test('D10 — each narrative has scenario, window, scenario_label, window_label, text, variables_cited, data_basis', () => {
    for (const n of ctx.narratives) {
      for (const field of ['scenario', 'window', 'scenario_label', 'window_label', 'text', 'variables_cited', 'data_basis']) {
        assert.ok(n[field] !== undefined, `narrative.${field} must exist`);
      }
    }
  });

  test('D11 — output.generated_at is a valid ISO date string', () => {
    assert.ok(typeof ctx.generated_at === 'string');
    assert.ok(!isNaN(new Date(ctx.generated_at).getTime()), 'generated_at must be parseable as a date');
  });

  test('D12 — output.uncertainty has required fields', () => {
    const u = ctx.uncertainty;
    assert.ok(u.overall_confidence);
    assert.ok(u.temperature_confidence);
    assert.ok(u.precipitation_confidence);
    assert.ok(u.notes);
  });

  test('D13 — output.uncertainty.temperature_confidence is high', () => {
    assert.equal(ctx.uncertainty.temperature_confidence, 'high');
  });

  test('D14 — output.uncertainty.precipitation_confidence is low', () => {
    assert.equal(ctx.uncertainty.precipitation_confidence, 'low');
  });

  test('D15 — output.active_signal_count equals projection-relevant signals in mockSignalOutput', () => {
    // mockSignalOutput has extreme_heat, temp_increase, extreme_rain, drought (4 projection signals)
    // enso_phase is NOT in PROJECTION_SIGNAL_TYPES
    assert.equal(ctx.active_signal_count, 4);
  });

  test('D16 — buildProjectionContext with empty signalOutput returns active_signal_count 0', () => {
    const emptyCtx = buildProjectionContext({});
    assert.equal(emptyCtx.active_signal_count, 0);
  });

  test('D17 — buildProjectionContext with no argument does not throw', () => {
    assert.doesNotThrow(() => buildProjectionContext());
  });

  test('D18 — narratives cover both scenarios', () => {
    const scenariosFound = new Set(ctx.narratives.map(n => n.scenario));
    assert.ok(scenariosFound.has('ssp245'));
    assert.ok(scenariosFound.has('ssp585'));
  });

  test('D19 — narratives cover all 3 windows', () => {
    const windowsFound = new Set(ctx.narratives.map(n => n.window));
    assert.ok(windowsFound.has('near_term'));
    assert.ok(windowsFound.has('mid_term'));
    assert.ok(windowsFound.has('far_term'));
  });

});

// ─── SUITE E — Narrative content validation ───────────────────────────────────

describe('SUITE E — Narrative content validation', () => {

  const ctx = buildProjectionContext(mockSignalOutput);

  test('E01 — each narrative text is a non-empty string', () => {
    for (const n of ctx.narratives) {
      assert.ok(typeof n.text === 'string' && n.text.length > 50,
        `narrative(${n.scenario},${n.window}).text must be a non-empty string`);
    }
  });

  test('E02 — each narrative text contains the scenario label', () => {
    for (const n of ctx.narratives) {
      const scenLabel = SCENARIO_DEFINITIONS[n.scenario].label;
      assert.ok(n.text.includes(scenLabel),
        `narrative(${n.scenario},${n.window}).text must contain "${scenLabel}"`);
    }
  });

  test('E03 — each narrative text contains the window label', () => {
    for (const n of ctx.narratives) {
      const winLabel = TIME_WINDOWS[n.window].label;
      assert.ok(n.text.includes(winLabel),
        `narrative(${n.scenario},${n.window}).text must contain "${winLabel}"`);
    }
  });

  test('E04 — ssp245 near_term narrative contains temperature median value (+1.0)', () => {
    const n = ctx.narratives.find(x => x.scenario === 'ssp245' && x.window === 'near_term');
    assert.ok(n.text.includes('+1.0°C'),
      `ssp245/near_term narrative must cite temperature median +1.0°C`);
  });

  test('E05 — ssp585 far_term narrative contains temperature median value (+3.2)', () => {
    const n = ctx.narratives.find(x => x.scenario === 'ssp585' && x.window === 'far_term');
    assert.ok(n.text.includes('+3.2°C'),
      `ssp585/far_term narrative must cite temperature median +3.2°C`);
  });

  test('E06 — ssp585 far_term narrative contains extreme heat days median (+55)', () => {
    const n = ctx.narratives.find(x => x.scenario === 'ssp585' && x.window === 'far_term');
    assert.ok(n.text.includes('+55'),
      `ssp585/far_term narrative must cite extreme heat days median +55`);
  });

  test('E07 — narratives contain confidence level text', () => {
    for (const n of ctx.narratives) {
      const hasConf = n.text.includes('confianza') || n.text.includes('confidence');
      assert.ok(hasConf, `narrative(${n.scenario},${n.window}) must mention confidence`);
    }
  });

  test('E08 — no urgency language in any narrative', () => {
    const urgencyWords = ['urgente', 'urgencia', 'inmediata acción', 'peligro inminente',
                          'catastrófico', 'emergencia climática'];
    for (const n of ctx.narratives) {
      for (const word of urgencyWords) {
        assert.ok(!n.text.toLowerCase().includes(word),
          `narrative(${n.scenario},${n.window}) must not contain urgency word: "${word}"`);
      }
    }
  });

  test('E09 — no financial figures in any narrative', () => {
    const financialPatterns = ['USD', 'dólares', 'millones', 'costo estimado', 'pérdidas económicas'];
    for (const n of ctx.narratives) {
      for (const pattern of financialPatterns) {
        assert.ok(!n.text.includes(pattern),
          `narrative(${n.scenario},${n.window}) must not contain financial term: "${pattern}"`);
      }
    }
  });

  test('E10 — variables_cited contains all 4 projection variables', () => {
    const expected = ['temperature_mean', 'extreme_heat_days', 'precipitation_change', 'extreme_precipitation'];
    for (const n of ctx.narratives) {
      for (const v of expected) {
        assert.ok(n.variables_cited.includes(v),
          `narrative(${n.scenario},${n.window}).variables_cited must include ${v}`);
      }
    }
  });

  test('E11 — data_basis contains all 4 variables', () => {
    const expected = ['temperature_mean', 'extreme_heat_days', 'precipitation_change', 'extreme_precipitation'];
    for (const n of ctx.narratives) {
      for (const v of expected) {
        assert.ok(n.data_basis[v] !== undefined,
          `narrative(${n.scenario},${n.window}).data_basis.${v} must exist`);
      }
    }
  });

  test('E12 — ssp245 narrative text differs from ssp585 for same window', () => {
    const n245 = ctx.narratives.find(x => x.scenario === 'ssp245' && x.window === 'mid_term');
    const n585 = ctx.narratives.find(x => x.scenario === 'ssp585' && x.window === 'mid_term');
    assert.notEqual(n245.text, n585.text, 'ssp245 and ssp585 mid_term narratives must differ');
  });

  test('E13 — each narrative references 1981–2014 as baseline', () => {
    for (const n of ctx.narratives) {
      assert.ok(n.text.includes('1981'), `narrative(${n.scenario},${n.window}) must reference baseline year 1981`);
    }
  });

  test('E14 — each narrative mentions the ensemble (CMIP6)', () => {
    for (const n of ctx.narratives) {
      assert.ok(n.text.includes('CMIP6'),
        `narrative(${n.scenario},${n.window}) must mention CMIP6 ensemble`);
    }
  });

});

// ─── SUITE F — validateProjection + getProjectionForVariable ─────────────────

describe('SUITE F — Validation + Lookup Helpers', () => {

  const ctx = buildProjectionContext(mockSignalOutput);

  test('F01 — validation_passed is true for built context', () => {
    assert.equal(ctx.validation.validation_passed, true);
  });

  test('F02 — validation has all flag fields', () => {
    const flags = ['has_scores', 'has_urgency', 'has_financial_impacts', 'has_duplicate_risks', 'validation_passed'];
    for (const flag of flags) {
      assert.ok(ctx.validation[flag] !== undefined, `validation.${flag} must exist`);
    }
  });

  test('F03 — has_urgency is false for clean context', () => {
    assert.equal(ctx.validation.has_urgency, false);
  });

  test('F04 — has_financial_impacts is false for clean context', () => {
    assert.equal(ctx.validation.has_financial_impacts, false);
  });

  test('F05 — has_scores is false for clean context', () => {
    assert.equal(ctx.validation.has_scores, false);
  });

  test('F06 — has_duplicate_risks is false for clean context', () => {
    assert.equal(ctx.validation.has_duplicate_risks, false);
  });

  test('F07 — validateProjection detects urgency language', () => {
    const dirtyOutput = {
      narratives: [{ text: 'Es urgente que se tomen medidas inmediatas.' }],
    };
    const v = validateProjection(dirtyOutput);
    assert.equal(v.has_urgency, true);
    assert.equal(v.validation_passed, false);
  });

  test('F08 — validateProjection detects financial language', () => {
    const dirtyOutput = {
      narratives: [{ text: 'Las pérdidas económicas ascenderían a 500 millones USD.' }],
    };
    const v = validateProjection(dirtyOutput);
    assert.equal(v.has_financial_impacts, true);
    assert.equal(v.validation_passed, false);
  });

  test('F09 — validateProjection detects score fields in output', () => {
    const dirtyOutput = {
      risk_score: 7.5,
      narratives: [{ text: 'Se proyecta un incremento térmico.' }],
    };
    const v = validateProjection(dirtyOutput);
    assert.equal(v.has_scores, true);
    assert.equal(v.validation_passed, false);
  });

  test('F10 — validateProjection detects duplicate Rx5day mentions', () => {
    const dirtyOutput = {
      narratives: [{ text: 'El Rx5day proyecta +5%. El Rx5day también aumentaría. El Rx5day confirma el incremento.' }],
    };
    const v = validateProjection(dirtyOutput);
    assert.equal(v.has_duplicate_risks, true);
    assert.equal(v.validation_passed, false);
  });

  test('F11 — getProjectionForVariable returns valid data for known inputs', () => {
    const data = getProjectionForVariable('temperature_mean', 'ssp245', 'near_term');
    assert.ok(data !== null);
    assert.equal(data.median, 1.0);
    assert.equal(data.confidence, 'high');
  });

  test('F12 — getProjectionForVariable returns correct SSP585 far_term temperature', () => {
    const data = getProjectionForVariable('temperature_mean', 'ssp585', 'far_term');
    assert.equal(data.median, 3.2);
    assert.equal(data.p10, 2.4);
    assert.equal(data.p90, 4.0);
  });

  test('F13 — getProjectionForVariable returns null for unknown variable', () => {
    const data = getProjectionForVariable('unknown_variable', 'ssp245', 'near_term');
    assert.equal(data, null);
  });

  test('F14 — getProjectionForVariable returns null for unknown scenario', () => {
    const data = getProjectionForVariable('temperature_mean', 'ssp999', 'near_term');
    assert.equal(data, null);
  });

  test('F15 — getProjectionForVariable returns null for unknown window', () => {
    const data = getProjectionForVariable('temperature_mean', 'ssp245', 'century_term');
    assert.equal(data, null);
  });

  test('F16 — extreme_precipitation ssp585 far_term has median 14', () => {
    const data = getProjectionForVariable('extreme_precipitation', 'ssp585', 'far_term');
    assert.equal(data.median, 14);
  });

  test('F17 — precipitation_change ssp585 far_term median is negative (net drying signal)', () => {
    const data = getProjectionForVariable('precipitation_change', 'ssp585', 'far_term');
    assert.ok(data.median < 0, `precipitation_change ssp585 far_term median must be negative, got: ${data.median}`);
  });

});
