import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import * as openMeteoCache from '../services/openMeteoCache.js';
import { getClimateData } from '../services/climateService.js';
import {
  getClimateByLocation,
  interpretClimateRisks,
} from '../services/climateGeospatialService.js';
import {
  parseClimateFile,
  upsertClimateData,
  uploadClimateFile,
} from '../services/climateImportService.js';
import { getGriRiskByLocation } from '../services/griRiskService.js';
import { getTerritorialContext } from '../services/worldBankService.js';
import { supabase } from '../supabaseClient.js';
import { climateCache, CACHE_TTL } from '../shared/cache.js';

// ── Fase 2: Backend Layers ────────────────────────────────────────────────────
import { fusionClimateData }    from '../layers/Layer1_ClimateDataFusion.js';
import { detectSignals }        from '../layers/Layer2_SignalEngine.js';
import { assessBusinessRisk }   from '../layers/Layer3_BusinessRiskEngine.js';
import { getAdaptations }       from '../layers/Layer5_AdaptationEngine.js';
import { generateNarrative }    from '../layers/Layer6_NarrativeEngine.js';
import { buildProjectionContext } from '../scientific/projection.js';

const router = express.Router();

// ── Helpers para climate_cells lookup ────────────────────────────────────────

// Unidades por variable (CMIP6 / CCKP)
const CLIMATE_VAR_UNITS = {
  txx:      '°C',
  hd35:     'días/año',
  hd30:     'días/año',
  tasmax:   '°C',
  tr:       'días/año',
  tas:      '°C',
  tx84rr:   'índice',
  rx1day:   'mm',
  rx5day:   'mm',
  r20mm:    'días/año',
  r50mm:    'días/año',
  pr:       'mm',
  prpercnt: '%',
};

// Clasificar nivel de exposición por variable y valor mediano
function classifyRiskLevel(varName, value) {
  if (value == null || isNaN(value)) return 'bajo';
  switch (varName) {
    case 'txx':     return value > 38  ? 'alto' : value > 32   ? 'medio' : 'bajo';
    case 'hd35':    return value > 60  ? 'alto' : value > 20   ? 'medio' : 'bajo';
    case 'hd30':    return value > 150 ? 'alto' : value > 60   ? 'medio' : 'bajo';
    case 'tasmax':  return value > 32  ? 'alto' : value > 27   ? 'medio' : 'bajo';
    case 'tr':      return value > 180 ? 'alto' : value > 90   ? 'medio' : 'bajo';
    case 'tas':     return value > 27  ? 'alto' : value > 22   ? 'medio' : 'bajo';
    case 'tx84rr':  return value > 0.05? 'alto' : value > 0.02 ? 'medio' : 'bajo';
    case 'rx1day':  return value > 50  ? 'alto' : value > 20   ? 'medio' : 'bajo';
    case 'rx5day':  return value > 150 ? 'alto' : value > 60   ? 'medio' : 'bajo';
    case 'r20mm':   return value > 20  ? 'alto' : value > 5    ? 'medio' : 'bajo';
    case 'r50mm':   return value > 10  ? 'alto' : value > 3    ? 'medio' : 'bajo';
    case 'pr':      return value > 400 ? 'alto' : value > 200  ? 'medio' : 'bajo';
    case 'prpercnt': {
      const d = Math.abs(value - 100);
      return d > 15 ? 'alto' : d > 5 ? 'medio' : 'bajo';
    }
    default: return 'bajo';
  }
}

// Convertir un período del JSONB a array de registros listos para el frontend
function extractClimatePeriod(periodData) {
  if (!periodData || typeof periodData !== 'object') return [];
  return Object.entries(periodData)
    .filter(([k]) => CLIMATE_VAR_UNITS[k])
    .map(([varName, stats]) => ({
      risk_type: varName,
      value:     stats?.median ?? null,
      p10:       stats?.p10   ?? null,
      p90:       stats?.p90   ?? null,
      unit:      CLIMATE_VAR_UNITS[varName],
      level:     classifyRiskLevel(varName, stats?.median ?? null),
      source:    'climate_cells',
    }));
}

// 🌤️ Endpoint para obtener datos climáticos en tiempo real
router.get('/climate', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Parámetros lat y lng son requeridos' });
    }

    const key = `${lat},${lng}`;
    const now = Date.now();

    if (climateCache[key] && (now - climateCache[key].timestamp < CACHE_TTL)) {
      return res.json(climateCache[key].data);
    }

    const climateData = await getClimateData(lat, lng);

    if (!climateData) {
      return res.json({
        warning: 'No hay datos climáticos disponibles',
        temperature: null,
        humidity: null,
        wind_kph: null,
        precipitation: null,
        condition: 'Datos no disponibles',
      });
    }

    climateCache[key] = {
      data: climateData,
      timestamp: now,
    };

    return res.json(climateData);
  } catch (error) {
    console.error('🔥 Error en /api/climate:', error.message);
    return res.json({
      warning: 'No hay datos climáticos disponibles',
      temperature: null,
      humidity: null,
      wind_kph: null,
      precipitation: null,
      condition: 'Datos no disponibles',
    });
  }
});

/**
 * GET /api/climate-cells/query
 * Consulta datos climáticos de la tabla climate_cells por ubicación (PostGIS)
 * Parámetros: lat, lon
 * Retorna: datos completos con todos los horizontes temporales
 */
router.get('/climate-cells/query', async (req, res) => {
  try {
    const { lat, lng, lon } = req.query;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng || lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: 'Parámetros lat y lon (o lng) son requeridos y deben ser números',
      });
    }

    const cacheKey = `climate-cells-${latitude}-${longitude}`;
    const now = Date.now();

    // Verificar cache
    if (climateCache[cacheKey] && now - climateCache[cacheKey].timestamp < CACHE_TTL) {
      return res.json({
        ...climateCache[cacheKey].data,
        cached: true,
        cacheAge: Math.floor((now - climateCache[cacheKey].timestamp) / 1000) + 's',
      });
    }

    // Consultar datos climáticos geoespaciales
    const climateData = await getClimateByLocation(latitude, longitude);

    if (!climateData) {
      return res.status(404).json({
        error: 'No hay datos climáticos disponibles para esta ubicación',
        location: { lat: latitude, lon: longitude },
      });
    }

    // Generar interpretaciones automáticas
    const risks = interpretClimateRisks(climateData);

    const response = {
      location: climateData.location,
      climate: climateData.climate,
      risks_interpretation: risks,
      source: 'climate_cells',
      generated_at: new Date().toISOString(),
    };

    // Guardar en cache
    climateCache[cacheKey] = {
      data: response,
      timestamp: now,
    };

    return res.json(response);
  } catch (error) {
    console.error('❌ Error en /api/climate-cells/query:', error.message);
    return res.status(500).json({
      error: error.message,
      hint: 'Intenta con coordenadas válidas dentro de Perú',
    });
  }
});

/**
 * POST /api/climate-cells/upload
 * Cargar datos climáticos desde archivo JSON o JSONL
 * Body: {
 *   data: string (JSON array o JSONL con registros),
 *   format?: 'auto' (default) | 'json' | 'jsonl'
 * }
 *
 * Retorna: 3-phase pipeline results con estadísticas detalladas
 */
router.post('/climate-cells/upload', requireAuth, strictLimiter, async (req, res) => {
  try {
    const { data, format = 'auto' } = req.body;

    if (!data) {
      return res.status(400).json({
        error: 'Campo "data" es requerido',
        hint: 'Envía contenido JSON o JSONL como string',
      });
    }

    if (typeof data !== 'string') {
      return res.status(400).json({
        error: 'El campo "data" debe ser un string con contenido JSON o JSONL',
        hint: 'Convierte el archivo a string antes de enviar',
      });
    }

    console.log(`📦 Cargando datos climáticos (formato: ${format})...`);

    // Usar la nueva función unificada que hace todo: Parse → Process → Upsert
    const result = await uploadClimateFile(data, format);

    const isSuccessful =
      result.parseResult.errors.length === 0 &&
      result.processResult.validRecords.length > 0 &&
      result.upsertResult.failed === 0;

    return res.json({
      success: isSuccessful,
      phases: {
        parse: {
          detected_format: result.parseResult.detectedFormat,
          total_records_parsed: result.parseResult.records.length,
          parse_errors: result.parseResult.errors.length,
          errors: result.parseResult.errors.slice(0, 50),
        },
        process: {
          valid_records: result.processResult.validRecords.length,
          normalized_records: result.processResult.validRecords.length,
          invalid_records: result.processResult.invalidRecords.length,
          validation_errors: result.processResult.validationErrors.slice(0, 50),
        },
        upsert: {
          total_processed: result.upsertResult.total,
          batches_processed: result.upsertResult.batches,
          duration_ms: result.upsertResult.duration_ms,
          records_per_second: Math.round(result.upsertResult.records_per_second),
          upsert_errors: result.upsertResult.errors.slice(0, 50),
        },
      },
      summary: {
        total_input_records: result.parseResult.records.length,
        successfully_processed: result.processResult.validRecords.length,
        skipped_invalid: result.processResult.invalidRecords.length,
        database_errors: result.upsertResult.errors.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error en /api/climate-cells/upload:', error.message);
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// LEGACY — Writes to old `climate_data` table (flat weather records), not `climate_cells`.
// The canonical data ingestion path is POST /api/climate-cells/upload (climateImportService).
// This endpoint is retained for backward compatibility only. Do NOT use for new ingestion.
router.post('/climate/bulk', requireAuth, strictLimiter, async (req, res) => {
  try {
    const { climateData } = req.body;

    if (!Array.isArray(climateData)) {
      return res.status(400).json({ error: 'Se esperaba un array de datos climáticos' });
    }

    const results = {
      total: climateData.length,
      inserted: 0,
      duplicates: 0,
      errors: [],
    };

    // Procesar en lotes
    const batchSize = 50;
    for (let i = 0; i < climateData.length; i += batchSize) {
      const batch = climateData.slice(i, i + batchSize);
      const validBatch = [];

      for (const data of batch) {
        try {
          const { lat, lng, temperature, humidity, wind_kph, precipitation, source, recorded_at } = data;

          if (lat === undefined || lng === undefined || !recorded_at) {
            results.errors.push({ index: i + validBatch.length, error: 'Campos obligatorios faltantes' });
            continue;
          }

          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            results.errors.push({ index: i + validBatch.length, error: 'Coordenadas inválidas' });
            continue;
          }

          // Verificar duplicado por lat+lng+recorded_at
          const { data: existing } = await supabase
            .from('climate_data')
            .select('id')
            .eq('lat', lat)
            .eq('lng', lng)
            .eq('recorded_at', recorded_at);

          if (existing && existing.length > 0) {
            results.duplicates++;
            continue;
          }

          validBatch.push({
            lat,
            lng,
            temperature,
            humidity,
            wind_kph,
            precipitation,
            source,
            recorded_at,
            created_at: new Date().toISOString(),
          });
        } catch (error) {
          results.errors.push({ index: i + validBatch.length, error: error.message });
        }
      }

      // Insertar batch válido
      if (validBatch.length > 0) {
        const { error } = await supabase
          .from('climate_data')
          .insert(validBatch);

        if (error) {
          console.error('Error inserting climate batch:', error);
          results.errors.push({ batch: i / batchSize, error: 'Error al insertar lote climático' });
        } else {
          results.inserted += validBatch.length;
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error in POST /api/climate/bulk:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🔍 Consulta de riesgos climáticos por coordenadas (climate_cells · PostGIS)
router.get('/climate-risks/lookup', async (req, res) => {
  try {
    const { lat, lng, scenario = 'pesimista' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat y lng son requeridos' });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || latNum < -90  || latNum > 90)
      return res.status(400).json({ error: 'lat inválido (rango: -90 a 90)' });
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180)
      return res.status(400).json({ error: 'lng inválido (rango: -180 a 180)' });

    // Celda más cercana vía función PostGIS definida en Supabase
    const { data, error } = await supabase
      .rpc('get_climate_by_location', { p_lat: latNum, p_lon: lngNum });

    if (error) {
      console.error('Error en lookup:', error.message);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.json({
        found: false,
        message: 'No hay datos climáticos para esta zona. Carga primero un dataset en Datos Climáticos (ETL).',
      });
    }

    const cell    = data[0];
    const cellData = cell.data;

    // Distancia Haversine (km)
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(cell.lat - latNum);
    const dLon = toRad(cell.lon - lngNum);
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(latNum)) * Math.cos(toRad(cell.lat)) * Math.sin(dLon / 2) ** 2;
    const distKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

    // Mapa de claves JSONB según escenario seleccionado
    const PERIOD_MAPS = {
      actual: {
        historico: 'historical',
      },
      moderado: {
        historico: 'historical',
        corto:     'ensemble-all-ssp245_2020-2039',
        mediano:   'ensemble-all-ssp245_2040-2059',
      },
      pesimista: {
        historico: 'historical',
        corto:     'ensemble-all-ssp585_2020-2039',
        mediano:   'ensemble-all-ssp585_2040-2059',
      },
    };

    const periodMap = PERIOD_MAPS[scenario] || PERIOD_MAPS.pesimista;
    const byHorizon = {};
    const baseline  = {};

    for (const [horizon, periodKey] of Object.entries(periodMap)) {
      if (cellData[periodKey]) {
        byHorizon[horizon] = extractClimatePeriod(cellData[periodKey]);
      }
    }

    // Línea base histórica para calcular deltas en el frontend
    for (const r of (byHorizon.historico || [])) {
      baseline[r.risk_type] = { level: r.level, value: r.value, unit: r.unit };
    }

    const SCENARIO_META = {
      actual:    { label: 'Situación Actual',    sublabel: 'Histórico 1995–2014 · línea base', color: 'slate' },
      moderado:  { label: 'Escenario Moderado',  sublabel: 'SSP2-4.5 · Emisiones moderadas',   color: 'amber' },
      pesimista: { label: 'Escenario Pesimista', sublabel: 'SSP5-8.5 · Altas emisiones',        color: 'red'   },
    };

    return res.json({
      found:        true,
      queried:      { lat: latNum, lng: lngNum },
      nearestPoint: { lat: cell.lat, lng: cell.lon, distanceKm: distKm },
      scenario,
      scenarioMeta: SCENARIO_META[scenario] || SCENARIO_META.pesimista,
      horizons:     Object.keys(byHorizon),
      byHorizon,
      baseline,
      totalRecords: Object.values(byHorizon).flat().length,
    });
  } catch (error) {
    console.error('Error en /api/climate-risks/lookup:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Consulta complementaria en vivo: GRI / Infrastructure Resilience.
// No reemplaza climate_cells ni modifica el score principal de la plataforma.
router.get('/external-risks/lookup', async (req, res) => {
  try {
    const { lat, lng, lon } = req.query;
    const longitude = lng ?? lon;

    if (!lat || !longitude) {
      return res.status(400).json({ error: 'lat y lng/lon son requeridos' });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(longitude);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({ error: 'lat invalido (rango: -90 a 90)' });
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: 'lng/lon invalido (rango: -180 a 180)' });
    }

    const cacheKey = `external-risks-${latNum.toFixed(5)}-${lngNum.toFixed(5)}`;
    const now = Date.now();

    if (climateCache[cacheKey] && now - climateCache[cacheKey].timestamp < CACHE_TTL) {
      return res.json({
        ...climateCache[cacheKey].data,
        cached: true,
        cacheAge: Math.floor((now - climateCache[cacheKey].timestamp) / 1000) + 's',
      });
    }

    const externalRisks = await getGriRiskByLocation(latNum, lngNum);

    climateCache[cacheKey] = {
      data: externalRisks,
      timestamp: now,
    };

    return res.json(externalRisks);
  } catch (error) {
    console.error('Error en /api/external-risks/lookup:', error.message);
    return res.status(500).json({
      error: 'Error consultando riesgos externos',
      message: error.message,
    });
  }
});

// LEGACY — Writes to old `climate_risks_grid` table and `climate_dataset_control`.
// These tables are superseded by `climate_cells` (CMIP6 JSONB schema + PostGIS).
// The canonical upload path is POST /api/climate-cells/upload (climateImportService).
// This endpoint is retained for backward compatibility only. Do NOT use for new ingestion.
router.post('/climate-risks/upload', requireAuth, strictLimiter, async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'El campo "data" es requerido y debe ser un array' });
    }

    if (data.length === 0) {
      return res.status(400).json({ error: 'El array "data" no puede estar vacío' });
    }

    const datasetVersion = `v_${Date.now()}`;
    const BATCH_SIZE = 500;

    let inserted = 0;
    let errors = 0;
    const validRecords = [];

    // Transformar y validar registros
    for (const item of data) {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lng);
      const value = parseFloat(item.value);

      if (isNaN(lat) || lat < -90 || lat > 90) { errors++; continue; }
      if (isNaN(lng) || lng < -180 || lng > 180) { errors++; continue; }
      if (!item.risk_type || !item.horizon || !item.level) { errors++; continue; }

      validRecords.push({
        lat,
        lng,
        risk_type: String(item.risk_type),
        horizon: String(item.horizon),
        level: String(item.level),
        value: isNaN(value) ? null : value,
        source: item.source || 'world_bank',
        dataset_version: datasetVersion,
        created_at: new Date().toISOString(),
      });
    }

    // Insertar en bloques de 500
    for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
      const batch = validRecords.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from('climate_risks_grid')
        .insert(batch);

      if (insertError) {
        console.error(`Error en batch ${Math.floor(i / BATCH_SIZE) + 1}:`, insertError.message);
        return res.status(500).json({
          error: `Error al insertar lote ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`,
          total: data.length,
          inserted,
          errors,
          datasetVersion,
        });
      }
      inserted += batch.length;
    }

    // Control de versiones: desactivar anteriores e insertar nueva versión activa
    await supabase
      .from('climate_dataset_control')
      .update({ is_active: false })
      .neq('version', datasetVersion);

    await supabase
      .from('climate_dataset_control')
      .insert({ version: datasetVersion, is_active: true });

    return res.json({
      total: data.length,
      inserted,
      errors,
      datasetVersion,
    });

  } catch (error) {
    console.error('Error en /api/climate-risks/upload:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/territorial-context
// Contexto socioeconómico de Perú (Banco Mundial) — cacheable 24h
router.get('/territorial-context', async (req, res) => {
  const cacheKey = 'territorial-context-PE';
  const now = Date.now();
  const TTL_24H = 1000 * 60 * 60 * 24;

  if (climateCache[cacheKey] && now - climateCache[cacheKey].timestamp < TTL_24H) {
    return res.json(climateCache[cacheKey].data);
  }

  try {
    const data = await getTerritorialContext();
    climateCache[cacheKey] = { data, timestamp: now };
    return res.json(data);
  } catch (err) {
    console.error('Error en /api/territorial-context:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================
// FASE 2 — POST /api/v2/climate-risk-analysis
// Ejecuta las 6 capas en secuencia y retorna
// análisis completo de riesgo climático.
// ============================================
router.post('/v2/climate-risk-analysis', requireAuth, async (req, res) => {
  const { lat, lon, sector: sectorRaw, asset_type, scenario } = req.body;
  const sector = sectorRaw || 'retail';

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat y lon son requeridos' });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: 'lat y lon deben ser números válidos' });
  }

  const partialResult = {};
  const errors = {};

  try {
    // ── Capa 1: Fusión de datos climáticos ──────────────────────────────────
    let fusedData;
    try {
      fusedData = await fusionClimateData({ lat: latNum, lon: lonNum, scenario });
      partialResult.layer1 = 'ok';
    } catch (err) {
      console.error('[v2] Layer1 falló:', err.message);
      errors.layer1 = err.message;
      return res.status(500).json({ error: 'Error en fusión de datos climáticos', details: err.message, partial: partialResult });
    }

    // ── Capa 2: Detección de señales ────────────────────────────────────────
    let signalOutput;
    try {
      signalOutput = detectSignals(fusedData);
      partialResult.layer2 = 'ok';
    } catch (err) {
      console.error('[v2] Layer2 falló:', err.message);
      errors.layer2 = err.message;
      signalOutput = { signals: [], signals_count: 0, dominant_signal: null };
    }

    // ── Capa 3: Evaluación de riesgo de negocio ─────────────────────────────
    let businessRiskOutput;
    try {
      businessRiskOutput = assessBusinessRisk(signalOutput, { sector, asset_type });
      partialResult.layer3 = 'ok';
    } catch (err) {
      console.error('[v2] Layer3 falló:', err.message);
      errors.layer3 = err.message;
      businessRiskOutput = { risks: [], overall_exposure: 'bajo', sector_key: 'otros' };
    }

    // ── Interpretacion contextual: riesgos descriptivos sin ranking ni scores ──
    const contextualRisks = {
      risks: businessRiskOutput.risks.map(risk => {
        const trace = risk.source_traceability ?? risk.signal?.source_traceability ?? {};
        return {
          ...risk,
          confidence: risk.signal?.confidence ?? trace.confidence_level ?? 'low',
          evidence: {
            signal_type: risk.signal?.signalType ?? null,
            indicator: risk.signal?.indicator ?? null,
            historical: risk.signal?.historical ?? null,
            projected: risk.signal?.projected ?? null,
            delta: risk.signal?.delta ?? null,
            delta_pct: risk.signal?.delta_pct ?? null,
            threshold: trace.threshold_applied ?? null,
            transformation: trace.transformation_applied ?? null,
          },
          scenario: trace.scenario_ssp ?? (fusedData.scenario ? String(fusedData.scenario).toUpperCase() : null),
          provenance: {
            source_origin: trace.source_origin ?? null,
            responsible_endpoint: trace.responsible_endpoint ?? null,
            climate_model_badge: trace.climate_model_badge ?? null,
            provenance_badges: trace.provenance_badges ?? [],
          },
          uncertainty: {
            confidence_level: trace.confidence_level ?? risk.signal?.confidence ?? 'low',
            note: 'Interpretacion descriptiva basada en senales detectadas; no expresa prioridad, ranking ni probabilidad de perdida.',
          },
        };
      }),
      overall_exposure: businessRiskOutput.overall_exposure,
      sector_key: businessRiskOutput.sector_key,
    };
    partialResult.contextual_interpretation = 'ok';

    // ── Capa 5: Adaptaciones ────────────────────────────────────────────────
    let adaptationOutput;
    try {
      adaptationOutput = getAdaptations(contextualRisks, sector);
      partialResult.layer5 = 'ok';
    } catch (err) {
      console.error('[v2] Layer5 falló:', err.message);
      errors.layer5 = err.message;
      adaptationOutput = { adaptations: [] };
    }

    // ── Capa 6: Narrativa ───────────────────────────────────────────────────
    let narrativeOutput;
    try {
      narrativeOutput = generateNarrative({
        fusedData,
        signalOutput,
        businessRiskOutput,
        contextualRisks,
        adaptationOutput,
        sector,
        lat: latNum,
        lon: lonNum,
      });
      partialResult.layer6 = 'ok';
    } catch (err) {
      console.error('[v2] Layer6 falló:', err.message);
      errors.layer6 = err.message;
      narrativeOutput = { executive_summary: 'No disponible', key_metrics: {}, generated_from: {} };
    }

    // ── Capa 9: Escenarios de proyección ────────────────────────────────────
    let projectionOutput;
    try {
      projectionOutput = buildProjectionContext(signalOutput);
      partialResult.layer9 = 'ok';
    } catch (err) {
      console.error('[v2] Layer9 falló:', err.message);
      projectionOutput = null;
    }

    // ── Respuesta final ─────────────────────────────────────────────────────
    return res.json({
      location: {
        lat:        latNum,
        lon:        lonNum,
        distanceKm: fusedData.distanceKm,
      },
      signals:     signalOutput,
      risks:       contextualRisks.risks,
      adaptations: adaptationOutput,
      projections: projectionOutput,
      narrative:   {
        executive_summary: narrativeOutput.executive_summary,
        key_metrics:       narrativeOutput.key_metrics,
      },
      confidence:        narrativeOutput.confidence,
      evidence:          narrativeOutput.evidence,
      scenario:          fusedData.scenario,
      provenance:        narrativeOutput.generated_from,
      uncertainty:       narrativeOutput.uncertainty,
      gri_hazards:       fusedData.griData?.hazards ?? [],
      territorial:       fusedData.territorialData ?? null,
      metadata: {
        sector,
        scenario:     fusedData.scenario,
        confidence:   narrativeOutput.confidence,
        uncertainty:  narrativeOutput.uncertainty,
        generated_at: fusedData.generated_at,
        distance_km:  fusedData.distanceKm,
        data_sources: Object.entries(narrativeOutput.generated_from)
          .filter(([k, v]) => v === true)
          .map(([k]) => k),
        layers_status: partialResult,
        ...(Object.keys(errors).length > 0 ? { layer_errors: errors } : {}),
      },
    });
  } catch (err) {
    console.error('[v2] Error inesperado:', err.message);
    return res.status(500).json({
      error:   'Error interno en el análisis de riesgo climático',
      details: err.message,
      partial: partialResult,
    });
  }
});

// ── Open-Meteo cache management ──────────────────────────────────────────────

/**
 * GET /api/v2/open-meteo-cache/stats
 * Returns in-memory cache metrics for observability and validation.
 */
router.get('/v2/open-meteo-cache/stats', (_req, res) => {
  res.json(openMeteoCache.stats());
});

/**
 * DELETE /api/v2/open-meteo-cache
 * Flushes all cached Open-Meteo responses (use for forced refresh or testing).
 * Optional query: ?lat=X&lon=Y to invalidate a single coordinate.
 */
router.delete('/v2/open-meteo-cache', requireAuth, strictLimiter, (req, res) => {
  const { lat, lon } = req.query;
  if (lat != null && lon != null) {
    openMeteoCache.invalidate(parseFloat(lat), parseFloat(lon));
    return res.json({ invalidated: true, lat: parseFloat(lat), lon: parseFloat(lon) });
  }
  openMeteoCache.clear();
  return res.json({ cleared: true });
});

export default router;
