import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { getClimateData } from './services/climateService.js';
import { supabase } from "./supabaseClient.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

app.post('/api/calculate-risk/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;

    const { data: asset, error: assetError } = await supabase
      .from('asset_risk_summary')
      .select('*')
      .eq('id', assetId)
      .single();

    if (assetError) {
      console.error('Error leyendo activo:', assetError.message);
      return res.status(500).json({ error: 'No se pudo obtener el activo' });
    }

    if (!asset) {
      return res.status(404).json({ error: 'Activo no encontrado' });
    }

    const climate = await getClimateData(asset.lat, asset.lng);

    if (!climate) {
      return res.json({
        warning: 'No hay datos climáticos disponibles',
        riskScore: 0,
        riskLevel: 'bajo',
      });
    }

    const lastCalculated = asset.risk_calculated_at || asset.updated_at || asset.created_at;
    const recalcThresholdMs = 1000 * 60 * 60 * 24;
    const shouldRecalculate = !lastCalculated || (Date.now() - new Date(lastCalculated).getTime()) > recalcThresholdMs;

    if (!shouldRecalculate) {
      return res.json({
        warning: 'El cálculo de riesgo ya está vigente',
        riskScore: asset.risk_score ?? 0,
        riskLevel: asset.risk_level ?? 'bajo',
        asset,
        climate,
      });
    }

    const floodRisk = climate.precipitation > 50 ? 0.8 : 0.3;
    const heatRisk = climate.temperature > 30 ? 0.7 : 0.2;
    const windRisk = climate.wind_kph > 25 ? 0.6 : 0.2;

    const hazard = floodRisk * 0.4 + heatRisk * 0.3 + windRisk * 0.3;
    const riskScore = Math.min(1, hazard * 0.65 + (asset.impact_score || 0) * 0.35);
    const riskLevel = riskScore >= 0.75 ? 'critico' : riskScore >= 0.5 ? 'alto' : riskScore >= 0.25 ? 'medio' : 'bajo';
    const topRisk = climate.precipitation > 50 ? 'Inundación' : climate.temperature > 30 ? 'Ola de calor' : 'Vientos fuertes';

    const updatePayload = {
      hazard_score: hazard,
      risk_score: riskScore,
      risk_level: riskLevel,
      top_risk: topRisk,
    };

    if (Object.prototype.hasOwnProperty.call(asset, 'risk_calculated_at')) {
      updatePayload.risk_calculated_at = new Date().toISOString();
    }

    const { data: updatedAsset, error: updateError } = await supabase
      .from('assets')
      .update(updatePayload)
      .eq('id', assetId)
      .select()
      .single();

    if (updateError) {
      console.warn('No se pudo actualizar el cálculo de riesgo:', updateError.message);
    }

    return res.json({
      asset: updatedAsset || asset,
      climate,
      hazard,
      riskScore,
      riskLevel,
    });
  } catch (error) {
    console.error(' Error en /api/calculate-risk:', error.message);
    return res.status(500).json({ error: 'Error al calcular el riesgo' });
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

// Carga masiva de datos climáticos for endpoint climático (para pruebas o integración con fuentes externas)
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

// 🔍 Consulta de riesgos climáticos por coordenadas (Banco Mundial)
app.get('/api/climate-risks/lookup', async (req, res) => {
  try {
    const { lat, lng, radius = '1.5', scenario = 'pesimista' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat y lng son requeridos' });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = Math.min(parseFloat(radius) || 1.5, 5.0);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }

    // Unidad por variable (no almacenada en DB — se enriquece aquí)
    const UNITS = {
      calor_extremo: '°C', temperatura_maxima: '°C', temperatura_media: '°C',
      noches_calurosas: 'días', mortalidad_calor: 'índice',
      precipitacion_extrema: 'mm', precipitacion_media: 'mm/día',
      cambio_precipitacion: '%', inundacion: 'días/año',
    };

    // Pesos de nivel para comparar escenarios
    const LEVEL_SCORES = { bajo: 1, medio: 2, alto: 3 };
    const score = (r) => LEVEL_SCORES[(r.level || '').toLowerCase()] || 0;

    // Elige el registro según escenario entre duplicados del mismo risk_type+horizon
    // (existen porque el dataset contiene SSP2-4.5 y SSP5-8.5)
    function pickRecord(records) {
      if (records.length === 1) return records[0];
      return records.reduce((pick, r) => {
        const ps = score(pick), rs = score(r);
        if (scenario === 'pesimista') {
          // SSP5-8.5 proxy: peor nivel / mayor valor
          return rs > ps || (rs === ps && (r.value || 0) > (pick.value || 0)) ? r : pick;
        }
        // moderado / actual: SSP2-4.5 proxy: mejor nivel / menor valor
        return rs < ps || (rs === ps && (r.value || 0) < (pick.value || 0)) ? r : pick;
      });
    }

    // Obtener versión activa
    const { data: control } = await supabase
      .from('climate_dataset_control')
      .select('version')
      .eq('is_active', true)
      .single();

    let query = supabase
      .from('climate_risks_grid')
      .select('lat, lng, risk_type, horizon, level, value, source')
      .gte('lat', latNum - radiusNum)
      .lte('lat', latNum + radiusNum)
      .gte('lng', lngNum - radiusNum)
      .lte('lng', lngNum + radiusNum)
      .limit(3000);

    if (control?.version) query = query.eq('dataset_version', control.version);

    const { data, error } = await query;

    if (error) {
      console.error('Error en lookup:', error.message);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.json({
        found: false,
        message: 'No hay datos climáticos para esta zona. Carga primero un dataset del Banco Mundial.',
      });
    }

    // Punto de grilla más cercano
    const uniquePoints = [];
    const seenPts = new Set();
    for (const r of data) {
      const key = `${r.lat},${r.lng}`;
      if (!seenPts.has(key)) {
        seenPts.add(key);
        const dist = Math.hypot(r.lat - latNum, r.lng - lngNum);
        uniquePoints.push({ lat: r.lat, lng: r.lng, dist });
      }
    }
    uniquePoints.sort((a, b) => a.dist - b.dist);
    const nearest = uniquePoints[0];

    const nearestRecords = data.filter(
      (r) => r.lat === nearest.lat && r.lng === nearest.lng
    );

    // Deduplicar: 1 registro por (risk_type, horizon) — aplica lógica de escenario
    const grouped = {};
    for (const r of nearestRecords) {
      const key = `${r.risk_type}|${r.horizon}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }
    const deduped = Object.values(grouped).map(pickRecord);

    // Enriquecer con unidad
    deduped.forEach((r) => { r.unit = UNITS[r.risk_type] || ''; });

    // Haversine (km)
    const toRad = (d) => (d * Math.PI) / 180;
    const Rearth = 6371;
    const dLat = toRad(nearest.lat - latNum);
    const dLon = toRad(nearest.lng - lngNum);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(latNum)) * Math.cos(toRad(nearest.lat)) * Math.sin(dLon / 2) ** 2;
    const distKm = Math.round(Rearth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

    const scenarioMeta = {
      actual:    { label: 'Situación Actual',    sublabel: 'Histórico 1985–2014 · línea base', color: 'slate' },
      moderado:  { label: 'Escenario Moderado',  sublabel: 'SSP2-4.5 · Emisiones moderadas',   color: 'amber' },
      pesimista: { label: 'Escenario Pesimista', sublabel: 'SSP5-8.5 · Altas emisiones',        color: 'red'   },
    };

    // Separar futuros (corto/mediano) de histórico
    const historicalRecs = deduped.filter((r) => r.horizon === 'historico');
    const futureRecs     = deduped.filter((r) => r.horizon !== 'historico');

    if (scenario === 'actual') {
      // Mostrar datos históricos como contenido principal (sin proyecciones)
      const byHorizon = {};
      for (const r of historicalRecs) {
        if (!byHorizon[r.horizon]) byHorizon[r.horizon] = [];
        byHorizon[r.horizon].push(r);
      }
      return res.json({
        found: true,
        queried: { lat: latNum, lng: lngNum },
        nearestPoint: { lat: nearest.lat, lng: nearest.lng, distanceKm: distKm },
        scenario,
        scenarioMeta: scenarioMeta.actual,
        horizons: Object.keys(byHorizon).sort(),
        byHorizon,
        baseline: {},
        totalRecords: historicalRecs.length,
      });
    }

    // Escenario moderado o pesimista: proyecciones futuras + línea base histórica
    const byHorizon = {};
    for (const r of futureRecs) {
      if (!byHorizon[r.horizon]) byHorizon[r.horizon] = [];
      byHorizon[r.horizon].push(r);
    }
    const baseline = {};
    for (const r of historicalRecs) {
      baseline[r.risk_type] = { level: r.level, value: r.value, unit: UNITS[r.risk_type] || '' };
    }

    return res.json({
      found: true,
      queried: { lat: latNum, lng: lngNum },
      nearestPoint: { lat: nearest.lat, lng: nearest.lng, distanceKm: distKm },
      scenario,
      scenarioMeta: scenarioMeta[scenario] || scenarioMeta.pesimista,
      horizons: Object.keys(byHorizon).sort(),
      byHorizon,
      baseline,
      totalRecords: futureRecs.length,
    });
  } catch (error) {
    console.error('Error en /api/climate-risks/lookup:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🌍 Carga de datos climáticos del Banco Mundial hacia climate_risks_grid
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

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});