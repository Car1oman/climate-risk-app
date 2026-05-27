# Climate Risk App — Intercorp Retail

Plataforma de análisis de riesgo climático para activos de retail en Perú. Usa datos CMIP6 ensemble (SSP2-4.5 y SSP5-8.5) para proyecciones a 2020–2080 y un modelo descriptivo multicapa para cuantificar señales, impacto operacional e incertidumbre.

**Stack:** React 18 + Vite 6 · Express.js · Supabase/PostgreSQL + PostGIS · Google Gemini · Tailwind CSS + shadcn/ui · Leaflet · Recharts

---

## Inicio Rapido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# → editar .env con las claves reales

# 3. Iniciar en desarrollo (dos terminales)
npm run dev       # Frontend en http://localhost:5173
npm run server    # Backend en http://localhost:3001

# 4. Ejecutar tests
npm test                    # Suite completa (770+ tests)
npm run test:frontend       # Tests de frontend (normalización, narrativa)
npm run test:regression     # Tests de regresión (Layers 2, 7, 8, 9, 10, 11)
npm run test:baselines      # Validación de escenarios baseline

# 5. Quality gate
npm run quality             # Lint + typecheck
npm run ci                  # Quality + build
```

---

## Estructura del Proyecto

```
climate-risk-app/
├── src/                          # Frontend (React + Vite)
│   ├── pages/                    # Paginas principales (React Router)
│   │   ├── ClimateRiskLookup.jsx #  Analisis climatico por coordenadas
│   │   ├── Dashboard.jsx         #  Resumen ejecutivo de activos
│   │   ├── RiskMap.jsx           #  Mapa interactivo de riesgos
│   │   ├── Assets.jsx            #  Lista y gestion de activos
│   │   ├── AssetDetail.jsx       #  Detalle y modelo H×E×I por activo
│   │   ├── Alerts.jsx            #  Gestion de alertas de riesgo
│   │   ├── Report.jsx            #  Generacion de reportes TCFD/ESRS
│   │   ├── DocumentosClimaticos.jsx # Gestion de documentos climaticos
│   │   ├── DataManagement.jsx    #  Administracion de datos
│   │   └── LoginPage.jsx         #  Pagina de autenticacion
│   ├── features/                 # Modulos funcionales desacoplados
│   │   └── climate-lookup/       # Feature principal: busqueda de riesgo climatico
│   │       ├── index.jsx         #       Punto de entrada
│   │       ├── constants.js      #       Constantes del feature
│   │       ├── utils.js          #       Utilidades especificas
│   │       ├── hooks/            #       Hooks de React
│   │       │   └── useClimateAnalysis.js  # Hook central: fetch, normaliza, narrativa
│   │       └── components/       #       Componentes del feature
│   │           ├── SearchPanel.jsx, MapView.jsx, AnalysisLoading.jsx
│   │           ├── ExecutiveSummaryCard.jsx, RiskTimeline.jsx
│   │           ├── RiskPeriodTabs.jsx, RiskPeriodSection.jsx
│   │           ├── ConsolidatedRiskCard.jsx, AdaptationPanel.jsx
│   │           ├── AIPanel.jsx, TerritorialContextPanel.jsx
│   │           ├── TraceabilityWidgets.jsx, ScientificFooter.jsx
│   ├── domain/                   # Capa de dominio (logica pura, sin UI)
│   │   ├── consolidatedRisk.ts   #       Modelo ConsolidatedRisk
│   │   ├── normalizeRisks.ts     #       Normaliza senales API → 7 tipos canonicos
│   │   ├── buildNarrativeReport.ts #     Ensambla NarrativeReport
│   │   ├── buildOperationalNarrative.ts # Narrativas operacionales limpias
│   │   └── sanitizeNarrative.ts  #       Sanitiza texto tecnico (40+ patrones regex)
│   ├── components/               # Componentes reutilizables
│   │   ├── layout/               #     Sidebar, TopBar, AppLayout
│   │   ├── climate/              #     HistoricalEventsCard, ProjectionScenarioCard,
│   │   │                         #     ClimateStoryCard, TerrainContextCard,
│   │   │                         #     ScientificEvidenceCard, MethodologyPanel
│   │   ├── dashboard/            #     TopRisksTable, AlertsFeed, StatCard
│   │   ├── ui/                   #     shadcn/ui (20+ componentes: button, card, dialog, etc.)
│   │   ├── BulkAssetUpload.jsx   #     Carga masiva de activos
│   │   └── BulkClimateUpload.jsx #     Carga masiva de datos climaticos
│   ├── constants/                # Constantes de dominio
│   │   ├── scenarios.ts          #       TIME_WINDOWS_UI, SCENARIO_DISPLAY, HORIZON_TO_PERIOD
│   │   └── riskTypes.ts          #       RISK_TYPE_DISPLAY, METRIC_DISPLAY, SCENARIO_DISPLAY
│   ├── hooks/                    # Hooks compartidos
│   │   ├── useAlerts.js          #     Alertas
│   │   └── useAssets.js          #     Activos
│   ├── lib/                      # Librerias compartidas
│   │   ├── api.js                #     Cliente HTTP hacia el backend
│   │   ├── supabase.js           #     Cliente Supabase (anon)
│   │   ├── AuthContext.jsx       #     Contexto de autenticacion
│   │   ├── query-client.js       #     React Query client
│   │   ├── utils.js              #     cn() helper
│   │   ├── methodologyConfig.js  #     Configuracion metodologica
│   │   └── enterprisePdfReport.js#     Generacion de PDF (jsPDF)
│   └── types/                    # Declaraciones TypeScript
│       ├── domain.d.ts           #     8 entidades compartidas (362 lines)
│       └── leaflet.d.ts          #     Tipos de Leaflet
├── server/                       # Backend (Express.js)
│   ├── server.js                 #     Entry point Express
│   ├── config/                   #     env.js, corsOptions.js
│   ├── routes/                   #     10 modulos de rutas
│   │   ├── health.js             #     /api/test, health probes
│   │   ├── climate.js            #     /api/climate, /api/climate-cells/*,
│   │   │                         #     /api/climate-risks/*, /api/external-risks/*,
│   │   │                         #     /api/v2/climate-risk-analysis
│   │   ├── assets.js             #     /api/assets CRUD
│   │   ├── ai.js                 #     /api/ai (Gemini)
│   │   ├── alerts.js             #     /api/alerts CRUD
│   │   ├── documentos.js         #     /api/documentos upload/list/delete
│   │   ├── search.js             #     /api/search, /api/places/assets
│   │   ├── enso.js               #     /api/enso/status, refresh, cache-stats
│   │   └── terrain.js            #     /api/terrain/slope, cache-stats, cache
│   ├── middleware/               #     5 middlewares
│   │   ├── auth.js               #     Autenticacion
│   │   ├── validate.js           #     Validacion con Zod
│   │   ├── errorHandler.js       #     Manejo centralizado de errores
│   │   ├── rateLimiter.js        #     Rate limiting
│   │   ├── requestLogger.js      #     Logging de requests
│   │   └── requestId.js          #     Generacion de IDs unicos
│   ├── validators/               #     Esquemas Zod por endpoint
│   │   ├── climate.js, alerts.js, assets.js, ai.js
│   ├── services/                 #     12+ servicios externos
│   │   ├── climateService.js     #     Orquestacion de datos climaticos
│   │   ├── climateImportService.js#    Pipeline ETL
│   │   ├── openMeteoService.js   #     Open-Meteo API + cache
│   │   ├── ensoService.js        #     ENSO (El Nino/La Nina)
│   │   ├── terrainService.js     #     Pendiente del terreno (SRTM)
│   │   ├── griRiskService.js     #     Riesgos GRI Oxford
│   │   ├── worldBankService.js   #     Datos socioeconomicos
│   │   ├── documentosService.js  #     Gestion de documentos
│   │   ├── documentosEnrichmentService.js # Enriquecimiento IA
│   │   └── supabaseClient.js     #     Singleton Supabase
│   ├── layers/                   #     Pipeline Phase 2 (Layers 1–6)
│   │   ├── Layer1_ClimateDataFusion.js
│   │   ├── Layer2_SignalEngine.js
│   │   ├── Layer3_BusinessRiskEngine.js
│   │   ├── Layer5_AdaptationEngine.js
│   │   └── Layer6_NarrativeEngine.js
│   ├── scientific/               #     Motores cientificos (Layers 7–11)
│   │   ├── domain.js             #     Layer 7: Scientific Domain Model
│   │   ├── interpretation.js     #     Layer 8: Scientific Interpretation Engine
│   │   ├── historical.js         #     Layer 9: Historical Climate Engine
│   │   ├── projection.js         #     Layer 10: Projection Scenario Engine
│   │   ├── storytelling.js       #     Layer 11: Scientific Storytelling Engine
│   │   └── governance.js         #     Layer 12: Scientific Governance Layer
│   ├── shared/cache.js           #     Utilidad de cache compartida
│   ├── errors/AppError.js        #     Clase de error personalizada
│   └── types/index.js            #     Definiciones de tipos compartidos
├── tests/                        # Suites de tests
│   ├── frontend/                 #     Tests unitarios del frontend
│   │   ├── normalizeRisks.test.js
│   │   ├── buildNarrativeReport.test.js
│   │   ├── sanitizeNarrative.test.js
│   │   └── sprint22_interactive_timeline.test.js
│   ├── regression/               #     Tests de regresion por motor
│   │   ├── layer2-signal-engine.test.js
│   │   ├── layer7-interpretation-engine.test.js
│   │   ├── layer8-historical-engine.test.js
│   │   ├── layer9-projection-engine.test.js
│   │   ├── layer10-storytelling-engine.test.js
│   │   └── layer11-governance-engine.test.js
│   └── baselines/                #     Validacion de escenarios baseline
│       ├── baseline-validation.test.js
│       └── scenarios.js
├── scripts/                      # Herramientas ETL de datos climaticos
│   ├── test-climate-api.js       #     Suite de integracion (8 tests)
│   ├── test-jsonl-upload.js      #     Pruebas de rendimiento (11 tests)
│   └── transform-climate-data.js #     Conversor CSV → JSONL
├── entities/                     # Esquemas JSON de entidades
│   ├── Asset                     #     26 propiedades
│   └── RiskAlert                 #     8 propiedades
├── supabase/migrations/          # Migraciones SQL
│   └── 20260512_create_alerts_table.sql
├── docs/                         # Documentacion tecnica
│   ├── SCIENTIFIC_METHOD.md      #     Metodologia cientifica completa
│   ├── DATA_SOURCES.md           #     8 fuentes de datos catalogadas
│   └── UNCERTAINTY_POLICY.md     #     Politica de incertidumbre
└── project-memory/               # Memoria del proyecto
    ├── auditoria.md              #     Auditoria estructural (19 hallazgos)
    └── HISTORIAL_SPRINTS.md      #     Historial de Sprints 12–22
```

---

## Paginas de la Aplicacion

| Ruta | Pagina | Descripcion |
|------|--------|-------------|
| `/` | ClimateRiskLookup | Analisis climatico por coordenadas (main) |
| `/dashboard` | Dashboard | Resumen ejecutivo de activos con KPIs |
| `/map` | RiskMap | Mapa interactivo de riesgos |
| `/assets` | Assets | Lista y gestion de activos |
| `/assets/:id` | AssetDetail | Detalle y modelo H×E×I por activo |
| `/alerts` | Alerts | Gestion de alertas de riesgo |
| `/report` | Report | Generacion de reportes TCFD/ESRS |
| `/documentos` | DocumentosClimaticos | Gestion de documentos climaticos |
| `/data-management` | DataManagement | Administracion de datos |

---

## Modelo de Riesgo Descriptivo

### Formula Conceptual

```
R = (H × 0.40) + (E × 0.30) + (I × 0.30)
```

| Variable | Descripcion | Peso |
|----------|-------------|------|
| **H** (Hazard) | Score de amenazas climaticas | 40% |
| **E** (Exposure) | Exposicion fisica del activo | 30% |
| **I** (Impact) | Impacto financiero estimado | 30% |
| **R** (Risk) | Score final normalizado 0–1 | — |

### Principios

La plataforma es **descriptiva, no prescriptiva**: reporta senales observables y proyectadas, su base cientifica y opciones de adaptacion. No produce scores de riesgo agregados, rankings, estimaciones de perdida financiera ni mandatos de accion.

---

## Base de Datos (Supabase/PostgreSQL + PostGIS)

### Schema Completo

| Tabla | Descripcion | Columnas Clave |
|-------|-------------|----------------|
| `places` | Direcciones georreferenciadas | `id` (uuid PK), `direccion`, `direccion_normalizada`, `lat`, `lng`, `geom` (PostGIS), `source` |
| `assets` | Activos comerciales vinculados a `places` | `id` (uuid PK), `place_id` (FK→places), `name`, `unidad_negocio`, `nombre_normalizado`, `status` |
| `activos` | Activos legacy (coordenadas directas) | `id` (bigint PK), `unidad_negocio`, `direccion`, `lat`, `lon`, `geom` |
| `asset_metrics` | Metricas operacionales por activo | `id` (uuid PK), `asset_id`, `monthly_sales`, `area_m2`, `num_employees`, `condition` |
| `hazards` | Scores de amenazas (0–1) por activo | `id` (uuid PK), `asset_id`, `flood`, `el_nino`, `earthquake`, `landslide`, `drought` |
| `risk_components` | Componentes H×E×I por activo | `id` (uuid PK), `asset_id`, `hazard_score`, `exposure_score`, `impact_score` |
| `risk_scores` | Score de riesgo final por activo | `id` (uuid PK), `asset_id`, `risk_score`, `risk_level` (bajo/medio/alto/critico), `financial_impact` |
| `recommendations` | Recomendaciones de adaptacion | `id` (uuid PK), `asset_id`, `content`, `source` |
| `alerts` | Alertas de riesgo climatico | `id` (uuid PK), `title`, `severity` (critical/warning/info), `type`, `region`, `asset_id` (FK→assets), `is_active` |
| `climate_cells` | Datos CMIP6 ensemble (PostGIS nearest-cell) | `id` (bigint PK), `lat`, `lon`, `geom` (PostGIS), `data` (jsonb) |
| `climate_data` | Datos meteorologicos actuales | `id` (uuid PK), `lat`, `lng`, `temperature`, `humidity`, `wind_kph`, `precipitation`, `source` |
| `climate_dataset_control` | Control de version de dataset activo | `id` (uuid PK), `version`, `is_active` |
| `archivos` | Archivos/documentos climaticos | `id` (bigint PK), `nombre`, `tipo` (pdf/xls/xlsx/doc/docx), `url`, `tamanio_bytes` |
| `function_audit_debug` | Auditoria de funciones DB | `id` (bigint PK), `function_name`, `execution_success`, `error_message`, `inspected_at` |
| `spatial_ref_sys` | Catalogo de sistemas de referencia espacial (PostGIS nativo) | `srid` (integer PK), `auth_name`, `auth_srtext`, `proj4text` |

### Fuente de Verdad (CMIP6)

La tabla `climate_cells` contiene datos CMIP6 ensemble en formato `jsonb` con la siguiente estructura interna:

```json
{
  "scenario": "SSP5-8.5",
  "variables": {
    "txx": { "past": 32.5, "short_term": 34.1, "mid_term": 35.8, "long_term": 37.2 },
    "rx1day": { "past": 45.2, "short_term": 52.1, "mid_term": 58.3, "long_term": 63.7 }
  }
}
```

### Relaciones Clave

```
places (1) ──→ (N) assets (1) ──→ (N) asset_metrics
                                    (N) hazards
                                    (N) risk_components
                                    (N) risk_scores
                                    (N) recommendations
                                    (N) alerts
```

### Escenarios

| Escenario | SSP | Descripcion |
|-----------|-----|-------------|
| `emisiones_moderadas` | SSP2-4.5 | Trayectoria media-alta |
| `altas_emisiones` | SSP5-8.5 | Trayectoria pesimista (business-as-usual) |

### Variables Disponibles

| Variable | Descripcion | Unidad |
|----------|-------------|--------|
| `txx` | Temperatura maxima extrema | °C |
| `hd35` | Dias extremadamente calurosos (>35°C) | dias/ano |
| `hd40` | Dias muy extremos (>40°C) | dias/ano |
| `tr` | Noches tropicales (>20°C) | noches/ano |
| `pr` | Cambio en precipitacion | % |
| `rx1day` | Precipitacion maxima en 1 dia | mm |
| `rx5day` | Precipitacion maxima en 5 dias | mm |
| `cdd` | Dias consecutivos secos | dias |
| `cwd` | Dias consecutivos humedos | dias |
| `spei` | Indice de estres hidrico | — |
| `oni` | Variabilidad climatica El Nino | °C |

### Horizontes Temporales

| Periodo UI | Etiqueta | Rango | Escenarios |
|------------|----------|-------|------------|
| `historico` | Historico | 1980–2014 | Observado |
| `corto_plazo` | Corto plazo | 2020–2039 | SSP2-4.5, SSP5-8.5 |
| `mediano_plazo` | Mediano plazo | 2040–2059 | SSP2-4.5, SSP5-8.5 |
| `largo_plazo` | Largo plazo | 2060–2080 | SSP5-8.5 |

### 7 Tipos de Riesgo Canonicos

| Tipo | Label UI | Descripcion |
|------|----------|-------------|
| `lluvias_extremas` | Lluvias extremas | Precipitacion que supera umbrales historicos |
| `calor_extremo` | Calor extremo | Temperaturas muy por encima del promedio |
| `sequia` | Sequia | Deficit hidrico prolongado |
| `deslizamiento` | Deslizamiento | Movimiento de masas por pendiente + lluvia |
| `heladas` | Heladas | Temperaturas bajo cero |
| `fenomeno_enso` | Fenomeno El Nino / La Nina | Variabilidad interanual ENSO |
| `inundacion` | Inundacion | Desborde de cuerpos de agua |

---

## Pipeline de Analisis (11 Capas)

```
Layer 1  - ClimateDataFusion      Fusion de datos climaticos (CMIP6 + GRI + Open-Meteo + World Bank)
Layer 2  - SignalEngine           Deteccion de senales de riesgo con umbrales cuantitativos
Layer 3  - BusinessRiskEngine     Interpretacion de impacto operacional por tipo de activo
Layer 5  - AdaptationEngine       Medidas de adaptacion descriptivas
Layer 6  - NarrativeEngine        Narrativa ejecutiva resumida
Layer 7  - ScientificDomain       Modelo de dominio cientifico
Layer 8  - ScientificInterpretation  Interpretacion cientifica contextual
Layer 9  - HistoricalClimateEngine   Motor de clima historico
Layer 10 - ProjectionScenarioEngine  Motor de proyecciones por escenario
Layer 11 - ScientificStorytelling    Narrativa cientifica estructurada
Layer 12 - ScientificGovernance      Capa de gobernanza cientifica
```

---

## API Endpoints Principales

### Salud

```
GET    /api/test                        # Health check
```

### Activos

```
GET    /api/assets              # Lista todos los activos
GET    /api/assets/:id          # Detalle de un activo
POST   /api/assets              # Crea un activo
PUT    /api/assets/:id          # Actualiza un activo
DELETE /api/assets/:id          # Elimina un activo
POST   /api/assets/bulk         # Carga masiva
```

### Analisis de Riesgo Climatico

```
GET    /api/climate-risks/lookup?lat=X&lng=Y    # Riesgo climatico para coordenadas
POST   /api/v2/climate-risk-analysis             # Pipeline completo Layers 1–6
Body: { "lat": -12.04, "lon": -77.03, "sector": "retail", "asset_type": "supermercado_grande" }
```

### Datos Climaticos (CMIP6)

```
GET    /api/climate-cells/query?lat=X&lon=Y    # Punto mas cercano en grilla
POST   /api/climate-cells/upload               # Carga archivo JSON/JSONL
```

### Riesgos Externos

```
GET    /api/external-risks/lookup?lat=X&lng=Y  # Riesgos GRI + infraestructura
```

### Busqueda Geografica

```
GET    /api/search?q=query                     # Busqueda hibrida (Supabase + Google + Mapbox)
GET    /api/places/assets                      # Activos como lugares para busqueda
```

### Documentos Climaticos

```
POST   /api/documentos/upload                  # Sube documento (multipart)
GET    /api/documentos                         # Lista documentos
DELETE /api/documentos/:id                     # Elimina documento
GET    /api/documentos/context                 # Catalogo para enriquecimiento IA
```

### Alertas

```
GET    /api/alerts                             # Lista alertas de riesgo
POST   /api/alerts                             # Crea nueva alerta
PUT    /api/alerts/:id                         # Actualiza alerta
DELETE /api/alerts/:id                         # Elimina alerta
```

### ENSO (El Nino/La Nina)

```
GET    /api/enso/status                        # Estado actual ENSO (ONI)
POST   /api/enso/refresh                       # Actualiza cache ENSO
GET    /api/enso/cache-stats                   # Estadisticas de cache
```

### Terreno

```
GET    /api/terrain/slope?lat=X&lng=Y          # Pendiente del terreno (SRTM)
GET    /api/terrain/cache-stats                # Estadisticas de cache
DELETE /api/terrain/cache                      # Limpia cache de terreno
```

### IA (Gemini)

```
POST   /api/ai                                 # Genera reporte TCFD/ESRS
Body: { "prompt": "..." }
```

---

## Scripts Disponibles

### NPM

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Vite dev server (HMR) |
| `npm run server` | Express backend (node) |
| `npm run build` | Build de produccion |
| `npm run preview` | Preview del build |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run typecheck` | TypeScript validation |
| `npm run quality` | Lint + typecheck |
| `npm run ci` | Quality + build |
| `npm test` | Suite completa (770+ tests) |
| `npm run test:frontend` | Tests de frontend |
| `npm run test:regression` | Tests de regresion (Layers 2, 7–11) |
| `npm run test:baselines` | Validacion de escenarios baseline |

### ETL (/scripts/)

| Script | Proposito |
|--------|-----------|
| `test-climate-api.js` | Suite de pruebas de integracion API (8 tests) |
| `test-jsonl-upload.js` | Pruebas de rendimiento para carga JSONL (11 tests) |
| `transform-climate-data.js` | Convierte datos CMIP6 a formato climate_cells |

**Uso:**
```bash
node scripts/test-climate-api.js
node scripts/test-jsonl-upload.js
node scripts/transform-climate-data.js input.csv output.jsonl
```

---

## Variables de Entorno

Ver `.env.example` para la lista completa. Las variables `VITE_*` son expuestas al frontend por Vite.

**Principales:**
| Variable | Descripcion |
|----------|-------------|
| `SUPABASE_URL` / `SUPABASE_KEY` | Conexion a base de datos (service role) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Conexion frontend (anon key) |
| `GEMINI_API_KEY` | API de Google Gemini para IA |
| `WEATHER_API_KEY` | WeatherAPI para clima actual |
| `GOOGLE_GEOCODING_KEY` | Google Geocoding para busqueda de direcciones |
| `MAPBOX_TOKEN` | Mapbox para busqueda geografica alternativa |
| `VITE_API_URL` | URL del backend (frontend) |
| `PORT` | Puerto del servidor Express (default: 3001) |
| `NODE_ENV` | Entorno (development/production) |
| `ALLOWED_ORIGINS` | Origenes CORS permitidos |
| `DEV_AUTH_BYPASS` | Bypass de autenticacion en desarrollo |

---

## Arquitectura del Sistema

### Flujo Principal: Analisis de Riesgo

```
Usuario ingresa coordenadas / selecciona activo
  ↓
GET /api/climate-risks/lookup?lat=X&lng=Y
  ↓
SELECT * FROM climate_cells ORDER BY geom <-> ST_SetSRID(ST_MakePoint(lon, lat), 4326) LIMIT 1
  ↓
climate_cells.data (jsonb con variables CMIP6 por escenario y horizonte)
  ↓
(opcional) GET /api/external-risks/lookup → GRI API + Open-Meteo + World Bank
  ↓
(opcional) POST /api/v2/climate-risk-analysis → Layer1–6 pipeline
  ↓
Retorna analisis completo con riesgos por horizonte
  ↓
Frontend: normalizeRisks() → 7 tipos canonicos
  ↓
ConsolidatedRiskTimeline → UI con 3 periodos
  ↓
buildNarrativeReport() → Narrativa ejecutiva

### Flujo: Activos con Riesgo

```
places (direccion, lat, lng) ──→ assets (name, unidad_negocio)
                                    ↓
                              hazards (flood, el_nino, earthquake, landslide, drought)
                              risk_components (hazard_score, exposure_score, impact_score)
                              risk_scores (risk_score, risk_level, financial_impact)
                              recommendations (content, source)
```

### Flujo de Tests

```
npm test
  ├── test:frontend (4 suites)
  │   ├── normalizeRisks.test.js
  │   ├── buildNarrativeReport.test.js
  │   ├── sanitizeNarrative.test.js
  │   └── sprint22_interactive_timeline.test.js
  ├── test:regression (6 suites)
  │   ├── layer2-signal-engine.test.js
  │   ├── layer7-interpretation-engine.test.js
  │   ├── layer8-historical-engine.test.js
  │   ├── layer9-projection-engine.test.js
  │   ├── layer10-storytelling-engine.test.js
  │   └── layer11-governance-engine.test.js
  └── test:baselines (1 suite)
      └── baseline-validation.test.js
```

### Archivos Protegidos (No Modificar Sin Plan)

| Archivo | Razon |
|---------|-------|
| `server/layers/Layer1_ClimateDataFusion.js` | Core data fusion |
| `server/layers/Layer2_SignalEngine.js` | CMIP6 signal detection |
| `server/layers/Layer3_BusinessRiskEngine.js` | Contextual business interpretation |
| `server/layers/Layer5_AdaptationEngine.js` | Descriptive adaptation measures |
| `server/layers/Layer6_NarrativeEngine.js` | Executive narrative |
| `server/scientific/domain.js` | Scientific Domain Model |
| `server/scientific/interpretation.js` | Scientific Interpretation Engine |
| `server/scientific/historical.js` | Historical Climate Engine |
| `server/scientific/projection.js` | Projection Scenario Engine |
| `server/scientific/storytelling.js` | Scientific Storytelling Engine |
| `server/scientific/governance.js` | Scientific Governance Layer |
| `server/services/climateImportService.js` | ETL pipeline |
| `server/services/ensoService.js` | ENSO (El Nino/La Nina) data service |
| `server/services/terrainService.js` | Terrain slope analysis service |
| `server/services/griRiskService.js` | GRI external risks integration |
| `server/services/worldBankService.js` | World Bank socioeconomic data |
| `server/supabaseClient.js` | Singleton DB connection |
| `src/domain/normalizeRisks.ts` | Risk normalization core logic |
| `src/domain/consolidatedRisk.ts` | ConsolidatedRisk domain model |
| `src/features/climate-lookup/hooks/useClimateAnalysis.js` | Central hook |
| `src/pages/ClimateRiskLookup.jsx` | Primary lookup flow |
| `src/pages/Dashboard.jsx` | Primary KPI + map view |
| `src/pages/AssetDetail.jsx` | Primary asset risk display |

---

## Documentacion

| Documento | Contenido |
|-----------|-----------|
| `docs/SCIENTIFIC_METHOD.md` | Metodologia cientifica completa: taxonomia de 10 senales, modelo H×E×I, capas 2–11, controles de calidad |
| `docs/DATA_SOURCES.md` | 8 fuentes de datos catalogadas: CMIP6 CCKP, IPCC AR6, NASA SRTM, INGEMMET, NOAA CPC, WRI Aqueduct, SENAMHI, GRI Oxford |
| `docs/UNCERTAINTY_POLICY.md` | Tres fuentes de incertidumbre, marco de confianza, propagacion a traves de capas, lenguaje prohibido |
| `scripts/README.md` | Documentacion de scripts ETL |
| `project-memory/auditoria.md` | Auditoria estructural (19 hallazgos: P0, P1, P2, P3) |
| `project-memory/HISTORIAL_SPRINTS.md` | Historial de Sprints 12–22 |

---

## Troubleshooting

### Backend no conecta a Supabase
- Verificar `SUPABASE_URL` y `SUPABASE_KEY` en `.env`
- Verificar que las tablas existen: `SELECT table_name FROM information_schema.tables WHERE table_schema='public';`

### "relation 'climate_cells' does not exist"
- Ejecutar migraciones SQL desde `supabase/migrations/` en Supabase Dashboard
- Verificar: `SELECT COUNT(*) FROM climate_cells;`

### "relation 'places' does not exist" o "relation 'assets' does not exist"
- Las tablas `places` y `assets` deben crearse antes que `alerts` (FK constraint)
- Orden sugerido: `places` → `assets` → `asset_metrics` / `hazards` / `risk_components` / `risk_scores` / `recommendations` / `alerts`

### GET /api/climate-risks/lookup devuelve 404
- Cargar datos con `POST /api/climate-cells/upload`
- Verificar: `SELECT COUNT(*) FROM climate_cells;`

### Los scores de riesgo se ven vacios
- Verificar `hazards`, `risk_components` y `risk_scores` tienen datos para el `asset_id` consultado
- Los scores se calculan en el backend o via mock; revisar `source` en `recommendations`

### Tests fallan
- Asegurar que `npm run server` esta corriendo
- Verificar conectividad a Supabase

---

## Licencia

Proyecto interno Intercorp Retail.

---

**Ultima actualizacion:** Mayo 2026
