import { describe, it } from "node:test";
import assert from "node:assert";
import { PipelineEngine } from "../pipeline/orchestration/engine.js";
import { Stage01Acquisition } from "../pipeline/stages/01-acquisition/index.js";
import { Stage02Validation } from "../pipeline/stages/02-validation/index.js";
import { Stage03Normalization } from "../pipeline/stages/03-normalization/index.js";
import { Stage04Signals } from "../pipeline/stages/04-signals/index.js";
import { Stage05Phenomena } from "../pipeline/stages/05-phenomena/index.js";
import { Stage06Risk } from "../pipeline/stages/06-risk/index.js";
import { Stage07Presentation } from "../pipeline/stages/07-presentation/index.js";

function buildEngine() {
  return new PipelineEngine({
    stages: [
      new Stage01Acquisition(),
      new Stage02Validation(),
      new Stage03Normalization(),
      new Stage04Signals(),
      new Stage05Phenomena(),
      new Stage06Risk(),
      new Stage07Presentation(),
    ],
  });
}

const LOCATIONS = {
  costa: [
    { name: "Lima",       lat: -12.0464, lon: -77.0428 },
    { name: "Piura",      lat: -5.1945,  lon: -80.6328 },
    { name: "Ica",        lat: -14.0650, lon: -75.7286 },
  ],
  sierra: [
    { name: "Cusco",           lat: -13.5320, lon: -71.9675 },
    { name: "Huancayo",       lat: -12.0654, lon: -75.2049 },
    { name: "Huaraz",         lat: -9.5278,  lon: -77.5333 },
  ],
  selva: [
    { name: "Iquitos",              lat: -3.7491,  lon: -73.2538 },
    { name: "Pucallpa",            lat: -8.3791,  lon: -74.5539 },
    { name: "Puerto Maldonado",   lat: -12.5937, lon: -69.1892 },
  ],
};

function extractConfidenceReport(artifact) {
  const stage4 = artifact.stages.find(s => s.stage_id === 4);
  if (!stage4 || !stage4.output?.signals) return [];

  return stage4.output.signals.map(s => {
    const sq = s.source_quality;
    const cov = sq.components?.coverage_spatial;
    const covNum = typeof cov === "number" ? cov : (cov?.coverage_spatial ?? null);
    const covStatus = cov?.status === "excluded" ? cov.reason : (cov != null ? "computed" : null);

    return {
      variable: s.source_variables[0],
      value: s.value,
      spatial_distance_km: cov?.distance_km ?? null,
      decorrelation_length_km: cov?.decorrelation_length_km ?? null,
      coverage_spatial: covNum,
      coverage_model: cov?.model ?? null,
      coverage_status: covStatus,
      coverage_info: cov,
      source_quality_score: sq.score,
      source_quality_total_weight: sq.total_weight_used,
      source_quality_excluded: sq.components_excluded || [],
      signal_strength_score: s.signal_strength?.score ?? null,
    };
  });
}

for (const [region, coords] of Object.entries(LOCATIONS)) {
  describe(`Validation: ${region.toUpperCase()}`, () => {
    for (const loc of coords) {
      it(`${loc.name} (${loc.lat}, ${loc.lon})`, async () => {
        const engine = buildEngine();
        const result = await engine.run({
          coordinates: { lat: loc.lat, lon: loc.lon },
          sector: "retail",
          view: "analyst",
        });
        assert.ok(result.success, `Pipeline failed for ${loc.name}`);
        assert.ok(result.artifact);

        const report = extractConfidenceReport(result.artifact);
        assert.ok(report.length > 0, `No signals generated for ${loc.name}`);

        // Print detailed report
        console.log(`\n${"=".repeat(80)}`);
        console.log(`LOCATION: ${loc.name} (${region}) — ${loc.lat}, ${loc.lon}`);
        console.log(`${"=".repeat(80)}`);

        for (const row of report) {
          const covStr = row.coverage_spatial != null
            ? row.coverage_spatial.toFixed(4)
            : row.coverage_status || "null";
          const sqStr = row.source_quality_score.toFixed(4);
          const Lstr = row.decorrelation_length_km != null
            ? `${row.decorrelation_length_km} km`
            : "N/A";
          const dStr = row.spatial_distance_km != null
            ? `${row.spatial_distance_km.toFixed(1)} km`
            : "null";

          console.log(
            `  ${row.variable.padEnd(28)} ` +
            `d=${dStr.padEnd(10)} L=${Lstr.padEnd(10)} ` +
            `cov=${covStr.padEnd(10)} SQ=${sqStr.padEnd(8)}`
          );
        }

        // Summary stats
        const lowCov = report.filter(r => r.coverage_spatial != null && r.coverage_spatial < 0.5);
        const excluded = report.filter(r => r.coverage_status !== "computed" && r.coverage_status !== null);
        const withCov = report.filter(r => r.coverage_spatial != null);

        console.log(`  --- Summary ---`);
        console.log(`  Total variables: ${report.length}`);
        console.log(`  With coverage: ${withCov.length}`);
        console.log(`  Coverage < 0.5: ${lowCov.length}`);
        if (lowCov.length > 0) {
          console.log(`    Variables: ${lowCov.map(r => r.variable).join(", ")}`);
          lowCov.forEach(r => console.log(`      ${r.variable}: d=${r.spatial_distance_km?.toFixed(1)} km, L=${r.decorrelation_length_km} km, coverage=${r.coverage_spatial.toFixed(4)}`));
        }
        console.log(`  Excluded (null): ${excluded.length}`);
        excluded.forEach(r => console.log(`      ${r.variable}: ${r.coverage_status}`));
        console.log(`  Avg source quality: ${(report.reduce((a, r) => a + r.source_quality_score, 0) / report.length).toFixed(4)}`);
      });
    }
  });
}
