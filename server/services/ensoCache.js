/**
 * In-memory cache for NOAA ENSO/ONI data.
 *
 * Unlike the coordinate-keyed openMeteoCache, ENSO data is global — there is
 * one current phase for the entire planet. The cache is therefore a single
 * slot keyed by time only.
 *
 * TTL = 24 h: NOAA updates ONI monthly. Daily re-fetch is more than sufficient
 * to stay current while avoiding unnecessary calls to NOAA CPC servers.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** @type {{ data: *, ts: number } | null} */
let _slot = null;

/**
 * Returns cached ENSO data, or null on miss/expiry.
 * @returns {*|null}
 */
export function get() {
  if (!_slot) return null;
  if (Date.now() - _slot.ts > TTL_MS) {
    _slot = null;
    return null;
  }
  return _slot.data;
}

/**
 * Stores ENSO data with the current timestamp.
 * @param {*} data
 */
export function set(data) {
  _slot = { data, ts: Date.now() };
}

/** Invalidates the cache slot (forces re-fetch on next access). */
export function invalidate() {
  _slot = null;
}

/**
 * Returns cache health metrics.
 * @returns {{ hit: boolean, age_minutes: number|null, ttl_hours: number }}
 */
export function stats() {
  const hit = _slot != null && Date.now() - _slot.ts <= TTL_MS;
  const age  = hit ? Math.round((Date.now() - _slot.ts) / 60_000) : null;
  return {
    hit,
    age_minutes: age,
    ttl_hours:   TTL_MS / (60 * 60 * 1000),
  };
}
