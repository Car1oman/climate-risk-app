// @ts-nocheck
/**
 * Climate Interpretation Engine
 *
 * Transforms quantitative DB climate data into evidence-based, traceable signals.
 * Every signal is grounded in measured deltas and explicit threshold references.
 *
 * NO heuristics. NO keyword matching. NO invented hazards.
 * Only: historical value → projected value → delta → threshold → severity.
 *
 * Threshold sources:
 *   IPCC AR6 WGI (Ch. 4, 11, 12)
 *   WRI Aqueduct Heat / Flood
 *   World Bank Climate Knowledge Portal (CKP)
 *   WMO precipitation standards
 */

// ── IPCC-aligned thresholds ───────────────────────────────────────────────────
const THR = {
  // Temperature change (°C Δ from historical baseline) — IPCC AR6 Ch.4
  tas_delta:    { low: 0.5, moderate: 1.0, high: 1.5, critical: 2.5 },
  txx_delta:    { low: 0.5, moderate: 1.0, high: 1.5, critical: 2.5 },

  // Heat extreme days change (Δ days/year) — WRI Aqueduct Heat, IPCC AR6 Ch.12
  hd35_delta:   { low: 5,  moderate: 15, high: 30, critical: 50 },
  hd30_delta:   { low: 10, moderate: 30, high: 60, critical: 100 },
  tr_delta:     { low: 10, moderate: 30, high: 60, critical: 100 },

  // Extreme precipitation change (% of historical value) — IPCC AR6 Ch.11
  rx1day_pct:   { low: 5,  moderate: 10, high: 20, critical: 35 },
  rx5day_pct:   { low: 5,  moderate: 10, high: 20, critical: 35 },

  // Drought — absolute projected CDD (days) — IPCC AR6 Ch.11, SPI framework
  cdd_absolute: { low: 20, moderate: 40, high: 60, critical: 90 },

  // Annual precipitation anomaly (% deviation from 100%) — World Bank CKP
  prpercnt_pct: { low: 5,  moderate: 15, high: 25, critical: 40 },
};

const SEVERITY_ORDER = { none: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function toSev(val, thr) {
  if (val >= (thr.critical ?? Infinity)) return "critical";
  if (val >= thr.high)                   return "high";
  if (val >= thr.moderate)               return "moderate";
  if (val >= thr.low)                    return "low";
  return "none";
}

function maxSev(a, b) {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// ── Delta helper ─────────────────────────────────────────────────────────────
function computeDelta(hist, proj) {
  if (!hist || hist.value == null || !proj || proj.value == null) return null;
  const d   = proj.value - hist.value;
  const pct = hist.value !== 0 ? (d / Math.abs(hist.value)) * 100 : null;
  return {
    delta:    d,
    deltaPct: pct,
    historical: hist.value,
    projected:  proj.value,
    projP10: proj.p10 ?? null,
    projP90: proj.p90 ?? null,
    unit: proj.unit ?? hist.unit ?? "",
  };
}

// ── Signal builders ───────────────────────────────────────────────────────────

function sig(base) {
  return { confidence: "high", ...base };
}

function buildTasSignal(hist, proj, period, scenario) {
  const r = computeDelta(hist, proj);
  if (!r) return null;
  const sev = toSev(Math.abs(r.delta), THR.tas_delta);
  if (sev === "none") return null;
  const sign = r.delta >= 0 ? "+" : "";
  const range = r.projP10 != null
    ? ` · Rango p10–p90: ${r.projP10.toFixed(1)}–${r.projP90.toFixed(1)}°C`
    : "";
  return sig({
    id: "tas", category: "temperature", metric: "tas",
    label: "Temperatura media anual", icon: "🌡️", unit: r.unit || "°C",
    historical: r.historical, projected: r.projected, delta: r.delta,
    projP10: r.projP10, projP90: r.projP90, period, scenario, severity: sev,
    direction: r.delta >= 0 ? "up" : "down",
    source: "DB · climate_cells · ensemble CMIP6",
    headline: `Temperatura media: ${sign}${r.delta.toFixed(1)}°C hacia ${period}`,
    detail: `La temperatura media anual pasa de ${r.historical.toFixed(1)}°C (histórico 1995–2014) a ${r.projected.toFixed(1)}°C en ${period}${range}.`,
    thresholdRef: "IPCC AR6: Δ ≥ 1.0°C moderado · ≥ 1.5°C significativo · ≥ 2.5°C crítico.",
  });
}

function buildTxxSignal(hist, proj, period, scenario) {
  const r = computeDelta(hist, proj);
  if (!r) return null;
  const sev = toSev(Math.abs(r.delta), THR.txx_delta);
  if (sev === "none") return null;
  const sign = r.delta >= 0 ? "+" : "";
  return sig({
    id: "txx", category: "temperature", metric: "txx",
    label: "Temperatura máxima extrema", icon: "🔥", unit: r.unit || "°C",
    historical: r.historical, projected: r.projected, delta: r.delta,
    projP10: r.projP10, projP90: r.projP90, period, scenario, severity: sev,
    direction: r.delta >= 0 ? "up" : "down",
    source: "DB · climate_cells · indicador txx",
    headline: `Temperatura máxima extrema: ${sign}${r.delta.toFixed(1)}°C hacia ${period}`,
    detail: `La temperatura máxima anual extrema pasa de ${r.historical.toFixed(1)}°C a ${r.projected.toFixed(1)}°C en ${period} (${sign}${r.delta.toFixed(1)}°C).`,
    thresholdRef: "IPCC AR6: Incremento en temperaturas máximas extremas intensifica estrés térmico operacional.",
  });
}

function buildHd35Signal(hist, proj, period, scenario) {
  const r = computeDelta(hist, proj);
  if (!r || r.delta < 2) return null;
  const sev = toSev(r.delta, THR.hd35_delta);
  if (sev === "none") return null;
  return sig({
    id: "hd35", category: "extremes", metric: "hd35",
    label: "Días con temperatura >35°C", icon: "☀️", unit: r.unit || "días/año",
    historical: r.historical, projected: r.projected, delta: r.delta,
    projP10: r.projP10, projP90: r.projP90, period, scenario, severity: sev,
    direction: "up",
    source: "DB · climate_cells · indicador hd35",
    headline: `Días de calor extremo (>35°C): ${r.historical.toFixed(0)} → ${r.projected.toFixed(0)}/año`,
    detail: `Los días con temperatura superior a 35°C aumentan de ${r.historical.toFixed(0)} a ${r.projected.toFixed(0)} por año (Δ +${r.delta.toFixed(0)} días) en ${period}.`,
    thresholdRef: "WRI Aqueduct Heat: >30 días/año a >35°C = exposición relevante para operaciones y salud laboral.",
  });
}

function buildTrSignal(hist, proj, period, scenario) {
  const r = computeDelta(hist, proj);
  if (!r || r.delta < 5) return null;
  const sev = toSev(r.delta, THR.tr_delta);
  if (sev === "none") return null;
  return sig({
    id: "tr", category: "extremes", metric: "tr",
    label: "Noches tropicales (Tmin > 20°C)", icon: "🌙", unit: r.unit || "días/año",
    historical: r.historical, projected: r.projected, delta: r.delta,
    projP10: r.projP10, projP90: r.projP90, period, scenario, severity: sev,
    direction: "up", confidence: "high",
    source: "DB · climate_cells · indicador tr",
    headline: `Noches cálidas (>20°C): ${r.historical.toFixed(0)} → ${r.projected.toFixed(0)}/año`,
    detail: `Las noches tropicales (Tmin > 20°C) aumentan de ${r.historical.toFixed(0)} a ${r.projected.toFixed(0)} por año en ${period}.`,
    thresholdRef: "IPCC AR6: Incremento en noches cálidas asociado a mayor consumo energético y estrés acumulado.",
  });
}

function buildRx1daySignal(hist, proj, period, scenario) {
  const r = computeDelta(hist, proj);
  if (!r || hist.value === 0 || Math.abs(r.delta) < 1) return null;
  const pctChange = Math.abs(r.deltaPct ?? 0);
  const sev = toSev(pctChange, THR.rx1day_pct);
  if (sev === "none") return null;
  const sign = r.delta >= 0 ? "+" : "";
  return sig({
    id: "rx1day", category: "precipitation", metric: "rx1day",
    label: "Lluvia máxima en 1 día", icon: "🌧️", unit: r.unit || "mm",
    historical: r.historical, projected: r.projected, delta: r.delta,
    projP10: r.projP10, projP90: r.projP90, period, scenario, severity: sev,
    direction: r.delta >= 0 ? "up" : "down", confidence: "medium",
    source: "DB · climate_cells · indicador rx1day",
    headline: `Lluvia máxima diaria: ${sign}${r.delta.toFixed(1)} mm (${sign}${r.deltaPct?.toFixed(0)}%) en ${period}`,
    detail: `La precipitación máxima en un día pasa de ${r.historical.toFixed(0)} mm a ${r.projected.toFixed(0)} mm en ${period} (${sign}${r.deltaPct?.toFixed(0)}%).`,
    thresholdRef: "WMO: >50mm/24h = precipitación extrema. IPCC AR6 Cap.11: cambio >10% en Rx1day indica intensificación.",
  });
}

function buildCddSignal(hist, proj, period, scenario) {
  const r = computeDelta(hist, proj);
  if (!r) return null;
  const sev = toSev(r.projected, THR.cdd_absolute);
  if (sev === "none") return null;
  const sign = r.delta >= 0 ? "+" : "";
  const deltaNote = Math.abs(r.delta) >= 1
    ? ` (${sign}${r.delta.toFixed(0)} días respecto al histórico de ${r.historical.toFixed(0)} días)`
    : "";
  return sig({
    id: "cdd", category: "drought", metric: "cdd",
    label: "Racha seca máxima", icon: "🏜️", unit: r.unit || "días",
    historical: r.historical, projected: r.projected, delta: r.delta,
    projP10: r.projP10, projP90: r.projP90, period, scenario, severity: sev,
    direction: r.delta >= 0 ? "up" : "down", confidence: "medium",
    source: "DB · climate_cells · indicador cdd",
    headline: `Racha seca proyectada: ${r.projected.toFixed(0)} días consecutivos sin lluvia`,
    detail: `La racha máxima de días consecutivos sin precipitación se proyecta en ${r.projected.toFixed(0)} días en ${period}${deltaNote}.`,
    thresholdRef: "IPCC AR6: >40 días secos consecutivos = estrés hídrico moderado · >90 días = sequía severa.",
  });
}

function buildPrpercntSignal(hist, proj, period, scenario) {
  const r = computeDelta(hist, proj);
  if (!r || Math.abs(r.delta) < 3) return null;
  // prpercnt represents % of historical baseline (100 = no change)
  const deviation = Math.abs(r.projected - 100);
  const sev = toSev(deviation, THR.prpercnt_pct);
  if (sev === "none") return null;
  const dir = r.projected < 100 ? "reducción" : "aumento";
  const sign = r.projected >= 100 ? "+" : "-";
  return sig({
    id: "prpercnt", category: "precipitation", metric: "prpercnt",
    label: "Anomalía de precipitación anual", icon: "💧", unit: "% del histórico",
    historical: r.historical, projected: r.projected, delta: r.delta,
    projP10: r.projP10, projP90: r.projP90, period, scenario, severity: sev,
    direction: r.projected >= 100 ? "up" : "down", confidence: "medium",
    source: "DB · climate_cells · indicador prpercnt",
    headline: `Precipitación anual: ${dir} de ${deviation.toFixed(0)}% en ${period}`,
    detail: `La precipitación proyectada equivale al ${r.projected.toFixed(0)}% del nivel histórico en ${period}, indicando una ${dir} de ${deviation.toFixed(0)}%.`,
    thresholdRef: "World Bank CKP: variación >15% en precipitación anual = cambio significativo en disponibilidad hídrica.",
  });
}

// ── GRI parser ────────────────────────────────────────────────────────────────
function parseGRI(griData) {
  if (!Array.isArray(griData?.hazards)) return [];
  return griData.hazards
    .filter(h => h.baseline?.score && h.baseline.score !== "sin data")
    .map(h => ({
      hazard: h.hazard,
      name: h.hazard_name,
      currentScore: h.baseline.score,
      futureScore: h.future_high_emissions?.score ?? null,
    }))
    .sort((a, b) => {
      const o = { alto: 3, medio: 2, bajo: 1 };
      return (o[b.currentScore] ?? 0) - (o[a.currentScore] ?? 0);
    });
}

// ── Main engine ───────────────────────────────────────────────────────────────
export function runClimateEngine(dbData, griData) {
  const griSignals = parseGRI(griData);
  const griBaseSev = griSignals.some(g => g.currentScore === "alto")   ? "high"
    : griSignals.some(g => g.currentScore === "medio")  ? "moderate"
    : "none";

  if (!dbData?.found || !dbData.byHorizon) {
    return {
      hasDBData: false,
      distanceKm: null,
      scenario: null,
      signals: [],
      griSignals,
      overallSeverity: griBaseSev,
    };
  }

  // Index by risk_type for O(1) lookup
  const histMap = Object.fromEntries(
    (dbData.byHorizon.historico ?? []).map(it => [it.risk_type, it])
  );
  const projMap = Object.fromEntries(
    (dbData.byHorizon.mediano ?? dbData.byHorizon.corto ?? []).map(it => [it.risk_type, it])
  );

  const PERIOD   = "2040–2059";
  const SCENARIO = "SSP5-8.5";

  const signals = [
    buildTasSignal    (histMap.tas,      projMap.tas,      PERIOD, SCENARIO),
    buildTxxSignal    (histMap.txx,      projMap.txx,      PERIOD, SCENARIO),
    buildHd35Signal   (histMap.hd35,     projMap.hd35,     PERIOD, SCENARIO),
    buildTrSignal     (histMap.tr,       projMap.tr,       PERIOD, SCENARIO),
    buildRx1daySignal (histMap.rx1day,   projMap.rx1day,   PERIOD, SCENARIO),
    buildCddSignal    (histMap.cdd,      projMap.cdd,      PERIOD, SCENARIO),
    buildPrpercntSignal(histMap.prpercnt, projMap.prpercnt, PERIOD, SCENARIO),
  ].filter(Boolean);

  const overallSeverity = signals.reduce(
    (acc, s) => maxSev(acc, s.severity),
    griBaseSev
  );

  return {
    hasDBData: true,
    distanceKm: dbData.nearestPoint?.distanceKm ?? null,
    scenario: `${SCENARIO} · horizonte ${PERIOD}`,
    signals,
    griSignals,
    overallSeverity,
  };
}
