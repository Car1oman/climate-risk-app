import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

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
const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

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

/* // 🌤️ Ruta datos climáticos
app.get('/api/climate', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat y lng son requeridos' });
    }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=precipitation_sum&timezone=auto`;
    const response = await fetch(url);
    const data = await response.json();
    

 res.json({
  temperature: data.current_weather?.temperature ?? null,
  precipitation: data.daily?.precipitation_sum?.[0] ?? 0,
});

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo datos climáticos' });
  }
}); */

app.get('/api/climate', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    console.log("👉 Request recibida");
    console.log("LAT:", lat, "LNG:", lng);

    if (!lat || !lng) {
      console.log("❌ Faltan parámetros");
      return res.status(400).json({ error: 'lat y lng son requeridos' });
    }

    // ⚡ Verificar caché
    const key = `${lat},${lng}`;
    const now = Date.now();

    if (climateCache[key] && (now - climateCache[key].timestamp < CACHE_TTL)) {
      console.log("⚡ Usando cache para", key);
      return res.json(climateCache[key].data);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=precipitation_sum&timezone=auto`;

    console.log("🌐 URL Open-Meteo:", url);

    const response = await fetch(url);

    console.log("📡 Status Open-Meteo:", response.status);

    const text = await response.text();

    console.log("📦 RAW RESPONSE:");
    console.log(text);

    let data;

    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.log("❌ Error parseando JSON");
      return res.status(500).json({ error: 'Respuesta inválida de Open-Meteo' });
    }

    console.log("✅ JSON parseado:");
    console.log(JSON.stringify(data, null, 2));

    // 🚨 Manejar límite de API
    if (data.error) {
      console.log("⚠️ Límite de API alcanzado");

      return res.json({
        temperature: null,
        precipitation: 0,
        fallback: true,
        message: "Datos climáticos no disponibles temporalmente"
      });
    }

    const result = {
      temperature: data.current_weather?.temperature ?? null,
      precipitation: data.daily?.precipitation_sum?.[0] ?? 0,
    };

    // 🎯 Guardar en caché
    climateCache[key] = {
      data: result,
      timestamp: now
    };

    console.log("🎯 RESULT FINAL:");
    console.log(result);

    res.json(result);

  } catch (error) {
    console.error("🔥 ERROR GENERAL:", error);
    res.status(500).json({ error: 'Error obteniendo datos climáticos' });
  }
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});