const GRI_API_URL = 'https://global.infrastructureresilience.org/api/pixel-driller/point';

const PERU_BOUNDS = {
  latMin: -18.5,
  latMax: 0.5,
  lonMin: -82.5,
  lonMax: -68.0,
};

const RELEVANT_HAZARDS = {
  drought: 'Sequia',
  extreme_heat: 'Calor extremo',
  heat: 'Calor extremo',
  fluvial: 'Inundacion fluvial',
  flood: 'Inundacion',
  river: 'Inundacion fluvial',
  coastal: 'Inundacion costera',
  pluvial: 'Inundacion pluvial',
  landslide: 'Deslizamiento',
};

const RELEVANT_DOMAINS = new Set(['isimip', 'aqueduct', 'jrc_flood']);

const DOMAIN_HAZARD_FALLBACK = {
  jrc_flood: 'flood',
};

const EXCLUDED_DOMAINS = new Set(['earthquake', 'wildfire', 'fire']);
const EXCLUDED_HAZARDS = new Set(['earthquake', 'wildfire', 'fire']);

function validateCoordinates(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
    throw new Error('Coordenadas invalidas');
  }

  if (latNum < -90 || latNum > 90) {
    throw new Error('Latitud fuera de rango [-90, 90]');
  }

  if (lonNum < -180 || lonNum > 180) {
    throw new Error('Longitud fuera de rango [-180, 180]');
  }

  return { latNum, lonNum };
}

function isInPeru(lat, lon) {
  return (
    lat >= PERU_BOUNDS.latMin &&
    lat <= PERU_BOUNDS.latMax &&
    lon >= PERU_BOUNDS.lonMin &&
    lon <= PERU_BOUNDS.lonMax
  );
}

function classifyProbability(value) {
  if (value == null) return 'sin data';
  if (value < 0.05) return 'bajo';
  if (value < 0.10) return 'medio';
  return 'alto';
}

function classifyIntensity(value) {
  if (value == null) return 'sin data';
  if (value <= 0) return 'bajo';
  if (value < 0.10) return 'bajo';
  if (value < 0.50) return 'medio';
  return 'alto';
}

function getHazard(item) {
  const layer = item?.layer || {};
  const keys = layer.keys || {};
  return keys.hazard || DOMAIN_HAZARD_FALLBACK[layer.domain];
}

function isRelevantItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.value == null) return false;

  const layer = item.layer || {};
  const domain = layer.domain;
  const hazard = getHazard(item);

  if (EXCLUDED_DOMAINS.has(domain) || EXCLUDED_HAZARDS.has(hazard)) return false;
  if (!RELEVANT_DOMAINS.has(domain)) return false;
  if (!RELEVANT_HAZARDS[hazard]) return false;

  return true;
}

function normalizeItem(item) {
  const layer = item.layer || {};
  const keys = layer.keys || {};
  const hazard = getHazard(item);

  return {
    domain: layer.domain || 'unknown',
    hazard,
    hazard_name: RELEVANT_HAZARDS[hazard] || hazard,
    metric: String(keys.metric || 'unknown'),
    value: item.value,
    rcp: String(keys.rcp || 'unknown'),
    epoch: String(keys.epoch || 'unknown'),
    gcm: String(keys.gcm || 'unknown'),
    impact_model: String(keys.impact_model || 'unknown'),
    rp: String(keys.rp || 'unknown'),
    raw_keys: keys,
  };
}

function groupByHazard(records) {
  return records.reduce((grouped, record) => {
    grouped[record.hazard] ||= [];
    grouped[record.hazard].push(record);
    return grouped;
  }, {});
}

function selectOccurrenceRecords(records, periodType) {
  return records.filter((record) => {
    if (record.metric !== 'occurrence') return false;

    const isBaseline = record.epoch === 'baseline' && record.rcp === 'baseline';
    const isFutureModerate =
      ['2030', '2050', '2080'].includes(record.epoch) &&
      ['2.6', '4.5', '6.0'].includes(record.rcp);
    const isFutureHigh =
      ['2030', '2050', '2080'].includes(record.epoch) &&
      record.rcp === '8.5';

    if (periodType === 'baseline') return isBaseline;
    if (periodType === 'moderate') return isFutureModerate;
    if (periodType === 'high') return isFutureHigh;
    return false;
  });
}

function selectRecordsByPeriod(records, periodType) {
  return records.filter((record) => {
    const isBaseline =
      (record.epoch === 'baseline' && record.rcp === 'baseline') ||
      (record.epoch === 'unknown' && record.rcp === 'unknown');
    const isFutureModerate =
      ['2030', '2050', '2080'].includes(record.epoch) &&
      ['2.6', '4.5', '6.0'].includes(record.rcp);
    const isFutureHigh =
      ['2030', '2050', '2080'].includes(record.epoch) &&
      record.rcp === '8.5';

    if (periodType === 'baseline') return isBaseline;
    if (periodType === 'moderate') return isFutureModerate;
    if (periodType === 'high') return isFutureHigh;
    return false;
  });
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateProbabilitySummary(records) {
  if (records.length === 0) {
    return {
      summary_type: 'probability',
      value_decimal: null,
      value_label: 'sin data',
      score: 'sin data',
      records_used: 0,
      records_detail: [],
    };
  }

  const values = records.map((record) => Number(record.value));
  const avgValue = average(values);

  return {
    summary_type: 'probability',
    value_decimal: avgValue,
    value_label: `${(avgValue * 100).toFixed(2)}%`,
    score: classifyProbability(avgValue),
    records_used: records.length,
    records_detail: records.map((record) => ({
      value: record.value,
      value_percent: Number((Number(record.value) * 100).toFixed(2)),
      rcp: record.rcp,
      epoch: record.epoch,
      gcm: record.gcm,
      impact_model: record.impact_model,
      domain: record.domain,
    })),
  };
}

function calculateValueSummary(records) {
  if (records.length === 0) {
    return {
      summary_type: 'value',
      value_decimal: null,
      value_label: 'sin data',
      score: 'sin data',
      records_used: 0,
      records_detail: [],
    };
  }

  const values = records.map((record) => Number(record.value));
  const avgValue = average(values);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  return {
    summary_type: 'value',
    value_decimal: avgValue,
    value_label: `promedio ${avgValue.toFixed(4)} | max. ${maxValue.toFixed(4)}`,
    score: classifyIntensity(maxValue),
    records_used: records.length,
    min_value: minValue,
    max_value: maxValue,
    records_detail: records.map((record) => ({
      value: record.value,
      rcp: record.rcp,
      epoch: record.epoch,
      gcm: record.gcm,
      impact_model: record.impact_model,
      rp: record.rp,
      metric: record.metric,
      domain: record.domain,
    })),
  };
}

function summarizeHazard(hazard, records) {
  const baselineOccurrence = selectOccurrenceRecords(records, 'baseline');
  const moderateOccurrence = selectOccurrenceRecords(records, 'moderate');
  const highOccurrence = selectOccurrenceRecords(records, 'high');
  const hasOccurrence =
    baselineOccurrence.length > 0 ||
    moderateOccurrence.length > 0 ||
    highOccurrence.length > 0;

  const baseline = hasOccurrence
    ? calculateProbabilitySummary(baselineOccurrence)
    : calculateValueSummary(selectRecordsByPeriod(records, 'baseline'));
  const futureModerate = hasOccurrence
    ? calculateProbabilitySummary(moderateOccurrence)
    : calculateValueSummary(selectRecordsByPeriod(records, 'moderate'));
  const futureHigh = hasOccurrence
    ? calculateProbabilitySummary(highOccurrence)
    : calculateValueSummary(selectRecordsByPeriod(records, 'high'));

  return {
    hazard,
    hazard_name: RELEVANT_HAZARDS[hazard] || hazard,
    total_records_for_hazard: records.length,
    domains: [...new Set(records.map((record) => record.domain))].sort(),
    metrics: [...new Set(records.map((record) => record.metric))].sort(),
    method: hasOccurrence ? 'probabilidad_occurrence' : 'valor_directo',
    baseline,
    future_moderate_emissions: futureModerate,
    future_high_emissions: futureHigh,
    all_records: records,
  };
}

function overallScore(summaries) {
  const scores = summaries.flatMap((summary) => [
    summary.baseline.score,
    summary.future_moderate_emissions.score,
    summary.future_high_emissions.score,
  ]);

  if (scores.includes('alto')) return 'alto';
  if (scores.includes('medio')) return 'medio';
  if (scores.includes('bajo')) return 'bajo';
  return 'sin data';
}

async function fetchGriPoint(lat, lon) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${GRI_API_URL}/${lon}/${lat}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GRI API error: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getGriRiskByLocation(lat, lon) {
  const { latNum, lonNum } = validateCoordinates(lat, lon);

  if (!isInPeru(latNum, lonNum)) {
    throw new Error('La ubicacion esta fuera del rango esperado para Peru');
  }

  const data = await fetchGriPoint(latNum, lonNum);
  const results = Array.isArray(data?.results) ? data.results : [];
  const normalized = results
    .filter(isRelevantItem)
    .map(normalizeItem);
  const grouped = groupByHazard(normalized);
  const hazards = Object.entries(grouped).map(([hazard, records]) =>
    summarizeHazard(hazard, records)
  );

  return {
    found: hazards.length > 0,
    source: 'gri_infrastructure_resilience',
    queried: { lat: latNum, lng: lonNum },
    overall_score: overallScore(hazards),
    hazards,
    metadata: {
      total_api_results: results.length,
      relevant_results_used: normalized.length,
      ignored_results: results.length - normalized.length,
      excluded_note: 'Sismo e incendios forestales fueron excluidos por decision metodologica.',
    },
    generated_at: new Date().toISOString(),
  };
}

export {
  getGriRiskByLocation,
  isRelevantItem,
  normalizeItem,
  summarizeHazard,
};
