/**
 * NASA POWER Cache — Simple in-memory cache with TTL
 * 
 * Provides caching for NASA POWER API responses to reduce redundant requests.
 * Cache entries expire after 1 hour (configurable).
 */

const cache = new Map();
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sets a value in the cache with expiration time.
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} ttlMs - Time to live in milliseconds (optional)
 */
function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  cache.set(key, {
    value,
    expiresAt
  });
}

/**
 * Gets a value from the cache if it exists and hasn't expired.
 * @param {string} key - Cache key
 * @returns {*} Cached value or null if not found/expired
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Invalidates (removes) a specific cache entry.
 * @param {string} key - Cache key to remove
 */
function invalidate(key) {
  cache.delete(key);
}

/**
 * Clears all cache entries.
 */
function clear() {
  cache.clear();
}

/**
 * Returns the number of entries in the cache.
 * @returns {number} Cache size
 */
function size() {
  // Clean up expired entries before counting
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    }
  }
  return cache.size;
}

export { set, get, invalidate, clear, size };