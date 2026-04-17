# 🏗️ Arquitectura del Sistema Climate Cells

## 🎯 Visión General

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO FINAL                            │
│              (Ingresa coordenadas en el mapa)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React/Vite)                      │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ • Mapa interactivo (Leaflet)                            │  │
│  │ • Selector de coordenadas                              │  │
│  │ • Visualización de riesgos por horizonte               │  │
│  │ • Panel de impactos relacionados                       │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    [GET query]      [POST upload]    [GET status]
    
    GET /api/          POST /api/          GET /api/
    climate-cells/     climate-cells/      climate-cells/
    query              upload              status
    
    Coordenadas  →     JSON/JSONL    →     Estadísticas
                       Array
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express.js)                          │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │   Geospatial    │  │    Import        │  │   Cache        │ │
│  │    Service      │  │    Service       │  │   (Memory)     │ │
│  │                 │  │                  │  │                │ │
│  │ • Query by      │  │ • Validate       │  │ • 10min TTL    │ │
│  │   proximity     │  │ • Normalize      │  │ • Fast queries │ │
│  │ • Transform     │  │ • Parse JSON/L   │  │                │ │
│  │   variables     │  │ • UPSERT check   │  │                │ │
│  │ • Generate      │  │ • Error handling │  │                │ │
│  │   insights      │  │ • Batch process  │  │                │ │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬───────┘ │
│           │                    │                     │          │
└───────────┼────────────────────┼─────────────────────┼──────────┘
            │                    │                     │
            └────────────┬───────┴┬────────────────────┘
                         │       │
            ┌────────────┼───────┴─────────────┐
            ▼            ▼                      ▼
  ┌──────────────────────────────────────────────────────┐
  │          SUPABASE (PostgreSQL + PostGIS)             │
  │                                                        │
  │  ┌─────────────────────────────────────────────────┐ │
  │  │         climate_cells (Tabla Principal)         │ │
  │  │                                                 │ │
  │  │ • id (SERIAL)                                  │ │
  │  │ • lat, lon (FLOAT8)                            │ │
  │  │ • geom (GEOGRAPHY POINT 4326)                  │ │
  │  │ • data (JSONB) ← Todos los horizontes          │ │
  │  │ • created_at, updated_at (TIMESTAMP)           │ │
  │  │                                                 │ │
  │  │ Índices:                                        │ │
  │  │ • UNIQUE(lat, lon) ← Para UPSERT              │ │
  │  │ • GIST(geom) ← Para búsquedas de proximidad   │ │
  │  │                                                 │ │
  │  │ Funciones PL/pgSQL:                            │ │
  │  │ • get_nearest_climate_cell(lat, lon)           │ │
  │  │ • get_climate_cells_stats()                    │ │
  │  └─────────────────────────────────────────────────┘ │
  │                                                        │
  │  ┌─────────────────────────────────────────────────┐ │
  │  │ Tablas de herencia (Backward compatibility)    │ │
  │  │                                                 │ │
  │  │ • climate_data (WeatherAPI histórico)          │ │
  │  │ • climate_risks_grid (Riesgos legacy)          │ │
  │  │ • climate_dataset_control (Versionamiento)     │ │
  │  └─────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────┘
```

---

## 📊 Flujo de Datos

### Flujo 1: Consulta de Usuario
```
Usuario: "Muestra riesgos en -12.5, -75.5"
    ↓
frontend: GET /api/climate-cells/query?lat=-12.5&lon=-75.5
    ↓
backend: [climateGeospatialService]
    ├─ Validar coordenadas
    ├─ Llamar: get_nearest_climate_cell(-12.5, -75.5)
    └─ Transformar variables (txx → Temperatura Máxima)
    ↓
Supabase: 
    ├─ ST_DWithin(geom, POINT(-75.5, -12.5), 50km)
    └─ ORDER BY geom <-> POINT(...) LIMIT 1
    ↓
Backend: [transformClimateData + generateClimateInsights]
    ├─ Mapear: historical → past, ensemble → short_term, etc.
    ├─ Comparar: past vs short_term vs mid_term vs worst_case
    └─ Generar textos: "Temperatura aumenta de X a Y"
    ↓
Response:
{
  location: {...},
  climate: { past: {...}, short_term: {...}, ... },
  risks_interpretation: [
    { horizon: "short_term", insights: [...] }
  ]
}
    ↓
UI: Mostrar riesgos organizados por horizonte temporal
    Usuario hace click en un riesgo → Ver impactos
```

### Flujo 2: Carga de Datos
```
Usuario: "Sube archivo con datos climáticos"
    ↓
frontend: POST /api/climate-cells/upload
    {
      data: [
        { lat: -12.5, lon: -75.5, data: {...} },
        ...
      ]
    }
    ↓
Backend: [climateImportService]
    ├─ validateClimateRecord() para cada fila
    │  ├─ Verificar rango lat/lon
    │  ├─ Verificar data es JSONB
    │  └─ Registrar errores por fila
    │
    ├─ normalizeRecord()
    │  ├─ Generar POINT(lon, lat) para geom
    │  └─ Asegurar estructura correcta
    │
    └─ upsertClimateData() lote por lote
       ├─ Para cada (lat, lon):
       │  ├─ Si existe → UPDATE data (merge)
       │  └─ Si no existe → INSERT nuevo
       │
       └─ Retornar:
          { inserted: X, updated: Y, failed: Z, errors: [...] }
    ↓
Supabase:
    INSERT INTO climate_cells 
    ON CONFLICT (lat, lon) 
    DO UPDATE SET data = EXCLUDED.data
    ↓
Response: { summary: {...}, errors: [] }
    ↓
UI: "✅ Cargados 120 registros, 28 actualizados"
```

---

## 🔄 Transformación de Horizonte Temporal

```
ENTRADA (Banco Mundial)           SALIDA (Sistema)
─────────────────────────────────────────────────

{                                 {
  "historical": {...}       →       "past": {
  "scenario": "ensemble-            "txx": {
    all-historical"                  "name": "Temp Máxima Extrema",
}                                    "value": 32.5,
                                     "unit": "°C"
                                   }
                                 }

"ensemble-all-ssp245_       →       "short_term": {
 2020-2039"                          (mismo mapeo)
                                 }

"ensemble-all-ssp245_       →       "mid_term": {
 2040-2059"                          (mismo mapeo)
                                 }

"ensemble-all-ssp585_       →       "worst_case": {
 *"                                  (mismo mapeo)
                                 }
}
```

---

## 🧮 Lógica de Interpretación Automática

```
Input:
  past.hd35 = 45 (días >35°C)
  short_term.hd35 = 65

Cálculo:
  delta = 65 - 45 = 20 días
  severity = delta > 30 ? "high" : delta > 10 ? "medium" : "low"
  
  → severity = "medium" ✓

Output:
{
  variable: "hd35",
  type: "extreme_heat_days",
  text: "Los días con temperatura >35°C AUMENTAN 
         de 45 a 65 días/año",
  severity: "medium"
}

Lógica similar para:
  - txx: Cambio de temperatura
  - rx1day: Lluvia extrema
  - cdd: Sequías (días secos)
  - tas: Temperatura media
```

---

## 🎯 Mapeo de Severidad

```
Severidad = f(delta, variable_type)

Para TEMPERATURA:
  |delta| > 2°C      → "high"
  |delta| > 1°C      → "medium"
  |delta| ≤ 1°C      → "low"

Para DÍAS EXTREMOS:
  delta > 30 días    → "high"
  delta > 10 días    → "medium"
  delta ≤ 10 días    → "low"

Para PRECIPITACIÓN:
  |delta| > 20mm     → "high"
  |delta| > 10mm     → "medium"
  |delta| ≤ 10mm     → "low"

Para SEQUÍA (CDD):
  delta > 15 días    → "high"
  delta > 5 días     → "medium"
  delta ≤ 5 días     → "low"
```

---

## 📈 Stack Tecnológico

```
┌─ FRONTEND
│  ├─ React 18
│  ├─ Vite (bundler)
│  ├─ React Query (state management)
│  ├─ Leaflet (mapas)
│  └─ Toast notifications
│
├─ BACKEND
│  ├─ Node.js/Express
│  ├─ climateGeospatialService.js
│  ├─ climateImportService.js
│  ├─ Cache en memoria
│  └─ Supabase JS client
│
└─ DATABASE
   ├─ PostgreSQL (Supabase)
   ├─ PostGIS (extensión)
   ├─ JSONB (data climáticos)
   ├─ GEOGRAPHY(POINT, 4326)
   └─ RLS (seguridad)
```

---

## ⚡ Performance (Benchmarks Estimados)

```
OPERACIÓN                  LATENCIA      NOTAS
─────────────────────────────────────────────────
GET /api/climate-cells/    50-100ms      Primer hits
query?lat=X&lon=Y          <1ms (cache)  Con cache

POST /api/climate-cells/   ~20ms/batch   100 registros
upload (100 registros)     ~5-10s total  Con validación

Índice geoespacial search  ~20-50ms      Con GIST
UPSERT por (lat,lon)       ~10-20ms      Con índice único

Cache hit                  <1ms          Memory lookup
Cache miss + fetch         ~100ms        DB + transform
```

---

## 🔐 Seguridad

```
┌─ VALIDACIÓN
│  ├─ Tipos de datos (numéricos, string)
│  ├─ Rangos de valores (lat: [-90,90], lon: [-180,180])
│  ├─ Estructura JSONB (schema validation)
│  ├─ Campos obligatorios (lat, lon, data)
│  └─ Detección de inyección SQL (prepared statements)
│
├─ RLS (Row Level Security en Supabase)
│  ├─ Política lectura: pública (SELECT *;)
│  ├─ Política escritura: service_role only
│  ├─ Política admin: service_role only
│  └─ Auditoría opcional (tabla climate_cells_audit)
│
└─ ERRORES
   ├─ Errores por fila (sin falla total)
   ├─ Logging detallado
   ├─ Rate limiting (opcional)
   └─ Validación en backend
```

---

## 🔄 Ciclo de Vida de un Registro

```
PASO 1: INGESTION
  ├─ Usuario sube JSON
  ├─ Backend recibe POST /upload
  └─ Service valida estructura

PASO 2: NORMALIZACIÓN
  ├─ Generar geom = POINT(lon, lat)
  ├─ Asegurar data JSONB válida
  └─ Mapear campos opcionales

PASO 3: DEDUPLICACIÓN
  ├─ Buscar existing (lat, lon)
  ├─ Si existe: marcar como UPDATE
  └─ Si no: marcar como INSERT

PASO 4: INSERCIÓN O ACTUALIZACIÓN
  ├─ INSERT si nuevo
  └─ UPDATE data (merge) si existe

PASO 5: AUDITORÍA
  ├─ Registro en tabla clima_cells_audit
  ├─ Timestamp automático
  └─ Cambios trackeados

PASO 6: INDEXACIÓN
  ├─ GIST index actualizado
  ├─ B-tree (lat,lon) actualizado
  └─ Ready para queries
```

---

## 📦 Estructura de Paquetes

```
server/
├─ server.js (modificado)
│  ├─ Imports: climateGeospatialService
│  ├─ Imports: climateImportService
│  └─ Endpoints: /api/climate-cells/*
│
├─ services/
│  ├─ climateGeospatialService.js (NUEVO)
│  │  ├─ getClimateByLocation()
│  │  ├─ transformClimateData()
│  │  ├─ generateClimateInsights()
│  │  ├─ interpretClimateRisks()
│  │  └─ transformVariables()
│  │
│  ├─ climateImportService.js (NUEVO)
│  │  ├─ validateClimateRecord()
│  │  ├─ normalizeRecord()
│  │  ├─ parseClimateFile()
│  │  ├─ upsertClimateData()
│  │  └─ batchUpsertClimateData()
│  │
│  └─ climateService.js (existente)
│     └─ Fallback a WeatherAPI
│
└─ supabaseClient.js (sin cambios)

scripts/
├─ transform-climate-data.js (NUEVO)
│  └─ Convierte JSON antiguo al nuevo formato
│
└─ test-climate-api.js (NUEVO)
   └─ Suite de pruebas automáticas

docs/
├─ API_CLIMATE_CELLS.md (NUEVO)
├─ SUPABASE_SETUP.md (NUEVO)
├─ QUICKSTART.md (NUEVO)
├─ IMPLEMENTATION_NOTES.md (NUEVO)
└─ ARCHITECTURE.md (este archivo)
```

---

## 🎓 Conceptos Clave

### PostGIS Geography
- **POINT(lon, lat):** Tipo geoespacial en el plano
- **ST_MakePoint(lon, lat):** Constructor
- **ST_DWithin():** Búsqueda en radio (metros)
- **<->:** Operador de distancia para ORDER BY

### JSONB en PostgreSQL
- Almacenamiento flexible (sin schema fijo)
- Queryable con operadores JSON
- Indexable con `jsonb_gin_ops`
- Merge automático en UPSERT

### UPSERT Inteligente
```sql
INSERT INTO climate_cells (lat, lon, geom, data)
VALUES (lat, lon, geom, data)
ON CONFLICT (lat, lon) 
DO UPDATE SET 
  data = OLD.data || EXCLUDED.data,
  updated_at = NOW()
```

---

## 🚀 Próximas Mejoras Sugeridas

1. **Exportación**
   - GeoJSON
   - TCFD/ESRS PDF
   - CSV con impactos

2. **IA/ML**
   - Predicción automática de impactos
   - Score de riesgo compuesto
   - Anomaly detection

3. **Integraciones**
   - Webhooks para alertas
   - GraphQL API
   - Mobile app (React Native)

4. **UX**
   - Timeline interactivo
   - Comparador de escenarios
   - Exportar reports

5. **Performance**
   - Query materialization
   - Partition por región
   - CDN para datos frecuentes

---

## 📞 Soporte Rápido

**¿Dónde está X?**
- API docs → API_CLIMATE_CELLS.md
- Setup Supabase → SUPABASE_SETUP.md
- Guía rápida → QUICKSTART.md
- Notas técnicas → IMPLEMENTATION_NOTES.md

**¿Cómo hago Y?**
- Cargar datos → cli o node script
- Consultar riesgos → GET /api/climate-cells/query
- Testear → node scripts/test-climate-api.js

**Error Z?**
- Check sintaxis → node -c file.js
- Check DB → SELECT COUNT(*) FROM climate_cells
- Check logs → Console + Supabase dashboard

---

**¡Sistema listo para producción!** 🎉

