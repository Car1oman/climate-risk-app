import { describe, it } from "node:test";
import assert from "node:assert";
import { calculateSourceQuality } from "../pipeline/stages/04-signals/confidence.js";

// Distance scenarios for Peru (km from station/grid center)
const DISTANCE_PROFILES = {
  "same_cell": 0,
  "nearby_urban": 2.5,
  "suburban": 10,
  "rural": 47,
  "remote_mountain": 120,
  "oceanic": 350,
};

const RESOLUTIONS = {
  high: "30m",
  medium: "~2km",
  coarse: "0.5°",
  very_coarse: "1°",
  country: "país",
};

function makeSource(variable, distanceKm, resolution, response = null) {
  const r = response || { [variable.replace(/[._]/g, "_")]: 1.0, unit: "°C" };
  return { variable, spatial_distance_km: distanceKm, resolution_native: resolution, response: r };
}

const LOCATION_CONTEXT = {
  lima: { lat: -12.0464, lon: -77.0428, region: "Costa", desc: "Capital, costa árida" },
  piura: { lat: -5.1945, lon: -80.6328, region: "Costa", desc: "Costa norte, desierto tropical" },
  ica: { lat: -14.065, lon: -75.7286, region: "Costa", desc: "Costa sur, desierto extremo" },
  cusco: { lat: -13.532, lon: -71.9675, region: "Sierra", desc: "Andes sur, altiplano" },
  huancayo: { lat: -12.0654, lon: -75.2049, region: "Sierra", desc: "Valle del Mantaro, Andes centrales" },
  huaraz: { lat: -9.5278, lon: -77.5333, region: "Sierra", desc: "Cordillera Blanca, Andes norte" },
  iquitos: { lat: -3.7491, lon: -73.2538, region: "Selva", desc: "Amazonía norte" },
  pucallpa: { lat: -8.3791, lon: -74.5539, region: "Selva", desc: "Amazonía central" },
  puerto_maldonado: { lat: -12.5937, lon: -69.1892, region: "Selva", desc: "Amazonía sur" },
};

// Typical distances by region and variable (km — estimated for Peruvian context)
const TYPICAL_DISTANCES = {
  // Coast: good coverage near cities, sparse in desert
  costa: {
    air_temperature_current: 5,      // WeatherAPI at ~2km, city center coverage
    air_temperature_max: 50,          // NASA POWER at 0.5° (~55km)
    air_temperature_min: 50,
    precipitation_current: 8,
    precipitation_sum: 55,
    relative_humidity: 5,
    wind_speed: 5,
    surface_pressure: 5,
    elevation: 0,                     // SRTM exact
    twsa: 150,                        // GRACE at 1°
    oni_index: 0,                     // Basin index
    poverty_rate: null,               // Country-level
    gdp_per_capita: null,
    water_access: null,
    population: 1,                    // Gridded data
    buildings: 1,
    land_cover: 1,
    traveltime_healthcare: 2,
    urban_population: null,
  },
  // Sierra: farther from stations due to sparse coverage
  sierra: {
    air_temperature_current: 25,
    air_temperature_max: 60,
    air_temperature_min: 60,
    precipitation_current: 30,
    precipitation_sum: 65,
    relative_humidity: 25,
    wind_speed: 25,
    surface_pressure: 25,
    elevation: 0,
    twsa: 150,
    oni_index: 0,
    poverty_rate: null,
    gdp_per_capita: null,
    water_access: null,
    population: 3,
    buildings: 4,
    land_cover: 2,
    traveltime_healthcare: 5,
    urban_population: null,
  },
  // Selva: very sparse station coverage
  selva: {
    air_temperature_current: 45,
    air_temperature_max: 80,
    air_temperature_min: 80,
    precipitation_current: 50,
    precipitation_sum: 85,
    relative_humidity: 45,
    wind_speed: 45,
    surface_pressure: 45,
    elevation: 0,
    twsa: 150,
    oni_index: 0,
    poverty_rate: null,
    gdp_per_capita: null,
    water_access: null,
    population: 5,
    buildings: 6,
    land_cover: 3,
    traveltime_healthcare: 8,
    urban_population: null,
  },
};

const RES_BY_VARIABLE = {
  air_temperature_current: "~2km",
  air_temperature_max: "0.5°",
  air_temperature_min: "0.5°",
  precipitation_current: "~2km",
  precipitation_sum: "0.5°",
  relative_humidity: "~2km",
  wind_speed: "~2km",
  surface_pressure: "~2km",
  elevation: "30m",
  twsa: "1°",
  oni_index: "trimestral",
  poverty_rate: "país",
  gdp_per_capita: "país",
  water_access: "país",
  population: "~1km",
  buildings: "~1km",
  land_cover: "~1km",
  traveltime_healthcare: "~1km",
  urban_population: "país",
};

describe("Full Confidence Validation — Variable Matrix", () => {
  const variables = Object.keys(TYPICAL_DISTANCES.costa);

  for (const [regionKey, regionLabel] of [["costa", "Costa"], ["sierra", "Sierra"], ["selva", "Selva"]]) {
    describe(`Region: ${regionLabel}`, () => {
      const dists = TYPICAL_DISTANCES[regionKey];

      for (const variable of variables) {
        const d = dists[variable];
        const res = RES_BY_VARIABLE[variable];
        const source = makeSource(variable, d, res);

        it(`${variable} (d=${d} km, res=${res})`, () => {
          const result = calculateSourceQuality(source);
          const cov = result.components?.coverage_spatial;
          const covNum = typeof cov === "number" ? cov : cov?.coverage_spatial ?? null;
          const excl = result.components_excluded || [];

          // Assert: score is a valid number
          assert.ok(typeof result.score === "number" && !Number.isNaN(result.score),
            `${variable}: score=${result.score} should be valid number`);

          // Assert: total_weight reflects available components
          assert.ok(typeof result.total_weight_used === "number",
            `${variable}: total_weight_used should be number`);

          if (covNum != null) {
            assert.ok(covNum >= 0 && covNum <= 1, `${variable}: coverage_spatial ${covNum} out of range`);
          }

          if (cov != null && typeof cov === "object" && cov.status === "excluded") {
            assert.ok(excl.length > 0, `${variable}: excluded should be recorded`);
          }

          // Print detail for manual review
          const dStr = d != null ? `${d} km` : "null    ";
          const covStr = covNum != null ? covNum.toFixed(4) : `EXCLUDED(${cov?.reason || "?"})`;
          const excStr = excl.length > 0 ? ` [excluded: ${excl.map(e => e.reason).join(", ")}]` : "";
          console.log(
            `  ${variable.padEnd(30)} d=${dStr.padEnd(8)} ` +
            `res=${res.padEnd(8)} ` +
            `cov=${covStr.padEnd(16)} SQ=${result.score.toFixed(4)}${excStr}`
          );
        });
      }
    });
  }
});

describe("Full Confidence Validation — Edge Cases & Sensitivity", () => {
  it("Distance sensitivity profile for temperature (L=500 km)", () => {
    const distances = [0, 10, 25, 50, 100, 250, 500, 1000];
    console.log("\n  Temperature sensitivity (L=500 km):");
    for (const d of distances) {
      const sq = calculateSourceQuality(makeSource("air_temperature_current", d, "~2km"));
      console.log(`    d=${String(d).padStart(5)} km → coverage_spatial=${(typeof sq.components.coverage_spatial === 'number' ? sq.components.coverage_spatial : sq.components.coverage_spatial?.coverage_spatial ?? '?').toString().padStart(8)} SQ=${sq.score.toFixed(4)}`);
    }
  });

  it("Distance sensitivity for precipitation (L=30 km)", () => {
    const distances = [0, 5, 10, 25, 50, 100];
    console.log("\n  Precipitation sensitivity (L=30 km):");
    for (const d of distances) {
      const sq = calculateSourceQuality(makeSource("precipitation_current", d, "~2km"));
      const cov = typeof sq.components.coverage_spatial === 'number' ? sq.components.coverage_spatial : sq.components.coverage_spatial?.coverage_spatial;
      console.log(`    d=${String(d).padStart(5)} km → coverage_spatial=${(cov ?? '?').toString().padStart(8)} SQ=${sq.score.toFixed(4)}`);
    }
  });

  it("Exclusion propagation: null distance (country-level data)", () => {
    const sources = [
      { variable: "poverty_rate", spatial_distance_km: null, resolution_native: "país", response: { poverty: 22.5 } },
      { variable: "oni_index", spatial_distance_km: null, resolution_native: "trimestral", response: { oni: 1.2 } },
    ];
    for (const source of sources) {
      const sq = calculateSourceQuality(source);
      const cov = sq.components.coverage_spatial;
      const excluded = sq.components_excluded || [];
      const expected = source.variable === "poverty_rate" ? "distance_unavailable" : null;
      if (source.variable === "poverty_rate") {
        assert.equal(cov?.reason, "distance_unavailable", `${source.variable}: should be excluded for null distance`);
      }
      console.log(`  ${source.variable.padEnd(30)} coverage=${cov?.status || 'computed'} reason=${cov?.reason || 'N/A'} SQ=${sq.score.toFixed(4)}`);
    }
  });

  it("Exclusion propagation: unknown variable (no decorrelation)", () => {
    const source = { variable: "unknown_variable_xyz", spatial_distance_km: 50, resolution_native: "~2km", response: { val: 1 } };
    const sq = calculateSourceQuality(source);
    const cov = sq.components.coverage_spatial;
    const excluded = sq.components_excluded || [];
    console.log(`  unknown_variable         coverage=${cov?.status} reason=${cov?.reason} SQ=${sq.score.toFixed(4)}`);
    assert.equal(cov?.reason, "decorrelation_length_unavailable",
      "Unknown variable should be excluded");
  });
});
