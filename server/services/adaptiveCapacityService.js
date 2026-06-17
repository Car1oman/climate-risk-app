/**
 * Adaptive Capacity Trend Service — Fase 3.3
 *
 * Computa la tendencia de capacidad adaptativa usando series históricas
 * del World Bank, alineado con las dimensiones del Manual de Adaptación
 * (sección 3.3): planes de continuidad, flexibilidad logística,
 * infraestructura resiliente, capacidades de gestión, acceso a
 * información y recursos financieros.
 *
 * La capacidad adaptativa se mide como tendencia de indicadores
 * proxy sobre el período más largo disponible (típicamente 2000–actual).
 * Una pendiente positiva indica mejora en capacidad adaptativa.
 *
 * Fuente: World Bank API v2 / WDI
 */

import { logger } from '../utils/logger.js';

const WB_BASE = 'https://api.worldbank.org/v2/country/PE/indicator';

// Indicadores WB proxy para cada dimensión del Manual (sección 3.3)
const ADAPTIVE_DIMENSIONS = {
  // Planes de continuidad → acceso eléctrico como proxy de infraestructura base
  electricidad:         { code: 'EG.ELC.ACCS.ZS', label: 'Acceso a electricidad (% población)' },
  // Flexibilidad logística → internet fijo como proxy de conectividad logística digital
  conectividad:         { code: 'IT.NET.BBND.P2',  label: 'Suscripciones a internet fijo (por 100 hab.)' },
  // Infraestructura resiliente → acceso a agua potable
  agua:                 { code: 'SH.H2O.BASW.ZS',  label: 'Acceso a agua potable (% población)' },
  // Capacidades de gestión → educación terciaria como proxy de capital humano
  capital_humano:       { code: 'SE.TER.ENRR',     label: 'Tasa bruta de matrícula terciaria (%)' },
  // Recursos financieros → crédito doméstico como proxy de profundidad financiera
  profundidad_financiera: { code: 'FS.AST.DOMS.GD.ZS', label: 'Crédito doméstico al sector privado (% PBI)' },
  // Acceso a información → suscripciones móviles
  telefonia:            { code: 'IT.CEL.SETS.P2',  label: 'Suscripciones a telefonía móvil (por 100 hab.)' },
};

const FETCH_TIMEOUT_MS = 15000;
const MAX_RECORDS = 60;

/**
 * Fetch serie temporal completa para un indicador.
 */
async function fetchTimeSeries(code) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${WB_BASE}/${code}?format=json&per_page=${MAX_RECORDS}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    return data[1]
      .filter(row => row.value != null)
      .map(row => ({ year: parseInt(row.date, 10), value: row.value }))
      .sort((a, b) => a.year - b.year);
  } catch {
    return null;
  }
}

/**
 * Computa pendiente de regresión lineal simple sobre la serie.
 * Retorna cambio promedio por año en unidades del indicador.
 */
function computeTrend(series) {
  if (!series || series.length < 3) return null;
  const n = series.length;
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((s, p) => s + p.value, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i].value - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const pctChange = yMean !== 0 ? (slope * n / yMean) * 100 : 0;
  return {
    slope: Math.round(slope * 1000) / 1000,
    pctChange: Math.round(pctChange * 10) / 10,
    direction: slope > 0.01 ? 'mejora' : slope < -0.01 ? 'deterioro' : 'estable',
    years: n,
    period: `${series[0].year}–${series[n - 1].year}`,
  };
}

/**
 * Clasifica una dimensión según su tendencia.
 */
function classifyDimension(trend) {
  if (!trend) return { level: 'sin_datos', score: 0.5 };
  if (trend.direction === 'mejora' && trend.pctChange > 20) return { level: 'alta', score: 0.8 };
  if (trend.direction === 'mejora') return { level: 'media', score: 0.6 };
  if (trend.direction === 'estable') return { level: 'media', score: 0.5 };
  if (trend.direction === 'deterioro' && trend.pctChange < -20) return { level: 'baja', score: 0.2 };
  return { level: 'baja', score: 0.3 };
}

/**
 * Computa el índice compuesto de capacidad adaptativa.
 *
 * @returns {Promise<Object>} { dimensions, compositeIndex, narrative }
 */
export async function getAdaptiveCapacityTrend() {
  const dimensions = {};
  let compositeScore = 0;
  let dimensionsWithData = 0;

  for (const [key, meta] of Object.entries(ADAPTIVE_DIMENSIONS)) {
    try {
      const series = await fetchTimeSeries(meta.code);
      if (series && series.length > 0) {
        const latest = series[series.length - 1].value;
        const trend = computeTrend(series);
        const classification = classifyDimension(trend);

        dimensions[key] = {
          label: meta.label,
          latestValue: latest,
          latestYear: series[series.length - 1].year,
          seriesLength: series.length,
          trend,
          classification: classification.level,
        };

        compositeScore += classification.score;
        dimensionsWithData++;
      } else {
        dimensions[key] = {
          label: meta.label,
          latestValue: null,
          trend: null,
          classification: 'sin_datos',
        };
      }
    } catch {
      dimensions[key] = { label: meta.label, latestValue: null, trend: null, classification: 'sin_datos' };
    }
  }

  const compositeIndex = dimensionsWithData > 0
    ? Math.round((compositeScore / dimensionsWithData) * 1000) / 1000
    : null;

  // Clasificación general
  const overallLevel = compositeIndex == null ? 'sin_datos'
    : compositeIndex >= 0.7 ? 'alta'
    : compositeIndex >= 0.4 ? 'media'
    : 'baja';

  // Narrativa
  const improving = Object.values(dimensions).filter(d => d.trend?.direction === 'mejora').length;
  const declining = Object.values(dimensions).filter(d => d.trend?.direction === 'deterioro').length;
  const totalWithTrend = Object.values(dimensions).filter(d => d.trend).length;

  let narrative = '';
  if (compositeIndex == null) {
    narrative = 'No se pudieron obtener datos de capacidad adaptativa.';
  } else {
    const pct = (compositeIndex * 100).toFixed(0);
    narrative = `Capacidad adaptativa: ${pct}% — ${overallLevel}. `;
    if (totalWithTrend > 0) {
      narrative += `${improving} dimensión(es) en mejora, ${declining} en deterioro (de ${totalWithTrend} con datos). `;
    }
    narrative += 'Período de análisis: 2000–actual. Fuente: World Bank WDI.';
  }

  logger.info('adaptiveCapacityService', 'Tendencia de capacidad adaptativa computada', {
    compositeIndex,
    level: overallLevel,
    dimensionsWithData,
  });

  return {
    compositeIndex,
    level: overallLevel,
    dimensions,
    narrative,
    source: 'World Bank — World Development Indicators (WDI)',
    generatedAt: new Date().toISOString(),
  };
}
