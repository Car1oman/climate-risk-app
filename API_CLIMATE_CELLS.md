# API de Datos Climáticos Geoespaciales

Nueva versión del sistema con soporte para tabla `climate_cells` con PostGIS.

---

## 🚀 Nuevos Endpoints

### 1. GET `/api/climate-cells/query`

**Consultar datos climáticos por ubicación (PostGIS)**

Obtiene datos climáticos del punto más cercano a las coordenadas proporcionadas.

**Parámetros:**
```
GET /api/climate-cells/query?lat=-12.5&lon=-75.5
```

- `lat` (requerido): Latitud [-90, 90]
- `lon` o `lng` (requerido): Longitud [-180, 180]

**Respuesta exitosa (200):**
```json
{
  "location": {
    "lat": -12.5,
    "lon": -75.5
  },
  "climate": {
    "past": {
      "txx": {
        "name": "Temperatura Máxima Extrema",
        "unit": "°C",
        "description": "Temperatura máxima extrema del período",
        "value": 32.5
      },
      "hd35": {
        "name": "Días Extremadamente Calurosos",
        "unit": "días/año",
        "description": "Número de días con temperatura > 35°C",
        "value": 45
      }
    },
    "short_term": {
      "txx": { "name": "...", "value": 33.2 },
      "hd35": { "name": "...", "value": 65 }
    },
    "mid_term": { ... },
    "worst_case": { ... }
  },
  "risks_interpretation": [
    {
      "horizon": "short_term",
      "period": "Corto Plazo (2020-2039)",
      "insights": [
        {
          "variable": "txx",
          "type": "temperature_change",
          "text": "La temperatura máxima extrema aumenta de 32.5°C a 33.2°C (cambio: 0.7°C)",
          "severity": "low"
        },
        {
          "variable": "hd35",
          "type": "extreme_heat_days",
          "text": "Los días con temperatura > 35°C aumentan de 45 a 65 días/año",
          "severity": "medium"
        }
      ]
    },
    {
      "horizon": "mid_term",
      "period": "Mediano Plazo (2040-2059)",
      "insights": [ ... ]
    }
  ],
  "source": "climate_cells",
  "generated_at": "2026-04-17T10:30:00Z",
  "cached": false
}
```

**Respuesta sin datos (404):**
```json
{
  "error": "No hay datos climáticos disponibles para esta ubicación",
  "location": { "lat": -12.5, "lon": -75.5 }
}
```

---

### 2. POST `/api/climate-cells/upload`

**Cargar datos climáticos en formato JSON o JSONL**

Carga datos climáticos a la tabla `climate_cells` con UPSERT inteligente (si existe, actualiza; si no, inserta).

**Parámetros:**
- Body JSON con:
  - `data` (requerido): Array de registros climáticos
  - `format` (opcional): 'json' (default) o 'jsonl'

**Formato de registro:**
```json
{
  "lat": -12.5,
  "lon": -75.5,
  "data": {
    "historical": {
      "txx": 32.5,
      "hd35": 45,
      "rx1day": 125
    },
    "ensemble-all-ssp245_2020-2039": {
      "txx": 33.2,
      "hd35": 65,
      "rx1day": 135
    },
    "ensemble-all-ssp245_2040-2059": {
      "txx": 34.1,
      "hd35": 90,
      "rx1day": 145
    },
    "ensemble-all-ssp585_2020-2039": {
      "txx": 33.5,
      "hd35": 72,
      "rx1day": 140
    }
  }
}
```

**Ejemplo de solicitud:**
```bash
curl -X POST http://localhost:3001/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "lat": -12.5,
        "lon": -75.5,
        "data": {
          "historical": { "txx": 32.5, "hd35": 45 },
          "ensemble-all-ssp245_2020-2039": { "txx": 33.2, "hd35": 65 }
        }
      }
    ]
  }'
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "summary": {
    "total": 150,
    "inserted": 120,
    "updated": 28,
    "failed": 2,
    "errors": []
  },
  "details": {
    "total_processed": 150,
    "successfully_inserted": 120,
    "successfully_updated": 28,
    "failed": 2
  },
  "errors": [],
  "timestamp": "2026-04-17T10:30:00Z"
}
```

**Con errores:**
```json
{
  "success": true,
  "summary": {
    "total": 150,
    "inserted": 120,
    "updated": 28,
    "failed": 2,
    "errors": [
      "Fila 45: 'lat' fuera de rango [-90, 90]",
      "Fila 87: 'data' es requerido"
    ]
  },
  "details": { ... },
  "errors": [ ... ],
  "timestamp": "2026-04-17T10:30:00Z"
}
```

---

### 3. GET `/api/climate-cells/status`

**Obtener estado de datos en climate_cells**

Información sobre cantidad de registros, estadísticas, y cache en memoria.

**Respuesta:**
```json
{
  "database_stats": {
    "total_cells": 5420,
    "coverage_area": "Perú",
    "last_update": "2026-04-16T15:20:00Z"
  },
  "cache_size": 12,
  "timestamp": "2026-04-17T10:30:00Z"
}
```

---

## 📋 Variables Climáticas Soportadas

| Variable | Nombre | Unidad | Descripción |
|----------|--------|--------|-------------|
| `txx` | Temperatura Máxima Extrema | °C | Temperatura máxima extrema del período |
| `tnn` | Temperatura Mínima Extrema | °C | Temperatura mínima extrema del período |
| `hd35` | Días Extremadamente Calurosos | días/año | Número de días con temperatura > 35°C |
| `hd40` | Días Críticos de Calor | días/año | Número de días con temperatura > 40°C |
| `rx1day` | Lluvia Extrema (1 día) | mm | Máxima precipitación en un día |
| `rx5day` | Lluvia Extrema (5 días) | mm | Máxima precipitación en 5 días consecutivos |
| `cdd` | Días Secos Consecutivos | días | Máxima secuencia de días sin precipitación |
| `cwd` | Días Lluviosos Consecutivos | días | Máxima secuencia de días con precipitación |
| `pr` | Precipitación Anual | mm | Precipitación total acumulada |
| `tas` | Temperatura Media | °C | Temperatura media del período |

---

## 🗺️ Horizontes Temporales

**Mapeado interno:**

| Entrada | Salida | Período | Descripción |
|---------|--------|---------|-------------|
| `historical` | `past` | ~1990-2020 | Datos históricos referencia |
| `ensemble-all-ssp245_2020-2039` | `short_term` | 2020-2039 | Corto plazo (escenario moderado) |
| `ensemble-all-ssp245_2040-2059` | `mid_term` | 2040-2059 | Mediano plazo (escenario moderado) |
| `ensemble-all-ssp585_*` | `worst_case` | Variable | Peor escenario (emisiones altas) |

---

## 🔄 Compatibilidad Hacia Atrás

Los endpoints antiguos siguen funcionando:

- `GET /api/climate?lat=X&lng=Y` → Datos en tiempo real (WeatherAPI)
- `POST /api/climate/bulk` → Carga de datos legacy
- `GET /api/climate-risks/lookup` → Búsqueda de riesgos climáticos
- `POST /api/climate-risks/upload` → Carga de riesgos climáticos

**Prioridad de consulta:**
1. Primero intenta `/api/climate-cells/query` (PostGIS)
2. Si no hay datos, fallback a `/api/climate` (WeatherAPI)

---

## 📊 Formato JSONL

 Para cargas masivas, también soporta JSONL (una línea por objeto):

```jsonl
{"lat": -12.5, "lon": -75.5, "data": {"historical": {"txx": 32.5}}}
{"lat": -12.3, "lon": -75.4, "data": {"historical": {"txx": 31.8}}}
{"lat": -12.1, "lon": -75.3, "data": {"historical": {"txx": 33.2}}}
```

**Cargar JSONL:**
```bash
curl -X POST http://localhost:3001/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d '{
    "data": "... contenido JSONL ...",
    "format": "jsonl"
  }'
```

---

## 🔐 Validaciones Implementadas

✅ Rango de coordenadas (lat: [-90,90], lon: [-180,180])
✅ Tipos de datos (numéricos para valores climáticos)
✅ Campos obligatorios (lat, lon, data)
✅ Estructura JSONB válida
✅ Detección de duplicados (lat, lon)
✅ UPSERT inteligente (actualiza si existe)

---

## 🚨 Manejo de Errores

Cada error incluye:
- Número de fila (index)
- Descripción del error
- Objeto que falló (si aplica)

Ejemplo de respuesta con errores:
```json
{
  "success": true,
  "details": { "failed": 5 },
  "errors": [
    "Fila 12: 'lat' fuera de rango [-90, 90]",
    "Fila 45: 'data' debe ser un objeto JSON",
    "Fila 67: Error actualizando (-12.5, -75.5): ...",
    "..."
  ]
}
```

---

## ⚡ Performance

- **Caching:** 10 minutos en memoria para queries recientes
- **Batch size:** 100 registros por lote (configurabe)
- **UPSERT:** Verificación individual + actualización selectiva
- **Latencia típica:** 
  - Primer query: ~50-100ms
  - Query en cache: ~1ms
  - Upload 1000 registros: ~5-10s

---

## 📝 Ejemplo Completo: Flujo de Usuario

### 1. Usuario ingresa coordenadas en el mapa
```javascript
const userLat = -12.5;
const userLon = -75.5;

fetch(`/api/climate-cells/query?lat=${userLat}&lon=${userLon}`)
  .then(r => r.json())
  .then(data => {
    console.log('Ubicación:', data.location);
    console.log('Datos climáticos históricos:', data.climate.past);
    console.log('Riesgos corto plazo:', data.risks_interpretation[0].insights);
  });
```

### 2. Sistema mostrar
a información por horizonte
```
CORTO PLAZO (2020-2039):
  🌡️ Temperatura máxima extrema: aumenta de 32.5°C a 33.2°C (+0.7°C)
  ☀️ Días > 35°C: aumentan de 45 a 65 días/año (+20 días)
  💧 Lluvia extrema: aumenta de 125mm a 135mm (+10mm)

MEDIANO PLAZO (2040-2059):
  🌡️ Temperatura máxima extrema: aumenta a 34.1°C (+1.6°C respecto pasado)
  ☀️ Días > 35°C: aumentan a 90 días/año (+45 días)
  💧 Lluvia extrema: aumenta a 145mm (+20mm)

ESCENARIO CRÍTICO:
  [Similar pero con valores más extremos]
```

### 3. Usuario hace click en un riesgo
```
Riesgo seleccionado: "Días > 35°C aumentan significativamente"

Impactos probables:
  - Estrés hídrico en actividades agrícolas
  - Mayor consumo energético (aire acondicionado)
  - Riesgo de golpe de calor en trabajadores
  - Modificación de patrones de vegetación
```

---

## 🔮 Próximas Mejoras

- [ ] Función PostGIS `get_nearest_climate_cell(lat, lon)` en Supabase
- [ ] Exportación de datos a GeoJSON
- [ ] Predicción automática de impactos por sector
- [ ] UI interactivo para comparación de escenarios
- [ ] Exportar reportes TCFD/ESRS con datos climáticos

