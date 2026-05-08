// @ts-nocheck
/**
 * Executive Formatter
 *
 * Transforms raw climate signals into executive-level insights:
 * - Signal selection (top 3–4 most important indicators)
 * - Data simplification (removes percentiles, technical jargon)
 * - Language humanization (delta → cambio proyectado, etc.)
 * - Card building for visual presentation
 */

const SEVERITY_ORDER = { none: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const SEVERITY_LABEL = {
  none: "Sin cambio",
  low: "Leve",
  moderate: "Moderado",
  high: "Elevado",
  critical: "Crítico",
};

// ── Signal selection: pick best 3–4 indicators for executive view ──────────────

export function selectExecutiveSignals(engineResult) {
  if (!engineResult || !engineResult.signals) return [];

  const signals = engineResult.signals || [];
  const selected = [];

  // Category 1: Temperature trend (tas or txx, highest severity)
  const tempSignals = signals.filter(s => s.category === "temperature" && s.severity !== "none");
  if (tempSignals.length > 0) {
    const topTemp = tempSignals.reduce((a, b) =>
      SEVERITY_ORDER[b.severity] > SEVERITY_ORDER[a.severity] ? b : a
    );
    selected.push(topTemp);
  }

  // Category 2: Heat extremes (hd35, tr, highest severity)
  const heatSignals = signals.filter(s =>
    s.category === "extremes" && s.id !== "tr" && s.severity !== "none"
  );
  if (heatSignals.length > 0) {
    const topHeat = heatSignals.reduce((a, b) =>
      SEVERITY_ORDER[b.severity] > SEVERITY_ORDER[a.severity] ? b : a
    );
    selected.push(topHeat);
  }

  // Category 3: Tropical nights (tr) if significant
  const trSignal = signals.find(s => s.id === "tr" && s.severity !== "none");
  if (trSignal && selected.length < 3) {
    selected.push(trSignal);
  }

  // Category 4: Water stress (cdd, prpercnt, highest severity)
  const waterSignals = signals.filter(s =>
    (s.category === "drought" || s.category === "precipitation") && s.severity !== "none"
  );
  if (waterSignals.length > 0 && selected.length < 4) {
    const topWater = waterSignals.reduce((a, b) =>
      SEVERITY_ORDER[b.severity] > SEVERITY_ORDER[a.severity] ? b : a
    );
    selected.push(topWater);
  }

  // Category 5: GRI threat (if no signals yet or space available)
  if (engineResult.griSignals && engineResult.griSignals.length > 0 && selected.length < 4) {
    const topGRI = engineResult.griSignals.find(g => g.currentScore === "alto")
      || engineResult.griSignals.find(g => g.currentScore === "medio")
      || engineResult.griSignals[0];
    if (topGRI) {
      selected.push({
        id: `gri_${topGRI.hazard}`,
        isGRI: true,
        hazard: topGRI.hazard,
        name: topGRI.name,
        currentScore: topGRI.currentScore,
        futureScore: topGRI.futureScore,
        severity: mapGRIScoreToSeverity(topGRI.currentScore),
        icon: HAZARD_ICON_MAP[topGRI.hazard] || "⚠️",
      });
    }
  }

  return selected.slice(0, 4);
}

// ── Format individual signal for executive display ──────────────────────────────

export function formatSignalForExecutive(signal) {
  if (!signal) return null;

  if (signal.isGRI) {
    return formatGRIForExecutive(signal);
  }

  const sev = SEVERITY_LABEL[signal.severity] || signal.severity;
  const sign = signal.delta >= 0 ? "+" : "";
  const dirArrow = signal.direction === "up" ? "↑" : signal.direction === "down" ? "↓" : "→";

  return {
    id: signal.id,
    icon: signal.icon,
    label: signal.label,
    historical: signal.historical?.toFixed(1) ?? "—",
    projected: signal.projected?.toFixed(1) ?? "—",
    delta: signal.delta != null ? `${sign}${signal.delta.toFixed(1)}` : "—",
    unit: signal.unit || "",
    direction: dirArrow,
    severity: signal.severity,
    severityLabel: sev,
    // Remove: p10, p90, projP10, projP90, source, thresholdRef, detail
    // Keep: what's needed for card display
  };
}

// ── GRI-specific formatting ────────────────────────────────────────────────────

const HAZARD_ICON_MAP = {
  flood: "🌊",
  fluvial: "🏞️",
  coastal: "🌊",
  pluvial: "🌧️",
  drought: "☀️",
  heat: "🌡️",
  extreme_heat: "🌡️",
  landslide: "⛰️",
};

function mapGRIScoreToSeverity(score) {
  const map = { alto: "high", medio: "moderate", bajo: "low", "sin data": "none" };
  return map[score] || "none";
}

function formatGRIForExecutive(griSignal) {
  const sev = SEVERITY_LABEL[griSignal.severity] || griSignal.severity;
  return {
    id: griSignal.id,
    icon: griSignal.icon,
    label: griSignal.name,
    currentScore: griSignal.currentScore,
    futureScore: griSignal.futureScore,
    severity: griSignal.severity,
    severityLabel: sev,
    isGRI: true,
    showFutureChange: griSignal.futureScore && griSignal.futureScore !== griSignal.currentScore,
  };
}

// ── Build executive summary cards (array of formatted signals) ────────────────

export function buildExecutiveSummaryCards(engineResult) {
  const selected = selectExecutiveSignals(engineResult);
  return selected.map(signal => formatSignalForExecutive(signal)).filter(Boolean);
}

// ── Threat panel: format GRI signals for display ──────────────────────────────

export function formatThreatsForExecutive(griSignals) {
  if (!Array.isArray(griSignals)) return [];

  return griSignals
    .filter(g => g.currentScore !== "sin data")
    .map(g => ({
      hazard: g.hazard,
      name: g.name,
      icon: HAZARD_ICON_MAP[g.hazard] || "⚠️",
      currentScore: g.currentScore,
      futureScore: g.futureScore,
      currentSeverity: mapGRIScoreToSeverity(g.currentScore),
      futureSeverity: g.futureScore ? mapGRIScoreToSeverity(g.futureScore) : null,
      severityLabel: SEVERITY_LABEL[mapGRIScoreToSeverity(g.currentScore)],
      hasChange: g.futureScore && g.futureScore !== g.currentScore,
    }))
    .sort((a, b) => {
      const order = { alto: 3, medio: 2, bajo: 1 };
      return (order[b.currentScore] ?? 0) - (order[a.currentScore] ?? 0);
    });
}

// ── Language translation helpers ────────────────────────────────────────────────

export function translateTechnicalTerm(term) {
  const translations = {
    delta: "cambio proyectado",
    ensemble: "modelos climáticos",
    threshold: "indicador de referencia",
    "p10-p90": "rango estimado",
    CMIP6: "modelos climáticos globales",
    "SSP5-8.5": "escenario de altas emisiones",
    severity: "importancia",
    "sin data": "Información insuficiente",
  };
  return translations[term] || term;
}

// ── Build technical details section (collapsible content) ──────────────────────

export function buildTechnicalDetailsContent(signals, distanceKm) {
  const sections = [];

  // Percentile ranges
  if (signals.some(s => s.projP10 != null)) {
    sections.push({
      title: "Rangos estimados (p10–p90)",
      content: signals
        .filter(s => s.projP10 != null)
        .map(s => `${s.label}: ${s.projP10.toFixed(1)}–${s.projP90.toFixed(1)} ${s.unit}`)
        .join("\n"),
    });
  }

  // Model & scenario info
  sections.push({
    title: "Metodología",
    content: `Modelos climáticos: ensemble CMIP6
Escenario: SSP5-8.5 (altas emisiones)
Horizonte: 2040–2059 (plazo mediano)
Indicadores: temperatura, precipitación, sequía, calor extremo`,
  });

  // Distance warning
  if (distanceKm != null && distanceKm > 0) {
    sections.push({
      title: "Ubicación de datos",
      content: `Punto de datos más cercano: ${distanceKm.toFixed(1)} km
${distanceKm > 30 ? "Las proyecciones son orientativas para esta ubicación específica." : ""}`,
    });
  }

  // Threshold references
  sections.push({
    title: "Referencias de umbral",
    content: `IPCC AR6: ΔT ≥ 1.0°C moderado · ≥ 1.5°C significativo · ≥ 2.5°C crítico
WRI Aqueduct: >30 días/año >35°C = calor extremo relevante
World Bank CKP: variación >15% en precipitación = cambio significativo
WMO: >50 mm/24h = precipitación extrema`,
  });

  return sections;
}

// ── Overall severity helper ──────────────────────────────────────────────────────

export function getExecutiveSeverityLabel(severity) {
  return SEVERITY_LABEL[severity] || "Sin cambio";
}

// ── Export all utilities ─────────────────────────────────────────────────────────

export default {
  selectExecutiveSignals,
  formatSignalForExecutive,
  buildExecutiveSummaryCards,
  formatThreatsForExecutive,
  buildTechnicalDetailsContent,
  getExecutiveSeverityLabel,
  translateTechnicalTerm,
};
