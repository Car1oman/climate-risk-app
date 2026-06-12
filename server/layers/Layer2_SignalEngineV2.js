/**
 * Layer 2 v2 — Signal Engine (Regionalized)
 *
 * Reemplazo de Layer2_SignalEngine.js (activo desde Commit 3).
 * Cambios clave respecto a v1:
 *   1. Thresholds regionalizados por macro-región Perú (costa/sierra/selva/puna)
 *      basados en SENAMHI normales climatológicas 1981-2010.
 *   2. ENSO modifica señales de precipitación y temperatura (no solo informacional).
 *      El Niño: 2.5x precip costa norte, +0.5°C temp. La Niña: 0.4x costa, -0.3°C.
 *   3. Variables huérfanas integradas (Commit 4): r50mm, tx84rr, tasmax ahora
 *      generan señales (antes en DB pero ignoradas).
 *   4. GRI como fuente primaria de inundación (~1km en vez de ~25km CMIP6).
 *   5. Señales long_term (2060-2100) cuando climate_cells tienen datos; si no,
 *      se usa extrapolación IPCC de referencia regional (ver projection.js).
 *   6. Re-activado: severe_heat/hd40 (004-hd40-extreme-heat) — Open-Meteo computa hd40.
 *   7. Nuevo: moderate_heat/hd30 + extreme_rain_frequency/r20mm (CP-001).
 *   8. prpercnt historical usa valor real de pr (no 100 fijo) — Commit 6.
 *
 * Fuentes: SENAMHI Perú, IPCC AR6, GRI Oxford, NOAA CPC, INGEMMET.
 */

import { getTerrainIntelligence } from '../services/terrainService.js';
import { REGION_THRESHOLDS, GRI_SCORE_PROB } from '../config/signalThresholds.js';

// ─── FACTOR DE AMPLIFICACIÓN ENSO ─────────────────────────────────────────────
// El Niño: amplifica lluvia/inundación en costa norte, reduce en sierra sur
// La Niña: amplifica sequía en costa norte, lluvias en selva alta
// drought_offset: desplaza umbral de sequía (positivo = más fácil activar señal, negativo = más difícil)
const ENSO_AMPLIFICATION = {
  el_nino: {
    coastal_precip_mult: 2.5,    // costa norte: 2.5x precipitación
    sierra_precip_mult: 1.3,     // sierra: 1.3x
    amazon_precip_mult: 0.8,     // Amazonía: reduce lluvia
    temp_boost_c: 0.5,           // +0.5°C adicional
    flood_prob_boost: 1.5,       // 1.5x probabilidad inundación
    coastal_drought_offset: -10, // El Niño moja costa → sequía más difícil (-40% en vez de -30%)
    sierra_drought_offset: 0,
    amazon_drought_offset: +8,   // El Niño seca Amazonía → sequía más fácil (-22% en vez de -30%)
  },
  la_nina: {
    coastal_precip_mult: 0.4,    // costa norte: sequía
    sierra_precip_mult: 1.0,
    amazon_precip_mult: 1.3,     // Amazonía: más lluvia
    temp_boost_c: -0.3,          // -0.3°C
    flood_prob_boost: 0.7,
    coastal_drought_offset: +10, // La Niña seca costa → sequía más fácil (-20% en vez de -30%)
    sierra_drought_offset: -5,   // La Niña moja sierra ligeramente → más difícil
    amazon_drought_offset: -8,   // La Niña moja Amazonía → sequía más difícil
  },
  neutral: {
    coastal_precip_mult: 1.0,
    sierra_precip_mult: 1.0,
    amazon_precip_mult: 1.0,
    temp_boost_c: 0,
    flood_prob_boost: 1.0,
    coastal_drought_offset: 0,
    sierra_drought_offset: 0,
    amazon_drought_offset: 0,
  },
};

const REGION_MAP = {
  costa: 'coastal',
  sierra: 'sierra',
  selva: 'amazon',
  puna: 'sierra',
};

function getRegionThresholds(terrainData) {
  const region = terrainData?.terrain_region ?? 'default';
  return REGION_THRESHOLDS[region] ?? REGION_THRESHOLDS.default;
}

// ensoModifier: determina phase desde ONI directamente (determinista) y retorna todos los factores.
// ONI > +0.5 → El Niño | ONI < -0.5 → La Niña | else → neutral (estándar NOAA CPC)
function ensoModifier(ensoData, region) {
  const oni = ensoData?.oni_latest ?? 0;
  const phase = oni > 0.5 ? 'el_nino' : oni < -0.5 ? 'la_nina' : 'neutral';
  const amp = ENSO_AMPLIFICATION[phase] ?? ENSO_AMPLIFICATION.neutral;
  const precipKey = region === 'costa' ? 'coastal_precip_mult'
    : region === 'selva' ? 'amazon_precip_mult'
    : 'sierra_precip_mult';
  const droughtKey = region === 'costa' ? 'coastal_drought_offset'
    : region === 'selva' ? 'amazon_drought_offset'
    : 'sierra_drought_offset';
  return {
    phase,
    oni,
    precipMult: amp[precipKey],
    tempBoost: amp.temp_boost_c,
    floodBoost: amp.flood_prob_boost,
    droughtOffset: amp[droughtKey] ?? 0,
    active: phase !== 'neutral',
  };
}

function deltaAbs(a, b) {
  if (a == null || b == null) return null;
  return b - a;
}

function deltaPct(a, b) {
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

function confidence(hasCC, hasMeteo) {
  if (hasCC) return 'high';
  if (hasMeteo) return 'medium';
  return 'low';
}

function buildSignal(opts) {
  return {
    signalType: opts.signalType,
    indicator: opts.indicator,
    historical: opts.historical ?? null,
    projected: opts.projected ?? null,
    delta: opts.delta ?? null,
    delta_pct: opts.delta_pct ?? null,
    confidence: opts.conf,
    horizon: opts.horizon,
    threshold_reference: opts.threshold_reference,
    exceeds_threshold: opts.exceeds_threshold,
    enso_amplified: opts.ensoAmplified ?? false,
    region: opts.region ?? null,
    source_traceability: opts.sourceTraceability ?? null,
    compound_severity: opts.compoundSeverity ?? null,
  };
}

export function detectSignalsV2(fusedData) {
  const { climateData, griData, meteoData, ensoData, terrainData, ndviData, graceFoData } = fusedData;
  const signals = [];

  const hist = climateData?.historical ?? null;
  const short = climateData?.short_term ?? null;
  const mid = climateData?.mid_term ?? null;
  const longT = climateData?.long_term ?? null;
  const hasCC = climateData != null;

  const region = terrainData?.terrain_region ?? 'default';
  const thr = getRegionThresholds(terrainData);
  const enso = ensoModifier(ensoData, region);

  // ── EXTREME HEAT (hd35) ──────────────────────────────────────────────────
  if (thr.extreme_heat_delta_short != null && hist?.hd35 != null && short?.hd35 != null) {
    const d = deltaAbs(hist.hd35, short.hd35);
    if (d != null && d > thr.extreme_heat_delta_short) {
      signals.push(buildSignal({
        signalType: 'extreme_heat',
        indicator: 'hd35',
        historical: hist.hd35,
        projected: short.hd35,
        delta: d,
        delta_pct: deltaPct(hist.hd35, short.hd35),
        conf: confidence(hasCC, !!meteoData),
        horizon: 'short_term',
        threshold_reference: `Umbral regionalizado ${region}: +${thr.extreme_heat_delta_short} días hd35`,
        exceeds_threshold: true,
        ensoAmplified: false,
        region,
      }));
    }
  }

  if (thr.extreme_heat_delta_mid != null && hist?.hd35 != null && mid?.hd35 != null) {
    const d = deltaAbs(hist.hd35, mid.hd35);
    if (d != null && d > thr.extreme_heat_delta_mid) {
      signals.push(buildSignal({
        signalType: 'extreme_heat',
        indicator: 'hd35',
        historical: hist.hd35,
        projected: mid.hd35,
        delta: d,
        delta_pct: deltaPct(hist.hd35, mid.hd35),
        conf: confidence(hasCC, !!meteoData),
        horizon: 'mid_term',
        threshold_reference: `Umbral regionalizado ${region}: +${thr.extreme_heat_delta_mid} días hd35`,
        exceeds_threshold: true,
        ensoAmplified: false,
        region,
      }));
    }
  }

  // ── EXTREME HEAT via tasmax (Tmax media > umbral regional) ──────────────
  if (hist?.tasmax != null) {
    for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
      if (period?.tasmax != null && period.tasmax > thr.tasmax_threshold_c) {
        signals.push(buildSignal({
          signalType: 'extreme_heat',
          indicator: 'tasmax',
          historical: hist.tasmax,
          projected: period.tasmax,
          delta: deltaAbs(hist.tasmax, period.tasmax),
          delta_pct: deltaPct(hist.tasmax, period.tasmax),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Tmax media > ${thr.tasmax_threshold_c}°C (regionalizado ${region})`,
          exceeds_threshold: true,
          ensoAmplified: false,
          region,
        }));
      }
    }
  }

  // ── WARM DAYS via tx84rr (días cálidos percentil 84) ────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    if (hist?.tx84rr != null && period?.tx84rr != null) {
      const pct = deltaPct(hist.tx84rr, period.tx84rr);
      if (pct != null && pct > thr.tx84rr_delta_pct) {
        signals.push(buildSignal({
          signalType: 'extreme_heat',
          indicator: 'tx84rr',
          historical: hist.tx84rr,
          projected: period.tx84rr,
          delta: deltaAbs(hist.tx84rr, period.tx84rr),
          delta_pct: pct,
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `tx84rr delta > ${thr.tx84rr_delta_pct}% (regionalizado ${region})`,
          exceeds_threshold: true,
          ensoAmplified: false,
          region,
        }));
      }
    }
  }

  // ── SEVERE HEAT (hd40) — Tmax > 40°C ──────────────────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    if (thr.severe_heat_delta != null && hist?.hd40 != null && period?.hd40 != null) {
      const d = deltaAbs(hist.hd40, period.hd40);
      if (d != null && d > thr.severe_heat_delta) {
        signals.push(buildSignal({
          signalType: 'severe_heat',
          indicator: 'hd40',
          historical: hist.hd40,
          projected: period.hd40,
          delta: d,
          delta_pct: deltaPct(hist.hd40, period.hd40),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: +${thr.severe_heat_delta} días hd40 (Tmax > 40°C)`,
          exceeds_threshold: true,
          ensoAmplified: false,
          region,
        }));
      }
    }
  }

  // ── MODERATE HEAT (hd30) — Tmax > 30°C (solo si no hay severe_heat ni extreme_heat para mismo horizonte) ─
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    if (thr.moderate_heat_delta != null && hist?.hd30 != null && period?.hd30 != null) {
      const hasHigherPriorityHeat = signals.some(s =>
        (s.signalType === 'severe_heat' || s.signalType === 'extreme_heat')
        && s.horizon === horizon
      );
      if (hasHigherPriorityHeat) continue;
      const d = deltaAbs(hist.hd30, period.hd30);
      if (d != null && d > thr.moderate_heat_delta) {
        signals.push(buildSignal({
          signalType: 'moderate_heat',
          indicator: 'hd30',
          historical: hist.hd30,
          projected: period.hd30,
          delta: d,
          delta_pct: deltaPct(hist.hd30, period.hd30),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: +${thr.moderate_heat_delta} días hd30 (Tmax > 30°C)`,
          exceeds_threshold: true,
          ensoAmplified: false,
          region,
        }));
      }
    }
  }

  // ── TROPICAL NIGHTS (tr) — solo donde aplica ────────────────────────────
  for (const [horizon, period, thresholdKey] of [
    ['short_term', short, 'tropical_nights_delta_short'],
    ['mid_term', mid, 'tropical_nights_delta_mid'],
  ]) {
    const th = thr[thresholdKey];
    if (th == null) continue; // no aplica en esta región
    if (hist?.tr != null && period?.tr != null) {
      const d = deltaAbs(hist.tr, period.tr);
      if (d != null && d > th) {
        signals.push(buildSignal({
          signalType: 'tropical_nights',
          indicator: 'tr',
          historical: hist.tr,
          projected: period.tr,
          delta: d,
          delta_pct: deltaPct(hist.tr, period.tr),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: +${th} noches tropicales`,
          exceeds_threshold: true,
          ensoAmplified: false,
          region,
        }));
      }
    }
  }

  // ── TEMP INCREASE (tas) con boost ENSO ──────────────────────────────────
  for (const [horizon, period, thresholdKey, ensoBoost] of [
    ['short_term', short, 'temp_increase_short', enso.tempBoost],
    ['mid_term', mid, 'temp_increase_mid', enso.tempBoost],
  ]) {
    const th = thr[thresholdKey];
    const rawDelta = (hist?.tas != null && period?.tas != null)
      ? deltaAbs(hist.tas, period.tas)
      : null;
    if (rawDelta == null) continue;
    const adjustedDelta = rawDelta + ensoBoost;
    const tasHist = hist?.tas ?? null;
    const tasProj = tasHist != null ? tasHist + adjustedDelta : null;
    if (adjustedDelta > th) {
      signals.push(buildSignal({
        signalType: 'temp_increase',
        indicator: 'tas',
        historical: tasHist,
        projected: tasProj,
        delta: adjustedDelta,
        delta_pct: deltaPct(tasHist, tasProj),
        conf: confidence(hasCC && hist?.tas != null, !!meteoData),
        horizon,
        threshold_reference: `Umbral regionalizado ${region}: +${th}°C (incl. ajuste ENSO: ${ensoBoost >= 0 ? '+' : ''}${ensoBoost.toFixed(1)}°C)`,
        exceeds_threshold: true,
        ensoAmplified: Math.abs(ensoBoost) > 0.1,
        region,
      }));
    }
  }

  // ── DROUGHT con discriminación regional ─────────────────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    if (!period) continue;

    // cdd (días secos consecutivos)
    if (hist?.cdd != null && period?.cdd != null) {
      const d = deltaAbs(hist.cdd, period.cdd);
      if (d != null && d > thr.drought_cdd_delta) {
        signals.push(buildSignal({
          signalType: 'drought',
          indicator: 'cdd',
          historical: hist.cdd,
          projected: period.cdd,
          delta: d,
          delta_pct: deltaPct(hist.cdd, period.cdd),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: +${thr.drought_cdd_delta} CDD`,
          exceeds_threshold: true,
          ensoAmplified: false,
          region,
        }));
      }
    }

    // prpercnt (porcentaje de precipitación vs histórico; 100 = histórico)
    if (period?.prpercnt != null) {
      const pctChange = period.prpercnt - 100;
      const histPr = hist?.pr ?? null;
      const droughtThreshold = thr.drought_pr_pct + enso.droughtOffset;
      if (pctChange < droughtThreshold) {
        signals.push(buildSignal({
          signalType: 'drought',
          indicator: 'prpercnt',
          historical: histPr,
          projected: period.prpercnt,
          delta: histPr != null ? deltaAbs(histPr, period.prpercnt / 100 * histPr) : null,
          delta_pct: pctChange,
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: < ${droughtThreshold}% precipitación${enso.droughtOffset !== 0 ? ` (ENSO ${enso.phase} offset: ${enso.droughtOffset >= 0 ? '+' : ''}${enso.droughtOffset}%)` : ''}`,
          exceeds_threshold: true,
          ensoAmplified: enso.droughtOffset !== 0,
          region,
        }));
      }
    }

    // pr (fallback)
    if (!period?.prpercnt && hist?.pr != null && period?.pr != null) {
      const pct = deltaPct(hist.pr, period.pr);
      const droughtThreshold = thr.drought_pr_pct + enso.droughtOffset;
      if (pct != null && pct < droughtThreshold) {
        signals.push(buildSignal({
          signalType: 'drought',
          indicator: 'pr',
          historical: hist.pr,
          projected: period.pr,
          delta: deltaAbs(hist.pr, period.pr),
          delta_pct: pct,
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: < ${droughtThreshold}% precipitación (fallback pr)${enso.droughtOffset !== 0 ? ` (ENSO ${enso.phase})` : ''}`,
          exceeds_threshold: true,
          ensoAmplified: enso.droughtOffset !== 0,
          region,
        }));
      }
    }
  }

  // ── EXTREME RAIN con amplificación ENSO ─────────────────────────────────
  for (const [horizon, period] of [['short_term', short], ['mid_term', mid]]) {
    if (!period) continue;

    // rx5day con ENSO multiplier
    if (hist?.rx5day != null && period?.rx5day != null) {
      const rawPct = deltaPct(hist.rx5day, period.rx5day);
      const adjustedPct = rawPct != null ? rawPct * enso.precipMult : null;
      const adjustedProj = period.rx5day * enso.precipMult;
      if (adjustedPct != null && adjustedPct > thr.extreme_rain_rx5day_pct) {
        signals.push(buildSignal({
          signalType: 'extreme_rain',
          indicator: 'rx5day',
          historical: hist.rx5day,
          projected: adjustedProj,
          delta: deltaAbs(hist.rx5day, adjustedProj),
          delta_pct: adjustedPct,
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: > ${thr.extreme_rain_rx5day_pct}% rx5day (ENSO mult: ${enso.precipMult.toFixed(1)}x)`,
          exceeds_threshold: true,
          ensoAmplified: enso.precipMult !== 1.0,
          region,
        }));
      }
    }

    // rx1day
    if (period?.rx1day != null) {
      const adjusted = period.rx1day * enso.precipMult;
      if (adjusted > thr.extreme_rain_rx1day_mm) {
        signals.push(buildSignal({
          signalType: 'extreme_rain',
          indicator: 'rx1day',
          historical: hist?.rx1day ?? null,
          projected: adjusted,
          delta: deltaAbs(hist?.rx1day ?? null, adjusted),
          delta_pct: deltaPct(hist?.rx1day ?? null, adjusted),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `Umbral regionalizado ${region}: rx1day > ${thr.extreme_rain_rx1day_mm}mm`,
          exceeds_threshold: true,
          ensoAmplified: enso.precipMult !== 1.0,
          region,
        }));
      }
    }

    // r50mm (días con lluvia > 50mm) con amplificación ENSO
    if (hist?.r50mm != null && period?.r50mm != null) {
      const adjustedR50mm = period.r50mm * enso.precipMult;
      const d = deltaAbs(hist.r50mm, adjustedR50mm);
      if (d != null && d > thr.r50mm_delta) {
        signals.push(buildSignal({
          signalType: 'extreme_rain',
          indicator: 'r50mm',
          historical: hist.r50mm,
          projected: adjustedR50mm,
          delta: d,
          delta_pct: deltaPct(hist.r50mm, adjustedR50mm),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `r50mm delta > ${thr.r50mm_delta} días (regionalizado ${region}, ENSO mult: ${enso.precipMult.toFixed(1)}x)`,
          exceeds_threshold: true,
          ensoAmplified: enso.precipMult !== 1.0,
          region,
        }));
      }
    }

    // r20mm (días con lluvia > 20mm) — frecuencia de lluvia intensa
    if (hist?.r20mm != null && period?.r20mm != null) {
      const d = deltaAbs(hist.r20mm, period.r20mm);
      if (d != null && d > thr.r20mm_delta) {
        signals.push(buildSignal({
          signalType: 'extreme_rain_frequency',
          indicator: 'r20mm',
          historical: hist.r20mm,
          projected: period.r20mm,
          delta: d,
          delta_pct: deltaPct(hist.r20mm, period.r20mm),
          conf: confidence(hasCC, !!meteoData),
          horizon,
          threshold_reference: `r20mm delta > ${thr.r20mm_delta} días (regionalizado ${region})`,
          exceeds_threshold: true,
          ensoAmplified: false,
          region,
        }));
      }
    }
  }

  // ── LONG_TERM (2060-2100) — señales extendidas cuando hay datos ─────────
  if (longT != null) {
    // extreme_heat long_term
    if (thr.extreme_heat_delta_long != null && hist?.hd35 != null && longT?.hd35 != null) {
      const d = deltaAbs(hist.hd35, longT.hd35);
      if (d != null && d > thr.extreme_heat_delta_long) {
        signals.push(buildSignal({
          signalType: 'extreme_heat', indicator: 'hd35',
          historical: hist.hd35, projected: longT.hd35, delta: d,
          delta_pct: deltaPct(hist.hd35, longT.hd35),
          conf: confidence(hasCC, !!meteoData), horizon: 'long_term',
          threshold_reference: `Umbral regionalizado ${region} long_term: +${thr.extreme_heat_delta_long} días hd35`,
          exceeds_threshold: true, ensoAmplified: false, region,
        }));
      }
    }

    // tropical_nights long_term
    if (thr.tropical_nights_delta_long != null && hist?.tr != null && longT?.tr != null) {
      const d = deltaAbs(hist.tr, longT.tr);
      if (d != null && d > thr.tropical_nights_delta_long) {
        signals.push(buildSignal({
          signalType: 'tropical_nights', indicator: 'tr',
          historical: hist.tr, projected: longT.tr, delta: d,
          delta_pct: deltaPct(hist.tr, longT.tr),
          conf: confidence(hasCC, !!meteoData), horizon: 'long_term',
          threshold_reference: `Umbral regionalizado ${region} long_term: +${thr.tropical_nights_delta_long} noches tropicales`,
          exceeds_threshold: true, ensoAmplified: false, region,
        }));
      }
    }

    // temp_increase long_term con ENSO
    if (thr.temp_increase_long != null && hist?.tas != null && longT?.tas != null) {
      const rawDelta = deltaAbs(hist.tas, longT.tas);
      if (rawDelta != null) {
        const adjustedDelta = rawDelta + enso.tempBoost;
        if (adjustedDelta > thr.temp_increase_long) {
          signals.push(buildSignal({
            signalType: 'temp_increase', indicator: 'tas',
            historical: hist.tas, projected: hist.tas + adjustedDelta,
            delta: adjustedDelta, delta_pct: deltaPct(hist.tas, hist.tas + adjustedDelta),
            conf: confidence(hasCC, !!meteoData), horizon: 'long_term',
            threshold_reference: `Umbral regionalizado ${region} long_term: +${thr.temp_increase_long}°C (incl. ENSO ${enso.tempBoost >= 0 ? '+' : ''}${enso.tempBoost.toFixed(1)}°C)`,
            exceeds_threshold: true, ensoAmplified: Math.abs(enso.tempBoost) > 0.1, region,
          }));
        }
      }
    }

    // drought long_term
    if (longT?.prpercnt != null) {
      const pctChange = longT.prpercnt - 100;
      if (pctChange < (thr.drought_pr_pct_long ?? thr.drought_pr_pct)) {
        signals.push(buildSignal({
          signalType: 'drought', indicator: 'prpercnt',
          historical: hist?.pr ?? null, projected: longT.prpercnt,
          delta: null, delta_pct: pctChange,
          conf: confidence(hasCC, !!meteoData), horizon: 'long_term',
          threshold_reference: `Umbral regionalizado ${region} long_term: < ${thr.drought_pr_pct_long}% precipitación`,
          exceeds_threshold: true, ensoAmplified: false, region,
        }));
      }
    }

    // extreme_rain long_term
    if (hist?.rx5day != null && longT?.rx5day != null) {
      const rawPct = deltaPct(hist.rx5day, longT.rx5day);
      const adjustedPct = rawPct != null ? rawPct * enso.precipMult : null;
      const adjustedProj = longT.rx5day * enso.precipMult;
      if (adjustedPct != null && adjustedPct > (thr.extreme_rain_rx5day_pct * 1.5)) {
        signals.push(buildSignal({
          signalType: 'extreme_rain', indicator: 'rx5day',
          historical: hist.rx5day, projected: adjustedProj,
          delta: deltaAbs(hist.rx5day, adjustedProj), delta_pct: adjustedPct,
          conf: confidence(hasCC, !!meteoData), horizon: 'long_term',
          threshold_reference: `Umbral regionalizado ${region} long_term: > ${thr.extreme_rain_rx5day_pct * 1.5}% rx5day`,
          exceeds_threshold: true, ensoAmplified: enso.precipMult !== 1.0, region,
        }));
      }
    }

    if (longT?.rx1day != null) {
      const adjusted = longT.rx1day * enso.precipMult;
      const threshold = thr.extreme_rain_rx1day_mm_long ?? thr.extreme_rain_rx1day_mm;
      if (adjusted > threshold) {
        signals.push(buildSignal({
          signalType: 'extreme_rain', indicator: 'rx1day',
          historical: hist?.rx1day ?? null, projected: adjusted,
          delta: deltaAbs(hist?.rx1day ?? null, adjusted),
          delta_pct: deltaPct(hist?.rx1day ?? null, adjusted),
          conf: confidence(hasCC, !!meteoData), horizon: 'long_term',
          threshold_reference: `Umbral regionalizado ${region} long_term: rx1day > ${threshold}mm`,
          exceeds_threshold: true, ensoAmplified: enso.precipMult !== 1.0, region,
        }));
      }
    }
  }

  // ── FLOOD RISK (GRI como fuente primaria) con amplificación ENSO ────────
  if (griData?.hazards) {
    const floodHazards = griData.hazards.filter(h =>
      ['flood', 'fluvial', 'pluvial', 'coastal'].includes(h.hazard)
    );
    for (const h of floodHazards) {
      const baseProb = h.baseline?.value_decimal ?? null;
      const futureHigh = h.future_high_emissions?.value_decimal ?? null;
      const futureMod = h.future_moderate_emissions?.value_decimal ?? null;
      const futureProb = futureHigh ?? futureMod;
      if (futureProb != null && futureProb * enso.floodBoost > 0.35) {
        signals.push(buildSignal({
          signalType: 'flood_risk',
          indicator: 'gri_flood_probability',
          historical: baseProb,
          projected: futureProb * enso.floodBoost,
          delta: (baseProb != null) ? (futureProb * enso.floodBoost) - baseProb : null,
          delta_pct: deltaPct(baseProb, futureProb * enso.floodBoost),
          conf: 'medium',
          horizon: 'short_term',
          threshold_reference: `GRI + ENSO amplificación: prob > 0.35 (ENSO boost: ${enso.floodBoost.toFixed(1)}x)`,
          exceeds_threshold: true,
          ensoAmplified: enso.floodBoost !== 1.0,
          region,
        }));
      }
    }
  }

  // ── GRI FALLBACK SOLO si no hay señales cuantitativas del mismo tipo ────
  const hasSignalType = (t) => signals.some(s => s.signalType === t);
  const GRI_SCORE_PROB = { bajo: 0.15, medio: 0.50, alto: 0.85 };
  function extractGri(types) {
    return griData?.hazards?.find(h => types.includes(h.hazard)) ?? null;
  }

  // Drought desde GRI
  if (!hasSignalType('drought')) {
    const griD = extractGri(['drought']);
    const baseScore = griD?.baseline?.score;
    if (baseScore && baseScore !== 'sin data') {
      const baseProb = GRI_SCORE_PROB[baseScore] ?? null;
      const future = griD.future_high_emissions ?? griD.future_moderate_emissions;
      const futureProb = GRI_SCORE_PROB[future?.score] ?? null;
      signals.push(buildSignal({
        signalType: 'drought',
        indicator: 'gri_drought_probability',
        historical: baseProb,
        projected: futureProb,
        delta: (baseProb != null && futureProb != null) ? futureProb - baseProb : null,
        delta_pct: deltaPct(baseProb, futureProb),
        conf: 'medium',
        horizon: 'short_term',
        threshold_reference: `GRI infraestructura — exposición sequía ${baseScore}`,
        exceeds_threshold: (GRI_SCORE_PROB[baseScore] ?? 0) >= 0.50,
        ensoAmplified: false,
        region,
      }));
    }
  }

  // Heat desde GRI
  if (!hasSignalType('extreme_heat') && !hasSignalType('severe_heat') && !hasSignalType('moderate_heat')) {
    const griH = extractGri(['heat', 'extreme_heat']);
    const baseScore = griH?.baseline?.score;
    if (baseScore && baseScore !== 'sin data') {
      const baseProb = GRI_SCORE_PROB[baseScore] ?? null;
      const future = griH.future_high_emissions ?? griH.future_moderate_emissions;
      const futureProb = GRI_SCORE_PROB[future?.score] ?? null;
      signals.push(buildSignal({
        signalType: 'extreme_heat',
        indicator: 'gri_heat_probability',
        historical: baseProb,
        projected: futureProb,
        delta: (baseProb != null && futureProb != null) ? futureProb - baseProb : null,
        delta_pct: deltaPct(baseProb, futureProb),
        conf: 'medium',
        horizon: 'short_term',
        threshold_reference: `GRI infraestructura — exposición calor ${baseScore}`,
        exceeds_threshold: (GRI_SCORE_PROB[baseScore] ?? 0) >= 0.50,
        ensoAmplified: false,
        region,
      }));
    }
  }

  // Flood desde GRI (solo si no hay ya flood_risk cuantitativo)
  if (!hasSignalType('flood_risk')) {
    const griF = extractGri(['flood', 'fluvial', 'pluvial', 'coastal']);
    const baseScore = griF?.baseline?.score;
    if (baseScore && baseScore !== 'sin data') {
      const baseProb = GRI_SCORE_PROB[baseScore] ?? null;
      const future = griF.future_high_emissions ?? griF.future_moderate_emissions;
      const futureRaw = GRI_SCORE_PROB[future?.score] ?? null;
      const futureProb = futureRaw != null ? Math.min(futureRaw * enso.floodBoost, 1.0) : null;
      signals.push(buildSignal({
        signalType: 'flood_risk',
        indicator: 'gri_flood_probability',
        historical: baseProb,
        projected: futureProb,
        delta: (baseProb != null && futureProb != null) ? futureProb - baseProb : null,
        delta_pct: deltaPct(baseProb, futureProb),
        conf: 'medium',
        horizon: 'short_term',
        threshold_reference: `GRI infraestructura — exposición inundación ${baseScore}${enso.floodBoost !== 1.0 ? ` (ENSO ${enso.phase} boost: ${enso.floodBoost.toFixed(1)}x)` : ''}`,
        exceeds_threshold: (GRI_SCORE_PROB[baseScore] ?? 0) >= 0.50,
        ensoAmplified: enso.floodBoost !== 1.0,
        region,
      }));
    }
  }

  // ── ENSO como señal modificadora (no solo informacional) ────────────────
  if (ensoData && ensoData.phase !== 'neutral' && ensoData.oni_latest != null) {
    signals.push(buildSignal({
      signalType: 'enso_phase',
      indicator: 'oni',
      historical: null,
      projected: ensoData.oni_latest,
      delta: ensoData.oni_latest,
      delta_pct: null,
      conf: 'high',
      horizon: 'short_term',
      threshold_reference: `NOAA CPC ONI — ENSO activo: ${ensoData.phase} (${ensoData.oni_latest > 0 ? '+' : ''}${ensoData.oni_latest.toFixed(2)}°C), amplificando señales de precipitación ${enso.precipMult.toFixed(1)}x en ${region}`,
      exceeds_threshold: true,
      ensoAmplified: true,
      region,
    }));
  }

  // ── NDVI SIGNALS (MODIS) ─────────────────────────────────────────────────
  if (ndviData?.anomaly) {
    const { vegetation_health, current_ndvi, anomaly_zscore } = ndviData.anomaly;
    if (vegetation_health === 'severe_stress' || vegetation_health === 'stress') {
      signals.push(buildSignal({
        signalType: vegetation_health === 'severe_stress' ? 'severe_vegetation_stress' : 'vegetation_stress',
        indicator: 'ndvi_anomaly',
        projected: current_ndvi,
        delta: anomaly_zscore,
        conf: 'medium',
        horizon: 'short_term',
        threshold_reference: `MODIS NDVI anomalía: ${vegetation_health === 'severe_stress' ? '< -0.4' : '< -0.2'}`,
        exceeds_threshold: true,
        region: terrainData?.terrain_region ?? null,
        sourceTraceability: {
          source: 'MODIS NDVI (Terra MOD13Q1, 250m)',
          dataset: 'MOD13Q1 v6.1',
          temporal_window: '16-day composite',
          validation_status: 'provisional',
        },
      }));
    }
  }

  // ── GRACE-FO SIGNALS ────────────────────────────────────────────────────
  if (graceFoData?.anomaly) {
    const { tws_anomaly_cm, drought_severity } = graceFoData.anomaly;

    // groundwater_depletion: TWS anomaly < -5cm
    if (tws_anomaly_cm < -5) {
      signals.push(buildSignal({
        signalType: 'groundwater_depletion',
        indicator: 'tws_anomaly',
        projected: tws_anomaly_cm,
        delta: tws_anomaly_cm,
        conf: 'medium',
        horizon: 'short_term',
        threshold_reference: `GRACE-FO TWS anomalía: < -5cm (severidad: ${drought_severity})`,
        exceeds_threshold: tws_anomaly_cm < -10,
        region: terrainData?.terrain_region ?? null,
        sourceTraceability: {
          source: 'GRACE-FO (JPL Mascon, ~300km)',
          dataset: 'TELLUS Mascon v3',
          temporal_window: 'mensual',
          validation_status: 'provisional',
        },
      }));
    }
  }

  // ── TERRAIN SIGNALS (sin cambios respecto a v1) ──────────────────────────
  if (terrainData?.exceeds_landslide_threshold) {
    signals.push(buildSignal({
      signalType: 'landslide_risk',
      indicator: 'slope_degrees',
      historical: null,
      projected: terrainData.slope_degrees,
      delta: null,
      delta_pct: null,
      conf: 'medium',
      horizon: 'short_term',
      threshold_reference: `INGEMMET/SENAMHI — ${terrainData.susceptibility}: pendiente ${terrainData.slope_degrees}° en ${terrainData.terrain_region}`,
      exceeds_threshold: true,
      ensoAmplified: false,
      region,
    }));
  }

  if (terrainData?.huayco_risk === 'alto' || terrainData?.huayco_risk === 'medio') {
    signals.push(buildSignal({
      signalType: 'huayco_risk',
      indicator: 'terrain_huayco',
      historical: null,
      projected: terrainData.landslide_score,
      delta: null,
      delta_pct: null,
      conf: 'medium',
      horizon: 'short_term',
      threshold_reference: `INGEMMET — huayco nivel ${terrainData.huayco_risk}: ${terrainData.terrain_region} a ${terrainData.elevation_m} m.s.n.m.`,
      exceeds_threshold: true,
      ensoAmplified: false,
      region,
    }));
  }

  // ── COMPOUND SIGNAL: drought_compounding (NDVI + GRACE-FO + POWER) ─────
  const ndviStress = ndviData?.anomaly?.vegetation_health === 'stress' || ndviData?.anomaly?.vegetation_health === 'severe_stress';
  const graceDry = graceFoData?.anomaly?.tws_anomaly_cm < -5;
  const powerDry = fusedData?.nasaPowerData?.recent?.PRECTOT?.value != null
    && fusedData.nasaPowerData.recent.PRECTOT.value < 0.5;
  const droughtSources = [ndviStress, graceDry, powerDry].filter(Boolean).length;

  if (droughtSources >= 2) {
    const compoundSeverity = droughtSources === 3 ? 'severe' : 'moderate';
    signals.push(buildSignal({
      signalType: 'drought_compounding',
      indicator: 'compound_drought_index',
      projected: droughtSources,
      delta: droughtSources,
      conf: compoundSeverity === 'severe' ? 'high' : 'medium',
      horizon: 'short_term',
      compoundSeverity,
      threshold_reference: `Sequía compuesta: ${droughtSources}/3 fuentes (NDVI + GRACE-FO + POWER) — severidad ${compoundSeverity}`,
      exceeds_threshold: true,
      region: terrainData?.terrain_region ?? null,
      sourceTraceability: {
        source: `Compuesto (${['NDVI', 'GRACE-FO', 'POWER'].filter((_, i) => [ndviStress, graceDry, powerDry][i]).join(' + ')})`,
        dataset: 'MODIS MOD13Q1 + GRACE-FO Mascon + NASA POWER',
        temporal_window: 'multiple escalas',
        validation_status: 'provisional',
      },
    }));
  }

  // ── PRECTOT SIGNAL (NASA POWER — standalone drought_observacional) ──────
  const prectotVal = fusedData?.nasaPowerData?.recent?.PRECTOT?.value;
  if (prectotVal != null && prectotVal < thr.prectot_drought_mm) {
    signals.push(buildSignal({
      signalType: 'drought_observacional',
      indicator: 'prectot',
      projected: prectotVal,
      delta: prectotVal,
      conf: 'medium',
      horizon: 'short_term',
      threshold_reference: `NASA POWER PRECTOT < ${thr.prectot_drought_mm} mm/día (${prectotVal.toFixed(2)} mm/día observado)`,
      exceeds_threshold: true,
      region: terrainData?.terrain_region ?? null,
      sourceTraceability: {
        source: 'NASA POWER (PRECTOT)',
        dataset: 'NASA POWER v2.8.0 (MERRA-2)',
        temporal_window: 'diario reciente',
        validation_status: 'provisional',
      },
    }));
  }

  // Señal dominante: considerar todas las señales excepto terrain/ENSO puras
  const scorable = signals.filter(s =>
    !['landslide_risk', 'huayco_risk'].includes(s.signalType)
  );
  const dominant = scorable.length > 0
    ? scorable.reduce((best, s) =>
        (Math.abs(s.delta ?? 0) > Math.abs(best.delta ?? 0) ? s : best)
      ).signalType
    : (signals.length > 0 ? signals[0].signalType : null);

  return {
    signals,
    signals_count: signals.length,
    dominant_signal: dominant,
    enso_phase: ensoData?.phase ?? null,
    terrain_region: terrainData?.terrain_region ?? null,
    detection_region: region,
  };
}
