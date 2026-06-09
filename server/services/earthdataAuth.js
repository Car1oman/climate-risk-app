/**
 * Earthdata Authentication Utility — Sprint 7
 *
 * Provides token-based authentication for NASA Earthdata APIs (AppEEARS, LP DAAC).
 * Supports both Basic Auth (user/pass) and Bearer Token (preferred).
 *
 * Usage:
 *   import { getToken } from './earthdataAuth.js';
 *   const token = await getToken();
 */

const TOKEN_URL = 'https://urs.earthdata.nasa.gov/api/users/token';
const AUTH_CACHE_TTL_MS = 55 * 60 * 1000; // 55 min (tokens expire in 60 min)

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Retrieves a valid Earthdata token, caching it to avoid redundant auth calls.
 * Falls back to Basic Auth if token retrieval fails.
 *
 * @returns {Promise<{token: string|null, type: 'bearer'|'basic'|null}>}
 */
export async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return { token: cachedToken, type: 'bearer' };
  }

  const username = process.env.EARTHDATA_USER;
  const password = process.env.EARTHDATA_PASS;
  const existingToken = process.env.EARTHDATA_TOKEN;

  // Prefer explicit token from env
  if (existingToken) {
    cachedToken = existingToken;
    tokenExpiresAt = Date.now() + AUTH_CACHE_TTL_MS;
    return { token: existingToken, type: 'bearer' };
  }

  // Try to obtain a token from the Earthdata URS API
  if (username && password) {
    try {
      const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.access_token) {
          cachedToken = data.access_token;
          tokenExpiresAt = Date.now() + AUTH_CACHE_TTL_MS;
          return { token: data.access_token, type: 'bearer' };
        }
      }
    } catch (err) {
      console.warn('[earthdataAuth] Token retrieval failed, falling back to Basic Auth:', err.message);
    }

    // Fallback: return Basic Auth header info
    return { token: Buffer.from(`${username}:${password}`).toString('base64'), type: 'basic' };
  }

  console.warn('[earthdataAuth] No Earthdata credentials configured (EARTHDATA_USER/EARTHDATA_PASS or EARTHDATA_TOKEN)');
  return { token: null, type: null };
}

/**
 * Clears cached token forcing a fresh retrieval on next getToken() call.
 */
export function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}
