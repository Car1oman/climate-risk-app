/**
 * NASA Metrics — Request counters & latency tracking for NASA data sources.
 *
 * Constitution VII (Observability): every service exposes request_count,
 * success_count, failure_count, avg_latency_ms, and cache_hit_rate.
 *
 * Metrics are collected in-memory via the track() wrapper and exposed
 * via GET /api/nasa-metrics.
 */

const metrics = {
  nasa_power:  { request_count: 0, success_count: 0, failure_count: 0, total_latency_ms: 0, cache_hits: 0 },
  modis_ndvi:  { request_count: 0, success_count: 0, failure_count: 0, total_latency_ms: 0, cache_hits: 0 },
  grace_fo:    { request_count: 0, success_count: 0, failure_count: 0, total_latency_ms: 0, cache_hits: 0 },
};

function initService(name) {
  if (!metrics[name]) {
    metrics[name] = { request_count: 0, success_count: 0, failure_count: 0, total_latency_ms: 0, cache_hits: 0 };
  }
}

export function recordRequest(service, options = {}) {
  initService(service);
  metrics[service].request_count++;
  if (options.cacheHit) metrics[service].cache_hits++;
}

export function recordSuccess(service, latencyMs) {
  initService(service);
  metrics[service].success_count++;
  metrics[service].total_latency_ms += latencyMs;
}

export function recordFailure(service, latencyMs) {
  initService(service);
  metrics[service].failure_count++;
  metrics[service].total_latency_ms += latencyMs;
}

export function getMetrics() {
  const result = {};
  for (const [name, m] of Object.entries(metrics)) {
    result[name] = {
      request_count:    m.request_count,
      success_count:    m.success_count,
      failure_count:    m.failure_count,
      avg_latency_ms:   m.request_count > 0 ? Math.round(m.total_latency_ms / m.request_count) : 0,
      cache_hit_rate:   m.request_count > 0
        ? Number((m.cache_hits / m.request_count).toFixed(3))
        : 0,
    };
  }
  return result;
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics() {
  for (const key of Object.keys(metrics)) {
    metrics[key] = { request_count: 0, success_count: 0, failure_count: 0, total_latency_ms: 0, cache_hits: 0 };
  }
}
