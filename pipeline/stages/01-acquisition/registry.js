import { getAuthoritativeSources } from "../../orchestration/config-loader.js";

export class SourceRegistry {
  constructor() {
    this._adapters = new Map();
  }

  registerAdapter(sourceName, adapterFn) {
    this._adapters.set(sourceName, adapterFn);
  }

  getAdapters() {
    const registry = getAuthoritativeSources();
    const entries = [];
    for (const [key, src] of Object.entries(registry.sources)) {
      const authoritative = src.authoritative;
      const fn = this._adapters.get(src.authoritative) || this._adapters.get(key);
      if (fn) {
        entries.push({ key, sourceName: authoritative, config: src, adapter: fn });
      } else {
        console.warn(`[SourceRegistry] domain="${key}" authoritative="${authoritative}" — no adapter registered, domain excluded`);
      }
      for (const compName of (src.complementary ?? [])) {
        const compFn = this._adapters.get(compName);
        if (compFn) {
          entries.push({ key, sourceName: compName, config: src, adapter: compFn });
        }
      }
    }
    return entries;
  }

  async executeAll(location) {
    const adapters = this.getAdapters();
    // Same sourceName may appear multiple times (primary + complementary roles).
    // Share one in-flight promise per sourceName so identical queries aren't sent twice.
    const inflight = new Map();
    const settled = await Promise.allSettled(
      adapters.map(entry => {
        if (inflight.has(entry.sourceName)) return inflight.get(entry.sourceName);
        const p = entry.adapter(location, entry.config);
        inflight.set(entry.sourceName, p);
        return p;
      })
    );
    return settled.map((result, i) => {
      const entry = adapters[i];
      if (result.status === "fulfilled") return result.value;
      return {
        source_name: entry.sourceName,
        source_domain: entry.key,
        authority_level: entry.sourceName === entry.config.authoritative ? "primary" : "complementary",
        status_code: 0,
        duration_ms: 0,
        error: result.reason?.message ?? "unknown error",
        coverage_status: "failed",
        request: { endpoint: "", params: {}, timestamp: new Date().toISOString() },
        response: null,
        spatial_distance_km: null,
        resolution_native: null,
      };
    });
  }
}
