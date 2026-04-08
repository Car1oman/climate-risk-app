import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { getClimateData } from './services/climateService.js';
import { supabase } from "./supabaseClient.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
      .from('asset_risk_summary')
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
    console.error('🔥 Error en /api/calculate-risk:', error.message);
    return res.status(500).json({ error: 'Error al calcular el riesgo' });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});