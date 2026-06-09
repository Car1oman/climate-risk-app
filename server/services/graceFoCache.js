/**
 * GRACE-FO Cache — In-memory cache with TTL for GRACE-FO TWS responses
 *
 * TTL default: 24 hours (GRACE-FO data is monthly — 24h avoids unnecessary refreshes)
 */

const cache = new Map();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  cache.set(key, { value, expiresAt });
}

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function invalidate(key) {
  cache.delete(key);
}

function clear() {
  cache.clear();
}

function size() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key);
  }
  return cache.size;
}

export { set, get, invalidate, clear, size };
