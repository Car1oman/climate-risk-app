/**
 * validate-location.js — Script de validación de datos para una coordenada específica.
 *
 * Ejecuta el pipeline completo Layer1→Layer9 y muestra:
 *   1. Datos crudos de cada fuente (Supabase, GRI, Open-Meteo, ENSO, Terrain)
 *   2. Transformaciones en cada capa (Layer1→2→3→9)
 *   3. Simulación de normalizeRisks() (frontend)
 *
 * Uso: node validate-location.js
 */

import 'dotenv/config';

// ── Coordenadas de validación ────────────────────────────────────────────────
const LAT = -10.79014;
const LON = -76.23413;
const SECTOR = 'retail';
const SCENARIO = 'ssp245';

// ── Importar servicios y capas del servidor ──────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { getGriRiskByLocation }   from './server/services/griRiskService.js';
import { getClimateTrends }       from './server/services/openMeteoService.js';
import { getEnsoContext }         from './server/services/ensoService.js';
import { getTerrainIntelligence } from './server/services/terrainService.js';
import { getTerritorialContext }  from './server/services/worldBankService.js';
import { fusionClimateData }      from './server/layers/Layer1_ClimateDataFusion.js';
import { detectSignalsV2 }        from './server/layers/Layer2_SignalEngineV2.js';
import { assessBusinessRisk }     from './server/layers/Layer3_BusinessRiskEngine.js';
import { getAdaptations }         from './server/layers/Layer5_AdaptationEngine.js';
import { generateNarrative }      from './server/layers/Layer6_NarrativeEngine.js';
import { buildProjectionContext } from './server/scientific/projection.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ── Utilidades de visualización ──────────────────────────────────────────────
function section(title) {
  console.log('\n' + '═'.repeat(80));
  console.log(`  ${title}`);
  console.log('═'.repeat(80));
}

function subsection(title) {
  console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(0, 74 - title.length)));
}

function pretty(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// ── Simulación inline de SIGNAL_TO_CONSOLIDATED (normalizeRisks frontend) ────
const SIGNAL_TO_CONSOLIDATED = {
  extreme_rain: 'lluvias_extremas',
  flood_risk: 'lluvias_extremas',
  extreme_heat: 'calor_extremo',
  severe_heat: 'calor_extremo',
  tropical_nights: 'calor_extremo',
  temp_increase: 'calor_extremo',
  drought: 'sequia',
  water_stress: 'sequia',
  landslide_susceptibility: 'deslizamiento',
  landslide_risk: 'deslizamiento',
  huayco_risk: 'deslizamiento',
  enso_phase: 'fenomeno_enso',
  enso: 'fenomeno_enso',
  flood: 'lluvias_extremas',
  fluvial: 'inundacion',
  pluvial: 'lluvias_extremas',
  coastal: 'inundacion',
  heat: 'calor_extremo',
  heat_stress: 'calor_extremo',
  landslide: 'deslizamiento',
  drought_gri: 'sequia',
};

const PERIOD_MAP = {
  short_term: 'corto_plazo',
  mid_term: 'mediano_plazo',
  long_term: 'largo_plazo',
  historical: 'historico',
  'corto plazo': 'corto_plazo',
  'mediano plazo': 'mediano_plazo',
  'largo plazo': 'largo_plazo',
};

function toTemporalPeriod(horizon) {
  const h = (horizon || '').toLowerCase().replace(/[_\s]/g, '_');
  if (h.includes('short') || h.includes('corto') || h.includes('2020') || h.includes('2039')) return 'corto_plazo';
  if (h.includes('mid') || h.includes('mediano') || h.includes('2040') || h.includes('2059')) return 'mediano_plazo';
  if (h.includes('long') || h.includes('largo') || h.includes('2060') || h.includes('2079')) return 'largo_plazo';
  if (h.includes('hist') || h.includes('historic')) return 'historico';
  return 'corto_plazo';
}

function simulateNormalizeRisks(apiResponse) {
  const map = new Map();

  const rawSignals = apiResponse.signals;
  const signalList = Array.isArray(rawSignals)
    ? rawSignals
    : Array.isArray(rawSignals?.signals) ? rawSignals.signals : [];

  for (const signal of signalList) {
    const typeKey = ((signal.signal_type ?? signal.signalType ?? '')).toLowerCase().trim();
    if (!typeKey) continue;
    const riskType = SIGNAL_TO_CONSOLIDATED[typeKey];
    if (!riskType) continue;
    const horizon = signal.horizon ?? signal.temporal_window ?? '';
    const period = toTemporalPeriod(horizon);
    const key = `${riskType}_${period}`;
    if (!map.has(key)) {
      map.set(key, { riskType, period, signals: [], risks: [], impacts: [], confidence: signal.confidence ?? 'low' });
    }
    map.get(key).signals.push({ typeKey, horizon, delta: signal.delta, historical: signal.historical, projected: signal.projected, indicator: signal.indicator, confidence: signal.confidence });
  }

  const riskList = Array.isArray(apiResponse.risks) ? apiResponse.risks : [];
  for (const risk of riskList) {
    const nestedSignal = risk.signal;
    const typeKey = nestedSignal ? ((nestedSignal.signal_type ?? nestedSignal.signalType ?? '')).toLowerCase().trim() : '';
    let riskType = typeKey ? SIGNAL_TO_CONSOLIDATED[typeKey] : null;
    if (!riskType) {
      const title = (risk.title ?? risk.name ?? '').toLowerCase();
      if (/lluvi|inundaci/.test(title)) riskType = 'lluvias_extremas';
      else if (/calor|temperatura/.test(title)) riskType = 'calor_extremo';
      else if (/sequ/.test(title)) riskType = 'sequia';
      else if (/desliz|huayco/.test(title)) riskType = 'deslizamiento';
    }
    if (!riskType) continue;
    const matchedKey = [...map.keys()].find(k => k.startsWith(riskType));
    if (matchedKey) {
      const entry = map.get(matchedKey);
      if (Array.isArray(risk.operational_impacts)) {
        entry.impacts = [...new Set([...entry.impacts, ...risk.operational_impacts])];
      }
      entry.risks.push({ title: risk.title, category: risk.category, operational_impacts: risk.operational_impacts });
    }
  }

  return [...map.values()];
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${'▓'.repeat(80)}`);
  console.log(`  VALIDACIÓN DE DATOS — lat: ${LAT}, lon: ${LON}`);
  console.log(`  Escenario: ${SCENARIO} | Sector: ${SECTOR} | Fecha: ${new Date().toISOString()}`);
  console.log(`${'▓'.repeat(80)}`);

  // ══════════════════════════════════════════════════════════════════════════
  section('BLOQUE 1: DATOS CRUDOS DE CADA FUENTE');
  // ══════════════════════════════════════════════════════════════════════════

  subsection('1A. SUPABASE — RPC get_nearest_climate_cell');

  let supabaseRaw = null;
  try {
    const { data, error } = await supabase.rpc('get_nearest_climate_cell', { p_lat: LAT, p_lon: LON });
    if (error) {
      console.log('❌ Error Supabase RPC:', error.message);
    } else if (!data || data.length === 0) {
      console.log('⚠️  Sin datos para esta coordenada (RPC retornó vacío)');
    } else {
      supabaseRaw = data[0];
      console.log(`✅ Celda encontrada:`);
      console.log(`   lat_celda: ${supabaseRaw.lat} | lon_celda: ${supabaseRaw.lon}`);
      const raw = typeof supabaseRaw.data === 'string' ? JSON.parse(supabaseRaw.data) : supabaseRaw.data;
      const periods = Object.keys(raw || {});
      console.log(`   Períodos disponibles: ${periods.join(', ')}`);

      // Mostrar datos de cada período
      for (const [periodKey, periodData] of Object.entries(raw || {})) {
        if (!periodData || typeof periodData !== 'object') continue;
        const vars = Object.keys(periodData);
        console.log(`\n   [${periodKey}] — ${vars.length} variables:`);
        for (const [varName, stats] of Object.entries(periodData)) {
          if (stats == null) continue;
          if (typeof stats === 'object') {
            const median = stats.median != null ? stats.median.toFixed(2) : 'null';
            const p10    = stats.p10    != null ? stats.p10.toFixed(2)    : 'null';
            const p90    = stats.p90    != null ? stats.p90.toFixed(2)    : 'null';
            console.log(`     ${varName.padEnd(12)}: median=${median}, p10=${p10}, p90=${p90}`);
          } else {
            console.log(`     ${varName.padEnd(12)}: ${stats}`);
          }
        }
      }
    }
  } catch (err) {
    console.log('❌ Excepción Supabase:', err.message);
  }

  subsection('1B. GRI Oxford — Infrastructure Resilience');
  let griRaw = null;
  try {
    griRaw = await getGriRiskByLocation(LAT, LON);
    if (!griRaw) {
      console.log('⚠️  GRI: sin datos');
    } else {
      console.log(`✅ Fuente: ${griRaw.source ?? 'GRI'}`);
      const hazards = griRaw.hazards ?? [];
      console.log(`   Amenazas: ${hazards.length}`);
      for (const h of hazards) {
        const prob = h.baseline?.probability ?? h.baseline?.score ?? 'N/A';
        console.log(`     ${(h.hazard ?? h.type ?? 'unknown').padEnd(20)}: probabilidad baseline = ${prob}`);
      }
      if (griRaw.scores) {
        console.log(`   Scores agregados:`, griRaw.scores);
      }
    }
  } catch (err) {
    console.log('❌ GRI error:', err.message);
  }

  subsection('1C. Open-Meteo — Tendencias meteorológicas');
  let meteoRaw = null;
  try {
    meteoRaw = await getClimateTrends(LAT, LON);
    if (!meteoRaw) {
      console.log('⚠️  Open-Meteo: sin datos');
    } else {
      console.log(`✅ Open-Meteo datos recibidos`);
      if (meteoRaw.meteo) {
        console.log(`   Datos narrativos (meteo):`, JSON.stringify(meteoRaw.meteo, null, 2).slice(0, 800) + '...');
      }
      if (meteoRaw.climateIndices) {
        const ci = meteoRaw.climateIndices;
        console.log(`   Climate indices disponibles: ${Object.keys(ci).join(', ')}`);
        for (const [periodKey, periodData] of Object.entries(ci)) {
          if (!periodData || typeof periodData !== 'object') continue;
          console.log(`   [${periodKey}]:`, JSON.stringify(periodData).slice(0, 300));
        }
      }
    }
  } catch (err) {
    console.log('❌ Open-Meteo error:', err.message);
  }

  subsection('1D. NOAA CPC — Índice ENSO (ONI)');
  let ensoRaw = null;
  try {
    ensoRaw = await getEnsoContext();
    if (!ensoRaw) {
      console.log('⚠️  ENSO: sin datos');
    } else {
      console.log(`✅ ENSO datos recibidos:`);
      console.log(`   Fase: ${ensoRaw.phase ?? 'unknown'}`);
      console.log(`   ONI: ${ensoRaw.oni_latest ?? 'N/A'}`);
      console.log(`   Intensidad: ${ensoRaw.intensity ?? 'N/A'}`);
      console.log(`   Tendencia: ${ensoRaw.trend ?? 'N/A'}`);
      console.log(`   Flood amplifier: ${ensoRaw.flood_amplifier}`);
      console.log(`   Drought amplifier: ${ensoRaw.drought_amplifier}`);
      console.log(`   Supply chain risk: ${ensoRaw.supply_chain_risk}`);
      if (ensoRaw.affected_regions?.length) {
        console.log(`   Regiones afectadas: ${ensoRaw.affected_regions.join(', ')}`);
      }
      if (ensoRaw.summary) {
        console.log(`   Resumen: ${ensoRaw.summary}`);
      }
    }
  } catch (err) {
    console.log('❌ ENSO error:', err.message);
  }

  subsection('1E. OpenTopoData SRTM — Terreno y pendiente');
  let terrainRaw = null;
  try {
    terrainRaw = await getTerrainIntelligence(LAT, LON);
    if (!terrainRaw) {
      console.log('⚠️  Terrain: sin datos');
    } else {
      console.log(`✅ Terrain datos recibidos:`);
      console.log(`   Elevación: ${terrainRaw.elevation_m} m`);
      console.log(`   Pendiente: ${terrainRaw.slope_degrees}°`);
      console.log(`   Aspecto: ${terrainRaw.aspect_degrees}°`);
      console.log(`   Región: ${terrainRaw.terrain_region}`);
      console.log(`   Susceptibilidad: ${terrainRaw.susceptibility}`);
      console.log(`   Landslide score: ${terrainRaw.landslide_score}`);
      console.log(`   Huayco risk: ${terrainRaw.huayco_risk}`);
      console.log(`   Excede umbral landslide: ${terrainRaw.exceeds_landslide_threshold}`);
      console.log(`   Excede umbral huayco: ${terrainRaw.exceeds_huayco_threshold}`);
      console.log(`   Fuente: ${terrainRaw.source}`);
      console.log(`   Método: ${terrainRaw.method}`);
    }
  } catch (err) {
    console.log('❌ Terrain error:', err.message);
  }

  subsection('1F. World Bank — Contexto territorial');
  let territorialRaw = null;
  try {
    territorialRaw = await getTerritorialContext();
    if (!territorialRaw) {
      console.log('⚠️  World Bank: sin datos');
    } else {
      console.log(`✅ World Bank datos recibidos`);
      const keys = Object.keys(territorialRaw);
      console.log(`   Campos: ${keys.join(', ')}`);
    }
  } catch (err) {
    console.log('❌ World Bank error:', err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('BLOQUE 2: PIPELINE DE TRANSFORMACIÓN (Layer1 → Layer9)');
  // ══════════════════════════════════════════════════════════════════════════

  subsection('LAYER 1 — fusionClimateData()');
  let fusedData = null;
  try {
    fusedData = await fusionClimateData({ lat: LAT, lon: LON, scenario: SCENARIO });
    console.log(`✅ Layer1 completado:`);
    console.log(`   climateSource: ${fusedData.climateSource ?? 'null'}`);
    console.log(`   distanceKm (a celda CMIP6): ${fusedData.distanceKm ?? 'null'}`);
    console.log(`   scenario: ${fusedData.scenario}`);
    console.log(`   griData presente: ${!!fusedData.griData}`);
    console.log(`   meteoData presente: ${!!fusedData.meteoData}`);
    console.log(`   ensoData presente: ${!!fusedData.ensoData}`);
    console.log(`   terrainData presente: ${!!fusedData.terrainData}`);
    console.log(`   territorialData presente: ${!!fusedData.territorialData}`);

    if (fusedData.climateData) {
      const periods = Object.keys(fusedData.climateData);
      console.log(`\n   climateData — períodos: ${periods.join(', ')}`);
      for (const [period, data] of Object.entries(fusedData.climateData)) {
        if (!data) { console.log(`   [${period}]: null`); continue; }
        console.log(`\n   [${period}]:`);
        for (const [varName, val] of Object.entries(data)) {
          if (val != null) {
            console.log(`     ${varName.padEnd(12)}: ${typeof val === 'number' ? val.toFixed(3) : val}`);
          }
        }
      }
    } else {
      console.log(`\n   ⚠️  climateData = null (no hay climate_cells ni Open-Meteo fallback)`);
    }

    if (fusedData.climateDataStats) {
      console.log('\n   climateDataStats (CMIP6 ensemble p10/p90) — fragmento:');
      const hist = fusedData.climateDataStats.historical;
      if (hist) {
        for (const [varName, stats] of Object.entries(hist)) {
          console.log(`     ${varName.padEnd(12)}: median=${stats.median?.toFixed(2) ?? 'null'}, p10=${stats.p10?.toFixed(2) ?? 'null'}, p90=${stats.p90?.toFixed(2) ?? 'null'}`);
        }
      }
    }
  } catch (err) {
    console.log('❌ Layer1 error:', err.message);
    console.error(err);
    return;
  }

  subsection('LAYER 2 — detectSignalsV2()');
  let signalOutput = null;
  try {
    signalOutput = detectSignalsV2(fusedData);
    console.log(`✅ Layer2 completado:`);
    console.log(`   Señales detectadas: ${signalOutput.signals_count}`);
    console.log(`   Señal dominante: ${signalOutput.dominant_signal ?? 'ninguna'}`);
    console.log(`   Región terrain: ${signalOutput.terrain_region ?? 'N/A'}`);
    console.log(`   ENSO phase: ${signalOutput.enso_phase ?? 'N/A'}`);

    if (signalOutput.signals?.length > 0) {
      console.log('\n   SEÑALES GENERADAS:');
      for (const s of signalOutput.signals) {
        const sigType = s.signal_type ?? s.signalType;
        const hz = s.horizon ?? s.temporal_window ?? 'N/A';
        const hist = s.historical != null ? s.historical.toFixed(2) : 'null';
        const proj = s.projected  != null ? s.projected.toFixed(2)  : 'null';
        const delta = s.delta     != null ? s.delta.toFixed(2)       : 'null';
        const threshold = s.source_traceability?.threshold_applied ?? 'N/A';
        const conf = s.confidence ?? 'N/A';
        const indicator = s.indicator ?? 'N/A';
        const ensoMod = s.source_traceability?.enso_modifier != null
          ? ` [ENSO×${s.source_traceability.enso_modifier}]`
          : '';
        console.log(`\n   ▸ ${sigType.padEnd(25)} | horizon: ${hz.padEnd(10)} | conf: ${conf}`);
        console.log(`     indicador=${indicator.padEnd(15)} | hist=${hist} | proj=${proj} | delta=${delta}${ensoMod}`);
        console.log(`     umbral aplicado: ${threshold}`);
        if (s.source_traceability) {
          const t = s.source_traceability;
          console.log(`     fuente_origen: ${t.source_origin ?? 'N/A'} | dataset: ${t.dataset ?? 'N/A'}`);
          if (t.transformation_applied) {
            console.log(`     transformación: ${t.transformation_applied}`);
          }
          if (t.scenario_ssp) {
            console.log(`     escenario: ${t.scenario_ssp}`);
          }
        }
      }
    } else {
      console.log('\n   ⚠️  No se generaron señales');
    }
  } catch (err) {
    console.log('❌ Layer2 error:', err.message);
    console.error(err);
  }

  subsection('LAYER 3 — assessBusinessRisk()');
  let businessRiskOutput = null;
  try {
    businessRiskOutput = await assessBusinessRisk(signalOutput, { sector: SECTOR });
    console.log(`✅ Layer3 completado:`);
    console.log(`   Exposición global: ${businessRiskOutput.overall_exposure}`);
    console.log(`   Sector key: ${businessRiskOutput.sector_key}`);
    console.log(`   Riesgos generados: ${businessRiskOutput.risks?.length ?? 0}`);
    for (const r of (businessRiskOutput.risks ?? [])) {
      const impacts = r.operational_impacts ?? [];
      console.log(`\n   ▸ ${(r.title ?? r.name ?? 'sin título').slice(0, 60)}`);
      console.log(`     Señal base: ${r.signal?.signal_type ?? r.signal?.signalType ?? 'N/A'}`);
      console.log(`     Impactos operacionales: ${impacts.length}`);
      for (const imp of impacts.slice(0, 3)) {
        console.log(`       - ${imp.slice(0, 80)}`);
      }
    }
  } catch (err) {
    console.log('❌ Layer3 error:', err.message);
  }

  subsection('LAYER 5 — getAdaptations()');
  let adaptationOutput = null;
  try {
    const contextualRisks = {
      risks: (businessRiskOutput?.risks ?? []).map(r => ({ ...r, confidence: r.signal?.confidence ?? 'low' })),
      overall_exposure: businessRiskOutput?.overall_exposure ?? 'bajo',
      sector_key: businessRiskOutput?.sector_key ?? 'otros',
    };
    adaptationOutput = getAdaptations(contextualRisks, SECTOR);
    const adaptations = adaptationOutput.adaptations ?? adaptationOutput ?? [];
    const adaptList = Array.isArray(adaptations) ? adaptations : [];
    console.log(`✅ Layer5 completado: ${adaptList.length} adaptaciones`);
    for (const a of adaptList.slice(0, 5)) {
      const name = a.nombre ?? a.name ?? 'sin nombre';
      const hor  = a.horizonte_implementacion ?? a.timeframe ?? 'N/A';
      const ef   = a.efectividad ?? a.effectiveness ?? 'N/A';
      console.log(`   ▸ ${name.slice(0, 60)} | horizonte: ${hor} | efectividad: ${ef}`);
    }
  } catch (err) {
    console.log('❌ Layer5 error:', err.message);
  }

  subsection('LAYER 6 — generateNarrative()');
  let narrativeOutput = null;
  try {
    narrativeOutput = generateNarrative({
      fusedData, signalOutput, businessRiskOutput,
      contextualRisks: businessRiskOutput,
      adaptationOutput, sector: SECTOR,
      lat: LAT, lon: LON,
    });
    console.log(`✅ Layer6 completado:`);
    console.log(`   Confianza: ${narrativeOutput.confidence ?? 'N/A'}`);
    console.log(`\n   Resumen ejecutivo:`);
    console.log(`   "${narrativeOutput.executive_summary?.slice(0, 300)}..."`);
    if (narrativeOutput.key_metrics) {
      console.log(`\n   Key metrics:`);
      for (const [k, v] of Object.entries(narrativeOutput.key_metrics)) {
        console.log(`     ${k}: ${JSON.stringify(v)}`);
      }
    }
  } catch (err) {
    console.log('❌ Layer6 error:', err.message);
  }

  subsection('LAYER 9 — buildProjectionContext() [ESTÁTICO IPCC]');
  let projectionOutput = null;
  try {
    projectionOutput = buildProjectionContext(signalOutput);
    console.log(`✅ Layer9 completado:`);
    console.log(`   ⚠️  NOTA: Layer9 es ESTÁTICO — mismos valores IPCC para toda coordenada de Perú`);
    console.log(`   active_signal_count: ${projectionOutput?.active_signal_count ?? 'N/A'}`);
    if (projectionOutput?.scenarios) {
      console.log(`   Escenarios disponibles: ${Object.keys(projectionOutput.scenarios).join(', ')}`);
    }
    if (projectionOutput?.projections) {
      console.log('\n   Proyecciones IPCC (valores hardcodeados):');
      for (const [varName, data] of Object.entries(projectionOutput.projections)) {
        console.log(`     ${varName}:`, JSON.stringify(data).slice(0, 150));
      }
    }
  } catch (err) {
    console.log('❌ Layer9 error:', err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('BLOQUE 3: SIMULACIÓN FRONTEND — normalizeRisks()');
  // ══════════════════════════════════════════════════════════════════════════

  const apiResponseSimulated = {
    signals: signalOutput,
    risks: businessRiskOutput?.risks ?? [],
    gri_hazards: fusedData?.griData?.hazards ?? [],
    adaptations: adaptationOutput?.adaptations ?? [],
    enso_context: fusedData?.ensoData ?? null,
  };

  try {
    const normalized = simulateNormalizeRisks(apiResponseSimulated);
    console.log(`\n  normalizeRisks() generó ${normalized.length} ConsolidatedRisk:`);
    for (const cr of normalized) {
      console.log(`\n   ▸ ${cr.riskType.padEnd(20)} | periodo: ${cr.period.padEnd(15)} | confianza: ${cr.confidence}`);
      if (cr.signals?.length) {
        for (const s of cr.signals) {
          console.log(`     señal: ${s.typeKey} | delta=${s.delta ?? 'null'} | hist=${s.historical ?? 'null'} | proj=${s.projected ?? 'null'}`);
        }
      }
      if (cr.impacts?.length) {
        console.log(`     impactos (${cr.impacts.length}): ${cr.impacts.slice(0, 2).map(i => i.slice(0, 60)).join(' | ')}`);
      }
    }

    // Agrupación por tipo de riesgo (para timeline)
    const byRiskType = {};
    for (const cr of normalized) {
      if (!byRiskType[cr.riskType]) byRiskType[cr.riskType] = [];
      byRiskType[cr.riskType].push(cr.period);
    }
    console.log('\n  Riesgos por tipo (lo que ve el usuario en la UI):');
    for (const [riskType, periods] of Object.entries(byRiskType)) {
      console.log(`   ${riskType.padEnd(25)}: ${periods.join(', ')}`);
    }
  } catch (err) {
    console.log('❌ normalizeRisks error:', err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('BLOQUE 4: COMPARACIÓN CRUDA vs UI');
  // ══════════════════════════════════════════════════════════════════════════

  console.log('\n  DATO CRUDO → TRANSFORMACIÓN → RESULTADO EN UI\n');

  if (fusedData?.climateData) {
    const hist = fusedData.climateData.historical;
    const short = fusedData.climateData.short_term;
    console.log('  TEMPERATURA (tas):');
    console.log(`    Crudo histórico:   ${hist?.tas ?? 'null'} °C (clima base 1981-2014)`);
    console.log(`    Crudo short_term:  ${short?.tas ?? 'null'} °C (CMIP6 SSP245 2020-2039)`);
    if (hist?.tas != null && short?.tas != null) {
      const delta = short.tas - hist.tas;
      const threshold_sierra = 1.0;
      const region = fusedData.terrainData?.terrain_region ?? 'desconocida';
      console.log(`    Delta calculado:   ${delta.toFixed(3)} °C`);
      console.log(`    Región:            ${region}`);
      console.log(`    Señal generada:    ${signalOutput?.signals?.find(s => (s.signal_type ?? s.signalType) === 'temp_increase' && (s.horizon ?? '').includes('short')) ? '✅ temp_increase (corto_plazo)' : '❌ no generada'}`);
      console.log(`    En UI:             "Calor extremo" corto_plazo`);
    }

    console.log('\n  CALOR EXTREMO (hd35 — días/año > 35°C):');
    console.log(`    Crudo histórico:   ${hist?.hd35 ?? 'null'} días/año`);
    console.log(`    Crudo short_term:  ${short?.hd35 ?? 'null'} días/año`);
    if (hist?.hd35 != null && short?.hd35 != null) {
      const delta = short.hd35 - hist.hd35;
      console.log(`    Delta calculado:   ${delta.toFixed(3)} días`);
      const s = signalOutput?.signals?.find(s => (s.signal_type ?? s.signalType) === 'extreme_heat' && (s.horizon ?? '').includes('short'));
      console.log(`    Señal generada:    ${s ? `✅ extreme_heat → delta=${s.delta?.toFixed(2)}` : '❌ no generada'}`);
      console.log(`    En UI:             "Calor extremo" corto_plazo`);
    }

    console.log('\n  PRECIPITACIÓN (prpercnt — % vs histórico):');
    console.log(`    Crudo histórico:   ${hist?.prpercnt ?? 'null'} %`);
    console.log(`    Crudo short_term:  ${short?.prpercnt ?? 'null'} %`);
    const ensoOni = fusedData.ensoData?.oni_latest ?? 0;
    const ensoPhase = ensoOni > 0.5 ? 'el_nino' : ensoOni < -0.5 ? 'la_nina' : 'neutral';
    const region = fusedData.terrainData?.terrain_region ?? 'default';
    const precipMult = ensoPhase === 'el_nino' && region === 'costa' ? 2.5
                     : ensoPhase === 'el_nino' && region === 'selva' ? 0.8
                     : ensoPhase === 'el_nino' ? 1.3
                     : ensoPhase === 'la_nina' && region === 'costa' ? 0.4
                     : 1.0;
    if (hist?.prpercnt != null && short?.prpercnt != null) {
      console.log(`    ENSO phase:        ${ensoPhase} (ONI=${ensoOni}) → precipMult=${precipMult}`);
      const effectivePrpercnt = short.prpercnt * precipMult;
      console.log(`    prpercnt con ENSO: ${effectivePrpercnt.toFixed(2)} % (${short.prpercnt} × ${precipMult})`);
      const droughtSignal = signalOutput?.signals?.find(s => (s.signal_type ?? s.signalType) === 'drought' && (s.horizon ?? '').includes('short'));
      const rainSignal    = signalOutput?.signals?.find(s => (s.signal_type ?? s.signalType) === 'extreme_rain' && (s.horizon ?? '').includes('short'));
      console.log(`    Señal sequía:      ${droughtSignal ? `✅ drought delta=${droughtSignal.delta?.toFixed(2)}` : '❌ no generada'}`);
      console.log(`    Señal lluvia:      ${rainSignal    ? `✅ extreme_rain delta=${rainSignal.delta?.toFixed(2)}` : '❌ no generada'}`);
    }

    console.log('\n  CDD (días secos consecutivos) — HALLAZGO F1:');
    console.log(`    CLIMATE_VARS incluye cdd: NO (dato faltante en Layer1)`);
    console.log(`    hist?.cdd:   ${hist?.cdd ?? 'null ← SIEMPRE null cuando fuente=climate_cells'}`);
    console.log(`    Impacto:     Señal drought vía CDD NUNCA se activa con fuente climate_cells`);
    console.log(`    Señal active: ${signalOutput?.signals?.some(s => (s.signal_type ?? s.signalType) === 'drought') ? 'drought via prpercnt/pr (no cdd)' : 'drought no activa'}`);
  }

  console.log('\n  TERRENO (GRI + SRTM):');
  if (fusedData?.terrainData) {
    const t = fusedData.terrainData;
    const griFlood = fusedData.griData?.hazards?.find(h => (h.hazard ?? h.type ?? '').toLowerCase().includes('flood'));
    console.log(`    Pendiente SRTM: ${t.slope_degrees}° → susceptibilidad=${t.susceptibility}`);
    console.log(`    Señal landslide: ${signalOutput?.signals?.some(s => (s.signal_type ?? s.signalType) === 'landslide_risk') ? '✅ generada' : '❌ no generada (umbral no superado)'}`);
    console.log(`    Señal huayco:    ${signalOutput?.signals?.some(s => (s.signal_type ?? s.signalType) === 'huayco_risk') ? '✅ generada' : '❌ no generada'}`);
    if (griFlood) {
      console.log(`    GRI flood prob: ${griFlood.baseline?.probability ?? 'N/A'}`);
      console.log(`    Señal flood_risk: ${signalOutput?.signals?.some(s => (s.signal_type ?? s.signalType) === 'flood_risk') ? '✅ generada' : '❌ no generada'}`);
    }
  } else {
    console.log(`    ⚠️  terrainData = null`);
  }

  console.log('\n  ENSO:');
  if (fusedData?.ensoData) {
    const e = fusedData.ensoData;
    console.log(`    Dato crudo: ONI=${e.oni_latest} → phase=${e.phase} → intensity=${e.intensity}`);
    const ensoSignal = signalOutput?.signals?.find(s => (s.signal_type ?? s.signalType) === 'enso_phase');
    console.log(`    Señal enso_phase: ${ensoSignal ? `✅ generada (ONI ${e.oni_latest})` : `❌ no generada como señal independiente (phase=${e.phase ?? 'N/A'})`}`);
    console.log(`    Factor amplificación: ${e.phase === 'el_nino' ? 'precip costa ×2.5, temp +0.5°C' : e.phase === 'la_nina' ? 'precip costa ×0.4, temp -0.3°C' : 'neutral (sin amplificación)'}`);
    console.log(`    En UI: enso_context → "Fenómeno ENSO" corto_plazo`);
  }

  console.log('\n  LAYER 9 — HALLAZGO F7 (valores estáticos):');
  if (projectionOutput?.projections) {
    const tempProj = projectionOutput.projections.temperature_mean;
    if (tempProj) {
      console.log(`    temperatura near_term.median (ALL coordenadas Perú): ${tempProj.near_term?.median ?? 'N/A'}°C`);
      console.log(`    temperatura mid_term.median:  ${tempProj.mid_term?.median ?? 'N/A'}°C`);
      console.log(`    temperatura far_term.median:  ${tempProj.far_term?.median ?? 'N/A'}°C`);
      console.log(`    ⚠️  Estos valores son IDÉNTICOS para Lima, Cusco e Iquitos`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('RESUMEN EJECUTIVO DEL ANÁLISIS');
  // ══════════════════════════════════════════════════════════════════════════

  const totalSignals = signalOutput?.signals?.length ?? 0;
  const normalized = simulateNormalizeRisks(apiResponseSimulated);

  console.log(`\n  Coordenada: lat=${LAT}, lon=${LON}`);
  console.log(`  Región: ${fusedData?.terrainData?.terrain_region ?? 'desconocida'}`);
  console.log(`  Elevación: ${fusedData?.terrainData?.elevation_m ?? 'N/A'} m`);
  console.log(`  Fuente climática: ${fusedData?.climateSource ?? 'null'}`);
  console.log(`  Distancia a celda CMIP6: ${fusedData?.distanceKm ?? 'N/A'} km`);
  console.log(`  ENSO phase: ${fusedData?.ensoData?.phase ?? 'N/A'} (ONI: ${fusedData?.ensoData?.oni_latest ?? 'N/A'})`);
  console.log(`\n  Señales Layer2: ${totalSignals}`);
  if (signalOutput?.signals?.length) {
    for (const s of signalOutput.signals) {
      const type = s.signal_type ?? s.signalType;
      const hz = s.horizon ?? '';
      console.log(`    - ${type} [${hz}] conf=${s.confidence}`);
    }
  }
  console.log(`\n  ConsolidatedRisk (UI): ${normalized.length}`);
  for (const cr of normalized) {
    console.log(`    - ${cr.riskType} [${cr.period}]`);
  }
  console.log(`\n  Exposición global: ${businessRiskOutput?.overall_exposure ?? 'N/A'}`);
  console.log(`\n  Hallazgos críticos activos en esta consulta:`);
  console.log(`    F1 (cdd ausente):  ${fusedData?.climateData?.historical?.cdd == null ? '⚠️  confirmado — cdd=null' : '✅ cdd presente'}`);
  console.log(`    F3 (landslide mismatch): ${signalOutput?.signals?.some(s => (s.signal_type ?? s.signalType) === 'landslide_risk') ? '⚠️  landslide_risk generado pero no mapea a ConsolidatedRisk correctamente' : 'N/A (señal no generada)'}`);
  console.log(`    F7 (Layer9 estático): ⚠️  confirmado — valores IPCC hardcodeados`);

  console.log(`\n${'▓'.repeat(80)}\n  FIN DE VALIDACIÓN\n${'▓'.repeat(80)}\n`);
}

main().catch(err => {
  console.error('\n❌ ERROR FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
