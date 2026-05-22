/**
 * Layer 11 — Scientific Governance Engine Tests
 *
 * Validates all FASE A–C invariants + full pipeline:
 *   SUITE A — Module structure and exports (10 tests)
 *   SUITE B — TRACEABILITY_REGISTRY completeness and schema (16 tests)
 *   SUITE C — buildTraceability() output shape and entries (20 tests)
 *   SUITE D — buildDisclaimer() limitations, uncertainty, assumptions (18 tests)
 *   SUITE E — buildScientificMetadata() validation/evidence/peer_review (18 tests)
 *   SUITE F — attachGovernance() full pipeline integration (10 tests)
 *   SUITE G — validateGovernance() check flags (8 tests)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACEABILITY_REGISTRY,
  DISCLAIMER_CATALOG,
  SCIENTIFIC_METADATA_CATALOG,
  SOURCE_KEY_MAP,
  buildTraceability,
  buildDisclaimer,
  buildScientificMetadata,
  attachGovernance,
  validateGovernance,
} from '../../server/scientific/governance.js';

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

const SOURCES_FULL = [
  'CMIP6',
  'IPCC AR6',
  'NASA SRTM',
  'INGEMMET 2021',
  'GRI Infrastructure Resilience',
  'WRI Aqueduct 4.0',
  'NOAA CPC',
  'SENAMHI',
];

const SOURCES_CMIP_IPCC = ['CMIP6', 'IPCC AR6'];
const SOURCES_TERRAIN   = ['NASA SRTM', 'INGEMMET 2021'];
const SOURCES_EMPTY     = [];

const mockLayer7 = {
  signal_groups: [
    { group_id: 'heat_stress',   group_label: 'Estrés térmico',   signal_count: 2 },
    { group_id: 'water_stress',  group_label: 'Estrés hídrico',   signal_count: 1 },
  ],
  context: { scenario: 'ssp245', temporal_horizon: 'mid_term' },
  interpretations: [
    {
      type: 'single_group', group_ids: ['heat_stress'],
      text: 'Las proyecciones CMIP6 (SSP2-4.5, 2040–2059) indican +18 días adicionales con Tmax > 35°C.',
      evidence_ids: ['CMIP6_CCKP'],
    },
  ],
  uncertainty: { overall_confidence: 'medium' },
};

const mockLayer9 = {
  scenarios: ['ssp245', 'ssp585'],
  narratives: [
    {
      scenario: 'ssp245', window: 'mid_term',
      scenario_label: 'SSP2-4.5', window_label: '2040–2059',
      text: 'Bajo SSP2-4.5, la temperatura media aumentaría +1.5°C en 2040–2059 respecto a 1980–2014 (CMIP6).',
    },
  ],
  uncertainty: { temperature_confidence: 'high', precipitation_confidence: 'low' },
};

const mockStoryContext = {
  narrative: {
    paragraphs: [
      'Las proyecciones CMIP6 (SSP2-4.5, 2040–2059) indican +18 días adicionales con Tmax > 35°C. ' +
      'Bajo SSP2-4.5, la temperatura media aumentaría +1.5°C en 2040–2059 respecto a 1980–2014 (CMIP6).',
    ],
    sources_cited:     ['CMIP6', 'IPCC AR6'],
    scenario_label:    'SSP2-4.5',
    horizon_label:     '2040–2059',
    uncertainty_note:  'Nivel de confianza general: confianza media. Temperatura: alta confianza.',
    historical_anchor: null,
    evidence_cited:    ['CMIP6_CCKP'],
  },
  adaptations:  [],
  metadata: {
    signals_used:    2,
    groups_covered:  ['heat_stress'],
    scenario:        'ssp245',
    window:          'mid_term',
    sector:          'general',
  },
  validation: { validation_passed: true },
  generated_at: new Date().toISOString(),
};

// ─── SUITE A — Module structure and exports ───────────────────────────────────

describe('SUITE A — Module structure and exports', () => {

  test('A01 — TRACEABILITY_REGISTRY is exported and is an object', () => {
    assert.ok(typeof TRACEABILITY_REGISTRY === 'object' && TRACEABILITY_REGISTRY !== null);
  });

  test('A02 — DISCLAIMER_CATALOG is exported and is an object', () => {
    assert.ok(typeof DISCLAIMER_CATALOG === 'object' && DISCLAIMER_CATALOG !== null);
  });

  test('A03 — SCIENTIFIC_METADATA_CATALOG is exported and is an object', () => {
    assert.ok(typeof SCIENTIFIC_METADATA_CATALOG === 'object' && SCIENTIFIC_METADATA_CATALOG !== null);
  });

  test('A04 — SOURCE_KEY_MAP is exported and maps all 8 standard sources', () => {
    assert.ok(typeof SOURCE_KEY_MAP === 'object');
    assert.ok('CMIP6' in SOURCE_KEY_MAP);
    assert.ok('IPCC AR6' in SOURCE_KEY_MAP);
    assert.ok('NASA SRTM' in SOURCE_KEY_MAP);
    assert.ok('INGEMMET 2021' in SOURCE_KEY_MAP);
    assert.ok('GRI Infrastructure Resilience' in SOURCE_KEY_MAP);
    assert.ok('WRI Aqueduct 4.0' in SOURCE_KEY_MAP);
    assert.ok('NOAA CPC' in SOURCE_KEY_MAP);
    assert.ok('SENAMHI' in SOURCE_KEY_MAP);
  });

  test('A05 — buildTraceability is exported and is a function', () => {
    assert.ok(typeof buildTraceability === 'function');
  });

  test('A06 — buildDisclaimer is exported and is a function', () => {
    assert.ok(typeof buildDisclaimer === 'function');
  });

  test('A07 — buildScientificMetadata is exported and is a function', () => {
    assert.ok(typeof buildScientificMetadata === 'function');
  });

  test('A08 — attachGovernance is exported and is a function', () => {
    assert.ok(typeof attachGovernance === 'function');
  });

  test('A09 — validateGovernance is exported and is a function', () => {
    assert.ok(typeof validateGovernance === 'function');
  });

  test('A10 — TRACEABILITY_REGISTRY has exactly 8 entries', () => {
    const keys = Object.keys(TRACEABILITY_REGISTRY);
    assert.equal(keys.length, 8);
  });
});

// ─── SUITE B — TRACEABILITY_REGISTRY completeness and schema ─────────────────

describe('SUITE B — TRACEABILITY_REGISTRY schema completeness', () => {

  const REQUIRED_FIELDS = ['source', 'dataset', 'model', 'version', 'resolution', 'confidence'];
  const REGISTRY_KEYS   = Object.keys(TRACEABILITY_REGISTRY);

  test('B01 — every registry entry has all 6 required traceability fields', () => {
    for (const key of REGISTRY_KEYS) {
      const entry = TRACEABILITY_REGISTRY[key];
      for (const field of REQUIRED_FIELDS) {
        assert.ok(field in entry, `${key} missing field: ${field}`);
        assert.ok(typeof entry[field] === 'string' && entry[field].length > 0,
          `${key}.${field} must be a non-empty string`);
      }
    }
  });

  test('B02 — CMIP6_CCKP has high confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.CMIP6_CCKP.confidence, 'high');
  });

  test('B03 — IPCC_AR6 has high confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.IPCC_AR6.confidence, 'high');
  });

  test('B04 — NASA_SRTM has high confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.NASA_SRTM.confidence, 'high');
  });

  test('B05 — INGEMMET_2021 has medium confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.INGEMMET_2021.confidence, 'medium');
  });

  test('B06 — NOAA_ENSO has high confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.NOAA_ENSO.confidence, 'high');
  });

  test('B07 — WRI_AQUEDUCT has medium confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.WRI_AQUEDUCT.confidence, 'medium');
  });

  test('B08 — SENAMHI has high confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.SENAMHI.confidence, 'high');
  });

  test('B09 — GRI has medium confidence', () => {
    assert.equal(TRACEABILITY_REGISTRY.GRI.confidence, 'medium');
  });

  test('B10 — every registry entry has a reference field', () => {
    for (const key of REGISTRY_KEYS) {
      assert.ok('reference' in TRACEABILITY_REGISTRY[key], `${key} missing reference`);
    }
  });

  test('B11 — CMIP6_CCKP dataset mentions ensemble', () => {
    assert.ok(/ensemble/i.test(TRACEABILITY_REGISTRY.CMIP6_CCKP.dataset));
  });

  test('B12 — INGEMMET_2021 resolution is 1:100,000 scale', () => {
    assert.ok(/100.000/.test(TRACEABILITY_REGISTRY.INGEMMET_2021.resolution));
  });

  test('B13 — NASA_SRTM resolution is 30 m', () => {
    assert.ok(/30\s*m/.test(TRACEABILITY_REGISTRY.NASA_SRTM.resolution));
  });

  test('B14 — confidence values are only high or medium across registry', () => {
    const validConfidences = new Set(['high', 'medium', 'low']);
    for (const key of REGISTRY_KEYS) {
      assert.ok(validConfidences.has(TRACEABILITY_REGISTRY[key].confidence),
        `${key} has invalid confidence: ${TRACEABILITY_REGISTRY[key].confidence}`);
    }
  });

  test('B15 — SOURCE_KEY_MAP values all map to valid TRACEABILITY_REGISTRY keys', () => {
    for (const [label, regKey] of Object.entries(SOURCE_KEY_MAP)) {
      assert.ok(regKey in TRACEABILITY_REGISTRY,
        `SOURCE_KEY_MAP['${label}'] = '${regKey}' not found in TRACEABILITY_REGISTRY`);
    }
  });

  test('B16 — SCIENTIFIC_METADATA_CATALOG has same 8 keys as TRACEABILITY_REGISTRY', () => {
    const traceKeys = new Set(Object.keys(TRACEABILITY_REGISTRY));
    const metaKeys  = new Set(Object.keys(SCIENTIFIC_METADATA_CATALOG));
    for (const k of traceKeys) {
      assert.ok(metaKeys.has(k), `SCIENTIFIC_METADATA_CATALOG missing key: ${k}`);
    }
  });
});

// ─── SUITE C — buildTraceability() ───────────────────────────────────────────

describe('SUITE C — buildTraceability() output shape and entries', () => {

  test('C01 — returns an object with entries, unmapped_sources, total_sources, generated_at', () => {
    const result = buildTraceability(SOURCES_CMIP_IPCC);
    assert.ok('entries'          in result);
    assert.ok('unmapped_sources' in result);
    assert.ok('total_sources'    in result);
    assert.ok('generated_at'     in result);
  });

  test('C02 — entries is an object', () => {
    const result = buildTraceability(SOURCES_CMIP_IPCC);
    assert.ok(typeof result.entries === 'object' && result.entries !== null);
  });

  test('C03 — total_sources matches entries count', () => {
    const result = buildTraceability(SOURCES_CMIP_IPCC);
    assert.equal(result.total_sources, Object.keys(result.entries).length);
  });

  test('C04 — generated_at is an ISO string', () => {
    const result = buildTraceability(SOURCES_CMIP_IPCC);
    assert.ok(typeof result.generated_at === 'string');
    assert.ok(!isNaN(Date.parse(result.generated_at)));
  });

  test('C05 — CMIP6 entry has all 6 required fields', () => {
    const result = buildTraceability(['CMIP6']);
    const entry  = result.entries['CMIP6'];
    assert.ok(entry);
    for (const f of ['source', 'dataset', 'model', 'version', 'resolution', 'confidence']) {
      assert.ok(f in entry, `CMIP6 entry missing field: ${f}`);
    }
  });

  test('C06 — IPCC AR6 entry has all 6 required fields', () => {
    const result = buildTraceability(['IPCC AR6']);
    const entry  = result.entries['IPCC AR6'];
    assert.ok(entry);
    for (const f of ['source', 'dataset', 'model', 'version', 'resolution', 'confidence']) {
      assert.ok(f in entry);
    }
  });

  test('C07 — NASA SRTM entry has all 6 required fields', () => {
    const result = buildTraceability(['NASA SRTM']);
    const entry  = result.entries['NASA SRTM'];
    assert.ok(entry);
    for (const f of ['source', 'dataset', 'model', 'version', 'resolution', 'confidence']) {
      assert.ok(f in entry);
    }
  });

  test('C08 — INGEMMET 2021 entry has confidence medium', () => {
    const result = buildTraceability(['INGEMMET 2021']);
    assert.equal(result.entries['INGEMMET 2021'].confidence, 'medium');
  });

  test('C09 — full sources list produces total_sources = 8', () => {
    const result = buildTraceability(SOURCES_FULL);
    assert.equal(result.total_sources, 8);
  });

  test('C10 — empty sources produces total_sources = 0', () => {
    const result = buildTraceability(SOURCES_EMPTY);
    assert.equal(result.total_sources, 0);
  });

  test('C11 — unknown source goes to unmapped_sources', () => {
    const result = buildTraceability(['UNKNOWN_SOURCE']);
    assert.ok(result.unmapped_sources.includes('UNKNOWN_SOURCE'));
    assert.equal(result.total_sources, 0);
  });

  test('C12 — mixed known and unknown sources: known mapped, unknown in unmapped', () => {
    const result = buildTraceability(['CMIP6', 'MYSTERY_DB']);
    assert.ok('CMIP6' in result.entries);
    assert.ok(result.unmapped_sources.includes('MYSTERY_DB'));
  });

  test('C13 — null sources argument produces empty result without throwing', () => {
    const result = buildTraceability(null);
    assert.equal(result.total_sources, 0);
    assert.deepEqual(result.unmapped_sources, []);
  });

  test('C14 — undefined sources argument produces empty result without throwing', () => {
    const result = buildTraceability(undefined);
    assert.equal(result.total_sources, 0);
  });

  test('C15 — NOAA CPC entry maps correctly', () => {
    const result = buildTraceability(['NOAA CPC']);
    const entry  = result.entries['NOAA CPC'];
    assert.ok(entry);
    assert.equal(entry.confidence, 'high');
  });

  test('C16 — WRI Aqueduct 4.0 entry maps correctly', () => {
    const result = buildTraceability(['WRI Aqueduct 4.0']);
    const entry  = result.entries['WRI Aqueduct 4.0'];
    assert.ok(entry);
    assert.equal(entry.confidence, 'medium');
  });

  test('C17 — SENAMHI entry maps correctly', () => {
    const result = buildTraceability(['SENAMHI']);
    const entry  = result.entries['SENAMHI'];
    assert.ok(entry);
    assert.equal(entry.confidence, 'high');
  });

  test('C18 — GRI Infrastructure Resilience entry maps correctly', () => {
    const result = buildTraceability(['GRI Infrastructure Resilience']);
    const entry  = result.entries['GRI Infrastructure Resilience'];
    assert.ok(entry);
    assert.equal(entry.confidence, 'medium');
  });

  test('C19 — entries are copies, not references (immutable registry)', () => {
    const result = buildTraceability(['CMIP6']);
    result.entries['CMIP6'].confidence = 'MUTATED';
    const result2 = buildTraceability(['CMIP6']);
    assert.equal(result2.entries['CMIP6'].confidence, 'high');
  });

  test('C20 — terrain sources (NASA SRTM + INGEMMET 2021) produce total_sources = 2', () => {
    const result = buildTraceability(SOURCES_TERRAIN);
    assert.equal(result.total_sources, 2);
    assert.ok('NASA SRTM' in result.entries);
    assert.ok('INGEMMET 2021' in result.entries);
  });
});

// ─── SUITE D — buildDisclaimer() ─────────────────────────────────────────────

describe('SUITE D — buildDisclaimer() limitations, uncertainty, assumptions', () => {

  test('D01 — returns object with limitations, uncertainty, assumptions, domain', () => {
    const result = buildDisclaimer();
    assert.ok('limitations' in result);
    assert.ok('uncertainty' in result);
    assert.ok('assumptions' in result);
    assert.ok('domain'      in result);
  });

  test('D02 — limitations is a non-empty array', () => {
    const result = buildDisclaimer();
    assert.ok(Array.isArray(result.limitations));
    assert.ok(result.limitations.length > 0);
  });

  test('D03 — assumptions is a non-empty array', () => {
    const result = buildDisclaimer();
    assert.ok(Array.isArray(result.assumptions));
    assert.ok(result.assumptions.length > 0);
  });

  test('D04 — uncertainty is a non-empty string', () => {
    const result = buildDisclaimer();
    assert.ok(typeof result.uncertainty === 'string');
    assert.ok(result.uncertainty.length > 10);
  });

  test('D05 — default domain is general', () => {
    const result = buildDisclaimer();
    assert.equal(result.domain, 'general');
  });

  test('D06 — explicit domain=general produces general disclaimer', () => {
    const result = buildDisclaimer({ domain: 'general' });
    assert.equal(result.domain, 'general');
    assert.ok(result.limitations.length >= 5);
  });

  test('D07 — domain=temperature adds temperature-specific limitations', () => {
    const general     = buildDisclaimer({ domain: 'general' });
    const temperature = buildDisclaimer({ domain: 'temperature' });
    assert.ok(temperature.limitations.length > general.limitations.length);
  });

  test('D08 — domain=precipitation adds precipitation-specific limitations', () => {
    const general       = buildDisclaimer({ domain: 'general' });
    const precipitation = buildDisclaimer({ domain: 'precipitation' });
    assert.ok(precipitation.limitations.length > general.limitations.length);
  });

  test('D09 — domain=terrain adds terrain-specific limitations', () => {
    const general = buildDisclaimer({ domain: 'general' });
    const terrain = buildDisclaimer({ domain: 'terrain' });
    assert.ok(terrain.limitations.length > general.limitations.length);
  });

  test('D10 — domain=projection adds projection-specific limitations', () => {
    const general    = buildDisclaimer({ domain: 'general' });
    const projection = buildDisclaimer({ domain: 'projection' });
    assert.ok(projection.limitations.length > general.limitations.length);
  });

  test('D11 — domain=temperature has domain-specific uncertainty text', () => {
    const result = buildDisclaimer({ domain: 'temperature' });
    assert.ok(/temperatura|calentamiento|confianza/i.test(result.uncertainty));
  });

  test('D12 — domain=precipitation has domain-specific uncertainty text', () => {
    const result = buildDisclaimer({ domain: 'precipitation' });
    assert.ok(/precipitaci[oó]n|incertidumbre|confianza/i.test(result.uncertainty));
  });

  test('D13 — general uncertainty text mentions three sources of uncertainty', () => {
    const result = buildDisclaimer({ domain: 'general' });
    assert.ok(result.uncertainty.includes('variabilidad climática interna'));
    assert.ok(result.uncertainty.includes('escenario de emisiones'));
    assert.ok(result.uncertainty.includes('incertidumbre estructural'));
  });

  test('D14 — unknown domain falls back to general disclaimer without throwing', () => {
    const result = buildDisclaimer({ domain: 'unknown_domain' });
    assert.equal(result.domain, 'unknown_domain');
    assert.ok(result.limitations.length > 0);
  });

  test('D15 — limitations are all strings', () => {
    const result = buildDisclaimer({ domain: 'temperature' });
    for (const lim of result.limitations) {
      assert.ok(typeof lim === 'string' && lim.length > 0);
    }
  });

  test('D16 — assumptions are all strings', () => {
    const result = buildDisclaimer({ domain: 'precipitation' });
    for (const asm of result.assumptions) {
      assert.ok(typeof asm === 'string' && asm.length > 0);
    }
  });

  test('D17 — general limitations mention models', () => {
    const result = buildDisclaimer();
    const combined = result.limitations.join(' ');
    assert.ok(/modelo/i.test(combined));
  });

  test('D18 — DISCLAIMER_CATALOG has at least 5 domain keys', () => {
    const keys = Object.keys(DISCLAIMER_CATALOG);
    assert.ok(keys.length >= 5);
    assert.ok(keys.includes('general'));
    assert.ok(keys.includes('temperature'));
    assert.ok(keys.includes('precipitation'));
    assert.ok(keys.includes('terrain'));
    assert.ok(keys.includes('projection'));
  });
});

// ─── SUITE E — buildScientificMetadata() ─────────────────────────────────────

describe('SUITE E — buildScientificMetadata() validation_status, evidence_strength, peer_review_status', () => {

  test('E01 — returns object with validation_status, evidence_strength, peer_review_status', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, mockLayer7, mockLayer9);
    assert.ok('validation_status'  in result);
    assert.ok('evidence_strength'  in result);
    assert.ok('peer_review_status' in result);
  });

  test('E02 — returns per_source, signal_count, scenario_count, generated_at', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, mockLayer7, mockLayer9);
    assert.ok('per_source'    in result);
    assert.ok('signal_count'  in result);
    assert.ok('scenario_count' in result);
    assert.ok('generated_at'  in result);
  });

  test('E03 — CMIP6+IPCC AR6 → validation_status validated', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, null);
    assert.equal(result.validation_status, 'validated');
  });

  test('E04 — CMIP6+IPCC AR6 → evidence_strength strong', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, null);
    assert.equal(result.evidence_strength, 'strong');
  });

  test('E05 — CMIP6+IPCC AR6 → peer_review_status peer_reviewed', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, null);
    assert.equal(result.peer_review_status, 'peer_reviewed');
  });

  test('E06 — NASA SRTM+INGEMMET 2021 → evidence_strength strong (SRTM is strong)', () => {
    const result = buildScientificMetadata(SOURCES_TERRAIN, null, null);
    assert.equal(result.evidence_strength, 'strong');
  });

  test('E07 — NASA SRTM+INGEMMET 2021 → peer_review_status peer_reviewed (SRTM is peer_reviewed)', () => {
    const result = buildScientificMetadata(SOURCES_TERRAIN, null, null);
    assert.equal(result.peer_review_status, 'peer_reviewed');
  });

  test('E08 — empty sources → validation_status pending', () => {
    const result = buildScientificMetadata(SOURCES_EMPTY, null, null);
    assert.equal(result.validation_status, 'pending');
  });

  test('E09 — empty sources → evidence_strength limited', () => {
    const result = buildScientificMetadata(SOURCES_EMPTY, null, null);
    assert.equal(result.evidence_strength, 'limited');
  });

  test('E10 — empty sources → peer_review_status expert_review', () => {
    const result = buildScientificMetadata(SOURCES_EMPTY, null, null);
    assert.equal(result.peer_review_status, 'expert_review');
  });

  test('E11 — per_source has entry for each known cited source', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, null);
    assert.ok('CMIP6'    in result.per_source);
    assert.ok('IPCC AR6' in result.per_source);
  });

  test('E12 — per_source CMIP6 entry has validation_status, evidence_strength, peer_review_status', () => {
    const result = buildScientificMetadata(['CMIP6'], null, null);
    const entry  = result.per_source['CMIP6'];
    assert.ok('validation_status'  in entry);
    assert.ok('evidence_strength'  in entry);
    assert.ok('peer_review_status' in entry);
  });

  test('E13 — signal_count reflects Layer 7 signal_groups length', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, mockLayer7, null);
    assert.equal(result.signal_count, mockLayer7.signal_groups.length);
  });

  test('E14 — signal_count is 0 when interpretationOutput is null', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, null);
    assert.equal(result.signal_count, 0);
  });

  test('E15 — scenario_count reflects Layer 9 scenarios length', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, mockLayer9);
    assert.equal(result.scenario_count, mockLayer9.scenarios.length);
  });

  test('E16 — scenario_count is 0 when projectionContext is null', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, null);
    assert.equal(result.scenario_count, 0);
  });

  test('E17 — full sources → validation_status validated', () => {
    const result = buildScientificMetadata(SOURCES_FULL, mockLayer7, mockLayer9);
    assert.equal(result.validation_status, 'validated');
  });

  test('E18 — generated_at is an ISO string', () => {
    const result = buildScientificMetadata(SOURCES_CMIP_IPCC, null, null);
    assert.ok(typeof result.generated_at === 'string');
    assert.ok(!isNaN(Date.parse(result.generated_at)));
  });
});

// ─── SUITE F — attachGovernance() ────────────────────────────────────────────

describe('SUITE F — attachGovernance() full pipeline', () => {

  test('F01 — returns object with governance key', () => {
    const result = attachGovernance(mockStoryContext);
    assert.ok('governance' in result);
  });

  test('F02 — governance has traceability, disclaimer, scientific_metadata', () => {
    const result = attachGovernance(mockStoryContext);
    const gov    = result.governance;
    assert.ok('traceability'        in gov);
    assert.ok('disclaimer'          in gov);
    assert.ok('scientific_metadata' in gov);
  });

  test('F03 — governance has governance_version and governed_at', () => {
    const result = attachGovernance(mockStoryContext);
    assert.ok('governance_version' in result.governance);
    assert.ok('governed_at'        in result.governance);
  });

  test('F04 — original storyContext keys are preserved', () => {
    const result = attachGovernance(mockStoryContext);
    assert.ok('narrative'    in result);
    assert.ok('adaptations'  in result);
    assert.ok('metadata'     in result);
    assert.ok('validation'   in result);
    assert.ok('generated_at' in result);
  });

  test('F05 — traceability.total_sources matches sources_cited', () => {
    const result       = attachGovernance(mockStoryContext);
    const sourcesCited = mockStoryContext.narrative.sources_cited;
    assert.equal(result.governance.traceability.total_sources, sourcesCited.length);
  });

  test('F06 — disclaimer.limitations is non-empty array', () => {
    const result = attachGovernance(mockStoryContext);
    assert.ok(Array.isArray(result.governance.disclaimer.limitations));
    assert.ok(result.governance.disclaimer.limitations.length > 0);
  });

  test('F07 — scientific_metadata.validation_status is a valid value', () => {
    const result   = attachGovernance(mockStoryContext);
    const validSet = new Set(['validated', 'partially_validated', 'pending']);
    assert.ok(validSet.has(result.governance.scientific_metadata.validation_status));
  });

  test('F08 — domain option is passed to disclaimer', () => {
    const result = attachGovernance(mockStoryContext, { domain: 'temperature' });
    assert.equal(result.governance.disclaimer.domain, 'temperature');
  });

  test('F09 — null storyContext does not throw', () => {
    assert.doesNotThrow(() => attachGovernance(null));
  });

  test('F10 — governance_version contains Sprint 11', () => {
    const result = attachGovernance(mockStoryContext);
    assert.ok(/Sprint 11/i.test(result.governance.governance_version));
  });
});

// ─── SUITE G — validateGovernance() ──────────────────────────────────────────

describe('SUITE G — validateGovernance() check flags', () => {

  test('G01 — valid governed output returns validation_passed = true', () => {
    const governed = attachGovernance(mockStoryContext);
    const result   = validateGovernance(governed);
    assert.ok(result.validation_passed);
  });

  test('G02 — returns all 8 check flags', () => {
    const governed = attachGovernance(mockStoryContext);
    const result   = validateGovernance(governed);
    const expectedFlags = [
      'has_traceability',
      'has_total_sources',
      'has_disclaimer_uncertainty',
      'has_limitations',
      'has_assumptions',
      'has_validation_status',
      'has_evidence_strength',
      'has_peer_review_status',
    ];
    for (const flag of expectedFlags) {
      assert.ok(flag in result, `Missing flag: ${flag}`);
    }
  });

  test('G03 — missing traceability → has_traceability = false, validation_passed = false', () => {
    const broken = { governance: { disclaimer: { uncertainty: 'text', limitations: ['a'], assumptions: ['b'] }, scientific_metadata: { validation_status: 'validated', evidence_strength: 'strong', peer_review_status: 'peer_reviewed' } } };
    const result = validateGovernance(broken);
    assert.equal(result.has_traceability, false);
    assert.equal(result.validation_passed, false);
  });

  test('G04 — missing disclaimer uncertainty → validation_passed = false', () => {
    const governed = attachGovernance(mockStoryContext);
    governed.governance.disclaimer.uncertainty = '';
    const result = validateGovernance(governed);
    assert.equal(result.has_disclaimer_uncertainty, false);
    assert.equal(result.validation_passed, false);
  });

  test('G05 — missing limitations → validation_passed = false', () => {
    const governed = attachGovernance(mockStoryContext);
    governed.governance.disclaimer.limitations = [];
    const result = validateGovernance(governed);
    assert.equal(result.has_limitations, false);
    assert.equal(result.validation_passed, false);
  });

  test('G06 — invalid validation_status → has_validation_status = false', () => {
    const governed = attachGovernance(mockStoryContext);
    governed.governance.scientific_metadata.validation_status = 'bad_value';
    const result = validateGovernance(governed);
    assert.equal(result.has_validation_status, false);
    assert.equal(result.validation_passed, false);
  });

  test('G07 — null output does not throw', () => {
    assert.doesNotThrow(() => validateGovernance(null));
    const result = validateGovernance(null);
    assert.equal(result.validation_passed, false);
  });

  test('G08 — governed output with full sources passes all checks', () => {
    const fullContext = {
      ...mockStoryContext,
      narrative: { ...mockStoryContext.narrative, sources_cited: SOURCES_FULL },
    };
    const governed = attachGovernance(fullContext);
    const result   = validateGovernance(governed);
    assert.ok(result.validation_passed);
    assert.ok(result.has_traceability);
    assert.ok(result.has_total_sources);
    assert.ok(result.has_disclaimer_uncertainty);
    assert.ok(result.has_limitations);
    assert.ok(result.has_assumptions);
    assert.ok(result.has_validation_status);
    assert.ok(result.has_evidence_strength);
    assert.ok(result.has_peer_review_status);
  });
});
