/**
 * In-memory cache for Open-Meteo CMIP6 climate projection results.
 *
 * Why 24-hour TTL: CMIP6 projections (1980–2049) are static model runs —
 * they don't change within a day. Re-fetching the full 70-year daily dataset
 * every request wastes ~100–300 KB of bandwidth and up to 45 s of latency.
 *
 * Why 0.01° coordinate rounding: CMIP6 model resolution is ~0.25° (~25 km).
 * Rounding to 0.01° (~1.1 km) avoids cache misses for nearly-identical coordinates
 * while staying well below the model's native grid precision.
 *
 * Redis abstraction:
 *   To swap the backend, replace `get` / `set` / `invalidate` / `clear` with
 *   an async Redis client (ioredis) and update callers to await them.
 *   The interface is identical — only the storage backend changes.
 */

const TTL_MS      = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 500;                   // ~5 MB ceiling at ~10 KB/entry
const COORD_DP    = 2;                     // 0.01° ≈ 1.1 km

/** @type {Map<string, {data: *, ts: number}>} */
const store = new Map();

function round(v) {
  const f = 10 ** COORD_DP;
  return Math.round(Number(v) * f) / f;
}

function buildKey(lat, lon) {
  return `${round(lat)}:${round(lon)}`;
}

function evictExpired() {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, entry] of store) {
    if (entry.ts < cutoff) store.delete(key);
  }
}

/**
 * Returns cached result for (lat, lon), or null on miss/expiry.
 * @param {number} lat
 * @param {number} lon
 * @returns {*|null}
 */
export function get(lat, lon) {
  const key   = buildKey(lat, lon);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Stores a result for (lat, lon). Evicts expired entries and, if still at
 * capacity, removes the oldest entry (insertion-order eviction).
 * @param {number} lat
 * @param {number} lon
 * @param {*} data
 */
export function set(lat, lon, data) {
  if (store.size >= MAX_ENTRIES) {
    evictExpired();
    if (store.size >= MAX_ENTRIES) {
      // Evict oldest by insertion order
      store.delete(store.keys().next().value);
    }
  }
  store.set(buildKey(lat, lon), { data, ts: Date.now() });
}

/**
 * Removes a single entry from the cache.
 * @param {number} lat
 * @param {number} lon
 */
export function invalidate(lat, lon) {
  store.delete(buildKey(lat, lon));
}

/** Flushes all entries. Use for testing or forced refresh. */
export function clear() {
  store.clear();
}

/**
 * Returns cache health metrics (after pruning expired entries).
 * @returns {{ entries: number, maxEntries: number, ttlHours: number, coordPrecision: string }}
 */
export function stats() {
  evictExpired();
  return {
    entries:        store.size,
    maxEntries:     MAX_ENTRIES,
    ttlHours:       TTL_MS / (60 * 60 * 1000),
    coordPrecision: `${(1 / 10 ** COORD_DP).toFixed(COORD_DP)}° (~${(111 / 10 ** COORD_DP).toFixed(1)} km)`,
  };
}
