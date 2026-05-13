/**
 * Coordinate-keyed in-memory cache for terrain elevation/slope data.
 *
 * Keys are rounded to 3 decimal places (~111 m precision), so nearby queries
 * within the same ~100 m cell share a single cache entry.
 *
 * TTL = 6 h: elevation data is effectively static on human timescales, but we
 * refresh periodically to catch any upstream dataset corrections.
 */

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** @type {Map<string, { data: *, ts: number }>} */
const _cache = new Map();

function key(lat, lon) {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

/**
 * Returns cached terrain data for a coordinate pair, or null on miss/expiry.
 * @param {number} lat
 * @param {number} lon
 * @returns {*|null}
 */
export function get(lat, lon) {
  const k     = key(lat, lon);
  const entry = _cache.get(k);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    _cache.delete(k);
    return null;
  }
  return entry.data;
}

/**
 * Stores terrain data for a coordinate pair.
 * @param {number} lat
 * @param {number} lon
 * @param {*} data
 */
export function set(lat, lon, data) {
  _cache.set(key(lat, lon), { data, ts: Date.now() });
}

/**
 * Invalidates a specific coordinate entry, or clears all entries when called
 * without arguments.
 * @param {number|null} lat
 * @param {number|null} lon
 */
export function invalidate(lat = null, lon = null) {
  if (lat != null && lon != null) {
    _cache.delete(key(lat, lon));
  } else {
    _cache.clear();
  }
}

/**
 * Returns cache health metrics.
 * @returns {{ total_entries: number, live_entries: number, ttl_hours: number }}
 */
export function stats() {
  const now  = Date.now();
  let live   = 0;
  for (const entry of _cache.values()) {
    if (now - entry.ts <= TTL_MS) live++;
  }
  return {
    total_entries: _cache.size,
    live_entries:  live,
    ttl_hours:     TTL_MS / (60 * 60 * 1000),
  };
}
