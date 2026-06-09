/**
 * MODIS NDVI Cache — In-memory cache with TTL for MODIS NDVI responses
 *
 * TTL default: 6 hours (NDVI composites update every 16 days — 6h avoids unnecessary refreshes)
 */

const cache = new Map();
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

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
