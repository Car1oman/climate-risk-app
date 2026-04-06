import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { getClimateData } from './services/climateService.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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

    console.log("👉 Request recibida: lat=", lat, "lng=", lng);

    // Validar parámetros
    if (!lat || !lng) {
      console.log("❌ Parámetros faltantes");
      return res.status(400).json({ error: 'Parámetros lat y lng son requeridos' });
    }

    // ⚡ Verificar caché
    const key = `${lat},${lng}`;
    const now = Date.now();

    if (climateCache[key] && (now - climateCache[key].timestamp < CACHE_TTL)) {
      console.log("⚡ Caché vigente para", key);
      return res.json(climateCache[key].data);
    }

    console.log("🔄 Consultando WeatherAPI...");

    // Obtener datos del servicio climático
    const climateData = await getClimateData(lat, lng);

    // 🎯 Guardar en caché
    climateCache[key] = {
      data: climateData,
      timestamp: now
    };

    console.log("✅ Datos guardados en caché");
    res.json(climateData);

  } catch (error) {
    console.error("🔥 Error en /api/climate:", error.message);
    
    // Respuesta fallback
    res.status(500).json({
      error: 'No se pudieron obtener datos climáticos',
      fallback: true,
      temperature: null,
      humidity: null,
      wind_kph: null,
      condition: 'Datos no disponibles'
    });
  }
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});