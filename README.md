# Climate Risk App — Intercorp Retail

Plataforma de análisis de riesgo climático para activos de retail en Perú. Usa datos CMIP6 (SSP5-8.5) para proyecciones a 2050–2100 y un modelo H×E×I para cuantificar exposición financiera.

**Stack:** React + Vite · Express.js · Supabase/PostgreSQL + PostGIS · Google Gemini

---

## 🚀 Inicio Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# → editar .env con las claves reales

# 3. Iniciar en desarrollo (dos terminales)
npm run dev       # Frontend en http://localhost:5173
npm run server    # Backend en http://localhost:3001
```

---

## 📁 Estructura del Proyecto

```
climate-risk-app/
├── src/
│   ├── pages/            # Páginas principales (React Router)
│   ├── components/       # Componentes reutilizables + shadcn/ui
│   ├── lib/
│   │   ├── api.js        # Cliente HTTP hacia el backend
│   │   └── riskEngine.js # Modelo H×E×I (frontend, Simulator)
│   └── hooks/            # React Query hooks
├── server/
│   ├── server.js         # Express + todas las rutas
│   ├── services/         # Servicios externos (Supabase, World Bank, etc.)
│   └── layers/           # Pipeline Phase 2 (Layer1–6)
├── scripts/              # Herramientas ETL de datos climáticos
└── docs/                 # Documentación técnica
```

---

## 🗺️ Páginas de la Aplicación

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | ClimateRiskLookup | Análisis climático por coordenadas (main) |
| `/dashboard` | Dashboard | Resumen ejecutivo de activos |
| `/map` | RiskMap | Mapa interactivo de riesgos |
| `/assets` | Assets | Lista y gestión de activos |
| `/assets/:id` | AssetDetail | Detalle y modelo H×E×I por activo |
| `/simulator` | Simulator | Simulación de escenarios climáticos |
| `/alerts` | Alerts | Gestión de alertas de riesgo |
| `/report` | Report | Generación de reportes TCFD/ESRS |
| `/documentos` | DocumentosClimaticos | Gestión de documentos climáticos |
| `/data-management` | DataManagement | Administración de datos |
| `/climate-upload` | ClimateDataUpload | Carga ETL de datos CMIP6 |
| `/settings` | AppSettings | Configuración de la aplicación |

---

## 📊 Modelo de Riesgo H×E×I

### Fórmula Principal

```
R = (H × 0.40) + (E × 0.30) + (I × 0.30)
```

| Variable | Descripción | Peso |
|----------|-------------|------|
| **H** (Hazard) | Score de amenazas climáticas | 40% |
| **E** (Exposure) | Exposición física del activo | 30% |
| **I** (Impact) | Impacto financiero estimado | 30% |
| **R** (Risk) | Score final normalizado 0–1 | — |

### Clasificación de Riesgo

| Nivel | Rango R | Acción |
|-------|---------|--------|
| **Crítico** | ≥ 0.75 | Atención inmediata |
| **Alto** | ≥ 0.50 | Implementar adaptaciones |
| **Medio** | ≥ 0.25 | Monitoreo continuo |
| **Bajo** | < 0.25 | Medidas estándar |

**Implementación:** `server/services/riskModelService.js` (backend) y `src/lib/riskEngine.js` (frontend)

---

## 🌡️ Datos Climáticos CMIP6

### Fuente de Verdad

Tabla `climate_cells` en Supabase (PostGIS) con datos CMIP6 ensemble SSP5-8.5 para Perú.

### Variables Disponibles

| Variable | Descripción | Unidad |
|----------|-------------|--------|
| `txx` | Temperatura máxima extrema | °C |
| `hd35` | Días extremadamente calurosos (>35°C) | días/año |
| `rx1day` | Precipitación máxima en 1 día | mm |
| `rx5day` | Precipitación máxima en 5 días | mm |
| `cdd` | Días consecutivos secos | días |
| `cwd` | Días consecutivos húmedos | días |

### Horizontes Temporales

- **past** (histórico): 1995–2014
- **short_term**: 2020–2039 (SSP2-4.5)
- **mid_term**: 2040–2059 (SSP2-4.5)
- **worst_case**: 2071–2100 (SSP5-8.5)

---

## 🔌 API Endpoints Principales

### Activos

```
GET    /api/assets              # Lista todos los activos
GET    /api/assets/:id          # Detalle de un activo
POST   /api/assets              # Crea un activo
PUT    /api/assets/:id          # Actualiza un activo
DELETE /api/assets/:id          # Elimina un activo
POST   /api/assets/bulk         # Carga masiva
```

### Modelo de Riesgo

```
POST   /api/risk-model          # Calcula H×E×I completo
Body: { "asset": {...}, "maxArea": 5000, "elNinoMultiplier": 1.0 }
```

### Análisis Climático (Phase 2)

```
POST   /api/v2/climate-risk-analysis
Body: { "lat": -12.04, "lon": -77.03, "sector": "retail", "asset_type": "supermercado_grande" }
```

Pipeline de 6 capas:
1. **Layer1**: Fusión de datos climáticos (climate_cells + GRI + Open-Meteo + World Bank)
2. **Layer2**: Detección de señales de riesgo
3. **Layer3**: Evaluación de riesgo de negocio (H×E×I)
4. **Layer4**: Priorización de riesgos
5. **Layer5**: Recomendaciones de adaptación
6. **Layer6**: Generación de narrativa ejecutiva

### Datos Climáticos CMIP6

```
GET    /api/climate-cells/query?lat=X&lon=Y    # Punto más cercano en grilla
POST   /api/climate-cells/upload               # Carga archivo JSON/JSONL
GET    /api/climate-risks/lookup               # Riesgo climático para coordenadas
```

### Riesgos Externos

```
GET    /api/external-risks/lookup?lat=X&lng=Y  # Riesgos GRI + infraestructura
```

### Búsqueda Geográfica

```
GET    /api/search?q=query                     # Búsqueda híbrida (Supabase + Google + Mapbox)
```

### Documentos Climáticos

```
POST   /api/documentos/upload                  # Sube documento (multipart)
GET    /api/documentos                         # Lista documentos
DELETE /api/documentos/:id                     # Elimina documento
GET    /api/documentos/context                 # Catálogo para enriquecimiento IA
```

### Alertas

```
GET    /api/alerts                             # Lista alertas de riesgo
POST   /api/alerts                             # Crea nueva alerta
PUT    /api/alerts/:id                         # Actualiza alerta
DELETE /api/alerts/:id                         # Elimina alerta
```

### ENSO (El Niño/La Niña) - Sprint 5

```
GET    /api/enso/status                        # Estado actual ENSO
POST   /api/enso/refresh                       # Actualiza caché ENSO
GET    /api/enso/cache-stats                   # Estadísticas de caché
```

### Terreno - Sprint 6

```
GET    /api/terrain/slope?lat=X&lng=Y          # Pendiente del terreno
GET    /api/terrain/cache-stats                # Estadísticas de caché
DELETE /api/terrain/cache                      # Limpia caché de terreno
```

### IA (Gemini)

```
POST   /api/ai                                 # Genera reporte TCFD/ESRS
Body: { "prompt": "..." }
```

---

## 🛠️ Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Vite dev server (HMR) |
| `npm run server` | Express backend (nodemon) |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |

### Scripts ETL (directorio `/scripts/`)

| Script | Propósito |
|--------|-----------|
| `test-climate-api.js` | Suite de pruebas de integración API |
| `test-jsonl-upload.js` | Pruebas de rendimiento para carga JSONL |
| `transform-climate-data.js` | Convierte datos CMIP6 a formato climate_cells |

**Uso:**
```bash
node scripts/test-climate-api.js
node scripts/test-jsonl-upload.js
node scripts/transform-climate-data.js input.csv output.jsonl
```

---

## 🔐 Variables de Entorno

Ver `.env.example` para la lista completa. Las variables `VITE_*` son expuestas al frontend por Vite.

**Principales:**
- `SUPABASE_URL` / `SUPABASE_KEY` - Conexión a base de datos
- `GEMINI_API_KEY` - API de Google Gemini para IA
- `WEATHER_API_KEY` - WeatherAPI para clima actual
- `GOOGLE_GEOCODING_KEY` - Google Geocoding para búsqueda de direcciones
- `MAPBOX_TOKEN` - Mapbox para búsqueda geográfica alternativa
- `VITE_API_URL` - URL del backend (frontend)
- `PORT` - Puerto del servidor Express (default: 3001)

---

## 🏗️ Arquitectura del Sistema

### Flujo Principal: Análisis de Riesgo

```
Usuario ingresa coordenadas
  ↓
GET /api/climate-risks/lookup?lat=X&lng=Y
  ↓
supabase.rpc('get_climate_by_location', { p_lat, p_lon })
  ↓
climate_cells (PostGIS nearest-cell lookup)
  ↓
(opcional) GET /api/external-risks/lookup → GRI API
  ↓
(opcional) POST /api/v2/climate-risk-analysis → Layer1–6 pipeline
  ↓
Retorna análisis completo con riesgos por horizonte
```

### Archivos Protegidos (No Modificar Sin Plan)

| Archivo | Razón |
|---------|-------|
| `server/layers/Layer1_ClimateDataFusion.js` | Core data fusion |
| `server/layers/Layer2_SignalEngine.js` | CMIP6 signal detection |
| `server/layers/Layer3_BusinessRiskEngine.js` | H×E×I business risk |
| `server/layers/Layer4_PrioritizationEngine.js` | Risk ranking |
| `server/layers/Layer5_AdaptationEngine.js` | Adaptation recommendations |
| `server/layers/Layer6_NarrativeEngine.js` | Executive narrative |
| `server/services/riskModelService.js` | H×E×I scoring source of truth |
| `server/services/climateImportService.js` | ETL pipeline |
| `server/services/ensoService.js` | ENSO (El Niño/La Niña) data service |
| `server/services/terrainService.js` | Terrain slope analysis service |
| `server/services/griRiskService.js` | GRI external risks integration |
| `server/services/worldBankService.js` | World Bank socioeconomic data |
| `server/supabaseClient.js` | Singleton DB connection |
| `src/pages/ClimateRiskLookup.jsx` | Primary lookup flow |
| `src/pages/AssetDetail.jsx` | Primary asset risk display |
| `src/pages/Dashboard.jsx` | Primary KPI + map view |

---

## 📚 Documentación Adicional

| Documento | Contenido |
|-----------|-----------|
| `scripts/README.md` | Documentación de scripts ETL |

---

## 🚨 Troubleshooting

### Backend no conecta a Supabase
- Verificar `SUPABASE_URL` y `SUPABASE_KEY` en `.env`
- Verificar que la tabla `climate_cells` existe en Supabase

### "relation 'climate_cells' does not exist"
- Ejecutar scripts SQL de creación de tabla en Supabase Dashboard

### GET /api/climate-risks/lookup devuelve 404
- Cargar datos con `POST /api/climate-cells/upload`
- Verificar: `SELECT COUNT(*) FROM climate_cells;` en Supabase

### Tests fallan
- Asegurar que `npm run server` está corriendo
- Verificar conectividad a Supabase

---

## 📄 Licencia

Proyecto interno Intercorp Retail.

---

**Última actualización:** Enero 2025
