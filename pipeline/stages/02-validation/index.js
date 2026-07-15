import { StageInterface } from "../../shared/stage-interface.js";
import { getMaxDistancesForSource, getSourceConfig, getValidationProfiles } from "../../orchestration/config-loader.js";
import { ValidatedRecordSchema } from "../../shared/types.js";
import { seasonIndex, MIN_CONSECUTIVE_SEASONS } from "../../shared/enso-classification.js";

const SOURCE_FIELD_MAP = {
  weatherapi: {
    paths: {
      "current.temp_c": { variable: "air_temperature_current", type: "scalar" },
      "current.humidity": { variable: "relative_humidity", type: "scalar" },
      "current.wind_kph": { variable: "wind_speed", type: "scalar" },
      // H-30: current.pressure_mb maps directly to surface_pressure (unit
      // "hPa" in canonical-schema.js) with no conversion factor — this is
      // correct, not a units mismatch. Millibar and hectopascal are the same
      // unit by definition: 1 mbar = 1 hPa = 100 Pa ("hecto-" = 100; the
      // millibar predates the Pa and was independently defined as 1/1000
      // bar = 100 Pa). See validation-profiles.json physical_ranges.
      // surface_pressure for the same note next to the numeric range.
      "current.pressure_mb": { variable: "surface_pressure", type: "scalar" },
    },
  },
  nasa_power: {
    paths: {
      "properties.parameter.T2M": { variable: "air_temperature_current", type: "timeseries" },
      "properties.parameter.PRECTOTCORR": { variable: "precipitation_sum", type: "timeseries" },
      "properties.parameter.RH2M": { variable: "relative_humidity", type: "timeseries" },
      "properties.parameter.WS2M": { variable: "wind_speed", type: "timeseries" },
      "properties.parameter.PS": { variable: "surface_pressure", type: "timeseries" },
    },
  },
  openmeteo_cmip6: {
    paths: {
      "daily.temperature_2m_max": { variable: "air_temperature_max", type: "timeseries" },
      "daily.temperature_2m_min": { variable: "air_temperature_min", type: "timeseries" },
      "daily.precipitation_sum": { variable: "precipitation_sum", type: "timeseries" },
    },
  },
  opentopodata_srtm30m: {
    paths: {
      "results[0].elevation": { variable: "elevation", type: "scalar" },
    },
  },
  open_elevation: {
    paths: {
      "results[0].elevation": { variable: "elevation", type: "scalar" },
    },
  },
  world_bank: {
    paths: {
      "poverty_rate": { variable: "poverty_rate", type: "scalar" },
      "gdp_per_capita": { variable: "gdp_per_capita", type: "scalar" },
      "water_access": { variable: "water_access", type: "scalar" },
      "urban_population": { variable: "urban_population", type: "scalar" },
    },
  },
  noaa_cpc_oni: {
    paths: {
      "latest_anom": { variable: "oni_index", type: "scalar" },
    },
  },
  supabase_climate_cells: {
    paths: {},
  },
  // Verified 2026-07-14 against the live pixel-driller API: the response is
  // { results: [{ value, layer: { domain, keys: {...} } }, ...] }, a flat
  // array of layer/value pairs, not nested per-variable objects. "buildings"
  // and "traveltime_to_healthcare" each carry multiple entries distinguished
  // by layer.keys.subtype; "all" and "motorized" are the ones actually
  // consumed downstream (adaptive-capacity.json's healthcare_access
  // indicator normalizes traveltime_to_healthcare against a 0-120 min
  // range, which only the "motorized" subtype fits — Weiss et al. 2020's
  // WHO 2-hour motorized-access benchmark; "walking" times run into the
  // hundreds of minutes and would always bottom out the score).
  gri_oxford: {
    paths: {
      "results[layer.domain=population].value": { variable: "population", type: "scalar" },
      "results[layer.domain=buildings][layer.keys.subtype=all].value": { variable: "buildings", type: "scalar" },
      "results[layer.domain=land_cover].value": { variable: "land_cover", type: "scalar" },
      "results[layer.domain=traveltime_to_healthcare][layer.keys.subtype=motorized].value": { variable: "traveltime_healthcare", type: "scalar" },
    },
  },
};

// HALLAZGO-22: sources with no genuine chronological series to check —
// verified per-adapter, not assumed:
//   - weatherapi: current.* is a single live observation, not a series.
//   - opentopodata_srtm30m / open_elevation: static SRTM elevation grid.
//   - world_bank: worldbank.js queries mrv=10 but resolves each indicator to
//     a single most-recent non-null value before Stage02 ever sees it (see
//     HALLAZGO-16) — no raw multi-year array reaches this check.
//   - supabase_climate_cells: response is one grid cell's precomputed
//     median/percentile stats per index (historical/ssp blocks), not a
//     dated observation series.
//   - gri_oxford: response is keyed by fixed rcp/epoch scenario buckets
//     (baseline/2030/2050/2080) verified live 2026-07-14 (see
//     SOURCE_FIELD_MAP above) — projection labels, not incrementally
//     sampled elapsed time, so "missing a step" isn't a meaningful gap here.
const TEMPORAL_CHECK_IMPLEMENTED = new Set(["nasa_power", "openmeteo_cmip6", "noaa_cpc_oni"]);

const TEMPORAL_NOT_APPLICABLE_REASONS = {
  weatherapi: "Single current-observation snapshot (current.*) — no chronological series to check for gaps or order.",
  opentopodata_srtm30m: "Static SRTM elevation grid, not a temporal series.",
  open_elevation: "Static SRTM-heritage elevation grid, not a temporal series.",
  world_bank: "Adapter (worldbank.js) resolves each indicator to a single most-recent non-null value before Stage02 sees it — no raw multi-year series to check.",
  supabase_climate_cells: "Precomputed per-index statistics (median/percentiles) for one grid cell, not a raw dated observation series.",
  gri_oxford: "Fixed rcp/epoch scenario buckets (baseline/2030/2050/2080), not incrementally sampled observations — no chronological gap concept applies.",
};

export class Stage02Validation extends StageInterface {
  constructor() {
    super(2, "Validation");
    this.rulesApplied = [
      "Schema validation: response presence and expected structure",
      "Fill value detection: per-source fill values from validation-profiles.json (CF Conventions 1.12)",
      "Physical range validation: per-variable ranges from WMO No. 8 and IPCC AR6 WG1",
      "Completeness metrics: GCOS-200 thresholds per data type",
      "Temporal consistency: date-gap and NOAA ONI season-sequence checks, severity scaled by completeness.thresholds (nasa_power daily gaps via 'climate', ONI season gaps via 'index' — Trenberth 1997 5-consecutive-season rule)",
      "Spatial coverage: decorrelation-derived max_distance_km from spatial-decorrelation.json (d_max = -L × ln(θ), θ=0.5)",
    ];
  }

  execute(input) {
    const { sources_consulted } = input;
    const profiles = getValidationProfiles();

    const validatedSources = [];
    const coverageDecisions = [];

    for (const source of sources_consulted) {
      const validation = this.validateSource(source, profiles);
      validatedSources.push(validation);

      const decision = this.evaluateCoverage(source);
      coverageDecisions.push(decision);
    }

    return {
      validated_sources: validatedSources,
      coverage_decisions: coverageDecisions,
    };
  }

  validateSource(source, profiles) {
    const fieldMap = SOURCE_FIELD_MAP[source.source_name] || null;

    const validations = [];

    validations.push(this.validateSchema(source));
    if (!source.response) {
      return this.buildResult(source, validations);
    }

    if (fieldMap) {
      validations.push(this.validateFillValues(source, fieldMap, profiles));
      validations.push(this.validatePhysicalRanges(source, fieldMap, profiles));
      validations.push(this.validateCompleteness(source, fieldMap, profiles));
    }

    validations.push(this.validateTemporalConsistency(source, profiles));

    return this.buildResult(source, validations);
  }

  validateSchema(source) {
    if (!source.response) {
      return {
        rule: "schema_validation",
        result: "fail",
        detail: "No response data available for validation",
        reference: null,
      };
    }
    if (typeof source.response !== "object") {
      return {
        rule: "schema_validation",
        result: "fail",
        detail: `Response is type '${typeof source.response}', expected object`,
        reference: null,
      };
    }

    if (this.isErrorResponse(source.response)) {
      console.warn(
        `[validation] schema: source '${source.source_name}' response appears to be an error object. ` +
        `Downstream validators will skip all fields. Check adapter error handling.`
      );
    }

    return {
      rule: "schema_validation",
      result: "pass",
      detail: `Response present and is valid object type for source '${source.source_name}'`,
      reference: null,
    };
  }

  isErrorResponse(obj) {
    if (obj.error != null) return true;
    if (obj.message && Array.isArray(obj.message)) return true;
    if (obj.code && obj.message && typeof obj.message === "string") return true;
    return false;
  }

  // typeof NaN === "number" and NaN != null is true, so a plain `!= null`
  // presence check (HALLAZGO-14, same root cause as HALLAZGO-10's physical
  // range check) counts a parse-failure NaN as "data present," inflating
  // completeness_pct — a series that's half NaN would report 100% complete.
  // Only excludes NaN for actual numbers; doesn't reject non-numeric leaf
  // values (e.g. enso_phase strings), which are legitimately "present".
  isPresentValue(v) {
    if (v == null) return false;
    if (typeof v === "number" && Number.isNaN(v)) return false;
    return true;
  }

  extractValues(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "object") {
      const vals = Object.values(value);
      const hasNested = vals.some(v => v != null && typeof v === "object");
      if (hasNested) {
        console.warn(
          "[validation] extractValues: object contains nested objects. " +
          "Only leaf-level primitives are compared against sentinels. " +
          "Configure paths to resolve to leaf values (e.g., 'a.b.c' instead of 'a.b')."
        );
      }
      return vals;
    }
    return [value];
  }

  validateFillValues(source, fieldMap, profiles) {
    const sourceFillConfig = profiles.fill_values.per_source[source.source_name];
    if (!sourceFillConfig) {
      return {
        rule: "fill_value_detection",
        result: "pass",
        detail: `No fill value configuration defined for '${source.source_name}'. No fill value check performed.`,
        reference: null,
      };
    }

    const fillPaths = sourceFillConfig.paths;
    if (!fillPaths || Object.keys(fillPaths).length === 0) {
      return {
        rule: "fill_value_detection",
        result: "pass",
        detail: `Source '${source.source_name}' has no fill values declared in its configuration.`,
        reference: { standard: sourceFillConfig.standard || "Not specified" },
      };
    }

    const detected = [];
    for (const [pathStr, sentinels] of Object.entries(fillPaths)) {
      if (sentinels.length === 0) continue;
      const value = this.resolvePath(source.response, pathStr);
      if (value == null) continue;
      const values = this.extractValues(value);
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v != null && sentinels.includes(v)) {
          detected.push({
            path: pathStr,
            index: Array.isArray(value) ? i : undefined,
            key: typeof value === "object" && !Array.isArray(value) ? Object.keys(value)[i] : undefined,
            value: v,
          });
        }
      }
    }

    if (detected.length > 0) {
      return {
        rule: "fill_value_detection",
        result: "warning",
        detail: `${detected.length} fill value(s) detected across ${Object.keys(fillPaths).length} checked field(s)`,
        fill_values: detected,
        reference: {
          standard: sourceFillConfig.standard || "CF Conventions 1.12",
          source: sourceFillConfig.reference || null,
        },
      };
    }

    return {
      rule: "fill_value_detection",
      result: "pass",
      detail: `No fill values detected in ${Object.keys(fillPaths).length} field(s) for '${source.source_name}'`,
      reference: {
        standard: sourceFillConfig.standard || "CF Conventions 1.12",
      },
    };
  }

  // H-35 (2026-07-15): peru_range is now an enforced second tier, not just
  // reference metadata. This deliberately revisits v2.0's decision to remove
  // all "warning_ranges" (validation-profiles.json's
  // physical_ranges._warning_ranges_removed) — that removal was because
  // those ranges "no tenían respaldo en WMO No. 8, GCOS, ni literatura
  // revisada por pares." peru_range is different: every entry cites specific
  // SENAMHI stations and observation years (e.g. air_temperature_current:
  // "Estación Antacolpa (Moquegua) -24.5°C; Estación Chachapoyas 42.8°C.
  // Based on observed extremes 1961-2020," SENAMHI (2021) "Climas del Perú")
  // — a national meteorological authority's station record, not an
  // unsourced round number. A value outside peru_range but inside
  // valid_range is "warning" (statistically unusual for Peru, not
  // physically impossible); outside valid_range stays "fail" as before.
  // Only variables with a peru_range entry get this second check — most
  // (relative_humidity, wind_speed, oni_index, socioeconomic indicators
  // besides gdp_per_capita, etc.) don't have one and are unaffected.
  validatePhysicalRanges(source, fieldMap, profiles) {
    const issues = [];
    const checked = [];

    for (const [pathStr, fieldInfo] of Object.entries(fieldMap.paths)) {
      const variable = fieldInfo.variable;
      const rangeConfig = profiles.physical_ranges[variable];
      if (!rangeConfig) continue;

      const value = this.resolvePath(source.response, pathStr);
      if (value == null) continue;

      const values = this.extractValues(value);
      let fieldIssues = 0;
      let fieldWarnings = 0;
      let fieldOk = 0;

      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v == null || typeof v !== "number") continue;

        const vr = rangeConfig.valid_range;
        const pr = rangeConfig.peru_range;

        // typeof NaN === "number", and NaN < x / NaN > x are both false, so
        // without this check a NaN (e.g. from an upstream parse failure)
        // would silently satisfy any range and count as "within_range".
        // Flag it explicitly instead of letting it pass or silently
        // dropping it — either would undercount values_checked below,
        // which already counts it via the typeof check above.
        if (Number.isNaN(v)) {
          issues.push({
            path: `${pathStr}[${i}]`,
            variable,
            value: "NaN",
            valid_range: vr,
            reason: "not_a_number",
            action: "fail",
          });
          fieldIssues++;
          continue;
        }

        if (v < vr.min || v > vr.max) {
          issues.push({
            path: `${pathStr}[${i}]`,
            variable,
            value: v,
            valid_range: vr,
            reason: v < vr.min ? "below_minimum" : "above_maximum",
            action: "fail",
          });
          fieldIssues++;
          continue;
        }

        if (pr && (v < pr.min || v > pr.max)) {
          issues.push({
            path: `${pathStr}[${i}]`,
            variable,
            value: v,
            peru_range: pr,
            reason: v < pr.min ? "below_peru_range" : "above_peru_range",
            action: "warning",
          });
          fieldWarnings++;
          continue;
        }

        fieldOk++;
      }

      checked.push({
        path: pathStr,
        variable,
        values_checked: values.filter(v => v != null && typeof v === "number").length,
        within_range: fieldOk,
        outside_peru_range: fieldWarnings,
        outside_range: fieldIssues,
        valid_range: rangeConfig.valid_range,
        peru_range: rangeConfig.peru_range,
        reference: rangeConfig.reference,
      });
    }

    const failCount = issues.filter(i => i.action === "fail").length;
    const warnCount = issues.filter(i => i.action === "warning").length;
    const nanCount = issues.filter(i => i.reason === "not_a_number").length;
    const rangeFailCount = failCount - nanCount;

    const result = failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass";

    const detailParts = [];
    detailParts.push(`Checked ${checked.length} variable(s)`);
    const totalChecked = checked.reduce((s, c) => s + c.values_checked, 0);
    detailParts.push(`${totalChecked} value(s) inspected`);
    if (rangeFailCount > 0) detailParts.push(`${rangeFailCount} value(s) outside absolute physical limits`);
    if (nanCount > 0) detailParts.push(`${nanCount} value(s) not_a_number (NaN)`);
    if (warnCount > 0) detailParts.push(`${warnCount} value(s) outside Peru-specific expected range (SENAMHI) but within global physical limits`);

    return {
      rule: "physical_range_validation",
      result,
      detail: detailParts.join(". "),
      variables_checked: checked,
      range_issues: issues.length > 0 ? issues : undefined,
      reference: {
        standard: "WMO No. 8 (2018) Guide to Instruments, Chapter 3; IPCC AR6 WG1 Chapter 2",
        peru_range_standard: "SENAMHI (Servicio Nacional de Meteorología e Hidrología del Perú) station-observed extremes — see each variable's own reference.peru_range in validation-profiles.json for the specific station(s)/years cited. Activated as a warning tier in H-35 (2026-07-15); distinct from v2.0's removed warning_ranges, which had no equivalent per-station sourcing.",
        variables: Object.fromEntries(
          checked.map(c => [c.variable, { valid_range: c.valid_range, peru_range: c.peru_range, reference: c.reference }])
        ),
      },
    };
  }

  // Shared by validateCompleteness and validateTemporalConsistency
  // (HALLAZGO-17) so both use the same GCOS-245/WMO-No.100-sourced
  // good/acceptable/degraded boundaries (validation-profiles.json
  // completeness.thresholds) instead of each inventing its own severity
  // cutoffs for what is, for openmeteo_cmip6, literally the same
  // present/missing count over the same fields.
  classifyCompleteness(presentFraction, thresholds) {
    if (presentFraction >= thresholds.good) return "good";
    if (presentFraction >= thresholds.acceptable) return "acceptable";
    if (presentFraction >= thresholds.degraded) return "degraded";
    return "insufficient";
  }

  completenessResultForClassification(classification) {
    if (classification === "good" || classification === "acceptable") return "pass";
    if (classification === "degraded") return "warning";
    return "fail";
  }

  validateCompleteness(source, fieldMap, profiles) {
    const expectedFields = Object.keys(fieldMap.paths);
    if (expectedFields.length === 0) {
      return {
        rule: "completeness",
        result: "pass",
        detail: "No data fields expected for this source (index or metadata-only source)",
        completeness_pct: 1.0,
        classification: "not_applicable",
        reference: null,
      };
    }

    let presentCount = 0;
    let totalExpected = 0;

    for (const [pathStr, fieldInfo] of Object.entries(fieldMap.paths)) {
      const value = this.resolvePath(source.response, pathStr);
      if (fieldInfo.type === "timeseries") {
        if (Array.isArray(value)) {
          totalExpected += value.length;
          presentCount += value.filter(v => this.isPresentValue(v)).length;
        } else if (typeof value === "object" && value !== null) {
          const entries = Object.values(value);
          totalExpected += entries.length;
          presentCount += entries.filter(v => this.isPresentValue(v)).length;
        } else if (this.isPresentValue(value)) {
          totalExpected += 1;
          presentCount += 1;
        } else {
          totalExpected += 1;
        }
      } else {
        totalExpected += 1;
        if (this.isPresentValue(value)) presentCount += 1;
      }
    }

    const pct = totalExpected > 0 ? presentCount / totalExpected : 0;

    const { domainType, wasMapped } = this.classifyDomain(source.source_domain);
    const thresholds = profiles.completeness.thresholds[domainType] || profiles.completeness.thresholds.climate;
    const classification = this.classifyCompleteness(pct, thresholds);
    const result = this.completenessResultForClassification(classification);

    return {
      rule: "completeness",
      result,
      detail: `${(pct * 100).toFixed(1)}% completeness (${presentCount}/${totalExpected} valid, non-null, non-NaN values)`
        + (wasMapped ? "" : ` [WARNING: source_domain '${source.source_domain}' has no completeness-threshold mapping — defaulted to 'climate', verify classifyDomain()]`),
      completeness_pct: Math.round(pct * 10000) / 10000,
      classification,
      thresholds_used: thresholds,
      domain_type: domainType,
      domain_type_was_explicitly_mapped: wasMapped,
      reference: {
        standard: "GCOS-200 (2022) Climate Monitoring Principles, Principle 10",
        gcos_citation: "GCOS-200: 'Data completeness should be monitored and reported with each dataset.'",
        wmo_citation: "WMO No. 100 (2018) §2.3.2: Monthly data ≥80% daily obs, Annual ≥90% monthly.",
      },
    };
  }

  // HALLAZGO-17: severity now scales with how much of the series is
  // affected, instead of any gap/null at all producing the same flat
  // "warning" (1 gap in 21,532 days used to be indistinguishable from
  // 5,000). Reuses classifyCompleteness/completenessResultForClassification
  // — the same GCOS-245-sourced good/acceptable/degraded boundaries
  // validateCompleteness already applies — rather than inventing a second,
  // unsourced set of percentage cutoffs for the same kind of judgment.
  //
  // HALLAZGO-22: result:"pass" here means "checked, no issues found" — the
  // classification field distinguishes that from "not_applicable" (nothing
  // to check, see TEMPORAL_NOT_APPLICABLE_REASONS above), which used to be
  // indistinguishable: both produced identical result:"pass",
  // detail:"Temporal data is consistent", reading as "verified" even when
  // nothing was actually inspected. Mirrors validateCompleteness's existing
  // classification:"not_applicable" pattern rather than adding a 4th
  // ValidationResultSchema result enum value. Any source_name not in either
  // TEMPORAL_CHECK_IMPLEMENTED or TEMPORAL_NOT_APPLICABLE_REASONS still gets
  // an honest generic "not implemented" message instead of silently
  // defaulting to "pass" — so a future new source can't fall through this
  // gap unnoticed.
  validateTemporalConsistency(source, profiles) {
    if (!TEMPORAL_CHECK_IMPLEMENTED.has(source.source_name)) {
      return {
        rule: "temporal_consistency",
        result: "pass",
        detail: TEMPORAL_NOT_APPLICABLE_REASONS[source.source_name]
          || `No temporal consistency check implemented for source '${source.source_name}'.`,
        classification: "not_applicable",
        reference: null,
      };
    }

    if (!source.response || typeof source.response !== "object") {
      return {
        rule: "temporal_consistency",
        result: "pass",
        detail: "No response data to check temporal consistency against.",
        classification: "not_applicable",
        reference: null,
      };
    }

    const gapChecks = [];
    const nullChecks = [];
    const climateThresholds = profiles?.completeness?.thresholds?.climate;
    const severityOrder = { pass: 0, warning: 1, fail: 2 };
    let worstResult = "pass";
    const worsen = (candidate) => {
      if (severityOrder[candidate] > severityOrder[worstResult]) worstResult = candidate;
    };

    if (source.source_name === "nasa_power" && source.response.properties?.parameter) {
      const params = source.response.properties.parameter;
      for (const [key, series] of Object.entries(params)) {
        if (typeof series !== "object" || series === null) continue;
        const dates = Object.keys(series).sort();
        if (dates.length <= 1) continue;

        const gaps = [];
        for (let i = 1; i < dates.length; i++) {
          const prevMs = this.parseYyyymmdd(dates[i - 1]);
          const currMs = this.parseYyyymmdd(dates[i]);
          const dayDiff = Math.round((currMs - prevMs) / 86400000);
          if (dayDiff !== 1) {
            gaps.push({
              expected_date: this.formatYyyymmdd(prevMs + 86400000),
              gap_between: `${dates[i - 1]} and ${dates[i]}`,
            });
          }
        }
        if (gaps.length === 0) continue;

        const intervalsChecked = dates.length - 1;
        const gapFraction = gaps.length / intervalsChecked;
        const classification = climateThresholds
          ? this.classifyCompleteness(1 - gapFraction, climateThresholds)
          : "degraded"; // conservative if the thresholds config is unavailable
        const severity = this.completenessResultForClassification(classification);
        worsen(severity);

        gapChecks.push({
          parameter: key,
          total_intervals_checked: intervalsChecked,
          gap_count: gaps.length,
          gap_pct: Math.round(gapFraction * 10000) / 100,
          classification,
          severity,
          gaps,
        });
      }
    }

    if (source.source_name === "openmeteo_cmip6" && source.response.daily) {
      for (const key of ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"]) {
        const arr = source.response.daily[key];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const nullCount = arr.filter(v => v == null).length;
        if (nullCount > 0) {
          nullChecks.push({
            variable: key,
            total_days: arr.length,
            null_days: nullCount,
            null_pct: Math.round((nullCount / arr.length) * 10000) / 100,
            // Deliberately not scored here (doesn't call worsen()): this
            // counts nulls in daily.temperature_2m_max/temperature_2m_min/
            // precipitation_sum — the exact same fields the completeness
            // rule already checks for this source via SOURCE_FIELD_MAP,
            // using the same thresholds. Scoring it again here would
            // double-judge the same missingness under two independent rule
            // names; the completeness rule is the single place that decides
            // pass/warning/fail for it. This is reported for transparency
            // (which days are affected), not as a second severity verdict.
            scored_by: "completeness_rule",
          });
        }
      }
    }

    // HALLAZGO-18: noaa_cpc_oni's all_rows is a genuine time series (unlike
    // the scalar latest_anom SOURCE_FIELD_MAP checks elsewhere), and nothing
    // else in Stage02 inspects it — validateCompleteness only sees
    // latest_anom, a single field. Reuses seasonIndex/MIN_CONSECUTIVE_SEASONS
    // from enso-classification.js — the canonical 12-overlapping-season
    // (DJF, JFM, FMA, … Trenberth 1997) definition already used to classify
    // ENSO episodes downstream, and the same reason this check matters:
    // classifyEnso() assumes its last-5-rows slice is chronologically
    // contiguous, so out-of-order or gappy all_rows can silently misclassify
    // an ENSO episode with no warning anywhere in the pipeline.
    const oniChecks = [];
    if (source.source_name === "noaa_cpc_oni" && Array.isArray(source.response.all_rows)) {
      const rows = source.response.all_rows;
      if (rows.length > 1) {
        const indices = rows.map(seasonIndex);
        const invalidSeasons = rows.filter((r, i) => indices[i] == null).map(r => r.season);
        const disorderedPairs = [];
        let missingSeasonCount = 0;

        for (let i = 1; i < indices.length; i++) {
          if (indices[i - 1] == null || indices[i] == null) continue;
          const diff = indices[i] - indices[i - 1];
          if (diff <= 0) {
            disorderedPairs.push(`${rows[i - 1].season} ${rows[i - 1].year} -> ${rows[i].season} ${rows[i].year}`);
          } else {
            missingSeasonCount += diff - 1;
          }
        }

        if (invalidSeasons.length > 0 || disorderedPairs.length > 0) {
          // Structural corruption (unparseable season code, or seasons not
          // strictly increasing), not a completeness gap — classifyEnso's
          // consecutiveness assumption is broken regardless of magnitude, so
          // this fails outright instead of being severity-scaled.
          worsen("fail");
          oniChecks.push({
            variable: "oni_all_rows",
            issue: invalidSeasons.length > 0 ? "unrecognized_season_code" : "non_monotonic_sequence",
            invalid_seasons: invalidSeasons.length > 0 ? invalidSeasons : undefined,
            disordered_pairs: disorderedPairs.length > 0 ? disorderedPairs : undefined,
            severity: "fail",
          });
        } else if (missingSeasonCount > 0) {
          const firstIdx = indices[0];
          const lastIdx = indices[indices.length - 1];
          const expectedSlots = lastIdx - firstIdx + 1;
          const presentFraction = expectedSlots > 0 ? rows.length / expectedSlots : 1;
          const indexThresholds = profiles?.completeness?.thresholds?.index;
          const classification = indexThresholds
            ? this.classifyCompleteness(presentFraction, indexThresholds)
            : "degraded"; // conservative if the thresholds config is unavailable
          const severity = this.completenessResultForClassification(classification);
          worsen(severity);

          oniChecks.push({
            variable: "oni_all_rows",
            total_seasons_expected: expectedSlots,
            seasons_present: rows.length,
            missing_season_count: missingSeasonCount,
            present_pct: Math.round(presentFraction * 10000) / 100,
            classification,
            severity,
            note: `A classifyEnso() episode call needs ${MIN_CONSECUTIVE_SEASONS} consecutive seasons; a gap this size may still leave a contiguous run of that length at the end of the series.`,
          });
        }
      }
    }

    const totalIssues = gapChecks.length + nullChecks.length + oniChecks.length;
    if (totalIssues === 0) {
      return {
        rule: "temporal_consistency",
        result: "pass",
        detail: "Temporal data is consistent",
        classification: "checked",
        reference: null,
      };
    }

    const detailParts = [];
    if (gapChecks.length > 0) {
      detailParts.push(`${gapChecks.length} parameter(s) with date gaps (severity scaled by gap_pct: ${gapChecks.map(c => `${c.parameter}=${c.gap_pct}%→${c.classification}`).join(", ")})`);
    }
    if (nullChecks.length > 0) {
      detailParts.push(`${nullChecks.length} variable(s) with null days (severity decided by the completeness rule, not here)`);
    }
    if (oniChecks.length > 0) {
      detailParts.push(oniChecks.map(c => c.issue
        ? `oni_all_rows: ${c.issue} (fail)`
        : `oni_all_rows: ${c.missing_season_count} season(s) missing (${c.present_pct}% present → ${c.classification})`
      ).join("; "));
    }

    return {
      rule: "temporal_consistency",
      result: worstResult,
      detail: detailParts.join("; "),
      classification: "checked",
      temporal_issues: [...gapChecks, ...nullChecks, ...oniChecks],
      reference: {
        standard: "WMO No. 100 Ch. 5 §5.3 Temporal consistency; ISO 19157:2013 Temporal Accuracy",
        severity_scaling: "Date-gap and ONI-season-gap severity classified via the same completeness.thresholds boundaries the completeness rule uses (GCOS-245 three-tier system; index thresholds cite Trenberth 1997's 5-consecutive-season rule for ONI specifically), not a separately invented percentage cutoff.",
      },
    };
  }

  // Evaluates spatial coverage per variable, not blended across a source's
  // variables. A multivariate source (e.g. nasa_power: air_temperature_current
  // d_max=347km, precipitation_sum d_max=21km) is neither disqualified
  // wholesale by its most spatially-localised variable, nor allowed to smuggle
  // that variable in under its least localised variable's allowance — the
  // failure mode of the Math.max()-blended approach this replaces (HALLAZGO-7:
  // at 300km, nasa_power's precipitation_sum is not representative even though
  // its temperature is). coverage_status is a rollup: "available" only if
  // every variable is in range, "out_of_coverage" only if none are, "partial"
  // otherwise, "unknown" if the source needs a distance but has none
  // (HALLAZGO-8, fail-closed — see below) — callers that care about a
  // specific variable must consult variable_coverage, not the rollup.
  evaluateCoverage(source) {
    const distance = source.spatial_distance_km;
    const modelMeta = {
      max_distance_source: "decorrelation_model",
      max_distance_formula: "d_max = -L × ln(θ)",
      max_distance_theta: 0.5,
    };

    if (source.coverage_status === "failed") {
      return {
        source: source.source_name,
        source_domain: source.source_domain,
        coverage_status: "failed",
        distance_km: distance,
        resolution: source.resolution_native || null,
        variable_coverage: [],
        ...modelMeta,
        decision_reason: "source_failed",
      };
    }

    const variableDistances = getMaxDistancesForSource(source.source_name);

    // No variable of this source has a decorrelation model at all (country-
    // level indicators, basin-scale indices, static rasters — see
    // spatial-decorrelation.json's non_stochastic block). Distance genuinely
    // does not apply here, whether or not the adapter happened to report one.
    if (variableDistances.length === 0) {
      return {
        source: source.source_name,
        source_domain: source.source_domain,
        coverage_status: "available",
        distance_km: distance,
        resolution: source.resolution_native || null,
        variable_coverage: [],
        ...modelMeta,
        decision_reason: "no_spatial_distance_required",
      };
    }

    // HALLAZGO-8: this source HAS variables that need a distance to judge
    // representativeness, but spatial_distance_km is missing. That's not "no
    // distance model applies" (handled above) — it means the adapter didn't
    // compute one, which is a bug signal. Failing open here ("assume
    // available") would let that bug through completely undetected, because
    // it would produce the exact same coverage_status as a source confirmed
    // in range. Fail closed instead: mark "unknown" and exclude downstream
    // (Stage03's liveSources filter treats "unknown" like "out_of_coverage"),
    // so a missing distance shows up as a visible gap instead of silently
    // passing.
    if (distance == null) {
      const variableCoverage = variableDistances.map(({ variable, maxDistanceKm }) => ({
        variable,
        distance_km: null,
        max_distance_km: maxDistanceKm,
        coverage_status: "unknown",
        decision_reason: "spatial_distance_km_missing_for_variable_requiring_distance_model",
      }));
      return {
        source: source.source_name,
        source_domain: source.source_domain,
        coverage_status: "unknown",
        distance_km: null,
        resolution: source.resolution_native || null,
        variable_coverage: variableCoverage,
        ...modelMeta,
        decision_reason: "spatial_distance_km_missing_despite_distance_required_source",
      };
    }

    // H-31: distance <= maxDistanceKm (inclusive) is intentional, not an
    // off-by-one — at exactly d = d_max, rho(d) = exp(-d_max/L) = theta =
    // 0.5 by construction (d_max = -L*ln(theta)), and
    // spatial-decorrelation.json's own theta_justification documents rho=0.5
    // as still representative ("el campo retiene suficiente señal"). theta
    // is the minimum ACCEPTABLE correlation, so the boundary point belongs
    // on the "available" side. Verified live 2026-07-15: at d=347km exactly
    // (air_temperature_current's d_max), coverage_status is "available"; at
    // 347.0001km it flips to "out_of_coverage".
    const variableCoverage = variableDistances.map(({ variable, maxDistanceKm }) => {
      const withinRange = distance <= maxDistanceKm;
      return {
        variable,
        distance_km: distance,
        max_distance_km: maxDistanceKm,
        coverage_status: withinRange ? "available" : "out_of_coverage",
        decision_reason: withinRange
          ? `distance_${distance}km_within_max_${maxDistanceKm}km`
          : `distance_${distance}km_exceeds_max_${maxDistanceKm}km`,
      };
    });

    const availableCount = variableCoverage.filter(v => v.coverage_status === "available").length;
    const coverageStatus = availableCount === 0 ? "out_of_coverage"
      : availableCount === variableCoverage.length ? "available"
      : "partial";

    const decisionReason = coverageStatus === "out_of_coverage"
      ? `distance_${distance}km_exceeds_max_distance_for_all_${variableCoverage.length}_variable(s)`
      : coverageStatus === "partial"
        ? `${availableCount}_of_${variableCoverage.length}_variables_within_coverage`
        : `distance_${distance}km_within_max_distance_for_all_${variableCoverage.length}_variable(s)`;

    return {
      source: source.source_name,
      source_domain: source.source_domain,
      coverage_status: coverageStatus,
      distance_km: distance,
      resolution: source.resolution_native || null,
      variable_coverage: variableCoverage,
      ...modelMeta,
      decision_reason: decisionReason,
    };
  }

  // buildResult() aggregates per-rule validations into a single overall status.
  //
  // DESIGN DECISION: "not_available" is NOT a valid result value.
  // ValidationResultSchema (shared/types.js) only accepts "pass" | "fail" | "warning".
  // Tests that are not applicable (e.g., no temporal data for temporal_consistency)
  // return "pass" with a descriptive detail message explaining why the check was skipped.
  // This follows ISO 19157:2013 convention where "not applicable" is represented as
  // "pass" with metadata, not as a separate status — a skipped test must not penalize
  // the overall assessment.
  //
  // The summary counts only the three valid result values. "not_available" was
  // historically produced by validateClimatologicalLimit (removed in HALLAZGO-6)
  // and is no longer used.
  buildResult(source, validations) {
    const hasFail = validations.some(v => v.result === "fail");
    const hasWarning = validations.some(v => v.result === "warning");
    const overallStatus = hasFail ? "failed" : hasWarning ? "warning" : "passed";

    const completenessValidation = validations.find(v => v.rule === "completeness");

    // HALLAZGO-13: enforced at construction time, same pattern as
    // buildRawResponse() in stage-01's adapters/common.js — a validator that
    // emits a result value or shape ValidatedRecordSchema doesn't expect
    // throws immediately here instead of silently drifting from the schema
    // the way this exact object shape already had (dead, unenforced schema
    // requiring fields buildResult() never produced).
    // H-32: is_valid is true for both "passed" and "warning" — a source
    // with warnings is still valid. Intentional, not an oversight: every
    // rule in this stage already treats "warning" as "noteworthy but not
    // disqualifying" and "fail" as "confirmed problem" (fill_value_detection
    // warns on a detected sentinel rather than failing the whole source;
    // completeness/temporal_consistency warn on a "degraded"-tier gap rather
    // than an "insufficient" one — see classifyCompleteness). is_valid just
    // mirrors that same two-tier boundary at the source level: "no confirmed
    // disqualifying issue," not "issue-free" (overall_status already
    // distinguishes "passed" from "warning" for callers that need that
    // finer distinction). Also worth noting for anyone tightening this
    // later: no code in this pipeline currently reads is_valid to decide
    // whether to use a source's data (grep confirms it — Stage03's
    // liveSources filter gates on coverage_status, not is_valid); today it's
    // a reporting field for external consumers (API/UI), not an internal
    // gate, so changing its semantics wouldn't currently affect what data
    // flows through Stage03.
    return ValidatedRecordSchema.parse({
      source: source.source_name,
      overall_status: overallStatus,
      is_valid: overallStatus !== "failed",
      validation_results: validations,
      summary: {
        total_checks: validations.length,
        passed: validations.filter(v => v.result === "pass").length,
        warnings: validations.filter(v => v.result === "warning").length,
        failed: validations.filter(v => v.result === "fail").length,
        completeness_pct: completenessValidation?.completeness_pct ?? null,
      },
    });
  }

  parseYyyymmdd(dateStr) {
    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(4, 6), 10) - 1;
    const day = parseInt(dateStr.slice(6, 8), 10);
    return Date.UTC(year, month, day);
  }

  formatYyyymmdd(utcMs) {
    const d = new Date(utcMs);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  resolvePath(obj, pathStr) {
    if (!obj || typeof obj !== "object") return undefined;
    return this.resolvePathParts(obj, this.splitPath(pathStr));
  }

  // Splits on "." outside of [...] brackets, since filter predicates
  // like "results[layer.domain=population]" contain dots of their own.
  splitPath(pathStr) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const ch of pathStr) {
      if (ch === "[") depth++;
      if (ch === "]") depth--;
      if (ch === "." && depth === 0) {
        parts.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    parts.push(current);
    return parts;
  }

  resolvePathParts(current, parts) {
    if (current == null) return undefined;
    if (parts.length === 0) return current;

    const [part, ...rest] = parts;

    const wildcardMatch = part.match(/^(\w+)\[\*\]$/);
    if (wildcardMatch) {
      const arr = current[wildcardMatch[1]];
      if (!Array.isArray(arr)) return undefined;
      return arr.map(item => this.resolvePathParts(item, rest));
    }

    const indexMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (indexMatch) {
      const arr = current[indexMatch[1]];
      if (arr == null || !Array.isArray(arr)) return undefined;
      return this.resolvePathParts(arr[parseInt(indexMatch[2])], rest);
    }

    // key[field.path=value][field2.path=value2] - filters an array of objects
    // down to entries matching all conditions (used for GRI Oxford's flat
    // results[] array, where the variable is identified by nested keys
    // rather than by array position, e.g. results[layer.domain=population]).
    const filterMatch = part.match(/^(\w+)((?:\[[\w.]+=[^[\]]+\])+)$/);
    if (filterMatch) {
      const arr = current[filterMatch[1]];
      if (!Array.isArray(arr)) return undefined;
      const conditions = [...filterMatch[2].matchAll(/\[([\w.]+)=([^[\]]+)\]/g)]
        .map(m => ({ field: m[1], value: m[2] }));
      const matches = arr.filter(item =>
        conditions.every(({ field, value }) => {
          const v = this.resolvePathParts(item, this.splitPath(field));
          return v != null && String(v) === value;
        })
      );
      if (matches.length === 0) return undefined;
      if (matches.length === 1) return this.resolvePathParts(matches[0], rest);
      return matches.map(m => this.resolvePathParts(m, rest));
    }

    // HALLAZGO-20: a bare "*" segment (as opposed to key[*], handled above)
    // can appear anywhere in the path, e.g. "parent.*.child" — so it must
    // recurse into `rest` per array element exactly like key[*] does, not
    // just return the raw array. Returning `current` outright here would
    // silently drop everything after the "*" (only correct by accident when
    // "*" happens to be the last segment, i.e. rest is empty) — the exact
    // limitation this comment used to have no fix for. No config path
    // currently uses the bare form (only key[*], e.g.
    // "results[*].elevation"), but the fix costs nothing beyond reusing the
    // recursion key[*] above already relies on, so there's no reason to
    // leave it silently wrong for whoever adds one next.
    if (part === "*" && Array.isArray(current)) {
      return current.map(item => this.resolvePathParts(item, rest));
    }

    if (current[part] === undefined || current[part] === null) return undefined;
    return this.resolvePathParts(current[part], rest);
  }

  // H-27: classifyDomain used to fall back to "climate" for any unmapped
  // source_domain with no way to tell that apart from a deliberately-mapped
  // "climate" domain — a real mapping bug (new adapter added without a
  // matching map entry, or a source_domain typo) would silently apply
  // climate's completeness thresholds instead of surfacing the gap.
  // Verified 2026-07-14: every source_domain a registered adapter actually
  // emits today (grep across pipeline/stages/01-acquisition/adapters/) —
  // observation_current, observation_historical, projection_climate,
  // precomputed_grid, elevation, hazard_risk_gri, socioeconomic, enso — is
  // already mapped, plus "groundwater" reserved for the not-yet-built
  // GRACE-FO source (see validation-profiles.json twsa._status, H-24). So
  // this fallback is unreachable today; it exists only to make a *future*
  // unmapped domain visible instead of silently indistinguishable from a
  // real "climate" classification. wasMapped:false is surfaced in
  // validateCompleteness's output rather than swallowed here.
  classifyDomain(sourceDomain) {
    const map = {
      "observation_current": "climate",
      "observation_historical": "climate",
      "projection_climate": "climate",
      "precomputed_grid": "climate",
      "elevation": "geophysical",
      "hazard_risk_gri": "geophysical",
      "groundwater": "climate",
      "socioeconomic": "socioeconomic",
      "enso": "index",
    };
    const domainType = map[sourceDomain];
    if (domainType) return { domainType, wasMapped: true };
    return { domainType: "climate", wasMapped: false };
  }
}
