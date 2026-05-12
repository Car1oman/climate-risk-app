# Climate Risk App — Intercorp Retail

Plataforma de análisis de riesgo climático para activos de retail en Perú. Usa datos CMIP6 (SSP5-8.5) para proyecciones a 2050–2100 y un modelo H×E×I para cuantificar exposición financiera.

**Stack:** React + Vite (frontend) · Express.js (backend) · Supabase/PostgreSQL + PostGIS · Google Gemini

---

## Inicio rápido

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

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Vite dev server (HMR) |
| `npm run server` | Express backend (nodemon) |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |

---

## Estructura principal

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
└── scripts/              # Herramientas ETL de datos climáticos
```

---

## Páginas de la app

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | ClimateRiskLookup | Análisis climático por coordenadas (main) |
| `/dashboard` | Dashboard | Resumen ejecutivo de activos |
| `/map` | RiskMap | Mapa interactivo de riesgos |
| `/assets` | Assets | Lista y gestión de activos |
| `/assets/:id` | AssetDetail | Detalle y modelo H×E×I por activo |
| `/simulator` | Simulator | Simulación de escenarios climáticos |
| `/report` | Report | Generación de reportes TCFD/ESRS |
| `/documentos` | DocumentosClimaticos | Gestión de documentos climáticos |
| `/data-management` | DataManagement | Administración de datos |
| `/climate-upload` | ClimateDataUpload | Carga ETL de datos CMIP6 |

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| `ARCHITECTURE.md` | Diagrama de arquitectura y flujo de datos |
| `RISK_MODEL.md` | Fórmula H×E×I, parámetros y ejemplos |
| `CLIMATE_DATA_GUIDE.md` | Datos CMIP6, endpoints de carga, Pipeline Phase 2 |
| `API.md` | Referencia completa de endpoints del backend |

---

## Variables de entorno

Ver `.env.example` para la lista completa de variables requeridas.

Las variables `VITE_*` son expuestas al frontend por Vite. Las demás solo son accesibles en el backend.
