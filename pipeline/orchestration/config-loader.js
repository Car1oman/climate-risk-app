import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { AuthoritativeSourcesSchema } from "../shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config");

const cache = new Map();
const CACHE_TTL_MS = 60_000;

const SOURCE_VARIABLES = {
  weatherapi: ["air_temperature_current", "relative_humidity", "wind_speed", "surface_pressure"],
  nasa_power: ["air_temperature_current", "precipitation_sum", "relative_humidity", "wind_speed", "surface_pressure"],
  openmeteo_cmip6: ["air_temperature_max", "air_temperature_min", "precipitation_sum"],
  opentopodata_srtm30m: ["elevation"],
  open_elevation: ["elevation"],
  world_bank: [],
  noaa_cpc_oni: [],
  supabase_climate_cells: [],
  gri_oxford: ["population", "buildings", "land_cover", "traveltime_healthcare"],
};

function loadConfig(filename) {
  const cached = cache.get(filename);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  const filepath = join(CONFIG_DIR, filename);
  if (!existsSync(filepath)) {
    throw new Error(`Config file not found: ${filename}`);
  }
  const raw = readFileSync(filepath, "utf-8");
  const parsed = JSON.parse(raw);
  cache.set(filename, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
  return parsed;
}

export function getAuthoritativeSources() {
  const raw = loadConfig("authoritative-sources.json");
  return AuthoritativeSourcesSchema.parse(raw);
}

export function getAdaptiveCapacityConfig() {
  return loadConfig("adaptive-capacity.json");
}

export function getThresholds() {
  return loadConfig("thresholds.json");
}

export function getSourceConfig(sourceName) {
  const registry = getAuthoritativeSources();
  for (const [key, source] of Object.entries(registry.sources)) {
    if (source.authoritative === sourceName || key === sourceName) {
      return { key, ...source };
    }
  }
  return null;
}

export function getMaxDistanceForVariable(variableName) {
  const decorrelationConfig = loadConfig("spatial-decorrelation.json");
  const varConf = decorrelationConfig.variables[variableName];
  if (varConf && varConf.max_distance_km != null) {
    return varConf.max_distance_km;
  }
  return null;
}

// The variables a source can provide, per SOURCE_VARIABLES — used to evaluate
// spatial coverage per variable (see getMaxDistancesForSource) rather than
// blending every variable's decorrelation distance into one figure for the
// source. A blended max_distance_km would let a multivariate source's most
// localised variable (e.g. nasa_power's precipitation_sum, d_max=21km) ride
// on its least localised variable's allowance (temperature, d_max=347km).
export function getVariablesForSource(sourceName) {
  return SOURCE_VARIABLES[sourceName] || [];
}

// Per-variable max_distance_km for every variable a source provides — no
// blending. Returns [] for sources with no declared variables (country-level
// or index sources with no spatial decorrelation model) or no decorrelation
// config for any of them.
export function getMaxDistancesForSource(sourceName) {
  const sourceVars = getVariablesForSource(sourceName);
  const result = [];
  for (const varName of sourceVars) {
    const maxDistanceKm = getMaxDistanceForVariable(varName);
    if (maxDistanceKm != null) result.push({ variable: varName, maxDistanceKm });
  }
  return result;
}

export function getDecorrelatonConfig() {
  return loadConfig("spatial-decorrelation.json");
}

export function invalidateCache() {
  cache.clear();
}

export function getValidationProfiles() {
  return loadConfig("validation-profiles.json");
}

export function getResolutionProfiles() {
  return loadConfig("resolution-profiles.json");
}

export function getTemporalCoverageProfiles() {
  return loadConfig("temporal-coverage-profiles.json");
}

export function getSourceQualityWeights() {
  return getThresholds().source_quality_weights;
}

export function getSignalTaxonomy() {
  return loadConfig("signal-taxonomy.json");
}

export function getPhenomenonDefinitions() {
  return loadConfig("phenomenon-definitions.json");
}

export function getAdaptationMeasures() {
  return loadConfig("adaptation-measures.json");
}

export function getAllConfig() {
  return {
    authoritativeSources: getAuthoritativeSources(),
    adaptiveCapacity: getAdaptiveCapacityConfig(),
    thresholds: getThresholds(),
    resolutionProfiles: getResolutionProfiles(),
    temporalCoverageProfiles: getTemporalCoverageProfiles(),
    validationProfiles: getValidationProfiles(),
  };
}
