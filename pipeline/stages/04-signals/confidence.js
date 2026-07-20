import {
  getDecorrelatonConfig,
  getResolutionProfiles,
  getTemporalCoverageProfiles,
  getThresholds,
  getSourceQualityWeights,
} from "../../orchestration/config-loader.js";
import { parseResolutionToMeters } from "../../shared/resolution-parser.js";
import { getHorizons } from "../../shared/horizons.js";

const HORIZON_SUFFIXES = ["historico", "corto", "mediano", "largo"];

// openmeteo_cmip6 also publishes a bare (non-suffixed) alias of each
// projection variable for the "corto" band only (see Stage 3
// _extractVariablesFromSource: `if (h.name === "corto") extracted.push(...
// canonicalBase ...)`) — so a variable name with no recognizable horizon
// suffix from this source is always that "corto" alias, never ambiguous.
function stripHorizonSuffix(varName) {
  for (const suf of HORIZON_SUFFIXES) {
    if (varName.endsWith(`_${suf}`)) {
      return suf;
    }
  }
  return null;
}

// spatial-decorrelation.json and resolution-profiles.json's variable_overrides
// key their per-variable physics (decorrelation_length_km) by the BASE
// canonical name (e.g. "air_temperature_max"), but openmeteo_cmip6 variables
// carry a horizon suffix (e.g. "air_temperature_max_corto" — see Stage 3
// canonicalName = `${canonicalBase}_${h.name}`). The decorrelation length of a
// physical field doesn't change with the projection horizon, so this strips
// the suffix before the lookup rather than treating every horizon variant as
// an unregistered variable (which silently zeroed out the climatological
// resolution floor and excluded coverage_spatial for all CMIP6 variables).
function baseVariableName(varName) {
  const suffix = stripHorizonSuffix(varName);
  return suffix ? varName.slice(0, -(suffix.length + 1)) : varName;
}

function lookupDecorrelation(decorrCfg, varname) {
  return decorrCfg?.variables?.[varname] ?? decorrCfg?.variables?.[baseVariableName(varname)];
}

function daysBetween(range) {
  if (!range || !range.start || !range.end) return null;
  const start = new Date(range.start);
  const end = new Date(range.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// coverage_spatial (30%): exponential decorrelation model exp(-d/L) per MVSM
// (Isaaks & Srivastava 1989, Journel & Huijbregts 1978 — see
// spatial-decorrelation.json and specs/.../methodology/coverage_spatial-methodology.md
// for the full per-variable citation list). Non-stochastic variables
// (elevation, ONI, country-level socioeconomic indicators) follow the
// exception rules already defined in spatial-decorrelation.json's
// `non_stochastic` block instead of the decay model. Null distance or null
// decorrelation length EXCLUDES the component (coverage_spatial-methodology.md
// §3-4, "Safeguard 1") — it does NOT default to a fabricated 1.0/0.8/0.5, per
// the already-approved methodology (see coverage_spatial-validation-status.md).
function computeCoverageSpatial(source, decorrCfg, resolutionResult) {
  const varname = source.variable;
  const distance = source.spatial_distance_km;

  const nonStochastic = decorrCfg?.non_stochastic?.[varname];
  if (nonStochastic) {
    if (nonStochastic.rule === "always_1") {
      return {
        value: 1.0,
        reason: `non_stochastic(always_1): ${nonStochastic.description}`,
      };
    }
    if (nonStochastic.rule === "categorical") {
      return {
        value: 1.0,
        reason: `non_stochastic(categorical): ${nonStochastic.description} — fuente disponible en esta ejecución`,
      };
    }
    if (nonStochastic.rule === "resolution_ratio") {
      // "coverage_spatial for DEM should equal 1.0 if DEM resolution <=
      // required resolution... coverage degrades as a function of
      // resolution ratio, NOT decorrelation" (coverage_spatial-methodology.md
      // §1). That is exactly what the `resolution` component already
      // computes, so it is reused here rather than re-deriving a second,
      // potentially inconsistent ratio.
      return resolutionResult.value != null
        ? { value: resolutionResult.value, reason: `non_stochastic(resolution_ratio): ${nonStochastic.description} — delegado al componente resolution (mismo valor, sin modelo de decorrelación aplicable)` }
        : { value: null, reason: `non_stochastic(resolution_ratio): ${nonStochastic.description} — resolution component también excluido (${resolutionResult.reason})` };
    }
  }

  const varCfg = lookupDecorrelation(decorrCfg, varname);
  const decorrL = varCfg?.decorrelation_length_km;

  if (distance == null) {
    return { value: null, reason: "distance_unavailable: sin spatial_distance_km reportado para esta fuente/variable" };
  }
  if (decorrL == null || decorrL <= 0) {
    return { value: null, reason: `decorrelation_length_unavailable: sin longitud de decorrelación registrada para '${varname}' en spatial-decorrelation.json` };
  }
  const value = Math.exp(-Math.abs(distance) / decorrL);
  return {
    value: round4(value),
    reason: `exp(-d/L), d=${distance}km, L=${decorrL}km (${varCfg?.reference?.citation || "spatial-decorrelation.json"})`,
  };
}

// coverage_temporal (20%): extensión real de la serie subyacente vs. la
// duración requerida para el tipo de dato — distinto de `completeness`
// (integridad de campos) y de Stage 3's methodology.completeness_ratio
// (densidad de valores válidos DENTRO de la ventana). Ver
// temporal-coverage-profiles.json para la metodología completa por fuente,
// con cita.
function computeCoverageTemporal(source, temporalCfg) {
  const sourceName = source.source_name;
  if (sourceName == null) {
    return { value: null, reason: "source_name_unavailable: no se puede clasificar la metodología de coverage_temporal sin saber el adapter de origen" };
  }

  if (temporalCfg.point_in_time_sources.sources.includes(sourceName)) {
    return { value: 1.0, reason: `point_in_time_source: ${temporalCfg.point_in_time_sources.reference}` };
  }
  if (temporalCfg.climate_normal_sources.sources.includes(sourceName)) {
    return { value: 1.0, reason: `climate_normal_source: ${temporalCfg.climate_normal_sources.reference.citation}` };
  }

  const fixedWindow = temporalCfg.fixed_window_sources.sources[sourceName];
  if (fixedWindow) {
    const span = daysBetween(source.data_time_range);
    if (span == null) {
      return { value: null, reason: `data_time_range_unavailable para fuente de ventana fija '${sourceName}'` };
    }
    const ratio = Math.min(1, span / fixedWindow.required_span_days);
    return {
      value: round4(ratio),
      reason: `actual_span_days=${round4(span)} / required_span_days=${fixedWindow.required_span_days} (${fixedWindow.reference.citation})`,
    };
  }

  if (temporalCfg.horizon_projection_sources.sources.includes(sourceName)) {
    const horizonName = stripHorizonSuffix(source.variable) || "corto";
    const band = getHorizons().find(b => b.name === horizonName);
    if (!band) {
      return { value: null, reason: `banda de horizonte desconocida '${horizonName}' para variable '${source.variable}'` };
    }
    const requiredDays = daysBetween({ start: band.nominal_start, end: band.nominal_end });
    const actualDays = daysBetween(source.data_time_range);
    if (actualDays == null || requiredDays == null || requiredDays <= 0) {
      return { value: null, reason: "datos insuficientes de data_time_range para calcular el ratio de horizonte" };
    }
    const ratio = Math.min(1, actualDays / requiredDays);
    return {
      value: round4(ratio),
      reason: `horizonte='${horizonName}' actual_span_days=${round4(actualDays)} / nominal_span_days=${round4(requiredDays)}` +
        (band.truncated ? " (banda nominal recortada por el límite del archivo fuente — ver horizons.js)" : ""),
    };
  }

  return { value: null, reason: `sin metodología de coverage_temporal definida para la fuente '${sourceName}' (${temporalCfg.unclassified_fallback._description})` };
}

// data_completeness (20%): completitud temporal de la fuente para esta variable.
// H-11 (documentacion-v2/stage-04): el cálculo anterior (present/keys.length)
// era trivialmente 1.0 para fuentes de una sola variable, making the component
// useless for discrimination. Se reemplaza por methodology.completeness_ratio
// calculado en Stage 3 (WMO No.100 / GCOS-245 — fracción de observaciones
// válidas sobre observaciones esperadas en la ventana temporal).
function computeCompleteness(source) {
  // H-11: preferir completitud temporal real de Stage 3 cuando está disponible
  if (source.methodology_completeness_ratio != null) {
    const value = source.methodology_completeness_ratio;
    return {
      value: round4(value),
      reason: `completeness_ratio_stage3=${round4(value)} (methodology.completeness_ratio — WMO No.100 / GCOS-245, observaciones_válidas/observaciones_esperadas)`,
    };
  }

  // Fallback: completitud de campos presentes (solo cuando no hay datos de Stage 3)
  const varname = source.variable;
  if (source.response && typeof source.response === "object") {
    const keys = source.response[varname] != null ? [varname] : Object.keys(source.response);
    const present = keys.filter(k => source.response[k] != null).length;
    const value = keys.length > 0 ? present / keys.length : 1.0;
    return { value: round4(value), reason: `fallback_campos_presentes=${present}/${keys.length} (sin methodology.completeness_ratio de Stage 3)` };
  }
  return { value: 0, reason: "sin objeto response ni methodology.completeness_ratio" };
}

// resolution (20%): exp(-alpha * max(0, ratio-1)) donde ratio =
// native_m / required_m (CEOS WGCV 2019 — resolution-profiles.json, componente
// hasta ahora sin ninguna implementación real). required_m combina el piso
// sectorial (Nyquist sobre el feature mínimo relevante) con el requerimiento
// climatológico derivado de la longitud de decorrelación de la variable
// (resolution-profiles.json variable_overrides, samples_per_decorrelation_length=2),
// tomando el máximo de ambos.
function computeResolution(source, resolutionProfiles, decorrCfg, sector) {
  const varname = source.variable;

  const nonSpatialVars = resolutionProfiles.native_resolution_parse?.non_spatial_variables || [];
  if (nonSpatialVars.includes(varname)) {
    return { value: 1.0, reason: "non_spatial_variable: sin concepto de resolución de grilla aplicable (resolution-profiles.json native_resolution_parse.non_spatial_variables)" };
  }

  const nativeM = parseResolutionToMeters(source.resolution_native);
  if (nativeM == null) {
    return { value: null, reason: `resolution_native ausente o no parseable: '${source.resolution_native}'` };
  }

  const sectorKey = resolutionProfiles.sectors?.[sector] ? sector : resolutionProfiles.default_sector;
  const sectorProfile = resolutionProfiles.sectors?.[sectorKey];
  const sectorRequiredM = sectorProfile?.required_resolution_meters;
  if (sectorRequiredM == null) {
    return { value: null, reason: `sin perfil de resolución para sector '${sector}' ni para el sector default` };
  }

  const decorrL = lookupDecorrelation(decorrCfg, varname)?.decorrelation_length_km;
  const samplesPerL = resolutionProfiles.variable_overrides?.samples_per_decorrelation_length ?? 2;
  const climatologicalRequiredM = decorrL != null ? (decorrL * 1000) / samplesPerL : null;
  const requiredM = climatologicalRequiredM != null ? Math.max(sectorRequiredM, climatologicalRequiredM) : sectorRequiredM;

  const ratio = nativeM / requiredM;
  const alpha = resolutionProfiles.decay_alpha ?? 0.3;
  const value = ratio <= 1 ? 1.0 : Math.exp(-alpha * (ratio - 1));

  return {
    value: round4(value),
    reason: `native_m=${round4(nativeM)}, required_m=${round4(requiredM)} (sector='${sectorKey}' piso=${sectorRequiredM}` +
      (climatologicalRequiredM != null ? `, climatológico=${round4(climatologicalRequiredM)}` : "") +
      `), ratio=${round4(ratio)}, alpha=${alpha} (CEOS WGCV 2019)`,
  };
}

// proximity (10%): a diferencia de coverage_spatial (modelo físico de
// decorrelación específico por variable), proximity es un chequeo simple e
// independiente — ¿está la fuente dentro del radio operativo de
// representatividad de SU DOMINIO? (thresholds.json spatial_coverage,
// cada umbral ya citado: WMO-No.8 CIMO Guide, ESA Sentinel-2 Handbook, USGS
// Open-File Report 2012-1215, CORDEX-SA, WMO OSCAR). Caída lineal, no
// exponencial — misma información base (distancia) pero una forma y un
// fundamento distintos, evitando duplicar coverage_spatial bajo otro nombre.
const PROXIMITY_MAX_KM_KEY_BY_SOURCE = {
  weatherapi: "observation_max_km",
  nasa_power: "observation_max_km",
  openmeteo_cmip6: "grid_projection_max_km",
  supabase_climate_cells: "grid_projection_max_km",
  opentopodata_srtm30m: "high_resolution_max_km",
  open_elevation: "high_resolution_max_km",
  gri_oxford: "geophysical_max_km",
  world_bank: "default_max_distance_km",
  noaa_cpc_oni: "enso_max_km",
  noaa_enso_discussion: "enso_max_km",
};

function computeProximity(source, thresholds) {
  const distance = source.spatial_distance_km;
  if (distance == null) {
    return { value: null, reason: "distance_unavailable" };
  }
  const sourceName = source.source_name;
  const key = sourceName != null ? PROXIMITY_MAX_KM_KEY_BY_SOURCE[sourceName] : null;
  if (key == null) {
    return { value: null, reason: `sin umbral de proximidad mapeado para la fuente '${sourceName}'` };
  }
  const maxKm = thresholds.spatial_coverage?.[key];
  if (maxKm == null) {
    // enso_max_km es null por diseño: ONI es un fenómeno de escala de cuenca
    // sin límite de representatividad local (thresholds.json _refs.enso_max_km).
    return { value: 1.0, reason: `${key}=null (${thresholds.spatial_coverage?._refs?.[key] || "sin límite de representatividad local"}) — proximity siempre 1.0` };
  }
  const value = Math.max(0, 1 - Math.abs(distance) / maxKm);
  return {
    value: round4(value),
    reason: `max(0, 1 - d/max_km), d=${distance}km, ${key}=${maxKm}km (${thresholds.spatial_coverage?._refs?.[key] || "thresholds.json"})`,
  };
}

// Source Quality = promedio ponderado de 5 componentes (30/20/20/20/10, ver
// thresholds.json source_quality_weights) — H-01 (documentacion-v2/stage-04,
// CRÍTICO): la implementación previa solo calculaba 2 de los 5 componentes
// del spec (spatial, completeness) con pesos fijos 50/50 sin fundamento.
// Componentes con value=null se EXCLUYEN del promedio (denominador reducido,
// no se fabrica un valor) y se registran en components_excluded con la razón
// exacta — Safeguard 1 de coverage_spatial-methodology.md, generalizado a los
// 5 componentes.
export function calculateSourceQuality(source, sector = "default") {
  const decorrCfg = getDecorrelatonConfig();
  const resolutionProfiles = getResolutionProfiles();
  const temporalCfg = getTemporalCoverageProfiles();
  const thresholds = getThresholds();
  const weights = getSourceQualityWeights() || {};

  const resolution = computeResolution(source, resolutionProfiles, decorrCfg, sector);
  const components = {
    coverage_spatial: computeCoverageSpatial(source, decorrCfg, resolution),
    coverage_temporal: computeCoverageTemporal(source, temporalCfg),
    completeness: computeCompleteness(source),
    resolution,
    proximity: computeProximity(source, thresholds),
  };

  let weightedSum = 0;
  let totalWeight = 0;
  const weightsApplied = {};
  const componentsExcluded = [];

  for (const [key, result] of Object.entries(components)) {
    if (result.value == null) {
      componentsExcluded.push({ component: key, reason: result.reason });
      continue;
    }
    const w = weights[key] ?? 0;
    weightsApplied[key] = w;
    weightedSum += result.value * w;
    totalWeight += w;
  }

  const score = totalWeight > 0 ? round4(weightedSum / totalWeight) : null;

  return {
    score,
    components,
    weights_applied: weightsApplied,
    total_weight_used: round4(totalWeight),
    components_excluded: componentsExcluded.length > 0 ? componentsExcluded : undefined,
  };
}

function findSibling(allVariables, name, sourceName) {
  return allVariables.find(v => v.name === name && (sourceName == null || v.source === sourceName));
}

// Converts a raw delta into a 0-1 significance ratio using the ALREADY-CITED
// (and, before this fix, entirely unused — same class of gap as
// resolution-profiles.json before H-01) thresholds.json `anomaly` block: the
// magnitude a change needs to reach before it counts as a scientifically
// "significant" anomaly for that physical quantity. Dispatches on the
// variable's own unit (not its name) so it generalizes to any canonical
// variable sharing that unit, instead of a hardcoded per-variable-name table.
function computeSignificanceRatio(delta, baselineValue, unit, thresholdsAnomaly) {
  if (unit === "°C") {
    const threshold = thresholdsAnomaly.temperature_delta_c;
    return {
      value: threshold ? round4(Math.min(1, Math.abs(delta) / threshold)) : null,
      reason: threshold
        ? `|Δ|=${Math.abs(delta).toFixed(2)}°C / umbral_significativo=${threshold}°C (UNFCCC Acuerdo de París 2015 Art.2.1(a); IPCC AR6 WGI Ch.4 — thresholds.json anomaly.temperature_delta_c)`
        : "thresholds.json anomaly.temperature_delta_c no configurado",
    };
  }
  if (unit === "mm" || unit === "km/h") {
    const thresholdKey = unit === "mm" ? "precipitation_delta_pct" : "wind_speed_delta_pct";
    const threshold = thresholdsAnomaly[thresholdKey];
    if (!threshold) {
      return { value: null, reason: `thresholds.json anomaly.${thresholdKey} no configurado` };
    }
    if (baselineValue === 0) {
      return delta === 0
        ? { value: 0, reason: `baseline=0${unit}, Δ=0${unit}: sin cambio` }
        : { value: 1, reason: `baseline=0${unit} y Δ≠0: cambio porcentual indefinido, tratado como máximamente significativo` };
    }
    const pct = Math.abs(delta / baselineValue) * 100;
    const citation = unit === "mm"
      ? "ETCCDI/WMO-TD-1200 (2009) §3.2, SENAMHI Peru boletines climáticos"
      : "WMO Technical Document No. 1203 (2020) §4.1, Vose et al. (2014) Bull. AMS";
    return {
      value: round4(Math.min(1, pct / threshold)),
      reason: `|Δ%|=${pct.toFixed(1)}% / umbral_significativo=${threshold}% (${citation} — thresholds.json anomaly.${thresholdKey})`,
    };
  }
  return { value: null, reason: `sin umbral de significancia definido para la unidad '${unit}' en thresholds.json anomaly` };
}

// ProjectionDetector (stage-04-signals.md: input="histórico + proyección",
// factors="Δ absoluto, consistencia entre modelos") — applies to
// openmeteo_cmip6 corto/mediano/largo variables. `projected_change` is the
// significance-normalized Δ vs this same base variable's `_historico` sibling
// (WMO No. 1203 1991-2020 baseline, already extracted by Stage 3 for every
// CC_VARS entry). `cross_period_consistency` reuses the literal spec wording
// ("cross-PERIOD", not "cross-model") as sign agreement of Δ across whichever
// of corto/mediano/largo are present for this base variable — a trend that
// flips sign between near- and long-term horizons is less consistent than one
// that holds direction throughout, and this is directly computable from data
// Stage 3 already emits (no new propagation needed).
function computeProjectionDetector(variable, allVariables, thresholdsAnomaly) {
  const base = baseVariableName(variable.name);
  const historicoName = `${base}_historico`;
  const historico = findSibling(allVariables, historicoName, variable.source);

  const notApplicable = "no aplica: variable de proyección CMIP6 (ver ProjectionDetector, stage-04-signals.md) — no es una observación con serie histórica propia";
  const components = {
    anomaly_magnitude: { value: null, reason: notApplicable },
    temporal_persistence: { value: null, reason: notApplicable },
    projected_change: { value: null, reason: null },
    cross_period_consistency: { value: null, reason: null },
  };

  if (!historico) {
    const reason = `sin variable '${historicoName}' (banda historico, misma fuente) disponible en esta ejecución para calcular Δ`;
    components.projected_change.reason = reason;
    components.cross_period_consistency.reason = reason;
    // H-08: sin línea base pareada no hay Δ físico que reportar — null con
    // razón, mismo patrón que projected_change arriba, no un 0 fabricado.
    return { components, anomalyValue: null, anomalyValueReason: reason };
  }

  const delta = variable.value - historico.value;
  const sig = computeSignificanceRatio(delta, historico.value, variable.unit, thresholdsAnomaly);
  components.projected_change = {
    value: sig.value,
    reason: `Δ=${delta.toFixed(3)}${variable.unit} (valor=${variable.value} - ${historicoName}=${historico.value}), ${sig.reason}`,
  };

  const bandDeltas = ["corto", "mediano", "largo"]
    .map(h => findSibling(allVariables, `${base}_${h}`, variable.source))
    .filter(Boolean)
    .map(v => v.value - historico.value);

  if (bandDeltas.length < 2) {
    components.cross_period_consistency.reason = `solo ${bandDeltas.length} banda(s) de horizonte disponible(s) para '${base}' — se requieren >=2 para evaluar consistencia entre períodos`;
  } else {
    const signs = bandDeltas.map(d => Math.sign(d));
    const posCount = signs.filter(s => s > 0).length;
    const negCount = signs.filter(s => s < 0).length;
    const zeroCount = signs.filter(s => s === 0).length;
    const majority = Math.max(posCount, negCount, zeroCount);
    components.cross_period_consistency = {
      value: round4(majority / signs.length),
      reason: `${majority}/${signs.length} bandas de horizonte coinciden en el signo de Δ vs ${historicoName} (bandas disponibles: ${bandDeltas.length}/3)`,
    };
  }

  // H-08 (documentacion-v2/stage-04, ALTO): anomaly_value expone el Δ físico
  // crudo (en la unidad propia de la variable, ej. °C) detrás de
  // projected_change's ratio normalizado 0-1 — "valor_actual - media/línea
  // base histórica", exactamente la fórmula que H-08 pide, ya calculada
  // internamente para projected_change y hasta ahora nunca expuesta.
  return { components, anomalyValue: round4(delta), anomalyValueReason: null };
}

// AnomalyDetector (stage-04-signals.md: input="valor actual + serie
// histórica", factors="magnitud anomalía, persistencia temporal") — applies
// where a genuine, independently-sourced climatological baseline exists for a
// current/recent observation. The only two such pairings this pipeline
// actually produces: weatherapi's instantaneous air_temperature_current
// against supabase_climate_cells' cc_tas (WMO 1991-2020 mean-temperature
// normal), and nasa_power's 1-year precipitation_sum against cc_pr (same
// baseline, accumulated precipitation). relative_humidity/wind_speed/
// surface_pressure have NO cc_* counterpart to compare against — not
// fabricated, see the "unclassified" branch below. `temporal_persistence`
// would need repeated observations over time, which this pipeline does not
// retain across runs — honestly reported as unavailable rather than derived
// from a single point-in-time execution.
const CROSS_SOURCE_BASELINE = {
  "weatherapi:air_temperature_current": "cc_tas",
  "nasa_power:precipitation_sum": "cc_pr",
};

function computeAnomalyDetector(variable, allVariables, thresholdsAnomaly) {
  const notApplicable = "no aplica: no es una variable de proyección CMIP6 (ver ProjectionDetector)";
  const components = {
    anomaly_magnitude: { value: null, reason: null },
    temporal_persistence: {
      value: null,
      reason: "no aplica: sin observaciones repetidas en el tiempo disponibles en una sola ejecución del pipeline (Stage 3 no propaga una serie histórica multi-fecha a Stage 4)",
    },
    projected_change: { value: null, reason: notApplicable },
    cross_period_consistency: { value: null, reason: notApplicable },
  };

  const baselineName = CROSS_SOURCE_BASELINE[`${variable.source}:${variable.name}`];
  const baseline = baselineName ? findSibling(allVariables, baselineName, "supabase_climate_cells") : null;
  if (!baseline) {
    const reason = baselineName
      ? `línea base '${baselineName}' (supabase_climate_cells) no disponible en esta ejecución`
      : `sin línea base climatológica definida para '${variable.source}:${variable.name}'`;
    components.anomaly_magnitude.reason = reason;
    // H-08: sin línea base pareada no hay Δ físico que reportar — null con
    // razón, no un 0 fabricado.
    return { components, anomalyValue: null, anomalyValueReason: reason };
  }

  const delta = variable.value - baseline.value;
  const sig = computeSignificanceRatio(delta, baseline.value, variable.unit, thresholdsAnomaly);
  components.anomaly_magnitude = {
    value: sig.value,
    reason: `Δ=${delta.toFixed(3)}${variable.unit} (valor actual=${variable.value} - ${baselineName} [línea base WMO No.1203 1991-2020]=${baseline.value}), ${sig.reason}`,
  };
  // H-08 (documentacion-v2/stage-04, ALTO): anomaly_value expone el Δ físico
  // crudo (unidad propia de la variable) detrás de anomaly_magnitude's ratio
  // normalizado 0-1 — "valor_actual - media_histórica", exactamente la
  // fórmula que el spec (AnomalyDetector, stage-04-signals.md) describe,
  // ya calculada internamente y hasta ahora nunca expuesta en el output.
  return { components, anomalyValue: round4(delta), anomalyValueReason: null };
}

// CategoricalDetector (stage-04-signals.md: input="estado categórico",
// factors="confianza de la fuente, transición reciente") — applies to
// enso_phase. "Confianza de la fuente" is source_quality's job (kept
// separate, never collapsed into signal_strength — see rulesApplied).
// "Transición reciente" would need the raw ONI quarter-by-quarter series,
// which Stage 3's classifyEnso() consumes but does NOT propagate past
// `classification.state` into the canonical variable (documented gap, not
// fixed here — out of Stage 4's scope). What IS available and genuinely
// informative: enso_phase only reports "el_nino"/"la_nina" when
// classifyEnso() has already confirmed >=5 consecutive ONI seasons over the
// ±0.5°C threshold (Trenberth 1997) — persistence is a PRECONDITION of the
// classification itself, not a separately varying quantity Stage 4 would
// need extra data to measure.
function computeCategoricalDetector(variable) {
  const isActive = variable.value !== "neutral";
  return {
    anomaly_magnitude: {
      value: isActive ? 1.0 : 0.0,
      reason: isActive
        ? "clasificación el_nino/la_nina requiere, por construcción, >=5 trimestres ONI consecutivos sobre el umbral ±0.5°C (Trenberth 1997, NOAA CPC) — persistencia ya verificada por la metodología de clasificación misma (pipeline/shared/enso-classification.js)"
        : "estado 'neutral': la condición de 5 trimestres consecutivos sobre el umbral NO se sostuvo (o datos insuficientes) — sin evidencia de anomalía ENSO sostenida",
    },
    temporal_persistence: {
      value: null,
      reason: "no aplica como eje independiente: la persistencia de 5 trimestres es una precondición binaria de la clasificación (ver anomaly_magnitude), no una magnitud separada medible en Stage 4",
    },
    projected_change: { value: null, reason: "no aplica: enso_phase es un estado observado, no una proyección CMIP6" },
    cross_period_consistency: { value: null, reason: "no aplica: enso_phase es un estado observado, no una proyección CMIP6" },
  };
}

function isBaselineOrStaticVariable(variable) {
  // cc_* variables (median of a {p10,p90,median} 1991-2020 baseline
  // distribution) and CMIP6 "_historico" variables ARE the climatological
  // norm other variables are compared against (see computeAnomalyDetector /
  // computeProjectionDetector) — they cannot also be "anomalies relative to
  // themselves". elevation is a fixed, non-stochastic geophysical field (same
  // reasoning already applied to it in coverage_spatial's non_stochastic
  // rules) with no anomaly/trend/projection concept at all.
  //
  // Auditoría de transformación de datos, hallazgo P2: desde que Stage 03
  // extrae cc_tasmax_corto/mediano y cc_pr_corto/mediano (bloques
  // ensemble-all-sspXXX reales, con escenario), esas variables SÍ son
  // proyecciones — no líneas base. Solo la forma bare (cc_tasmax, cc_pr, y
  // los demás índices ETCCDI sin sufijo) y la forma explícita _historico
  // siguen siendo la referencia climatológica fija. isProjectionVariable()
  // abajo es la fuente única de verdad para esta distinción — reutilizada
  // también en el dispatch de calculateSignalStrength.
  if (variable.source === "supabase_climate_cells") {
    return !isProjectionVariable(variable);
  }
  if (variable.name === "elevation") return true;
  if (stripHorizonSuffix(variable.name) === "historico") return true;
  return false;
}

// Auditoría de transformación de datos, hallazgo P2: una variable
// climate_cells es una proyección real (no una línea base) solo si tiene
// sufijo de horizonte corto/mediano/largo (nunca "historico", que ES la
// línea base) — mismo criterio que ya distingue las variables de
// openmeteo_cmip6, generalizado a la segunda fuente que ahora también
// produce proyecciones con esa forma de nombre.
function isProjectionVariable(variable) {
  const suffix = stripHorizonSuffix(variable.name);
  return suffix != null && suffix !== "historico";
}

// Signal Strength = fuerza de la señal detectada, calculada por el detector
// específico al tipo de variable (stage-04-signals.md Rule 2: "Signal
// Strength es específica del tipo de detector — no hay fórmula universal").
// H-02 (documentacion-v2/stage-04, CRÍTICO): la implementación previa
// aplicaba una única fórmula (|valor|/|rango_físico_máximo|) a TODAS las
// variables recibidas a la vez, lo que también las colapsaba a un solo score
// compartido (H-03) — ambos se corrigen juntos porque son la misma causa: la
// función necesita el valor y la fuente de la variable ESPECÍFICA que está
// puntuando, más el array completo (para localizar su línea base/hermanos de
// horizonte), no un promedio ciego de todas las variables canónicas.
// Componentes sin metodología aplicable o sin dato pareado disponible se
// reportan value=null con la razón exacta (mismo patrón "no fabricar" que
// H-01), nunca con un número construido de un rango físico que no mide fuerza
// de señal.
export function calculateSignalStrength(variable, allVariables = []) {
  const thresholdsAnomaly = getThresholds().anomaly || {};

  let detector;
  let components;
  // H-08 (documentacion-v2/stage-04, ALTO): anomaly_value = Δ físico crudo
  // ("valor_actual - media_histórica", en la unidad propia de la variable),
  // no el ratio normalizado 0-1 que components.anomaly_magnitude/
  // projected_change reportan. Solo AnomalyDetector y ProjectionDetector
  // tienen una línea base contra la que restar — categorical/baseline_or_
  // static/unclassified no tienen Δ que calcular, así que se quedan en
  // null con razón explícita (mismo patrón "no fabricar" del resto de este
  // archivo), no en un 0 que fingiría ausencia de cambio.
  let anomalyValue = null;
  let anomalyValueReason = null;

  if (variable.name === "enso_phase") {
    detector = "categorical";
    components = computeCategoricalDetector(variable);
    anomalyValueReason = "no aplica: enso_phase es un estado categórico (el_nino/la_nina/neutral), no una magnitud numérica con la que calcular Δ";
  } else if (isBaselineOrStaticVariable(variable)) {
    detector = "baseline_or_static";
    const reason = "variable de línea base climatológica o campo estático — no representa en sí misma una anomalía, persistencia o proyección (es la referencia contra la que OTRAS variables se comparan)";
    components = {
      anomaly_magnitude: { value: null, reason },
      temporal_persistence: { value: null, reason },
      projected_change: { value: null, reason },
      cross_period_consistency: { value: null, reason },
    };
    anomalyValueReason = reason;
  } else if (variable.source === "openmeteo_cmip6" || (variable.source === "supabase_climate_cells" && isProjectionVariable(variable))) {
    // Auditoría de transformación de datos, hallazgo P2: cc_tasmax_corto/
    // mediano y cc_pr_corto/mediano (climate_cells, con escenario real) pasan
    // por el MISMO ProjectionDetector genérico que ya usa openmeteo_cmip6 —
    // sin duplicar lógica. computeProjectionDetector busca `${base}_historico`
    // con el mismo `variable.source`, que Stage 03 ya provee para ambas
    // variables (ver 03-normalization/index.js, extracción SSP_PROJECTION_VARS).
    detector = "projection";
    ({ components, anomalyValue, anomalyValueReason } = computeProjectionDetector(variable, allVariables, thresholdsAnomaly));
  } else if (CROSS_SOURCE_BASELINE[`${variable.source}:${variable.name}`]) {
    detector = "anomaly";
    ({ components, anomalyValue, anomalyValueReason } = computeAnomalyDetector(variable, allVariables, thresholdsAnomaly));
  } else {
    detector = "unclassified";
    const reason = `sin metodología de signal_strength definida para '${variable.source}:${variable.name}' — sin línea base climatológica pareada, serie histórica ni horizonte de proyección disponibles en Stage 4`;
    components = {
      anomaly_magnitude: { value: null, reason },
      temporal_persistence: { value: null, reason },
      projected_change: { value: null, reason },
      cross_period_consistency: { value: null, reason },
    };
    anomalyValueReason = reason;
  }

  const availableValues = Object.values(components).map(c => c.value).filter(v => v != null);
  const score = availableValues.length > 0
    ? round4(availableValues.reduce((a, b) => a + b, 0) / availableValues.length)
    : null;
  // H-10 (documentacion-v2/stage-04, ALTO): los cortes 0.7/0.4 estaban
  // hardcodeados sin referencia y coincidían con min_signal_strength solo por
  // casualidad — una señal con score=0.40 (el mínimo aceptable, ver H-04) se
  // etiquetaba "medium", sugiriendo holgura donde en realidad está en el
  // límite de descarte. Ahora leídos de thresholds.json
  // signal_activation.signal_strength_labels, donde low_max está anclado a
  // min_signal_strength por diseño (label="low" <=> se descarta en Stage 04)
  // y medium_max es el punto medio [min_signal_strength, 1.0] (Laplace,
  // misma convención que H-06 usó para severityMap) — ver ese archivo para
  // la justificación completa, no repetida aquí para evitar que las dos
  // copias diverjan.
  const labelBands = getThresholds().signal_activation.signal_strength_labels;
  const label = score == null ? "not_available"
    : score >= labelBands.medium_max ? "high"
    : score >= labelBands.low_max ? "medium"
    : "low";

  return { score, label, detector, components, anomaly_value: anomalyValue, anomaly_value_reason: anomalyValueReason };
}
