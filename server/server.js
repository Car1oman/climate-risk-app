import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { getClimateData } from './services/climateService.js';
import {
  getClimateByLocation,
  interpretClimateRisks,
} from './services/climateGeospatialService.js';
import {
  parseClimateFile,
  upsertClimateData,
  uploadClimateFile,
} from './services/climateImportService.js';
import {
  uploadDocumento,
  getDocumentos,
  deleteDocumento,
  CATEGORIAS,
} from './services/documentosService.js';
import { getGriRiskByLocation } from './services/griRiskService.js';
import { getTerritorialContext } from './services/worldBankService.js';
import { getDocumentosEnrichment } from './services/documentosEnrichmentService.js';
import { getCompleteRiskModel } from './services/riskModelService.js';
import { supabase } from "./supabaseClient.js";

// ── Fase 2: Backend Layers ────────────────────────────────────────────────────
import { fusionClimateData }  from './layers/Layer1_ClimateDataFusion.js';
import { detectSignals }      from './layers/Layer2_SignalEngine.js';
import { assessBusinessRisk } from './layers/Layer3_BusinessRiskEngine.js';
import { prioritizeRisks }    from './layers/Layer4_PrioritizationEngine.js';
import { getAdaptations }     from './layers/Layer5_AdaptationEngine.js';
import { generateNarrative }  from './layers/Layer6_NarrativeEngine.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir archivos estáticos (build de Vite)
app.use(express.static('dist'));

//Acceso a la base de datos Supabase
app.get("/api/assets", async (req, res) => {
  const { data, error } = await supabase
    .from("asset_risk_summary")
    .select("*");

  if (error) return res.status(500).json(error);

  res.json(data);
});

//Endpoint detallado de un activo
app.get("/api/assets/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("asset_risk_summary")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return res.status(500).json(error);

  res.json(data);
});

// Inicializar Gemini solo si hay API key
let ai = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
}

// 🧠 Caché en memoria para API climática
const climateCache = {};
const CACHE_TTL = 1000 * 60 * 10; // 10 minutos

// Ruta de prueba
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend funcionando 🚀' });
});

// 🔥 Ruta IA REAL
app.post('/api/ai', async (req, res) => {
  try {
    const { prompt } = req.body;

    // Si no hay API key, devolver respuesta mock
    if (!process.env.GEMINI_API_KEY) {
      console.log('Usando respuesta mock (sin API key)');
      const mockResponse = `# Reporte TCFD/ESRS - Intercorp Retail (SPSA)

## 1. Gobernanza
La gestión de riesgos climáticos está integrada en la estructura de gobernanza de Intercorp Retail, con supervisión directa del comité ejecutivo y participación activa del departamento de sostenibilidad.

## 2. Estrategia
### Riesgos Físicos
- **Inundaciones fluviales**: Afectan principalmente activos en zonas bajas de Lima Metropolitana
- **Fenómeno El Niño**: Riesgo cíclico con impacto significativo en operaciones costeras
- **Sismos**: Amenaza constante en zona sísmica activa
- **Deslizamientos**: Riesgo en áreas con pendiente pronunciada

### Riesgos de Transición
- Cambios regulatorios en reporting climático
- Transición hacia energías renovables
- Adaptación de cadena de suministro

## 3. Gestión de Riesgos
- Monitoreo continuo de 15 activos principales
- Sistema de alertas tempranas implementado
- Planes de contingencia para escenarios críticos
- Inversión en infraestructura resiliente

## 4. Métricas y Objetivos
- **Cobertura**: 100% de activos monitoreados
- **Objetivo 2025**: Reducir exposición a riesgos críticos en 30%
- **Inversión**: S/ 50M en medidas de adaptación climática
- **Reporting**: Cumplimiento TCFD/ESRS completo

## Recomendaciones
1. Implementar sistemas de drenaje mejorados en activos vulnerables
2. Desarrollar programa de seguros paramétricos
3. Invertir en energías renovables para reducción de emisiones
4. Fortalecer cadena de suministro resiliente al clima`;
      return res.json(mockResponse);
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    res.json({
      response: response.text,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error al procesar la IA',
    });
  }
});

// 🌤️ Endpoint para obtener datos climáticos (comentado - usar versión con WeatherAPI abajo)

// 🌤️ Endpoint para obtener datos climáticos en tiempo real
app.get('/api/climate', async (req, res) => {
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

// ============================================
// 🆕 NUEVOS ENDPOINTS - CLIMATE CELLS (PostGIS)
// ============================================

/**
 * GET /api/climate-cells/query
 * Consulta datos climáticos de la tabla climate_cells por ubicación (PostGIS)
 * Parámetros: lat, lon
 * Retorna: datos completos con todos los horizontes temporales
 */
app.get('/api/climate-cells/query', async (req, res) => {
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
app.post('/api/climate-cells/upload', async (req, res) => {
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

// ============================================
// FIN NUEVOS ENDPOINTS
// ============================================

// -----------------------------------------------
// POST /api/risk-model
// Calcula modelo de riesgo H×E×I en el backend.
// Body: { asset: {...}, maxArea?: number, elNinoMultiplier?: number }
// -----------------------------------------------
app.post('/api/risk-model', (req, res) => {
  try {
    const { asset, maxArea, elNinoMultiplier } = req.body;
    if (!asset || typeof asset !== 'object') {
      return res.status(400).json({ error: 'Se requiere el objeto "asset" en el body.' });
    }
    const result = getCompleteRiskModel(asset, {
      maxArea:         maxArea         ?? 5000,
      elNinoMultiplier: elNinoMultiplier ?? 1.0,
    });
    return res.json(result);
  } catch (err) {
    console.error('Error en /api/risk-model:', err.message);
    return res.status(500).json({ error: 'Error al calcular el modelo de riesgo.' });
  }
});

// 📝 CRUD para Activos

// Verificar duplicados
app.post('/api/assets/check-duplicate', async (req, res) => {
  try {
    const { name, lat, lng, excludeId } = req.body;

    let query = supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking duplicate:', error);
      return res.status(500).json({ error: 'Error al verificar duplicados' });
    }

    res.json({ exists: data && data.length > 0 });
  } catch (error) {
    console.error('Error in check-duplicate:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear activo
app.post('/api/assets', async (req, res) => {
  try {
    const {
      name,
      type,
      district,
      lat,
      lng,
      monthly_sales,
      area_m2,
      num_employees,
      condition
    } = req.body;

    // Validaciones básicas
    if (!name || !type || !district || lat === undefined || lng === undefined || monthly_sales === undefined || !condition) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }

    if (monthly_sales < 0) {
      return res.status(400).json({ error: 'Ventas mensuales deben ser >= 0' });
    }

    // Verificar duplicado
    const { data: existing } = await supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Activo duplicado' });
    }

    // 1. Insertar activo base
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({
        name: name.trim(),
        type,
        district: district.trim(),
        lat,
        lng,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (assetError) {
      console.error('Error creating asset:', assetError);
      return res.status(500).json({ error: 'Error al crear el activo' });
    }

    // 2. Insertar métricas
    const { error: metricsError } = await supabase
      .from('asset_metrics')
      .insert({
        asset_id: asset.id,
        monthly_sales,
        area_m2,
        num_employees,
        condition,
        updated_at: new Date().toISOString(),
      });

    if (metricsError) {
      console.error('Error creating metrics:', metricsError);
    }

    res.status(201).json(asset);
  } catch (error) {
    console.error('Error in POST /api/assets:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar activo
app.put('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      district,
      lat,
      lng,
      monthly_sales,
      area_m2,
      num_employees,
      condition
    } = req.body;

    // Validaciones básicas
    if (!name || !type || !district || lat === undefined || lng === undefined || monthly_sales === undefined || !condition) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }

    if (monthly_sales < 0) {
      return res.status(400).json({ error: 'Ventas mensuales deben ser >= 0' });
    }

    // Verificar duplicado (excluyendo el actual)
    const { data: existing } = await supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng)
      .neq('id', id);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Activo duplicado' });
    }

    // Actualizar
    const { data, error } = await supabase
      .from('assets')
      .update({
        name: name.trim(),
        type,
        district: district.trim(),
        lat,
        lng,
        monthly_sales,
        area_m2,
        num_employees,
        condition,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating asset:', error);
      return res.status(500).json({ error: 'Error al actualizar el activo' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in PUT /api/assets/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar activo
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting asset:', error);
      return res.status(500).json({ error: 'Error al eliminar el activo' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error in DELETE /api/assets/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Carga masiva de activos
app.post('/api/assets/bulk', async (req, res) => {
  try {
    const { assets } = req.body;

    if (!Array.isArray(assets)) {
      return res.status(400).json({ error: 'Se esperaba un array de activos' });
    }

    const results = {
      total: assets.length,
      inserted: 0,
      duplicates: 0,
      errors: [],
    };

    // Procesar en lotes para mejor performance
    const batchSize = 10;
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const validBatch = [];

      for (const asset of batch) {
        try {
          // Validar campos
          const {
            name,
            type,
            district,
            lat,
            lng,
            monthly_sales,
            area_m2,
            num_employees,
            condition
          } = asset;

          if (!name || !type || !district || lat === undefined || lng === undefined || monthly_sales === undefined || !condition) {
            results.errors.push({ index: i + validBatch.length, error: 'Campos obligatorios faltantes' });
            continue;
          }

          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            results.errors.push({ index: i + validBatch.length, error: 'Coordenadas inválidas' });
            continue;
          }

          if (monthly_sales < 0) {
            results.errors.push({ index: i + validBatch.length, error: 'Ventas mensuales deben ser >= 0' });
            continue;
          }

          // Verificar duplicado
          const { data: existing } = await supabase
            .from('asset_risk_summary')
            .select('id')
            .eq('name', name.trim())
            .eq('lat', lat)
            .eq('lng', lng);

          if (existing && existing.length > 0) {
            results.duplicates++;
            continue;
          }

          validBatch.push({
            name: name.trim(),
            type,
            district: district.trim(),
            lat,
            lng,
            monthly_sales,
            area_m2,
            num_employees,
            condition,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (error) {
          results.errors.push({ index: i + validBatch.length, error: error.message });
        }
      }

      // Insertar batch válido
      if (validBatch.length > 0) {
        const { error } = await supabase
          .from('assets')
          .insert(validBatch);

        if (error) {
          console.error('Error inserting batch:', error);
          results.errors.push({ batch: i / batchSize, error: 'Error al insertar lote' });
        } else {
          results.inserted += validBatch.length;
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error in POST /api/assets/bulk:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// LEGACY — Writes to old `climate_data` table (flat weather records), not `climate_cells`.
// The canonical data ingestion path is POST /api/climate-cells/upload (climateImportService).
// This endpoint is retained for backward compatibility only. Do NOT use for new ingestion.
app.post('/api/climate/bulk', async (req, res) => {
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

// 🔍 Consulta de riesgos climáticos por coordenadas (climate_cells · PostGIS)
app.get('/api/climate-risks/lookup', async (req, res) => {
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
app.get('/api/external-risks/lookup', async (req, res) => {
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
app.post('/api/climate-risks/upload', async (req, res) => {
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

// ============================================
// ENDPOINTS — DOCUMENTOS CLIMÁTICOS
// ============================================

// Multer: almacena en memoria (el buffer se pasa a Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — defensa extra
});

/**
 * POST /api/documentos/upload
 * Sube un documento a Storage y registra metadata en "archivos".
 * multipart/form-data:
 *   - archivo   (File)   — requerido
 *   - descripcion (string) — opcional
 *   - categoria  (string) — opcional: riesgo | impacto | adaptacion | informe
 */
app.post('/api/documentos/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo (campo: "archivo")' });
    }

    const { descripcion, categoria } = req.body;
    const doc = await uploadDocumento(req.file, descripcion || null, categoria || null);

    return res.status(201).json({
      success: true,
      documento: doc,
    });
  } catch (err) {
    console.error('❌ /api/documentos/upload:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/documentos
 * Lista todos los documentos, con filtro opcional ?categoria=riesgo
 */
app.get('/api/documentos', async (req, res) => {
  try {
    const { categoria } = req.query;
    const docs = await getDocumentos(categoria || null);
    return res.json(docs);
  } catch (err) {
    console.error('❌ /api/documentos:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/documentos/:id
 * Elimina el documento de la BD y del Storage.
 */
app.delete('/api/documentos/:id', async (req, res) => {
  try {
    const result = await deleteDocumento(req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('❌ /api/documentos/:id DELETE:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/documentos/categorias
 * Devuelve las categorías disponibles.
 */
app.get('/api/documentos/categorias', (_req, res) => {
  res.json(CATEGORIAS);
});

// ============================================
// FIN ENDPOINTS DOCUMENTOS
// ============================================

// ============================================
// ENDPOINTS — BÚSQUEDA GEOGRÁFICA HÍBRIDA
// ============================================

/**
 * GET /api/search?q=
 * Búsqueda geográfica híbrida con contexto forzado a Perú.
 * Orden: assets (BD) → places (BD) → Mapbox → Google → guardar en places.
 */

// Bounding box de Perú para validar resultados de APIs externas
const PERU_BOUNDS = { latMin: -18.5, latMax: 0.1, lngMin: -81.5, lngMax: -68.5 };

function isInPeru(lat, lng) {
  return lat >= PERU_BOUNDS.latMin && lat <= PERU_BOUNDS.latMax
      && lng >= PERU_BOUNDS.lngMin && lng <= PERU_BOUNDS.lngMax;
}

// Limpia ruido léxico antes de geocodificar
function cleanAddress(q) {
  return q
    .replace(/\bintersection with\b/gi, '&')
    .replace(/\bs\/n\b|\bsn\b|\bsin\s+número\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Normaliza query para APIs externas: garantiza contexto Perú
function normalizeGeoQuery(raw) {
  const q = cleanAddress(raw.trim());
  const lower = q.toLowerCase();
  if (lower.includes('peru') || lower.includes('perú')) return q;
  return `${q}, Lima, Peru`;
}

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const rawQuery = q.trim();

    // ── 1 & 2. Buscar en BD (assets primero, luego places) ──────────────────
    const [{ data: assetResults, error: assetError }, { data: placeResults, error: placeError }] =
      await Promise.all([
        supabase.rpc('search_assets', { query: rawQuery }),
        supabase.rpc('search_places', { query: rawQuery }),
      ]);

    if (assetError) console.warn('search_assets:', assetError.message);
    if (placeError)  console.warn('search_places:', placeError.message);

    // Filtrar resultados de BD: solo los que están dentro de Perú
    const validAssets = (assetResults || []).filter(r => isInPeru(r.lat, r.lng));
    const validPlaces = (placeResults  || []).filter(r => isInPeru(r.lat, r.lng));
    const fromDB = [...validAssets, ...validPlaces];

    if (fromDB.length > 0) return res.json(fromDB);

    // ── 3. Preparar query normalizado para APIs externas ────────────────────
    const geoQuery = normalizeGeoQuery(rawQuery);
    const isIntersection = rawQuery.includes('&');
    let geoResults = null;

    // ── 4. Google Geocoding (primario) ──────────────────────────────────────
    if (!geoResults && process.env.GOOGLE_GEOCODING_KEY) {
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', geoQuery);
        url.searchParams.set('components', 'country:PE');
        url.searchParams.set('key', process.env.GOOGLE_GEOCODING_KEY);
        url.searchParams.set('language', 'es');

        const r = await fetch(url.toString());
        if (!r.ok) {
          console.warn(`Google Geocoding HTTP ${r.status} para: ${geoQuery}`);
        } else {
          const d = await r.json();
          const items = (d.results || []).filter(item => {
            const loc = item.geometry?.location;
            return loc && isInPeru(loc.lat, loc.lng);
          });
          if (items.length > 0) {
            geoResults = items.map(item => ({
              direccion:     item.formatted_address,
              lat:           item.geometry.location.lat,
              lng:           item.geometry.location.lng,
              source:        'google',
              place_type_db: item.types?.[0] || 'place',
            }));
          }
        }
      } catch (e) { console.warn('Google Geocoding error:', e.message); }
    }

    // ── 5. Mapbox Geocoding (fallback) ──────────────────────────────────────
    if (!geoResults && process.env.MAPBOX_TOKEN) {
      try {
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(geoQuery)}.json`
        );
        url.searchParams.set('access_token', process.env.MAPBOX_TOKEN);
        url.searchParams.set('country', 'PE');
        url.searchParams.set('limit', '5');
        url.searchParams.set('language', 'es');
        url.searchParams.set('types', isIntersection ? 'address,poi' : 'place,locality,neighborhood,address');
        url.searchParams.set('proximity', '-76.95,-12.05');
        url.searchParams.set('bbox', '-81.5,-18.5,-68.5,0.1');
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('fuzzyMatch', 'true');

        const r = await fetch(url.toString());
        if (!r.ok) {
          console.warn(`Mapbox Geocoding HTTP ${r.status} para: ${geoQuery}`);
        } else {
          const d = await r.json();
          const features = (d.features || []).filter(f => {
            const [fLng, fLat] = f.center || [];
            return fLat != null && fLng != null && isInPeru(fLat, fLng);
          });
          if (features.length > 0) {
            geoResults = features.map(f => ({
              direccion:     f.place_name,
              lat:           f.center[1],
              lng:           f.center[0],
              source:        'mapbox',
              place_type_db: f.place_type?.[0] || 'place',
            }));
          }
        }
      } catch (e) { console.warn('Mapbox error:', e.message); }
    }

    if (!geoResults || geoResults.length === 0) return res.json([]);

    // ── 5. Guardar en places y devolver ─────────────────────────────────────
    const saved = [];
    for (const geo of geoResults) {
      const { data: inserted, error: insertErr } = await supabase
        .from('places')
        .insert({
          direccion:  geo.direccion,
          lat:        geo.lat,
          lng:        geo.lng,
          source:     geo.source,
        })
        .select('id, direccion, lat, lng')
        .single();

      if (insertErr) {
        // Conflicto por unique_place_address → recuperar existente
        if (insertErr.code !== '23505') console.error('Insert place error:', insertErr.message);
        const { data: existing } = await supabase
          .from('places')
          .select('id, direccion, lat, lng')
          .ilike('direccion', geo.direccion)
          .limit(1)
          .maybeSingle();
        if (existing) saved.push({ ...existing, tipo: 'place', source: geo.source });
      } else if (inserted) {
        saved.push({ ...inserted, tipo: 'place', source: geo.source });
      }
    }

    return res.json(saved);
  } catch (error) {
    console.error('Error en /api/search:', error.message);
    return res.status(500).json({ error: 'Error en la búsqueda' });
  }
});

/**
 * POST /api/places/assets
 * Registra un nuevo activo en una ubicación existente
 * Body: { place_id, name, unidad_negocio }
 */
app.post('/api/places/assets', async (req, res) => {
  try {
    const { place_id, name, unidad_negocio } = req.body;
    if (!place_id || !name?.trim()) {
      return res.status(400).json({ error: 'place_id y name son requeridos' });
    }

    const { data: place } = await supabase
      .from('places')
      .select('id')
      .eq('id', place_id)
      .single();

    if (!place) return res.status(404).json({ error: 'Ubicación no encontrada' });

    const { data: asset, error } = await supabase
      .from('assets')
      .insert({
        place_id,
        name: name.trim(),
        unidad_negocio: unidad_negocio || null,
        status: 'enriched',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya existe un activo con ese nombre en esta ubicación' });
      }
      console.error('Error insertando asset:', error.message);
      return res.status(500).json({ error: 'Error al registrar el activo' });
    }

    return res.status(201).json(asset);
  } catch (error) {
    console.error('Error en POST /api/places/assets:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================
// FIN ENDPOINTS BÚSQUEDA GEOGRÁFICA HÍBRIDA
// ============================================

// ============================================
// ENDPOINTS — APIS EXTERNAS NARRATIVAS
// ============================================

// GET /api/territorial-context
// Contexto socioeconómico de Perú (Banco Mundial) — cacheable 24h
app.get('/api/territorial-context', async (req, res) => {
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

// GET /api/documentos/context
// Catálogo de documentos subidos para enriquecer prompts de IA — caché 30 min
app.get('/api/documentos/context', async (req, res) => {
  const cacheKey = 'documentos-context';
  const now = Date.now();
  const TTL_30MIN = 1000 * 60 * 30;

  if (climateCache[cacheKey] && now - climateCache[cacheKey].timestamp < TTL_30MIN) {
    return res.json(climateCache[cacheKey].data);
  }

  const data = await getDocumentosEnrichment();
  if (data.total > 0) climateCache[cacheKey] = { data, timestamp: now };
  return res.json(data); // nunca retorna 500 — los documentos son enriquecimiento opcional
});

// ============================================
// FIN ENDPOINTS APIS EXTERNAS NARRATIVAS
// ============================================

// ============================================
// FASE 2 — POST /api/v2/climate-risk-analysis
// Ejecuta las 6 capas en secuencia y retorna
// análisis completo de riesgo climático.
// ============================================
app.post('/api/v2/climate-risk-analysis', async (req, res) => {
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

    // ── Capa 4: Priorización ────────────────────────────────────────────────
    let prioritizationOutput;
    try {
      prioritizationOutput = prioritizeRisks(businessRiskOutput, fusedData);
      partialResult.layer4 = 'ok';
    } catch (err) {
      console.error('[v2] Layer4 falló:', err.message);
      errors.layer4 = err.message;
      prioritizationOutput = { prioritized_risks: [], top_risk: null };
    }

    // ── Capa 5: Adaptaciones ────────────────────────────────────────────────
    let adaptationOutput;
    try {
      adaptationOutput = getAdaptations(prioritizationOutput, sector);
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
        prioritizationOutput,
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

    // ── Respuesta final ─────────────────────────────────────────────────────
    return res.json({
      location: {
        lat:        latNum,
        lon:        lonNum,
        distanceKm: fusedData.distanceKm,
      },
      signals:     signalOutput,
      risks:       prioritizationOutput.prioritized_risks,
      adaptations: adaptationOutput,
      narrative:   {
        executive_summary: narrativeOutput.executive_summary,
        key_metrics:       narrativeOutput.key_metrics,
      },
      gri_hazards:       fusedData.griData?.hazards ?? [],
      territorial:       fusedData.territorialData ?? null,
      metadata: {
        sector,
        scenario:     fusedData.scenario,
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

// ============================================
// FIN FASE 2
// ============================================

const PORT = process.env.PORT || 3001;

// Fallback para SPA: servir index.html para rutas no encontradas
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile('../dist/index.html', { root: __dirname });
  } else {
    res.status(404).json({ error: 'API endpoint no encontrado' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
