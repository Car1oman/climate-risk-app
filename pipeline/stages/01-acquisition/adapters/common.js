const DEFAULT_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Does NOT throw on a non-2xx status before reading the body: several
// sources (confirmed live for Open-Meteo's Climate API — HALLAZGO-8) return
// their real error reason as a JSON body on HTTP 400, not HTTP 200. The old
// version threw a generic "HTTP 400: Bad Request" here, discarding that body
// entirely, so detectApiError() below never got a chance to see the actual
// reason. Only falls back to a generic HTTP error when the non-2xx response
// has no parseable JSON body to report instead.
export async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON body — nothing to salvage
  }
  if (!response.ok && (body == null || typeof body !== "object")) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return body;
}

export async function fetchText(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

import { RawSourceResponseSchema } from "../../../shared/types.js";

export function detectApiError(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return null;
  if (responseBody.error) {
    // {error: {message: "..."}} — e.g. weatherapi
    if (typeof responseBody.error === "object" && responseBody.error?.message) {
      return responseBody.error.message;
    }
    // {error: true, reason: "..."} — Open-Meteo's actual shape (verified live,
    // HALLAZGO-8). Previously fell through to `responseBody.error` itself
    // (the boolean `true`), which isn't a string and fails
    // RawSourceResponseSchema's error: z.string().nullable() — the adapter
    // would throw a ZodError instead of returning a clean "failed" result.
    if (typeof responseBody.reason === "string") {
      return responseBody.reason;
    }
    return typeof responseBody.error === "string" ? responseBody.error : "api_error";
  }
  if (Array.isArray(responseBody.message) && responseBody.message.length > 0) {
    return responseBody.message[0]?.value ?? "api_error";
  }
  return null;
}

export function buildRawResponse({ source_name, source_domain, authority_level, request, response, status_code, duration_ms, error = null, coverage_status, spatial_distance_km = null, resolution_native = null }) {
  return RawSourceResponseSchema.parse({
    source_name,
    source_domain,
    authority_level,
    request: {
      endpoint: request.endpoint || "",
      params: request.params || {},
      timestamp: request.timestamp || new Date().toISOString(),
    },
    response,
    status_code,
    duration_ms,
    error,
    coverage_status,
    spatial_distance_km,
    resolution_native,
  });
}
