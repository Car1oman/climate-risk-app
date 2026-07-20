import { StageInterface } from "../../shared/stage-interface.js";
import { getCanonicalInfo, CANONICAL_VARIABLES, getVariablesByDomain } from "./canonical-schema.js";
import { getDecorrelatonConfig, getMaxDistanceForVariable, getValidationProfiles } from "../../orchestration/config-loader.js";
import { classifyEnso } from "../../shared/enso-classification.js";
import { getHorizons, sliceByDateRange } from "../../shared/horizons.js";
import { parseResolutionToMeters } from "../../shared/resolution-parser.js";

const COMPLETENESS_THRESHOLD_DEFAULT = 0.80;

function _buildCompletenessReference(threshold, wasAdaptive, expectedCount) {
  const thresholdPct = Math.round(threshold * 100);
  if (wasAdaptive) {
    return `WMO No. 100 (2018) §2.3.2 + GCOS-245 (2022/2025) three-tier system. ` +
      `Umbral adaptativo=${thresholdPct}% para ventana corta (${expectedCount} valores esperados, <20): ` +
      `interpolación lineal entre GCOS-245 'degraded'=50% (piso) y 'acceptable'=80% (techo). ` +
      `El techo del 80% proviene de WMO §2.3.2: 'Monthly climate data should have ≥80% daily observations'. ` +
      `WMO/GCOS no definen umbrales sub-mensuales; esta es una adaptación provisional pendiente de calibración.`;
  }
  // Non-adaptive: threshold is the ceiling (default 0.80 or from config).
  // Clarify that WMO's 80% rule is for monthly data, applied here as the
  // general completeness floor for longer windows.
  return `WMO No. 100 (2018) Guide to Climatological Practices §2.3.2: ` +
    `'Monthly climate data should have ≥80% daily observations. Annual should have ≥90% monthly.' ` +
    `Umbral efectivo=${thresholdPct}% (ceiling de GCOS-245 'acceptable', aplicado a esta ventana de agregación). ` +
    `La referencia WMO es para datos mensuales; se usa como umbral general para ventanas ≥20 datos porque ` +
    `GCOS-245 no define umbrales específicos para otras frecuencias — valor consistente con validation-profiles.json completeness.thresholds.climate.acceptable.`;
}

// Status marker mirrors the pattern already used for other provisional
// technical thresholds in validation-profiles.json (qc_tests.step_test /
// persistence_test "_status" fields): explicit until superseded by a real
// evaluation, not a silent assumption.
const ADAPTIVE_COMPLETENESS_PENDING_VALIDATION =
  "No calibration dataset evaluated yet. Pending: run this formula's degraded-flag decisions against SENAMHI station completeness records for a representative sample of short windows (1-19 days) and check whether the linear anchors/shape change the pass/fail outcome that a domain expert would assign.";

// Per-source sentinel/fill values — one entry per adapter actually
// registered in pipeline/stages/01-acquisition/registry.js. This is the
// authoritative list; GLOBAL_FILL_VALUES below is a defensive floor for
// _getSourceFillValues' fallback branch, not a second source of truth.
const SOURCE_FILL_VALUES = {
  opentopodata_srtm30m: [-32768, -999, null],
  nasa_power: [-999, -9999, -99999, null],
  weatherapi: [null],
  openmeteo_cmip6: [null, -999],
  noaa_cpc_oni: [-999, null],
  world_bank: [null],
  open_elevation: [-32768, null],
  supabase_climate_cells: [null],
};

// H-4.2 (documentacion-v2 audit finding 4.2): CF Conventions (cfconventions.org
// v1.12 §2.5.1, "Missing data") requires each dataset to DOCUMENT its own
// _FillValue/missing_value — it does not mandate any universal numeric
// sentinel. -999, -9999, -32768 (SRTM void convention, Farr et al. 2007) and
// -99999 are not an external standard; they are simply the union of every
// sentinel value already observed across this pipeline's registered sources
// above. Previously this set only had 2 of those 4 values (missing -32768
// and -99999), so a future unregistered source using either would have
// silently passed corrupted "data" through as valid. Completing the union
// closes that specific gap, but it is still only a defensive floor: it
// cannot know a new source's own convention if that source invents a
// sentinel never seen before, which is why _getSourceFillValues also
// reports whether a source hit this fallback at all (fill_values_source_registered),
// surfaced per-variable in methodology.assumptions instead of passing
// silently either way.
const GLOBAL_FILL_VALUES = new Set([-999, -9999, -32768, -99999, null]);

export class Stage03Normalization extends StageInterface {
  constructor() {
    super(3, "Normalization");
    this.rulesApplied = [
      "Selección multi-fuente — mecanismo único de autoridad: primary con completeness≥0.80 se selecciona directamente (authority gate explícito, sin comparar score) salvo que exista una complementary que domine en TODAS las dimensiones activas para esta decisión. Fuera del gate, TODAS las fuentes (primary y complementary) compiten con la misma fórmula equal-weight — la autoridad ya no se filtra también vía asimetría de fórmula, para que exista un solo mecanismo auditable. H-4.1 (CRÍTICO, 2026-07-15): el 50/50 fijo sobre solo 2 dimensiones (completeness, proximity) no tenía evidencia de ser el peso ni el conjunto de dimensiones correctos. Corregido en dos frentes, sin fabricar una elicitación AHP de expertos que este proyecto no tiene: (1) resolución nativa se promueve de desempate ordinal a tercera dimensión real, normalizada por ranking min-max relativo entre las fuentes candidatas de este dominio (TOPSIS-style, Hwang & Yoon 1981) — no requiere una constante de decaimiento física absoluta como proximity, solo un ranking monótono 'más fino es mejor'; se activa únicamente cuando ≥2 fuentes tienen resolución distinta y discriminante, si no el score cae limpiamente a 2 dimensiones. (2) Cada decisión de scoring ahora incluye un análisis de sensibilidad (_computeSensitivity) que es una PRUEBA matemática, no un muestreo de combinaciones de pesos: como el score es lineal en los pesos, evaluar los vértices puros (peso=1 en una sola dimensión) determina si el ganador es el mismo bajo CUALQUIER ponderación posible (winner_stable) o si la elección de pesos sí importa, en cuyo caso se declara explícitamente en source_decisions[].sensitivity qué fuente gana bajo cada dimensión. Actualización/recencia y metodología quedan explícitamente fuera del scoring: recencia no tiene campo estandarizado entre adaptadores en esta etapa (gap rastreado, no omisión por conveniencia); metodología se asigna DESPUÉS de seleccionar la fuente (_buildMethodology), por lo que usarla como criterio de selección sería circular.",
      "Agregación completa-aware: completeness_ratio = valid_obs / expected_obs; threshold adaptativo por duración del período, interpolado linealmente entre los anclajes 'degraded'/'acceptable' de validation-profiles.json completeness.thresholds.climate (mismos anclajes que usa Stage02 — no reinventados), no entre literales duplicados. Interpolación lineal justificada por máxima entropía (dos anclajes documentados, sin evidencia de curvatura); validación empírica contra SENAMHI pendiente (ver ADAPTIVE_COMPLETENESS_PENDING_VALIDATION en el código).",
      "Cobertura derivada del modelo de decorrelación: distance < d_max → nearest_neighbor; solo interpolación con fuentes multi-punto explícitas",
      "Metodología por variable: method, rationale, references, assumptions documentados por variable canónica",
      "Temporal separado: data_time_range (periodo real de observación) ≠ processing_timestamp (ejecución)",
      "Coordenadas reales: lat_used/lon_used desde request, o null con spatial_trace_confidence = 'unavailable'",
      "source_decisions[]: por cada variable, qué fuente se usó, cuáles se descartaron, y por qué",
      "Missingness: MCAR se asume para toda corrección por completitud (Schafer, 1997), pero ya no sin verificación — cada agregación con completitud por debajo del umbral corre un test de rachas (Wald-Wolfowitz, 1940) sobre la secuencia temporal válido/faltante, buscando específicamente el síntoma que preocupa bajo MAR estacional (faltantes agrupados en tramos, ej. estación húmeda). Ni Little's MCAR test (necesita covarianza multivariable entre varias variables con missingness conjunto) ni un Mann-Whitney contra una covariable como día-del-año (no disponible en esta función) aplican con los datos de una sola serie univariante; el test de rachas sí, usando solo el orden ya disponible. El resultado (rachas observadas/esperadas, z, p, patrón) se reporta por variable en methodology.mcar_test y en assumptions — no prueba MCAR, pero cuando detecta agrupamiento (RECHAZA aleatoriedad) lo declara explícitamente en vez de asumir MCAR en silencio.",
      "Fill values: SOURCE_FILL_VALUES es la lista autoritativa por fuente (no un estándar externo — CF Conventions v1.12 §2.5.1 exige documentar la convención propia de cada dataset, no impone valores numéricos universales). H-4.2 (2026-07-15): GLOBAL_FILL_VALUES (fallback para una fuente no registrada) antes solo cubría 2 de los 4 sentinels ya vistos en producción (-999, -9999; faltaban -32768 del void SRTM y -99999 de nasa_power) — completado a la unión de los 4. Sigue siendo un piso defensivo, no un sustituto de registrar la fuente: methodology.fill_values_source_registered=false marca explícitamente, por variable, cuándo se usó el fallback genérico en vez de la convención documentada de la fuente, en vez de pasar en silencio con un filtrado potencialmente incompleto.",
    ];
    this._decorrelationConfig = null;
    this._validationProfiles = null;
  }

  execute(input) {
    const { location, config, scenario = "ssp245" } = input;
    this._scenario = scenario;
    const sourcesConsulted = input.sources_consulted || [];
    const validatedSources = input.validated_sources || [];
    const coverageDecisions = input.coverage_decisions || [];

    this._decorrelationConfig = getDecorrelatonConfig();
    this._validationProfiles = getValidationProfiles();

    const validationMap = this._buildValidationMap(validatedSources);
    const coverageMap = this._buildCoverageMap(coverageDecisions);

    // Exclude sources that Stage02 marked as out_of_coverage (spatial gate) in
    // addition to the acquisition-time "failed" flag. This closes the disconnect
    // where Stage02 evaluated coverage but Stage03 never acted on the result.
    // "unknown" (HALLAZGO-8: a source whose variables need a distance model
    // but got none from its adapter) and "partial" (HALLAZGO-7) sources still
    // get in here — hard-excluding the whole source at this point would just
    // make the gap invisible instead of closing it. Per-variable filtering
    // below (via each variable's own coverage_action, which already treats
    // "unknown" the same as "out_of_coverage") drops exactly the affected
    // variables and records them in excluded_variables instead.
    const liveSources = sourcesConsulted.filter(s => {
      if (!s.response || s.coverage_status === "failed") return false;
      const dec = coverageMap.get(s.source_name);
      return !dec || dec.coverage_status !== "out_of_coverage";
    });

    const variables = [];
    const excludedVariables = [];
    const sourceDecisions = [];
    const usedVariables = new Set();

    const byDomain = {};
    for (const source of liveSources) {
      const domain = source.source_domain || "unknown";
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(source);
    }

    for (const [domain, domainSources] of Object.entries(byDomain)) {
      const scored = this._scoreSources(domainSources, validationMap, domain);
      const bestSource = scored[0];

      if (!bestSource) continue;

      const extracted = this._extractVariablesFromSource(
        bestSource.source,
        validationMap.get(bestSource.source.source_name),
        coverageMap.get(bestSource.source.source_name)
      );

      for (const v of extracted) {
        // Per-variable spatial coverage (HALLAZGO-7): a variable this
        // localised source can't actually see from here is dropped instead
        // of being smuggled in under a co-located variable's wider
        // decorrelation allowance. Recorded, not silently discarded — see
        // excluded_variables.
        if (v.coverage_action === "out_of_coverage") {
          excludedVariables.push({
            name: v.name,
            source: v.source,
            reason: v.coverage_reason || "out_of_spatial_coverage",
            spatial_info: v.spatial_info,
          });
          continue;
        }
        const dedupKey = `${v.name}|${domain}|${v.data_time_range?.start || "nostart"}`;
        if (usedVariables.has(dedupKey)) continue;
        usedVariables.add(dedupKey);
        variables.push(v);
      }

      const decisionsForDomain = this._buildSourceDecisions(
        domain, domainSources, scored, validationMap, coverageMap
      );
      sourceDecisions.push(...decisionsForDomain);
    }

    return {
      canonical_variables: variables,
      excluded_variables: excludedVariables,
      source_decisions: sourceDecisions,
    };
  }

  _buildValidationMap(validatedSources) {
    const map = new Map();
    for (const v of validatedSources) {
      map.set(v.source, v);
    }
    return map;
  }

  _buildCoverageMap(coverageDecisions) {
    const map = new Map();
    for (const c of coverageDecisions) {
      map.set(c.source, c);
    }
    return map;
  }

  // H-4.1 (documentacion-v2 audit finding 4.1, CRÍTICO): the previous
  // formula fixed the weight at completeness=0.5/proximity=0.5 with no
  // evidence those are the only two relevant dimensions, or that they
  // deserve equal weight. Two changes address this without fabricating an
  // AHP expert-elicitation this project doesn't have (inventing pairwise
  // judgments would just move the arbitrariness somewhere that LOOKS more
  // rigorous — the same problem this audit keeps correcting elsewhere, e.g.
  // 3.5's refusal to fabricate skill weights):
  //   1. Resolution is promoted from an ordinal tiebreaker to a real third
  //      criterion, normalized via relative min-max ranking across THIS
  //      domain's actual candidates (standard MCDA/TOPSIS-style
  //      normalization, Hwang & Yoon 1981) — this does not require an
  //      absolute physically-grounded decay constant (which proximity has
  //      and resolution doesn't), only a monotonic "finer is better"
  //      ranking, which is a much weaker and more defensible claim.
  //   2. Every scoring decision now ships a per-decision, mathematically
  //      COMPLETE sensitivity analysis (_computeSensitivity, called from
  //      _buildSourceDecisions), not a sampled sweep of a few weight
  //      combinations. Equal weight (1/n active dimensions) remains the
  //      default — Laplace's indifference principle, now honestly applied
  //      to every dimension actually available instead of 2 chosen for
  //      convenience — but the sensitivity analysis proves, per decision,
  //      whether that choice could have mattered.
  //
  // Still explicitly excluded, same reasoning as before: update recency
  // (no standardized field across adapters at this stage — tracked gap) and
  // methodology (assigned per-variable AFTER selection — circular as an
  // input to selection).
  _scoreSources(sources, validationMap, domain) {
    const decorrCfg = this._decorrelationConfig;

    const raw = sources.map(source => {
      const validation = validationMap.get(source.source_name);
      const completeness = validation?.summary?.completeness_pct ?? 0.5;

      const distance = source.spatial_distance_km;
      const decorrL = this._getDecorrelationLengthForDomain(domain, decorrCfg);
      const proximityScore =
        distance != null && decorrL != null && decorrL > 0
          ? Math.exp(-distance / decorrL)
          : 1.0;

      return { source, completeness, proximity: proximityScore, resolution_m: this._parseResolutionToMeters(source.resolution_native) };
    });

    // Resolution only becomes an active scoring dimension when it can
    // actually discriminate between this domain's candidates — at least 2
    // sources with a parsed resolution and not all identical. Otherwise
    // there's nothing to rank (a single data point, or a tie, carries no
    // ordering information), and the formula cleanly degrades to the
    // original 2-dimension (completeness, proximity) average rather than
    // inventing a score from nothing.
    const resolutionValues = raw.map(r => r.resolution_m).filter(v => v != null);
    const resolutionActive = resolutionValues.length >= 2 && Math.max(...resolutionValues) > Math.min(...resolutionValues);
    const resMin = resolutionActive ? Math.min(...resolutionValues) : null;
    const resMax = resolutionActive ? Math.max(...resolutionValues) : null;

    const scored = raw.map(r => {
      const dims = [r.completeness, r.proximity];
      let resolutionScore = null;
      if (resolutionActive) {
        // Missing resolution_native for a source, in a decision where OTHER
        // sources do report it, defaults to the neutral midpoint (0.5) —
        // neither rewarded nor penalized for undisclosed metadata, the same
        // "don't guess, don't punish" stance already used when proximity
        // has no decorrelation config to compute from (defaults to 1.0).
        resolutionScore = r.resolution_m != null ? (resMax - r.resolution_m) / (resMax - resMin) : 0.5;
        dims.push(resolutionScore);
      }
      const totalScore = dims.reduce((a, b) => a + b, 0) / dims.length;

      return {
        source: r.source,
        score: Math.round(totalScore * 10000) / 10000,
        components: {
          completeness: r.completeness,
          proximity: r.proximity,
          resolution_m: r.resolution_m,
          resolution_score: resolutionScore,
        },
      };
    });

    scored.sort((a, b) => this._compareScored(a, b));
    return this._applyAuthorityGate(scored);
  }

  // Final determinism guarantee for a literal score tie (identical rounded
  // average across every active dimension — normally this means resolution
  // wasn't discriminating enough to be active for this decision, since when
  // it IS active it's already folded into `score` and would have separated
  // the pair; this branch instead catches the rare case of two genuinely
  // different underlying scores that happen to round to the same 4-decimal
  // value): resolution_score next if available and discriminating (finer
  // wins), then authority_level (primary preferred), then source_name —
  // never an unordered/arbitrary result.
  _compareScored(a, b) {
    if (b.score !== a.score) return b.score - a.score;

    const resScoreA = a.components.resolution_score;
    const resScoreB = b.components.resolution_score;
    if (resScoreA != null && resScoreB != null && resScoreA !== resScoreB) return resScoreB - resScoreA;

    if (a.source.authority_level !== b.source.authority_level) {
      return a.source.authority_level === "primary" ? -1 : 1;
    }
    return a.source.source_name.localeCompare(b.source.source_name);
  }

  // Explicit authority gate: a primary source with completeness >= threshold
  // is selected directly, without being compared by score against
  // complementary sources — UNLESS a complementary source dominates it on
  // EVERY dimension actually active for this decision (completeness,
  // proximity, and resolution when the domain has discriminating resolution
  // data — see _scoreSources), in which case the gate does not fire and the
  // pre-existing score comparison decides. This dominance safeguard exists
  // because "authority" is a reason to prefer primary when evidence is
  // comparable, not a reason to pick primary over a complementary source
  // that is strictly better on every dimension the scoring model tracks.
  _applyAuthorityGate(scored) {
    const primaryEntries = scored.filter(s => s.source.authority_level === "primary");
    if (primaryEntries.length === 0) return scored;

    // Defensive only: registry.js maps at most one source per domain to
    // "primary" (the configured `authoritative` source), so this normally
    // has exactly one candidate.
    const primary = primaryEntries.reduce((a, b) =>
      b.components.completeness > a.components.completeness ? b : a
    );

    if (primary.components.completeness < COMPLETENESS_THRESHOLD_DEFAULT) {
      primary.gate_skipped_reason = `completeness=${primary.components.completeness.toFixed(3)} < authority_gate_threshold=${COMPLETENESS_THRESHOLD_DEFAULT}`;
      return scored;
    }

    const resolutionActive = primary.components.resolution_score != null;

    const dominatingComplementary = scored.find(s => {
      if (s === primary) return false;
      const beatsCompleteness = s.components.completeness > primary.components.completeness;
      const beatsProximity = s.components.proximity > primary.components.proximity;
      const beatsResolution = !resolutionActive || s.components.resolution_score > primary.components.resolution_score;
      return beatsCompleteness && beatsProximity && beatsResolution;
    });
    if (dominatingComplementary) {
      const resText = resolutionActive
        ? `, resolution_score=${dominatingComplementary.components.resolution_score.toFixed(3)} > ${primary.components.resolution_score.toFixed(3)}`
        : "";
      primary.gate_skipped_reason = `dominated by complementary source ${dominatingComplementary.source.source_name} (completeness=${dominatingComplementary.components.completeness.toFixed(3)}, proximity=${dominatingComplementary.components.proximity.toFixed(3)}${resText})`;
      return scored;
    }

    primary.gated = true;
    primary.gate_reason = `authority_gate: primary completeness=${primary.components.completeness.toFixed(3)} >= ${COMPLETENESS_THRESHOLD_DEFAULT} and no complementary source dominates on every active dimension (completeness, proximity${resolutionActive ? ", resolution" : ""})`;

    return [primary, ...scored.filter(s => s !== primary)];
  }

  _getDecorrelationLengthForDomain(domain, decorrCfg) {
    if (!decorrCfg || !decorrCfg.variables) return null;
    const domainVars = getVariablesByDomain();
    const varsInDomain = domainVars[domain];
    if (!varsInDomain || varsInDomain.length === 0) return null;
    // Use the first variable in the domain that has a decorrelation config
    for (const v of varsInDomain) {
      const varCfg = decorrCfg.variables[v];
      if (varCfg?.decorrelation_length_km != null) {
        return varCfg.decorrelation_length_km;
      }
    }
    return null;
  }

  _parseResolutionToMeters(resolutionStr) {
    return parseResolutionToMeters(resolutionStr);
  }

  _extractVariablesFromSource(source, validation, coverage) {
    const extracted = [];
    const name = source.source_name;
    const coverageDecision = coverage;

    if (name === "weatherapi" && source.response?.current) {
      const c = source.response.current;
      const dataTimeEnd = source.response.location?.localtime_epoch
        ? new Date(source.response.location.localtime_epoch * 1000).toISOString()
        : source.request?.timestamp || new Date().toISOString();

      extracted.push(this._buildVariable(
        "air_temperature_current", c.temp_c, source,
        { start: dataTimeEnd, end: dataTimeEnd },
        { method: "direct_read", completeness: 1.0 },
        coverageDecision
      ));
      if (c.humidity != null) {
        extracted.push(this._buildVariable(
          "relative_humidity", c.humidity, source,
          { start: dataTimeEnd, end: dataTimeEnd },
          { method: "direct_read", completeness: 1.0 },
          coverageDecision
        ));
      }
      if (c.wind_kph != null) {
        extracted.push(this._buildVariable(
          "wind_speed", c.wind_kph, source,
          { start: dataTimeEnd, end: dataTimeEnd },
          { method: "direct_read", completeness: 1.0 },
          coverageDecision
        ));
      }
      if (c.pressure_mb != null) {
        extracted.push(this._buildVariable(
          "surface_pressure", c.pressure_mb, source,
          { start: dataTimeEnd, end: dataTimeEnd },
          { method: "direct_read", completeness: 1.0 },
          coverageDecision
        ));
      }
    }

    if (name === "nasa_power" && source.response?.properties?.parameter) {
      const p = source.response.properties.parameter;
      const dates = Object.keys(p.PRECTOTCORR || {}).sort();
      const dataTimeRange = dates.length >= 2
        ? { start: dates[0], end: dates[dates.length - 1] }
        : { start: dates[0] || "unknown", end: dates[0] || "unknown" };

      if (p.PRECTOTCORR) {
        const result = this._aggregateCompletenessAware(
          Object.values(p.PRECTOTCORR),
          null, dates.length,
          "precipitation_sum",
          name
        );
        if (result.value != null) {
          extracted.push(this._buildVariable(
            "precipitation_sum", result.value, source,
            dataTimeRange,
            {
              method: "completeness_weighted_sum",
              completeness: result.completenessRatio,
              validCount: result.validCount,
              expectedCount: result.expectedCount,
              correction_applied: result.correction_applied,
              correction_factor: result.correction_factor,
              threshold_used: result.threshold_used,
              fill_values_source_registered: result.fill_values_source_registered,
            },
            coverageDecision
          ));
        }
      }
    }

    if (name === "openmeteo_cmip6" && source.response?.daily) {
      const d = source.response.daily;
      const times = d.time || [];

      // Slice the full fetched archive into non-overlapping horizon bands
      // (pipeline/shared/horizons.js: historico/corto/mediano/largo) instead
      // of averaging the entire requested window into one scalar. See
      // HALLAZGO-7: the adapter used to hardcode a fixed 2020-2050 request
      // window with no horizon concept at all.
      const horizons = getHorizons();
      const CC_VARS = [
        { rawKey: "temperature_2m_max", canonicalBase: "air_temperature_max" },
        { rawKey: "temperature_2m_min", canonicalBase: "air_temperature_min" },
        { rawKey: "precipitation_sum", canonicalBase: "precipitation_sum" },
      ];

      for (const { rawKey, canonicalBase } of CC_VARS) {
        const rawArr = d[rawKey];
        if (!rawArr) continue;

        for (const h of horizons) {
          const sliced = sliceByDateRange(times, rawArr, h.start, h.end);
          if (sliced.values.length === 0) continue;

          const canonicalName = `${canonicalBase}_${h.name}`;
          const result = this._aggregateCompletenessAware(
            sliced.values, null, sliced.values.length,
            canonicalBase,
            name
          );
          if (result.value == null) continue;

          const method = CANONICAL_VARIABLES[canonicalBase]?.methodology?.default_method
            || "completeness_weighted_mean";

          const timeRange = {
            start: sliced.times[0] || h.start,
            end: sliced.times[sliced.times.length - 1] || h.end,
          };
          // Finding 3.5: the adapter (openmeteo.js) now actually computes
          // every ensemble weighting scheme, not just the active one — keys
          // named "<rawKey>_ensemble_alt_<scheme>". Aggregate each over this
          // same horizon slice and report how much the reported value would
          // have differed under that alternative, so the choice of scheme is
          // a quantified, checkable fact per variable/horizon instead of an
          // assertion in a comment. Knutti et al. (2010) predicts this delta
          // should usually be small; a large one here is itself a finding.
          const altKeys = Object.keys(d).filter(k => k.startsWith(`${rawKey}_ensemble_alt_`));
          const ensembleWeightingComparison = altKeys.map(altKey => {
            const scheme = altKey.slice(`${rawKey}_ensemble_alt_`.length);
            const altSliced = sliceByDateRange(times, d[altKey], h.start, h.end);
            const altResult = this._aggregateCompletenessAware(
              altSliced.values, null, altSliced.values.length, canonicalBase, name
            );
            const deltaAbs = altResult.value != null ? Math.round((altResult.value - result.value) * 10000) / 10000 : null;
            const deltaPct = altResult.value != null && result.value !== 0
              ? Math.round((deltaAbs / Math.abs(result.value)) * 10000) / 100
              : null;
            return { scheme, value: altResult.value, delta_abs: deltaAbs, delta_pct: deltaPct };
          });

          const aggInfo = {
            method,
            value: result.value,
            completeness: result.completenessRatio,
            validCount: result.validCount,
            expectedCount: result.expectedCount,
            correction_applied: result.correction_applied,
            correction_factor: result.correction_factor,
            threshold_used: result.threshold_used,
            horizon: h.name,
            horizon_truncated: h.truncated,
            ensemble_weighting_comparison: ensembleWeightingComparison.length > 0 ? ensembleWeightingComparison : undefined,
            fill_values_source_registered: result.fill_values_source_registered,
          };

          extracted.push(this._buildVariable(canonicalName, result.value, source, timeRange, aggInfo, coverageDecision));

          // Also publish under the bare (non-suffixed) canonical name for the
          // "corto" horizon: Stage04's signalName()/Stage05's
          // phenomenon-definitions.json (e.g. "ola_de_calor" ->
          // "temperatura_max_projection") were built before horizons existed
          // and are not horizon-aware — without this alias they would
          // silently stop receiving any CMIP6 signal at all. "corto"
          // (near-term) is the closest match to what those existing
          // consumers assumed a single undated "projection" value meant.
          if (h.name === "corto") {
            extracted.push(this._buildVariable(canonicalBase, result.value, source, timeRange, aggInfo, coverageDecision));
          }
        }
      }
    }

    if (name === "opentopodata_srtm30m" && source.response?.results?.[0]) {
      const elev = source.response.results[0].elevation;
      if (elev != null) {
        extracted.push(this._buildVariable(
          "elevation", elev, source,
          null,
          { method: "direct_read", completeness: 1.0 },
          coverageDecision
        ));
      }
    }

    if (name === "open_elevation" && source.response?.results?.[0]) {
      const elev = source.response.results[0].elevation;
      if (elev != null) {
        extracted.push(this._buildVariable(
          "elevation", elev, source,
          null,
          { method: "direct_read", completeness: 1.0 },
          coverageDecision
        ));
      }
    }

    if (name === "world_bank" && source.response) {
      const r = source.response;
      const dataTimeRange = { start: source.request?.timestamp || "unknown", end: source.request?.timestamp || "unknown" };
      // Auditoría de transformación de datos, hallazgo P4: estos 5
      // indicadores se consultan por país (country=PE), no por
      // región/distrito — todo punto consultado en Perú recibe el mismo
      // valor. No es fabricación (es un proxy nacional legítimo cuando no
      // existe dato subnacional), pero el output debe declararlo, no
      // presentarlo con la misma confianza espacial que una variable
      // realmente puntual (ej. air_temperature_current).
      const nationalExtra = { spatial_granularity: "national" };
      if (r.poverty_rate != null) {
        extracted.push(this._buildVariable(
          "poverty_rate", r.poverty_rate, source, dataTimeRange,
          { method: "direct_read", completeness: 1.0 }, coverageDecision, nationalExtra
        ));
      }
      if (r.gdp_per_capita != null) {
        extracted.push(this._buildVariable(
          "gdp_per_capita", r.gdp_per_capita, source, dataTimeRange,
          { method: "direct_read", completeness: 1.0 }, coverageDecision, nationalExtra
        ));
      }
      if (r.water_access != null) {
        extracted.push(this._buildVariable(
          "water_access", r.water_access, source, dataTimeRange,
          { method: "direct_read", completeness: 1.0 }, coverageDecision, nationalExtra
        ));
      }
      if (r.urban_population != null) {
        extracted.push(this._buildVariable(
          "urban_population", r.urban_population, source, dataTimeRange,
          { method: "direct_read", completeness: 1.0 }, coverageDecision, nationalExtra
        ));
      }
      if (r.education_literacy != null) {
        extracted.push(this._buildVariable(
          "education_literacy", r.education_literacy, source, dataTimeRange,
          { method: "direct_read", completeness: 1.0 }, coverageDecision, nationalExtra
        ));
      }
    }

    if (name === "gri_oxford" && source.response?.results) {
      const results = source.response.results;
      const dataTimeRange = { start: source.request?.timestamp || "unknown", end: source.request?.timestamp || "unknown" };
      // GRI Oxford response is a flat array of { value, layer: { domain, keys } } pairs.
      // Extract traveltime_healthcare (motorized subtype) for adaptive capacity.
      // Weiss et al. (2020): motorized travel time fits the 0-120 min normalization
      // range in adaptive-capacity.json healthcare_access indicator.
      const traveltimeEntry = results.find(
        r => r.layer?.domain === "traveltime_to_healthcare" && r.layer?.keys?.subtype === "motorized"
      );
      if (traveltimeEntry?.value != null) {
        extracted.push(this._buildVariable(
          "traveltime_healthcare", traveltimeEntry.value, source, dataTimeRange,
          { method: "direct_read", completeness: 1.0 }, coverageDecision
        ));
      }
    }

    if (name === "noaa_cpc_oni" && source.response?.latest_anom != null) {
      extracted.push(this._buildVariable(
        "oni_index", source.response.latest_anom, source,
        { start: source.request?.timestamp || "unknown", end: source.request?.timestamp || "unknown" },
        { method: "direct_read", completeness: 1.0 },
        coverageDecision
      ));

      // Derived from the same raw ONI series (source.response.all_rows), not
      // from a single-quarter threshold on latest_anom above — see
      // pipeline/shared/enso-classification.js (HALLAZGO-4: NOAA CPC requires
      // 5 consecutive overlapping seasons to classify an episode).
      const classification = classifyEnso(source.response.all_rows || []);
      extracted.push(this._buildVariable(
        "enso_phase", classification.state, source,
        { start: source.request?.timestamp || "unknown", end: source.request?.timestamp || "unknown" },
        { method: "consecutive_threshold_classification", completeness: 1.0 },
        coverageDecision
      ));
    }

    if (name === "supabase_climate_cells" && source.response?.historical && typeof source.response.historical === "object") {
      // Maps this source's raw index names to their cc_* canonical variables
      // (see canonical-schema.js for scientific rationale / caveats per
      // index). "tx84rr" is deliberately excluded — its definition could not
      // be confirmed.
      const CC_INDEX_TO_CANONICAL = {
        tas: "cc_tas", tasmax: "cc_tasmax", txx: "cc_txx", tr: "cc_tr",
        hd30: "cc_hd30", hd35: "cc_hd35", r20mm: "cc_r20mm", r50mm: "cc_r50mm",
        rx1day: "cc_rx1day", rx5day: "cc_rx5day", pr: "cc_pr", prpercnt: "cc_prpercnt",
      };
      const histDataTimeRange = { start: source.request?.timestamp || "unknown", end: source.request?.timestamp || "unknown" };
      for (const [rawKey, canonicalName] of Object.entries(CC_INDEX_TO_CANONICAL)) {
        const stat = source.response.historical[rawKey];
        if (stat && typeof stat.median === "number") {
          // Auditoría de transformación de datos, hallazgo P6: p10/p90 del
          // ensemble vienen en la misma respuesta y antes se descartaban —
          // se exponen ahora como uncertainty_range en vez de tirarse, sin
          // ningún costo de fuente adicional.
          const uncertaintyExtra = {
            uncertainty_range: {
              p10: typeof stat.p10 === "number" ? stat.p10 : null,
              p90: typeof stat.p90 === "number" ? stat.p90 : null,
            },
          };
          extracted.push(this._buildVariable(
            canonicalName, stat.median, source, histDataTimeRange,
            { method: "direct_read", completeness: 1.0 },
            coverageDecision, uncertaintyExtra
          ));
        }
      }

      // Auditoría de transformación de datos, hallazgo P2 (el más importante
      // de esa auditoría): los bloques "ensemble-all-sspXXX_YYYY-YYYY" traen
      // proyecciones reales, diferenciadas por escenario, y hasta ahora
      // nunca se leían (ver canonical-schema.js:203-208, "HALLAZGO-6 follow-
      // up"). Solo se extraen aquí los 2 índices para los que el pipeline ya
      // tiene un detector/fenómeno real que los consuma — tasmax (alimenta
      // ola_de_calor/ola_de_frio vía el mismo signal_name que
      // openmeteo_cmip6 ya usa) y pr (alimenta sequia/inundacion, mismo
      // criterio) — no los 12 índices completos: extraer los otros 10 sin
      // que ningún detector los use repetiría exactamente el patrón "dato
      // extraído pero nunca consumido" que esta misma auditoría señaló para
      // NASA POWER T2M. La banda "historico" (comparación) es la misma
      // mediana ya extraída arriba (cc_tasmax/cc_pr) — se re-expone aquí con
      // sufijo _historico porque ProjectionDetector (confidence.js) busca
      // específicamente `${base}_historico`, el mismo contrato que
      // openmeteo_cmip6 ya satisface para sus propias variables.
      // Solo hay bandas corto (2020-2039) y mediano (2040-2059) — Supabase
      // no publica un bloque 2060-2079 ("largo"): no se fabrica esa banda.
      const SSP_PROJECTION_VARS = { tasmax: "cc_tasmax", pr: "cc_pr" };
      const SSP_PERIOD_TO_HORIZON = { "2020-2039": "corto", "2040-2059": "mediano" };
      const scenario = this._scenario || "ssp245";

      for (const [rawKey, canonicalBase] of Object.entries(SSP_PROJECTION_VARS)) {
        const histStat = source.response.historical[rawKey];
        if (histStat && typeof histStat.median === "number") {
          extracted.push(this._buildVariable(
            `${canonicalBase}_historico`, histStat.median, source, histDataTimeRange,
            { method: "direct_read", completeness: 1.0 },
            coverageDecision,
            { scenario: null } // la línea base histórica no depende de escenario
          ));
        }

        for (const [period, horizon] of Object.entries(SSP_PERIOD_TO_HORIZON)) {
          const blockKey = `ensemble-all-${scenario}_${period}`;
          const block = source.response[blockKey];
          const stat = block?.[rawKey];
          if (!stat || typeof stat.median !== "number") continue;

          const [startYear, endYear] = period.split("-");
          extracted.push(this._buildVariable(
            `${canonicalBase}_${horizon}`, stat.median, source,
            { start: `${startYear}-01-01`, end: `${endYear}-12-31` },
            { method: "direct_read", completeness: 1.0 },
            coverageDecision,
            {
              scenario,
              uncertainty_range: {
                p10: typeof stat.p10 === "number" ? stat.p10 : null,
                p90: typeof stat.p90 === "number" ? stat.p90 : null,
              },
            }
          ));
        }
      }
    }

    return extracted;
  }

  // Returns both the sentinel set to use AND whether it came from this
  // source's own documented convention or the generic fallback — the
  // fallback branch is a real gap (an unregistered source), not a designed
  // path, so callers can flag it instead of treating both cases as equally
  // trustworthy.
  _getSourceFillValues(sourceName) {
    const registered = SOURCE_FILL_VALUES[sourceName];
    return {
      values: new Set(registered || GLOBAL_FILL_VALUES),
      is_registered: registered != null,
    };
  }

  // Both interpolation anchors come from validation-profiles.json
  // completeness.thresholds.climate — the same GCOS-245-sourced tiers
  // Stage02's classifyCompleteness reads (its "degraded"/"acceptable"
  // fields, cited there against Carro-Calvo et al. 2020 and WMO No. 100).
  // This function only ever aggregates climate-domain variables
  // (precipitation_sum, air_temperature_max/min — see its two call sites in
  // _extractVariablesFromSource); if a non-climate variable ever needs
  // adaptive thresholding, this must switch to that variable's own
  // completeness.thresholds[domainType] rather than assuming 'climate'.
  //
  // Shape: linear interpolation between the two anchors is a deliberate
  // maximum-entropy choice, not a default. With exactly two documented data
  // points and no empirical evidence about the curve between them, a
  // constant marginal rate (linear) is the interpolant that encodes the
  // fewest additional, unsupported assumptions — a log/quadratic/stepwise
  // curve would each assert a specific, uncited belief about where
  // completeness requirements accelerate or plateau. See
  // ADAPTIVE_COMPLETENESS_PENDING_VALIDATION: this shape is provisional
  // until checked against real SENAMHI short-window records.
  //
  // Precision caveat: completeness_ratio for a window of `count` values is
  // quantized to k/count (k=0..count); for count=1 the only possible ratios
  // are 0 or 1, so the exact interpolated threshold (e.g. 0.515) has no
  // discriminating power there — it only starts to matter once count is
  // large enough that consecutive k/count steps straddle it.
  _computeAdaptiveThreshold(dataPointCount) {
    const thresholds = this._validationProfiles?.completeness?.thresholds?.climate;
    const floor = thresholds?.degraded ?? 0.50;
    const ceiling = thresholds?.acceptable ?? COMPLETENESS_THRESHOLD_DEFAULT;

    if (dataPointCount == null || dataPointCount >= 20) return ceiling;
    return floor + (dataPointCount / 20) * (ceiling - floor);
  }

  // Wald-Wolfowitz runs test (Wald & Wolfowitz, 1940, Ann. Math. Statist.)
  // for randomness of the valid/missing indicator sequence, in its original
  // temporal order. This is the specific, executable check finding 3.3
  // asks for, adapted to what this function actually has available:
  //   - Little's MCAR test (Little, 1988) needs a multivariate covariance
  //     structure across several jointly-missing variables — not available
  //     here, this is one univariate series.
  //   - A Mann-Whitney test against an auxiliary grouping variable (e.g.
  //     day-of-year, to test the "missing days cluster in the wet season"
  //     scenario directly) needs a covariate this function isn't handed —
  //     `values` carries no dates.
  //   - The runs test needs neither: only the already-available temporal
  //     ORDER of valid vs missing entries (both call sites pass
  //     chronologically sorted series). It directly targets the failure
  //     mode 3.3 describes — missingness clustered in a season — because
  //     clustering shows up as significantly FEWER runs than a random
  //     placement would produce.
  // This does not prove MCAR (no test on an incomplete series can); it only
  // checks for one specific, checkable symptom of its violation (temporal
  // clustering) and reports the actual statistic, not a blanket assumption.
  _testMissingnessRandomness(values, isValid) {
    const indicators = values.map(v => (isValid(v) ? 1 : 0));
    const n1 = indicators.reduce((a, b) => a + b, 0);
    const n2 = indicators.length - n1;
    const N = indicators.length;

    const MIN_PER_GROUP = 2;
    const MIN_N = 8;
    if (n1 < MIN_PER_GROUP || n2 < MIN_PER_GROUP || N < MIN_N) {
      return {
        tested: false,
        reason: `insufficient_n(n_valid=${n1}, n_missing=${n2}; need >=${MIN_PER_GROUP} of each and >=${MIN_N} total for the normal approximation to hold)`,
      };
    }

    let runs = 1;
    for (let i = 1; i < indicators.length; i++) {
      if (indicators[i] !== indicators[i - 1]) runs++;
    }

    const expectedRuns = (2 * n1 * n2) / N + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (N * N * (N - 1));
    if (!(variance > 0)) {
      return { tested: false, reason: "degenerate_variance" };
    }

    const z = (runs - expectedRuns) / Math.sqrt(variance);
    const pValue = this._normalTwoTailedPValue(z);
    const significant = pValue < 0.05;
    // Fewer runs than expected (z<0) means valid/missing entries clump into
    // long consecutive stretches — the seasonal-clustering failure mode.
    // More runs than expected (z>0) means the pattern alternates more than
    // chance would — still non-random, but not the scenario 3.3 raises.
    const pattern = !significant ? "consistent_with_random" : (z < 0 ? "clustered" : "alternating");

    return {
      tested: true,
      runs,
      expected_runs: Math.round(expectedRuns * 100) / 100,
      z: Math.round(z * 1000) / 1000,
      p_value: Math.round(pValue * 10000) / 10000,
      pattern,
    };
  }

  // Standard normal two-tailed p-value via the Abramowitz & Stegun (1964)
  // 7.1.26 erf approximation (max error 1.5e-7) — no runtime stats
  // dependency for a single closed-form approximation.
  _normalTwoTailedPValue(z) {
    // p = 2*(1 - Phi(|z|)) = 2*(1 - 0.5*(1+erf(|z|/sqrt2))) = 1 - erf(|z|/sqrt2).
    return 1 - this._erf(Math.abs(z) / Math.SQRT2);
  }

  _erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return sign * y;
  }

  _aggregateCompletenessAware(values, fillValues, expectedCount, variableName, sourceName) {
    const sourceFills = this._getSourceFillValues(sourceName);
    const explicitFills = fillValues != null ? new Set(fillValues) : null;
    const sentinels = explicitFills || sourceFills.values;
    // An explicit fillValues override (caller-supplied) is trusted as-is;
    // otherwise flag whether sourceName had its own documented convention
    // or fell back to GLOBAL_FILL_VALUES' defensive floor (finding 4.2) —
    // that fallback is a real gap (an unregistered source), not a designed
    // path, so it's worth saying so on every value it touches rather than
    // passing silently either way.
    const fillValuesSourceRegistered = explicitFills != null ? true : sourceFills.is_registered;

    const isValid = v => v != null && typeof v === "number" && !sentinels.has(v);
    const validValues = values.filter(isValid);

    const validCount = validValues.length;
    const totalExpected = expectedCount || values.length;
    const completenessRatio = totalExpected > 0 ? validCount / totalExpected : 0;

    const adaptiveThreshold = this._computeAdaptiveThreshold(totalExpected);
    const canonicalInfo = CANONICAL_VARIABLES[variableName];
    const method = canonicalInfo?.methodology?.default_method || "completeness_weighted_sum";

    if (validCount === 0) {
      return {
        value: null, completenessRatio: 0, validCount: 0, expectedCount: totalExpected,
        threshold_used: adaptiveThreshold,
        fill_values_source_registered: fillValuesSourceRegistered,
      };
    }

    if (completenessRatio < adaptiveThreshold && totalExpected > 1) {
      const missingnessTest = this._testMissingnessRandomness(values, isValid);
      const correctionFactor = totalExpected / validCount;
      if (method === "completeness_weighted_sum") {
        const rawSum = validValues.reduce((a, b) => a + b, 0);
        const corrected = rawSum * correctionFactor;
        return {
          value: Math.round(corrected * 100) / 100,
          completenessRatio,
          validCount,
          expectedCount: totalExpected,
          correction_applied: true,
          correction_factor: correctionFactor,
          threshold_used: adaptiveThreshold,
          mcar_test: missingnessTest,
          fill_values_source_registered: fillValuesSourceRegistered,
        };
      }
      if (method === "completeness_weighted_mean") {
        const rawMean = validValues.reduce((a, b) => a + b, 0) / validCount;
        return {
          value: Math.round(rawMean * 100) / 100,
          completenessRatio,
          validCount,
          expectedCount: totalExpected,
          correction_applied: false,
          note: "Mean computed from valid values only; no correction applied for temporal mean (WMO No. 100 §2.3.2: mean is unbiased if MCAR)",
          threshold_used: adaptiveThreshold,
          mcar_test: missingnessTest,
          fill_values_source_registered: fillValuesSourceRegistered,
        };
      }
    }

    const base = {
      completenessRatio,
      validCount,
      expectedCount: totalExpected,
      threshold_used: adaptiveThreshold,
      fill_values_source_registered: fillValuesSourceRegistered,
    };

    if (method === "completeness_weighted_sum") {
      return {
        value: Math.round(validValues.reduce((a, b) => a + b, 0) * 100) / 100,
        correction_applied: false,
        ...base,
      };
    }

    if (method === "completeness_weighted_mean") {
      return {
        value: Math.round(validValues.reduce((a, b) => a + b, 0) / validCount * 100) / 100,
        ...base,
      };
    }

    return { value: validValues[0], ...base };
  }

  // canonicalName identifies which specific variable is being built, so this
  // checks that variable's own coverage — not a blended or domain-level
  // stand-in (HALLAZGO-7). Stage02's coverageDecision.variable_coverage, when
  // present, is authoritative (it's the same per-variable distance-vs-d_max
  // check Stage02 already ran); this only falls back to computing it locally
  // when Stage02 had nothing spatial to say about this source.
  //
  // "unknown" (HALLAZGO-8) is Stage02's fail-closed answer for a source whose
  // variables DO have a decorrelation model but whose spatial_distance_km
  // came back null anyway (an adapter bug, not a legitimate non-spatial
  // source — those never reach here, see evaluateCoverage). It is treated
  // the same as "out_of_coverage": a variable we can't confirm is
  // representative is not used, same as one we've confirmed isn't.
  _deriveCoverageAction(source, coverageDecision, canonicalName) {
    const variableDecision = coverageDecision?.variable_coverage?.find(v => v.variable === canonicalName);
    if (variableDecision) {
      if (variableDecision.coverage_status === "out_of_coverage") {
        return { action: "out_of_coverage", reason: variableDecision.decision_reason };
      }
      if (variableDecision.coverage_status === "unknown") {
        return { action: "out_of_coverage", reason: variableDecision.decision_reason };
      }
      // Stage02 already confirmed this specific variable is within its own
      // decorrelation-derived max distance — no need to recompute it here.
      return { action: "nearest_neighbor", reason: variableDecision.decision_reason };
    }
    if (coverageDecision?.coverage_status === "out_of_coverage" || coverageDecision?.coverage_status === "unknown") {
      return { action: "out_of_coverage", reason: coverageDecision.decision_reason };
    }

    const distance = source.spatial_distance_km;
    if (distance == null || distance === 0) return { action: "direct", reason: "co_located_or_distance_not_tracked" };

    // Use this variable's own decorrelation-derived max distance directly
    // (d_max = -L * ln(theta), theta=0.5, precomputed in
    // spatial-decorrelation.json) rather than a domain-representative
    // stand-in: a domain can bundle variables with very different
    // decorrelation lengths (e.g. "observation_current" holds both
    // surface_pressure L=500km and wind_speed L=200km), so borrowing one
    // variable's L for another's coverage check is the same blending bug
    // this whole fix removes from Stage02.
    // H-31: <= (inclusive) at d = dMax is intentional — rho(dMax) = theta =
    // 0.5 exactly by construction, and theta is the minimum ACCEPTABLE
    // correlation (spatial-decorrelation.json's theta_justification), so the
    // boundary point itself is still representative. Same boundary rule as
    // Stage02's evaluateCoverage() (see its H-31 note) — kept consistent
    // deliberately, not independently re-derived.
    const dMax = getMaxDistanceForVariable(canonicalName);
    if (dMax != null) {
      return distance <= dMax
        ? { action: "nearest_neighbor", reason: `distance_${distance}km_within_max_${dMax}km` }
        : { action: "out_of_coverage", reason: `distance_${distance}km_exceeds_max_${dMax}km` };
    }
    // Fallback if no decorrelation config for this variable: assume native cell size as radius
    const resolution = source.resolution_native;
    if (resolution != null) {
      const meters = this._parseResolutionToMeters(resolution);
      if (meters != null && distance <= meters / 2000) {
        return { action: "direct", reason: "distance_within_native_resolution_cell" };
      }
    }
    if (distance <= 1) return { action: "direct", reason: "distance_within_1km" };
    return { action: "nearest_neighbor", reason: "no_decorrelation_model_assumed_nearest_neighbor" };
  }

  // `extra` transporta campos opcionales que no todas las fuentes producen
  // (scenario, uncertainty_range, spatial_granularity) — se mezclan tal cual
  // en el objeto final en vez de forzar un shape único para todas las
  // variables canónicas; los llamadores que no los necesitan simplemente no
  // los pasan y el campo queda ausente (no `null` fabricado donde no aplica).
  _buildVariable(canonicalName, value, source, dataTimeRange, aggregationInfo, coverageDecision, extra = {}) {
    const info = getCanonicalInfo(canonicalName);
    const { action: coverageAction, reason: coverageReason } = this._deriveCoverageAction(source, coverageDecision, canonicalName);
    const now = new Date();

    const spatialInfo = this._buildSpatialInfo(source);

    return {
      name: canonicalName,
      unit: info.unit,
      value,
      source: source.source_name,
      source_authority: source.authority_level,
      coverage_action: coverageAction,
      coverage_reason: coverageReason,
      spatial_info: spatialInfo,
      data_time_range: dataTimeRange || null,
      processing_timestamp: now.toISOString(),
      methodology: this._buildMethodology(
        canonicalName,
        aggregationInfo.completeness,
        aggregationInfo.method,
        aggregationInfo
      ),
      ...extra,
    };
  }

  _buildSpatialInfo(source) {
    const requestLat = source.request?.params?.lat;
    const requestLon = source.request?.params?.lon;

    if (requestLat != null && requestLon != null) {
      return {
        lat_used: requestLat,
        lon_used: requestLon,
        spatial_trace_confidence: "exact",
        distance_km: source.spatial_distance_km ?? null,
        resolution: source.resolution_native ?? null,
      };
    }

    return {
      lat_used: null,
      lon_used: null,
      spatial_trace_confidence: "unavailable",
      distance_km: source.spatial_distance_km ?? null,
      resolution: source.resolution_native ?? null,
    };
  }

  _buildMethodology(variableName, completenessRatio, method, aggregationInfo) {
    const canonicalInfo = CANONICAL_VARIABLES[variableName];
    const defaultMethod = canonicalInfo?.methodology?.default_method || "direct_read";
    const rawReferences = canonicalInfo?.methodology?.references || [];
    // Cloned, not aliased: this array may get a test-specific citation
    // pushed onto it below, and rawReferences can be the same array object
    // CANONICAL_VARIABLES holds for every other variable of this kind — a
    // push without cloning would leak one call's citation into all of them.
    const references = [...(Array.isArray(rawReferences) ? rawReferences : [String(rawReferences)])];
    const rationale = canonicalInfo?.methodology?.scientific_rationale || "";
    const rawAssumptions = canonicalInfo?.methodology?.assumptions || [];
    const baseAssumptions = Array.isArray(rawAssumptions) ? rawAssumptions : [String(rawAssumptions)];

    const isSum = method === "completeness_weighted_sum";
    const threshold = aggregationInfo.threshold_used ?? COMPLETENESS_THRESHOLD_DEFAULT;
    // The reference string must match the number it's justifying: below 20
    // data points, `threshold` is the linearly-interpolated adaptive value
    // (_computeAdaptiveThreshold), not the flat WMO monthly 0.80 — citing
    // the monthly reference next to an interpolated number like 0.65 would
    // be a real, checkable mismatch for an auditor comparing the two fields.
    const wasAdaptiveThreshold = aggregationInfo.expectedCount != null && aggregationInfo.expectedCount < 20;

    const assumptions = [...baseAssumptions];
    // H-4.2: fill_values_source_registered=false means this source's
    // sentinel/fill-value convention isn't documented in SOURCE_FILL_VALUES
    // — filtering fell back to GLOBAL_FILL_VALUES' defensive floor (union of
    // conventions seen elsewhere), which may not match this source's actual
    // convention. Surfaced here, on the affected value itself, instead of
    // passing silently — this is exactly the gap finding 4.2 flagged.
    if (aggregationInfo.fill_values_source_registered === false) {
      assumptions.push(
        `ADVERTENCIA: fuente sin convención de fill-values documentada en SOURCE_FILL_VALUES — se usó el conjunto genérico de respaldo (GLOBAL_FILL_VALUES: -999, -9999, -32768, -99999, null), que puede no coincidir con la convención real de esta fuente. Registrar la fuente en SOURCE_FILL_VALUES para eliminar esta advertencia.`
      );
    }
    if (wasAdaptiveThreshold) {
      assumptions.push(
        `Umbral de completitud adaptado a ventana corta (${aggregationInfo.expectedCount} valores esperados, <20): ` +
        `${threshold.toFixed(3)} interpolado linealmente entre los anclajes GCOS-245 'degraded' y 'acceptable' de validation-profiles.json. ` +
        `${ADAPTIVE_COMPLETENESS_PENDING_VALIDATION}`
      );
    }
    if (aggregationInfo.correction_applied) {
      assumptions.push(
        `Corrección por completitud aplicada: factor ${aggregationInfo.correction_factor?.toFixed(3) || "N/A"} (expected/valid).`
      );
    }
    // MCAR is never provable from an incomplete series alone, but temporal
    // clustering of the missing entries (the specific failure mode 3.3
    // raises — e.g. gaps concentrated in the wet season) IS checkable with
    // a runs test, so state what was actually found instead of a blanket
    // "MCAR asumido" regardless of case.
    if (aggregationInfo.mcar_test) {
      const t = aggregationInfo.mcar_test;
      if (!t.tested) {
        assumptions.push(
          `Aleatoriedad del patrón de faltantes no verificable estadísticamente (${t.reason}). ` +
          `Se asume MCAR sin evidencia (Schafer, 1997) — si el mecanismo real es MAR/MNAR (p.ej. faltantes concentrados en la estación húmeda), el valor puede estar sub/sobreestimado en una dirección no cuantificada.`
        );
      } else if (t.pattern === "clustered") {
        references.push("Wald, A. & Wolfowitz, J. (1940). 'On a Test Whether Two Samples are from the Same Population.' Ann. Math. Statist. 11(2), 147-162.");
        assumptions.push(
          `Test de rachas (Wald-Wolfowitz) RECHAZA aleatoriedad del patrón de faltantes (runs=${t.runs} vs ${t.expected_runs} esperadas, z=${t.z}, p=${t.p_value}): ` +
          `los valores faltantes se concentran en tramos consecutivos — consistente con un mecanismo estacional (MAR), no con MCAR. ` +
          `El valor reportado sigue asumiendo MCAR (Schafer, 1997); bajo el patrón detectado puede estar sub/sobreestimado en una dirección no cuantificada. Ver Little & Rubin (2019) 'Statistical Analysis with Missing Data', 3rd ed., Cap. 1.`
        );
      } else if (t.pattern === "alternating") {
        references.push("Wald, A. & Wolfowitz, J. (1940). 'On a Test Whether Two Samples are from the Same Population.' Ann. Math. Statist. 11(2), 147-162.");
        assumptions.push(
          `Test de rachas (Wald-Wolfowitz) detecta un patrón de faltantes no aleatorio (runs=${t.runs} vs ${t.expected_runs} esperadas, z=${t.z}, p=${t.p_value}), alternante en vez de agrupado — inconsistente con MCAR simple, aunque no en el sentido de agrupamiento estacional que motivó este test.`
        );
      } else {
        references.push("Wald, A. & Wolfowitz, J. (1940). 'On a Test Whether Two Samples are from the Same Population.' Ann. Math. Statist. 11(2), 147-162.");
        assumptions.push(
          `Test de rachas (Wald-Wolfowitz) no rechaza aleatoriedad del patrón de faltantes (runs=${t.runs} vs ${t.expected_runs} esperadas, z=${t.z}, p=${t.p_value}): consistente con MCAR. ` +
          `Esto no prueba MCAR — solo la ausencia de agrupamiento secuencial detectable con este tamaño de muestra.`
        );
      }
    }
    if (completenessRatio < threshold && !isSum) {
      assumptions.push(
        `Completitud (${(completenessRatio * 100).toFixed(1)}%) por debajo del umbral (${(threshold * 100).toFixed(0)}%). ` +
        `El valor puede no ser representativo del período completo.`
      );
    }
    // Finding 3.5: quantify, per variable/horizon, what this value would
    // have been under every other ensemble weighting scheme the adapter
    // actually computed (openmeteo.js ENSEMBLE_WEIGHTING_SCHEMES) — turning
    // "resolution-inverse vs equal-weight is a defensible choice" from an
    // assertion into a checkable number for this specific request.
    if (aggregationInfo.ensemble_weighting_comparison) {
      references.push("Knutti, R. et al. (2010). 'Challenges in combining projections from multiple climate models.' J. Climate / GRL — skill-weighting typically differs only marginally from equal-weighting.");
      for (const cmp of aggregationInfo.ensemble_weighting_comparison) {
        const deltaText = cmp.delta_pct != null
          ? `${cmp.delta_abs >= 0 ? "+" : ""}${cmp.delta_abs} (${cmp.delta_pct >= 0 ? "+" : ""}${cmp.delta_pct}%)`
          : `${cmp.delta_abs} (delta % no definido: valor activo es 0)`;
        assumptions.push(
          `Peso de ensemble activo: resolution_inverse (ver openmeteo.js ACTIVE_ENSEMBLE_WEIGHTING_SCHEME). ` +
          `Bajo el esquema alternativo '${cmp.scheme}' este valor habría sido ${cmp.value ?? "N/A"} en vez de ${aggregationInfo.value ?? "el valor reportado"}, delta=${deltaText}. ` +
          `RMSE-weighting contra observaciones SENAMHI no está implementado (no hay serie observacional SENAMHI conectada al pipeline aún) — pendiente, no sustituido silenciosamente por resolution_inverse.`
        );
      }
    }

    const thresholdStatus = completenessRatio >= threshold ? "passed" : "degraded";

    return {
      computation_method: method || defaultMethod,
      scientific_rationale: rationale || "Valor extraído directamente de la fuente. No se aplicó transformación.",
      references: references.length > 0 ? references : undefined,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      completeness_ratio: Math.round(completenessRatio * 10000) / 10000,
      completeness_threshold: Math.round(threshold * 100) / 100,
      completeness_threshold_reference: _buildCompletenessReference(threshold, wasAdaptiveThreshold, aggregationInfo.expectedCount),
      completeness_threshold_status: thresholdStatus,
      correction_applied: aggregationInfo.correction_applied ?? false,
      mcar_test: aggregationInfo.mcar_test ?? undefined,
      ensemble_weighting_comparison: aggregationInfo.ensemble_weighting_comparison ?? undefined,
      fill_values_source_registered: aggregationInfo.fill_values_source_registered ?? undefined,
      reference_status: references.length > 0 ? "peer_reviewed_or_industry_standard" : "provisional",
    };
  }

  // H-4.1: proves — not samples — whether the chosen equal weighting
  // (1/n across whichever of completeness/proximity/resolution are active)
  // could have changed which source wins, for THIS specific decision.
  //
  // Why checking only the pure-dimension vertices is a complete proof, not
  // a sample of a few combinations: each candidate's score is a strictly
  // linear function of the weight vector w (score(w) = sum_k w_k * x_k for
  // per-dimension values x_k, weights summing to 1). For any two candidates
  // i, j, the difference score_i(w) - score_j(w) is therefore also linear
  // in w, which means its value at an arbitrary w is exactly the
  // w-weighted AVERAGE of its values at the simplex's vertices (w=1 on one
  // dimension, 0 on the rest). An average of numbers that all share the
  // same sign always shares that sign — so if one candidate has the
  // strictly highest value at EVERY vertex, it has the strictly highest
  // score for EVERY possible weighting in between, not just the ones
  // checked. Conversely, if the top scorer differs across vertices, at
  // least one pairwise ranking must flip somewhere inside the simplex, so
  // the overall winner is provably NOT invariant to the weight choice.
  // This is the "análisis de sensibilidad" the finding asks for, done as a
  // closed-form proof over the entire weight space rather than a sampled
  // sweep (e.g. 70/30, 50/50, 30/70) that could miss a boundary between
  // sampled points.
  _computeSensitivity(scored) {
    if (scored.length < 2) {
      return { applicable: false, reason: "single_candidate_no_comparison_needed" };
    }

    const resolutionActive = scored.every(s => s.components.resolution_score != null);
    const dimensions = resolutionActive
      ? ["completeness", "proximity", "resolution_score"]
      : ["completeness", "proximity"];

    const vertices = dimensions.map(dim => {
      const ranked = [...scored].sort((a, b) => {
        const diff = b.components[dim] - a.components[dim];
        if (diff !== 0) return diff;
        return this._compareScored(a, b); // deterministic tiebreak, never an arbitrary order
      });
      return {
        dimension: dim,
        winner: ranked[0].source.source_name,
        value: ranked[0].components[dim],
      };
    });

    const distinctWinners = new Set(vertices.map(v => v.winner));
    const winnerStable = distinctWinners.size === 1;

    return {
      applicable: true,
      dimensions_used: dimensions,
      weight_scheme: `equal (1/${dimensions.length} each) — Laplace indifference over every dimension with usable data, not 2 chosen for convenience`,
      vertices,
      winner_stable: winnerStable,
      interpretation: winnerStable
        ? `El mismo candidato (${vertices[0].winner}) gana bajo CUALQUIER ponderación posible de {${dimensions.join(", ")}} — prueba por vértices (ver comentario de _computeSensitivity), no muestreo. La elección de pesos 1/${dimensions.length} no afecta este resultado.`
        : `La selección SÍ depende de la ponderación elegida: ${vertices.map(v => `${v.dimension}→${v.winner}`).join(", ")}. Bajo pesos iguales (default) gana quien tenga mayor score promedio, pero un peso distinto (ej. solo proximity, o solo completeness) habría elegido otra fuente. Tratar esta decisión con escrutinio adicional — es exactamente el escenario que el hallazgo 4.1 advierte.`,
    };
  }

  _buildSourceDecisions(domain, domainSources, scored, validationMap, coverageMap) {
    const decisions = [];
    const best = scored[0];

    if (!best) {
      return [{
        domain,
        status: "no_source_available",
        message: `No hay fuentes disponibles para el dominio ${domain}`,
      }];
    }

    const resolutionActive = best.components.resolution_score != null;

    const discardedSources = [];
    for (let i = 1; i < scored.length; i++) {
      const s = scored[i];
      const validation = validationMap.get(s.source.source_name);
      const coverage = coverageMap.get(s.source.source_name);
      const reasons = [];
      if (best.gated) {
        // The gate selected `best` without comparing scores, so this
        // source's score/components (even if numerically higher under the
        // equal-weight formula) were never the deciding factor — say so
        // rather than reusing score-comparison language that would imply
        // otherwise.
        reasons.push(`authority_gate_override(primary completeness=${best.components.completeness.toFixed(3)} selected directly; this source completeness=${s.components.completeness.toFixed(3)}, proximity=${s.components.proximity.toFixed(3)} was not score-compared)`);
      } else {
        // Same equal-weight formula applies to primary and complementary
        // alike (see _scoreSources), so "being complementary" is never
        // itself a discard reason here — only the actual dimensions that
        // separated the scores are.
        if (s.components.completeness < best.components.completeness) {
          reasons.push(`lower_completeness(${s.components.completeness.toFixed(3)} < ${best.components.completeness.toFixed(3)})`);
        }
        if (s.components.proximity < best.components.proximity) {
          reasons.push(`worse_proximity(${s.components.proximity.toFixed(3)} < ${best.components.proximity.toFixed(3)})`);
        }
        if (resolutionActive && s.components.resolution_score != null && s.components.resolution_score < best.components.resolution_score) {
          reasons.push(`worse_resolution_score(${s.components.resolution_score.toFixed(3)} < ${best.components.resolution_score.toFixed(3)})`);
        }
        if (reasons.length === 0 && s.score !== best.score) {
          reasons.push(`overall_score_lower(${s.score} < ${best.score})`);
        }
        if (reasons.length === 0) {
          // Score tied after rounding despite differing components (see
          // _compareScored): resolution_score next, then authority_level,
          // then source_name decided.
          const resScoreA = best.components.resolution_score;
          const resScoreB = s.components.resolution_score;
          if (resScoreA != null && resScoreB != null && resScoreA !== resScoreB) {
            reasons.push(`tiebreak_lower_resolution_score(${resScoreB.toFixed(3)} < ${resScoreA.toFixed(3)})`);
          } else if (best.source.authority_level !== s.source.authority_level) {
            reasons.push("tiebreak_authority_level(complementary loses tie to primary)");
          } else {
            reasons.push("tiebreak_source_name_order");
          }
        }
      }
      discardedSources.push({
        source: s.source.source_name,
        score: s.score,
        reasons,
        authority_level: s.source.authority_level,
        completeness_pct: validation?.summary?.completeness_pct ?? null,
        coverage_status: coverage?.coverage_status ?? s.source.coverage_status,
        resolution_m: s.components.resolution_m,
      });
    }

    const bestValidation = validationMap.get(best.source.source_name);
    const bestCoverage = coverageMap.get(best.source.source_name);

    const isPrimary = best.source.authority_level === "primary";
    const nDims = resolutionActive ? 3 : 2;
    const scoreFormula = resolutionActive
      ? "(completeness+proximity+resolution_score)/3"
      : "(completeness+proximity)/2";
    const componentsText = resolutionActive
      ? `completeness=${best.components.completeness.toFixed(3)}, proximity=${best.components.proximity.toFixed(3)}, resolution_score=${best.components.resolution_score.toFixed(3)}`
      : `completeness=${best.components.completeness.toFixed(3)}, proximity=${best.components.proximity.toFixed(3)}`;

    let selectionRationale;
    if (best.gated) {
      selectionRationale = `${best.gate_reason}. Selected directly, not by score comparison.`;
    } else if (isPrimary) {
      selectionRationale = `Primary source won by equal-weighted (1/${nDims} each) score comparison, not by authority gate (${best.gate_skipped_reason || "no complementary sources to gate against"}); score=${scoreFormula}=${best.score}, ${componentsText}.`;
    } else {
      selectionRationale = `Complementary source selected by equal-weighted (1/${nDims} each) score comparison (same formula applied to primary; authority gate did not fire for this domain): ${componentsText}, score=${best.score}.`;
    }

    decisions.push({
      domain,
      selected_source: best.source.source_name,
      selection_score: best.score,
      selection_components: best.components,
      selection_rationale: selectionRationale,
      gated: best.gated === true,
      sensitivity: this._computeSensitivity(scored),
      authority_level: best.source.authority_level,
      completeness_pct: bestValidation?.summary?.completeness_pct ?? null,
      coverage_status: bestCoverage?.coverage_status ?? best.source.coverage_status,
      spatial_distance_km: best.source.spatial_distance_km ?? null,
      resolution_native: best.source.resolution_native ?? null,
      total_sources_evaluated: scored.length,
      discarded_sources: discardedSources,
    });

    for (const source of domainSources) {
      const alreadyRecorded = scored.some(s => s.source.source_name === source.source_name);
      if (!alreadyRecorded) {
        discardedSources.push({
          source: source.source_name,
          score: null,
          reasons: ["filtered_before_scoring"],
          authority_level: source.authority_level,
          coverage_status: source.coverage_status,
        });
      }
    }

    return decisions;
  }

}
