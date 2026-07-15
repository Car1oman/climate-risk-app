import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage02Validation } from "../../../pipeline/stages/02-validation/index.js";

describe("Stage02 - Validation", () => {
  it("should validate sources and produce coverage decisions", () => {
    const stage = new Stage02Validation();
    const sources = [
      {
        source_name: "weatherapi",
        source_domain: "observation_current",
        response: { current: { temp_c: 22.5, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
        coverage_status: "available",
        spatial_distance_km: 0,
        resolution_native: "~2km",
        variable: "air_temperature_current",
      },
      {
        source_name: "nasa_power",
        source_domain: "observation_historical",
        response: null,
        coverage_status: "failed",
        variable: "air_temperature_current",
      },
    ];
    const result = stage.execute({ sources_consulted: sources });
    assert.ok(Array.isArray(result.validated_sources));
    assert.equal(result.validated_sources.length, 2);
    assert.ok(result.validated_sources[0].overall_status !== "failed");
    assert.equal(result.validated_sources[1].overall_status, "failed");
    assert.ok(Array.isArray(result.coverage_decisions));
  });

  it("should validate fill values and physical ranges", () => {
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: {
        properties: {
          parameter: {
            T2M: { "20230101": 22.5, "20230102": -999, "20230103": 23.0 },
            PRECTOTCORR: { "20230101": 0.0, "20230102": 5.2, "20230103": 9999 },
          },
        },
      },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
      variable: "air_temperature_current",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];

    assert.equal(validation.source, "nasa_power");
    assert.ok(Array.isArray(validation.validation_results));

    const fillValueResult = validation.validation_results.find(r => r.rule === "fill_value_detection");
    assert.ok(fillValueResult);
    assert.equal(fillValueResult.result, "warning");

    const rangeResult = validation.validation_results.find(r => r.rule === "physical_range_validation");
    assert.ok(rangeResult);

    const completenessResult = validation.validation_results.find(r => r.rule === "completeness");
    assert.ok(completenessResult);
  });

  it("should keep is_valid true for a source with only warnings, no failures (H-32)", () => {
    // Every one of nasa_power's 5 declared fields (T2M, PRECTOTCORR, RH2M,
    // WS2M, PS) has 6 of 10 entries present, 4 null — 60% completeness overall,
    // landing in the "degraded" tier (climate thresholds: good=0.95,
    // acceptable=0.80, degraded=0.50), i.e. a "warning". Deliberately uses
    // null rather than a sentinel like -999, since a sentinel would also
    // trip physical_range_validation into "fail" (it's well outside any
    // variable's valid_range by design) — this fixture isolates completeness
    // as the ONLY non-pass rule, to test is_valid against a source that has
    // a warning and nothing else. All 5 fields must be present (even if
    // partially null) — an entirely-absent field only costs 1 slot in the
    // completeness denominator (see validateCompleteness's timeseries
    // branch), which would understate how partial this fixture actually is.
    const stage = new Stage02Validation();
    const buildSeries = (base) => {
      const series = {};
      for (let d = 1; d <= 10; d++) {
        const key = `202301${String(d).padStart(2, "0")}`;
        series[key] = d <= 6 ? base + d * 0.1 : null;
      }
      return series;
    };
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: {
        properties: {
          parameter: {
            T2M: buildSeries(20),
            PRECTOTCORR: buildSeries(1),
            RH2M: buildSeries(70),
            WS2M: buildSeries(10),
            PS: buildSeries(1010),
          },
        },
      },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const completenessResult = validation.validation_results.find(r => r.rule === "completeness");

    assert.equal(completenessResult.completeness_pct, 0.6);
    assert.equal(completenessResult.result, "warning");
    assert.ok(!validation.validation_results.some(r => r.result === "fail"));
    assert.equal(validation.overall_status, "warning");
    assert.equal(validation.is_valid, true);
  });

  it("should set is_valid false when any rule actually fails (H-32)", () => {
    const stage = new Stage02Validation();
    const source = {
      source_name: "weatherapi",
      source_domain: "observation_current",
      response: { current: { temp_c: NaN, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "~2km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];

    assert.equal(validation.overall_status, "failed");
    assert.equal(validation.is_valid, false);
  });

  it("should flag a physically implausible daily precipitation value that the old [0, 50000] range let through (HALLAZGO-11)", () => {
    // 25000mm in a single day is >13x the WMO 24h world record (1825mm,
    // La Réunion 1966) — physically impossible, but the old valid_range.max
    // of 50000 was a no-op that would have passed it silently.
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: {
        properties: {
          parameter: {
            PRECTOTCORR: { "20230101": 5.2, "20230102": 25000, "20230103": 3.1 },
          },
        },
      },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const rangeResult = validation.validation_results.find(r => r.rule === "physical_range_validation");

    assert.equal(rangeResult.result, "fail");
    const issue = rangeResult.range_issues.find(i => i.variable === "precipitation_sum");
    assert.ok(issue);
    assert.equal(issue.reason, "above_maximum");
  });

  it("should pass cleanly for a value within both valid_range and peru_range", () => {
    const stage = new Stage02Validation();
    const source = {
      source_name: "weatherapi",
      source_domain: "observation_current",
      response: { current: { temp_c: 30, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "~2km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const rangeResult = validation.validation_results.find(r => r.rule === "physical_range_validation");

    assert.ok(rangeResult);
    assert.equal(rangeResult.result, "pass");
    assert.ok(!rangeResult.range_issues || rangeResult.range_issues.length === 0);
  });

  it("should warn (not fail) for a value outside peru_range but inside valid_range (H-35)", () => {
    // 55°C is within air_temperature_current's global valid_range [-90, 60]
    // (physically plausible somewhere on Earth — Death Valley record is
    // 56.7°C) but outside its SENAMHI-sourced peru_range [-25, 45] — Peru's
    // hottest confirmed extreme (Pucallpa, ~45°C). H-35 activated
    // peru_range as a real warning tier: statistically unusual for Peru,
    // not physically impossible, so "warning" not "fail". Before this fix,
    // peru_range was documented but never read by validatePhysicalRanges,
    // so this value passed with no signal at all.
    const stage = new Stage02Validation();
    const source = {
      source_name: "weatherapi",
      source_domain: "observation_current",
      response: { current: { temp_c: 55, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "~2km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const rangeResult = validation.validation_results.find(r => r.rule === "physical_range_validation");

    assert.equal(rangeResult.result, "warning");
    const issue = rangeResult.range_issues.find(i => i.variable === "air_temperature_current");
    assert.equal(issue.reason, "above_peru_range");
    assert.equal(issue.action, "warning");
  });

  it("should still fail for a value outside valid_range regardless of peru_range (H-35)", () => {
    // 70°C exceeds even the global physical limit (valid_range max 60) —
    // must stay "fail", not get downgraded to "warning" by peru_range.
    const stage = new Stage02Validation();
    const source = {
      source_name: "weatherapi",
      source_domain: "observation_current",
      response: { current: { temp_c: 70, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "~2km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const rangeResult = validation.validation_results.find(r => r.rule === "physical_range_validation");

    assert.equal(rangeResult.result, "fail");
    const issue = rangeResult.range_issues.find(i => i.variable === "air_temperature_current");
    assert.equal(issue.reason, "above_maximum");
    assert.equal(issue.action, "fail");
  });

  it("should flag NaN as a physical range failure instead of silently passing it (HALLAZGO-10)", () => {
    // typeof NaN === "number", and NaN < min / NaN > max are both false, so
    // without an explicit isNaN check a parse failure upstream (e.g.
    // Number("garbage")) would silently satisfy any physical range.
    const stage = new Stage02Validation();
    const source = {
      source_name: "weatherapi",
      source_domain: "observation_current",
      response: { current: { temp_c: NaN, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "~2km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const rangeResult = validation.validation_results.find(r => r.rule === "physical_range_validation");

    assert.equal(rangeResult.result, "fail");
    const nanIssue = rangeResult.range_issues.find(i => i.variable === "air_temperature_current");
    assert.ok(nanIssue);
    assert.equal(nanIssue.reason, "not_a_number");

    const tempChecked = rangeResult.variables_checked.find(c => c.variable === "air_temperature_current");
    assert.equal(tempChecked.within_range + tempChecked.outside_range, tempChecked.values_checked);
  });

  it("should mark out of coverage when distance exceeds decorrelation-derived max for every variable", () => {
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: null,
      coverage_status: "available",
      spatial_distance_km: 999,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const decision = result.coverage_decisions[0];

    assert.equal(decision.coverage_status, "out_of_coverage");
    assert.ok(Array.isArray(decision.variable_coverage));
    assert.ok(decision.variable_coverage.length > 0);
    assert.ok(decision.variable_coverage.every(v => v.coverage_status === "out_of_coverage"));
    assert.ok(decision.variable_coverage.every(v => v.max_distance_km < 999));
  });

  it("should mark partial coverage per variable instead of blending a multivariate source's distances (HALLAZGO-7)", () => {
    // nasa_power at 100km: air_temperature_current (d_max=347), relative_humidity
    // (d_max=104), wind_speed (d_max=139) and surface_pressure (d_max=347) are
    // in range, but precipitation_sum (d_max=21) is not. The old Math.max()
    // blend would have reported the whole source "available" up to 347km,
    // silently letting an unrepresentative precipitation value through.
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: null,
      coverage_status: "available",
      spatial_distance_km: 100,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const decision = result.coverage_decisions[0];

    assert.equal(decision.coverage_status, "partial");
    const precip = decision.variable_coverage.find(v => v.variable === "precipitation_sum");
    const temp = decision.variable_coverage.find(v => v.variable === "air_temperature_current");
    assert.equal(precip.coverage_status, "out_of_coverage");
    assert.equal(temp.coverage_status, "available");
  });

  it("should treat distance === max_distance_km as available, not out_of_coverage (H-31)", () => {
    // At d = d_max exactly, rho(d) = exp(-d_max/L) = theta = 0.5 by
    // construction (d_max = -L*ln(theta)) — theta is the *minimum
    // acceptable* correlation, so the boundary point itself is still
    // representative and belongs on the "available" side. Locks in the
    // inclusive <= comparison so a future refactor can't silently flip it
    // to a stricter < and start rejecting the boundary case.
    const stage = new Stage02Validation();
    // air_temperature_current's max_distance_km is 347 (spatial-decorrelation.json).
    const atBoundary = stage.evaluateCoverage({
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: null,
      coverage_status: "available",
      spatial_distance_km: 347,
      resolution_native: "0.5°",
    });
    const pastBoundary = stage.evaluateCoverage({
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: null,
      coverage_status: "available",
      spatial_distance_km: 347.0001,
      resolution_native: "0.5°",
    });

    assert.equal(atBoundary.variable_coverage.find(v => v.variable === "air_temperature_current").coverage_status, "available");
    assert.equal(pastBoundary.variable_coverage.find(v => v.variable === "air_temperature_current").coverage_status, "out_of_coverage");
  });

  it("should handle non-spatial sources gracefully", () => {
    const stage = new Stage02Validation();
    const source = {
      source_name: "world_bank",
      source_domain: "socioeconomic",
      response: { poverty_rate: 20.2, gdp_per_capita: 7000 },
      coverage_status: "available",
      spatial_distance_km: null,
      resolution_native: "país",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const decision = result.coverage_decisions[0];

    assert.equal(decision.coverage_status, "available");
    assert.deepEqual(decision.variable_coverage, []);
  });

  it("should fail closed to 'unknown' (not fail open to 'available') when a spatially-gated source has no distance (HALLAZGO-8)", () => {
    // nasa_power's variables have a decorrelation model (unlike world_bank
    // above), so a null spatial_distance_km here means the adapter didn't
    // compute one — a bug, not a legitimate non-spatial source. Before this
    // fix, this produced the exact same "available" status as a source
    // confirmed in range, so a broken adapter would pass coverage validation
    // silently.
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: null,
      coverage_status: "available",
      spatial_distance_km: null,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const decision = result.coverage_decisions[0];

    assert.equal(decision.coverage_status, "unknown");
    assert.ok(decision.variable_coverage.length > 0);
    assert.ok(decision.variable_coverage.every(v => v.coverage_status === "unknown"));
  });

  it("should not count NaN as present when computing completeness (HALLAZGO-14)", () => {
    // typeof NaN === "number" and NaN != null, so a plain presence filter
    // would count these as "data present" and report 100% completeness for
    // a series that's actually half parse-failure NaN.
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: {
        properties: {
          parameter: {
            T2M: { "20230101": 22.5, "20230102": NaN, "20230103": 23.0, "20230104": NaN },
            PRECTOTCORR: { "20230101": 1.0, "20230102": 2.0, "20230103": 3.0, "20230104": 4.0 },
            RH2M: { "20230101": 78, "20230102": 80, "20230103": 79, "20230104": 81 },
            WS2M: { "20230101": 12, "20230102": 11, "20230103": 13, "20230104": 10 },
            PS: { "20230101": 1013, "20230102": 1012, "20230103": 1014, "20230104": 1011 },
          },
        },
      },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const completenessResult = validation.validation_results.find(r => r.rule === "completeness");

    assert.ok(completenessResult.completeness_pct < 1.0);
  });

  it("should classify world_bank as 'good' when all 4 indicators resolved (HALLAZGO-16)", () => {
    // worldbank.js queries mrv=10 and takes the first non-null of the last
    // 10 years per indicator, so a null reaching here means unpublished for
    // a full decade, not "this year's number isn't out yet" — the 1-2yr
    // reporting lag documented in authoritative-sources.json is already
    // absorbed before Stage02 sees the data. Verified live 2026-07-14: all 4
    // Peru indicators (poverty_rate, gdp_per_capita, water_access,
    // urban_population) have non-null values in every one of the last 10
    // years, so 4/4 is the actual current state, not a hypothetical.
    const stage = new Stage02Validation();
    const source = {
      source_name: "world_bank",
      source_domain: "socioeconomic",
      response: { poverty_rate: 27.6, gdp_per_capita: 8526.3, water_access: 95.6, urban_population: 29150620 },
      coverage_status: "available",
      spatial_distance_km: null,
      resolution_native: "país",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const completenessResult = result.validated_sources[0].validation_results.find(r => r.rule === "completeness");

    assert.equal(completenessResult.completeness_pct, 1.0);
    assert.equal(completenessResult.classification, "good");
  });

  it("should classify world_bank as 'acceptable', not 'good', when one of 4 indicators is missing (HALLAZGO-16)", () => {
    // With only 4 declared fields, completeness_pct can only be one of
    // {0, 0.25, 0.5, 0.75, 1.0} — demonstrates why lowering "good" to
    // 0.90/0.95 would be a no-op for this source: any threshold in (0.75, 1)
    // still requires the same 4/4 that good=1.0 already requires.
    const stage = new Stage02Validation();
    const source = {
      source_name: "world_bank",
      source_domain: "socioeconomic",
      response: { poverty_rate: null, gdp_per_capita: 8526.3, water_access: 95.6, urban_population: 29150620 },
      coverage_status: "available",
      spatial_distance_km: null,
      resolution_native: "país",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const completenessResult = result.validated_sources[0].validation_results.find(r => r.rule === "completeness");

    assert.equal(completenessResult.completeness_pct, 0.75);
    assert.equal(completenessResult.classification, "acceptable");
  });

  it("should validate completeness from config not hardcoded", () => {
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: {
        properties: {
          parameter: {
            T2M: { "20230101": 22.5 },
            PRECTOTCORR: { "20230101": null },
            RH2M: { "20230101": 78 },
            WS2M: { "20230101": 12 },
            PS: { "20230101": 1013 },
          },
        },
      },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
      variable: "air_temperature_current",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const validation = result.validated_sources[0];
    const completenessResult = validation.validation_results.find(r => r.rule === "completeness");

    assert.ok(completenessResult);
    assert.equal(completenessResult.domain_type, "climate");
    assert.equal(completenessResult.domain_type_was_explicitly_mapped, true);
    assert.ok(completenessResult.thresholds_used);
  });

  it("should flag an unmapped source_domain instead of silently blending into a real 'climate' classification (H-27)", () => {
    // classifyDomain() falls back to "climate" thresholds for an unmapped
    // source_domain (so the pipeline doesn't crash), but before this fix
    // that fallback was indistinguishable from a genuinely-mapped "climate"
    // domain — a typo'd or newly-added source_domain with no matching map
    // entry would silently borrow climate's thresholds with no visible sign
    // anything was wrong.
    const stage = new Stage02Validation();
    const source = {
      source_name: "weatherapi",
      source_domain: "some_new_domain_nobody_mapped_yet",
      response: { current: { temp_c: 22.5, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "~2km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const completenessResult = result.validated_sources[0].validation_results.find(r => r.rule === "completeness");

    assert.equal(completenessResult.domain_type, "climate");
    assert.equal(completenessResult.domain_type_was_explicitly_mapped, false);
    assert.match(completenessResult.detail, /WARNING.*some_new_domain_nobody_mapped_yet/);
  });

  it("should pass temporal_consistency for a single date gap in a long series, not flat-warning (HALLAZGO-17)", () => {
    // 1 gap out of 49 checked intervals ≈ 2% gap, i.e. ~98% present — well
    // above the "good" completeness threshold (95%). Mirrors the finding's
    // own example (1 null in 21,532 days) at a smaller, test-friendly scale.
    const stage = new Stage02Validation();
    const dates = {};
    let d = new Date(Date.UTC(2020, 0, 1));
    for (let i = 0; i < 50; i++) {
      if (i !== 25) { // skip day 25 to create exactly one gap
        const key = d.toISOString().slice(0, 10).replace(/-/g, "");
        dates[key] = 20 + i * 0.1;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: { properties: { parameter: { T2M: dates } } },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.result, "pass");
    const gapCheck = temporalResult.temporal_issues.find(c => c.parameter === "T2M");
    assert.equal(gapCheck.classification, "good");
  });

  it("should warn or fail temporal_consistency when most of a series is missing, scaled by gap_pct (HALLAZGO-17)", () => {
    // 4 widely-spaced dates (20-day jumps) mean every one of the 3 checked
    // intervals is a gap — 100% gap fraction, 0% present — the opposite end
    // of the severity scale from the single-gap test above.
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: {
        properties: {
          parameter: {
            T2M: { "20200101": 20, "20200121": 21, "20200210": 22, "20200302": 23 },
          },
        },
      },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.result, "fail");
    const gapCheck = temporalResult.temporal_issues.find(c => c.parameter === "T2M");
    assert.equal(gapCheck.classification, "insufficient");
    assert.equal(gapCheck.gap_pct, 100);
  });

  it("should not let openmeteo_cmip6 null days force temporal_consistency to 'warning' by themselves — that's the completeness rule's call (HALLAZGO-17)", () => {
    const stage = new Stage02Validation();
    const source = {
      source_name: "openmeteo_cmip6",
      source_domain: "projection_climate",
      response: {
        daily: {
          time: ["2020-01-01", "2020-01-02", "2020-01-03"],
          temperature_2m_max: [20, null, 22],
          temperature_2m_min: [10, 11, 12],
          precipitation_sum: [0, 1, 2],
        },
      },
      coverage_status: "available",
      spatial_distance_km: 25.5,
      resolution_native: "20km–51km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.result, "pass");
    const nullCheck = temporalResult.temporal_issues.find(c => c.variable === "temperature_2m_max");
    assert.ok(nullCheck);
    assert.equal(nullCheck.scored_by, "completeness_rule");
  });

  it("should mark temporal_consistency as classification:'not_applicable' for sources with no chronological series, instead of a misleading 'pass' (HALLAZGO-22)", () => {
    // weatherapi's current.* is a single live observation — before this
    // fix, this produced the exact same result:"pass",
    // detail:"Temporal data is consistent" as a source that was actually
    // checked and found consistent, reading as "verified" when nothing was
    // inspected.
    const stage = new Stage02Validation();
    const source = {
      source_name: "weatherapi",
      source_domain: "observation_current",
      response: { current: { temp_c: 22.5, humidity: 78, wind_kph: 12, pressure_mb: 1013 } },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "~2km",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.result, "pass");
    assert.equal(temporalResult.classification, "not_applicable");
    assert.match(temporalResult.detail, /current-observation snapshot/);
  });

  it("should mark temporal_consistency as classification:'checked' when a real check ran and found no issues (HALLAZGO-22)", () => {
    // Contrast with the not_applicable case above: nasa_power has an
    // implemented check, so a clean series should be distinguishable from
    // "nothing was checked" even though both currently read result:"pass".
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: { properties: { parameter: { T2M: { "20230101": 22.5, "20230102": 23.0 } } } },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.result, "pass");
    assert.equal(temporalResult.classification, "checked");
  });

  it("should fall back to an honest generic 'not implemented' message for a source with no explicit reason on file (HALLAZGO-22)", () => {
    // A future or misspelled source_name must not silently look verified —
    // this proves the fallback path doesn't default to a bare "pass".
    const stage = new Stage02Validation();
    const source = {
      source_name: "some_future_source",
      source_domain: "observation_current",
      response: { anything: 1 },
      coverage_status: "available",
      spatial_distance_km: 0,
      resolution_native: "n/a",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.classification, "not_applicable");
    assert.match(temporalResult.detail, /No temporal consistency check implemented/);
  });

  it("should resolve a bare '*' segment mid-path, not just as the final segment (HALLAZGO-20)", () => {
    // "parent.*.child": before this fix, the bare "*" branch in
    // resolvePathParts returned the raw array and discarded everything
    // after it (`rest`), so ".child" was silently never applied — it only
    // ever worked by accident when "*" happened to be the last segment.
    const stage = new Stage02Validation();
    const obj = {
      parent: [
        { child: 1 },
        { child: 2 },
        { child: null },
      ],
    };
    assert.deepEqual(stage.resolvePath(obj, "parent.*.child"), [1, 2, null]);
  });

  it("should pass temporal_consistency for a real, unbroken NOAA ONI season sequence (HALLAZGO-18)", () => {
    // 12 overlapping 3-month seasons per year (Trenberth 1997), not 4
    // non-overlapping ones — DJF is immediately followed by JFM, not by MAM.
    const stage = new Stage02Validation();
    const all_rows = [
      { season: "SON", year: 2024, total: 26.46, anom: -0.21 },
      { season: "OND", year: 2024, total: 26.30, anom: -0.30 },
      { season: "NDJ", year: 2024, total: 26.09, anom: -0.42 },
      { season: "DJF", year: 2025, total: 25.90, anom: -0.50 },
      { season: "JFM", year: 2025, total: 25.85, anom: -0.48 },
    ];
    const source = {
      source_name: "noaa_cpc_oni",
      source_domain: "enso",
      response: { latest_anom: -0.48, all_rows },
      coverage_status: "available",
      spatial_distance_km: null,
      resolution_native: "trimestral",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.result, "pass");
  });

  it("should fail temporal_consistency when NOAA ONI seasons are out of order (HALLAZGO-18)", () => {
    // classifyEnso() (enso-classification.js) assumes its last-N-rows slice
    // is chronologically contiguous; a disordered feed would silently break
    // that assumption with nothing anywhere flagging it, before this fix.
    const stage = new Stage02Validation();
    const all_rows = [
      { season: "SON", year: 2024, total: 26.46, anom: -0.21 },
      { season: "NDJ", year: 2024, total: 26.09, anom: -0.42 }, // OND skipped AND out of strict order relative to what follows
      { season: "OND", year: 2024, total: 26.30, anom: -0.30 }, // goes backward
    ];
    const source = {
      source_name: "noaa_cpc_oni",
      source_domain: "enso",
      response: { latest_anom: -0.30, all_rows },
      coverage_status: "available",
      spatial_distance_km: null,
      resolution_native: "trimestral",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");

    assert.equal(temporalResult.result, "fail");
    const oniCheck = temporalResult.temporal_issues.find(c => c.variable === "oni_all_rows");
    assert.equal(oniCheck.issue, "non_monotonic_sequence");
  });

  it("should scale NOAA ONI gap severity by present_pct instead of a flat warning (HALLAZGO-18)", () => {
    // SON 2024 -> DJF 2025 skips OND and NDJ: 2 missing seasons out of an
    // expected 4-season span (SON, OND, NDJ, DJF) = 2/4 = 50% present.
    const stage = new Stage02Validation();
    const all_rows = [
      { season: "SON", year: 2024, total: 26.46, anom: -0.21 },
      { season: "DJF", year: 2025, total: 25.90, anom: -0.50 },
    ];
    const source = {
      source_name: "noaa_cpc_oni",
      source_domain: "enso",
      response: { latest_anom: -0.50, all_rows },
      coverage_status: "available",
      spatial_distance_km: null,
      resolution_native: "trimestral",
    };
    const result = stage.execute({ sources_consulted: [source] });
    const temporalResult = result.validated_sources[0].validation_results.find(r => r.rule === "temporal_consistency");
    const oniCheck = temporalResult.temporal_issues.find(c => c.variable === "oni_all_rows");

    assert.equal(oniCheck.missing_season_count, 2);
    assert.equal(oniCheck.present_pct, 50);
    assert.equal(oniCheck.classification, "degraded");
    assert.equal(temporalResult.result, "warning");
  });

  it("should have every validateSource() output actually satisfy ValidatedRecordSchema at runtime (HALLAZGO-13)", () => {
    // buildResult() now parses its own return value against
    // ValidatedRecordSchema (pipeline/shared/types.js) before returning it —
    // this exercises every rule this stage runs (schema, fill_value,
    // physical_range, completeness, temporal_consistency) through a single
    // real source and confirms the schema enforcement doesn't throw on
    // legitimate output, i.e. the schema actually matches what the code
    // produces rather than being an aspirational, unenforced definition.
    const stage = new Stage02Validation();
    const source = {
      source_name: "nasa_power",
      source_domain: "observation_historical",
      response: {
        properties: {
          parameter: {
            T2M: { "20230101": 22.5, "20230102": 23.0 },
            PRECTOTCORR: { "20230101": 1.2, "20230102": 0.0 },
          },
        },
      },
      coverage_status: "available",
      spatial_distance_km: 27.5,
      resolution_native: "0.5°",
    };
    assert.doesNotThrow(() => stage.execute({ sources_consulted: [source] }));
  });

  it("should reject a validation result shape ValidatedRecordSchema doesn't recognize (HALLAZGO-13)", () => {
    // buildResult() is a plain method, callable directly to prove the
    // .parse() call is load-bearing (throws on real drift), not just
    // present-but-inert.
    const stage = new Stage02Validation();
    const badSource = { source_name: "weatherapi" };
    assert.throws(() => stage.buildResult(badSource, [
      { rule: "schema_validation", result: "not_a_real_result_value", detail: "x" },
    ]));
  });

});
