import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { Stage04Signals } from "../../../pipeline/stages/04-signals/index.js";
import { SUPPORTED_SECTORS } from "../../../pipeline/shared/types.js";

describe("Stage04 - Signals", () => {
  it("should generate signals from canonical variables", () => {
    const stage = new Stage04Signals();
    const result = stage.execute({
      canonical_variables: [
        {
          name: "air_temperature_current",
          value: 22.5,
          unit: "°C",
          source: "weatherapi",
          spatial_info: { distance_km: 0, resolution: "~2km" },
          methodology: { completeness_ratio: 0.95 },
        },
        // Real climatological baseline (WMO 1991-2020 normal) so
        // air_temperature_current's AnomalyDetector has something to compare
        // against — H-02/H-04: without a paired baseline, signal_strength is
        // honestly null and the signal is discarded (signals_discarded), not
        // fabricated, so this fixture needs to reflect what Stage 3 actually
        // emits (both variables, each with `source` set) to exercise the
        // "signals get generated" path at all.
        {
          name: "cc_tas",
          value: 19.8,
          unit: "°C",
          source: "supabase_climate_cells",
          spatial_info: { distance_km: 2, resolution: "~5km" },
          methodology: { completeness_ratio: 0.88 },
        },
      ],
    });
    assert.ok(Array.isArray(result.signals));
    assert.ok(result.signals.length > 0);
    assert.ok(result.signals[0].signal_id);
    assert.ok(result.signals[0].source_quality);
    assert.ok(result.signals[0].signal_strength);
    assert.ok(Array.isArray(result.signals_discarded));
  });

  it("H-11: should use methodology.completeness_ratio for completeness component", () => {
    const stage = new Stage04Signals();
    const result = stage.execute({
      canonical_variables: [
        {
          name: "air_temperature_current",
          value: 22.5,
          unit: "°C",
          source: "weatherapi",
          spatial_info: { distance_km: 0, resolution: "~2km" },
          methodology: { completeness_ratio: 0.82 },
        },
        {
          name: "cc_tas",
          value: 19.8,
          unit: "°C",
          source: "supabase_climate_cells",
          spatial_info: { distance_km: 2, resolution: "~5km" },
          methodology: { completeness_ratio: 0.91 },
        },
      ],
    });
    const signal = result.signals[0];
    const completenessComponent = signal.source_quality.components.completeness;
    assert.ok(completenessComponent, "completeness component should exist");
    assert.strictEqual(completenessComponent.value, 0.82, "completeness should use methodology.completeness_ratio from Stage 3");
    assert.ok(completenessComponent.reason.includes("completeness_ratio_stage3"), "reason should reference Stage 3 methodology");
    assert.ok(completenessComponent.reason.includes("WMO No.100"), "reason should reference WMO No.100 / GCOS-245");
  });

  it("H-11: should fall back to field presence when methodology.completeness_ratio is absent", () => {
    const stage = new Stage04Signals();
    const result = stage.execute({
      canonical_variables: [
        {
          name: "air_temperature_current",
          value: 22.5,
          unit: "°C",
          source: "weatherapi",
          spatial_info: { distance_km: 0, resolution: "~2km" },
          // No methodology — simulates legacy or incomplete Stage 3 output
        },
        {
          name: "cc_tas",
          value: 19.8,
          unit: "°C",
          source: "supabase_climate_cells",
          spatial_info: { distance_km: 2, resolution: "~5km" },
          methodology: { completeness_ratio: 0.91 },
        },
      ],
    });
    const signal = result.signals.find(s => s.source_variables.includes("air_temperature_current"));
    const completenessComponent = signal.source_quality.components.completeness;
    assert.ok(completenessComponent, "completeness component should exist");
    assert.strictEqual(completenessComponent.value, 1.0, "completeness should be 1.0 (trivial fallback for single-variable source)");
    assert.ok(completenessComponent.reason.includes("fallback_campos_presentes"), "reason should indicate fallback path");
    assert.ok(completenessComponent.reason.includes("sin methodology.completeness_ratio"), "reason should note missing Stage 3 data");
  });

  it("H-12: signal_strength should use anomaly-based normalization, not |value|/|range_max|", () => {
    const stage = new Stage04Signals();
    const result = stage.execute({
      canonical_variables: [
        {
          name: "air_temperature_current",
          value: 22.5,
          unit: "°C",
          source: "weatherapi",
          spatial_info: { distance_km: 0, resolution: "~2km" },
          methodology: { completeness_ratio: 0.95 },
        },
        {
          name: "cc_tas",
          value: 19.8,
          unit: "°C",
          source: "supabase_climate_cells",
          spatial_info: { distance_km: 2, resolution: "~5km" },
          methodology: { completeness_ratio: 0.88 },
        },
      ],
    });
    const signal = result.signals[0];
    const anomalyComponent = signal.signal_strength.components.anomaly_magnitude;
    assert.ok(anomalyComponent, "anomaly_magnitude component should exist");
    assert.ok(anomalyComponent.value != null, "anomaly_magnitude should have a numeric value");

    // H-12: Old formula would compute |22.5|/90 = 0.25 (absMax from valid_range [-90, 60])
    // New formula computes |22.5 - 19.8| / 2.0 = 2.7 / 2.0 = 1.0 (capped at 1.0)
    // using scientific threshold (temperature_delta_c = 2.0°C from thresholds.json)
    const delta = Math.abs(22.5 - 19.8);
    const expectedValue = Math.min(1, delta / 2.0);
    assert.strictEqual(anomalyComponent.value, expectedValue, "anomaly_magnitude should use delta from baseline / scientific threshold, not |value|/|range_max|");

    // Verify the reason references the scientific methodology, not physical range
    assert.ok(anomalyComponent.reason.includes("Δ="), "reason should reference delta from baseline");
    assert.ok(anomalyComponent.reason.includes("umbral_significativo"), "reason should reference scientific threshold");
    assert.ok(anomalyComponent.reason.includes("IPCC AR6"), "reason should cite IPCC AR6");
    assert.ok(!anomalyComponent.reason.includes("valid_range"), "reason should NOT reference valid_range (H-12 regression)");
    assert.ok(!anomalyComponent.reason.includes("absMax"), "reason should NOT reference absMax (H-12 regression)");
  });

  it("H-12: precipitation should use percentage-based anomaly, not absolute value over range_max", () => {
    const stage = new Stage04Signals();
    const result = stage.execute({
      canonical_variables: [
        {
          name: "precipitation_sum",
          value: 150,
          unit: "mm",
          source: "nasa_power",
          spatial_info: { distance_km: 0, resolution: "~50km" },
          methodology: { completeness_ratio: 0.92 },
        },
        {
          name: "cc_pr",
          value: 50,
          unit: "mm",
          source: "supabase_climate_cells",
          spatial_info: { distance_km: 2, resolution: "~5km" },
          methodology: { completeness_ratio: 0.88 },
        },
      ],
    });
    const signal = result.signals[0];
    const anomalyComponent = signal.signal_strength.components.anomaly_magnitude;
    assert.ok(anomalyComponent, "anomaly_magnitude component should exist");
    assert.ok(anomalyComponent.value != null, "anomaly_magnitude should have a numeric value");

    // H-12: Old formula would compute |150|/2000 = 0.075 (absMax from valid_range [0, 2000])
    // New formula computes |150-50|/50 * 100 = 200% / 25% threshold = 1.0 (capped at 1.0)
    // using scientific threshold (precipitation_delta_pct = 25% from thresholds.json)
    const deltaPct = Math.abs(150 - 50) / 50 * 100;
    const expectedValue = Math.min(1, deltaPct / 25);
    assert.strictEqual(anomalyComponent.value, expectedValue, "anomaly_magnitude should use percentage delta / scientific threshold, not |value|/|range_max|");

    // Verify the reason references percentage-based methodology
    assert.ok(anomalyComponent.reason.includes("|Δ%|="), "reason should reference percentage delta");
    assert.ok(anomalyComponent.reason.includes("ETCCDI"), "reason should cite ETCCDI/WMO-TD-1200");
    assert.ok(!anomalyComponent.reason.includes("valid_range"), "reason should NOT reference valid_range (H-12 regression)");
  });

  it("H-13: 'default' should be in SUPPORTED_SECTORS to match runtime fallback", () => {
    // H-13: Stage 04 and confidence.js use sector = "default" as fallback,
    // but SUPPORTED_SECTORS didn't include it, creating a latent ZodError
    // if sector validation was enforced. Fix: add "default" to SUPPORTED_SECTORS.
    assert.ok(SUPPORTED_SECTORS.includes("default"), "SUPPORTED_SECTORS should include 'default' for runtime fallback consistency");
    assert.ok(SUPPORTED_SECTORS.includes("infrastructure"), "SUPPORTED_SECTORS should include 'infrastructure'");
    assert.strictEqual(SUPPORTED_SECTORS.length, 6, "SUPPORTED_SECTORS should have 6 entries (5 sectors + default)");
  });

  it("H-13: sector-profiles.json should include all SUPPORTED_SECTORS", () => {
    // H-13: infrastructure was in SUPPORTED_SECTORS but missing from sector-profiles.json,
    // causing transition-risk-detector to silently fall back to default profile.
    // Fix: add infrastructure profile to sector-profiles.json.
    const profilesPath = new URL("../../../pipeline/config/sector-profiles.json", import.meta.url);
    const profiles = JSON.parse(readFileSync(profilesPath, "utf-8"));
    const sectorKeys = Object.keys(profiles.sectors);
    assert.ok(sectorKeys.includes("infrastructure"), "sector-profiles.json sectors should include 'infrastructure'");
    assert.ok(sectorKeys.includes("retail"), "sector-profiles.json sectors should include 'retail'");
    assert.ok(sectorKeys.includes("agriculture"), "sector-profiles.json sectors should include 'agriculture'");
    assert.ok(sectorKeys.includes("finance"), "sector-profiles.json sectors should include 'finance'");
    assert.ok(sectorKeys.includes("energy"), "sector-profiles.json sectors should include 'energy'");
  });
});
