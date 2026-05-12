# Scripts

Utilidades de línea de comandos para el pipeline de datos climáticos. Requieren que el servidor esté corriendo salvo que se indique lo contrario.

## Requisitos previos

```bash
npm run server   # inicia el backend en http://localhost:3001
```

---

## test-climate-api.js

**Propósito:** Suite de pruebas de integración para la API de `climate_cells`.

Valida los endpoints `/api/climate-cells/query`, `/api/climate-cells/upload` y `/api/climate-cells/status` sin necesidad de datos reales. Cubre coordenadas válidas, validación de errores, carga de registros de prueba y compatibilidad con el endpoint legado `/api/climate`.

```bash
node scripts/test-climate-api.js
```

**Salida esperada:** 8 pruebas con resultado ✅/⚠️ por cada caso.

---

## test-jsonl-upload.js

**Propósito:** Suite de pruebas de rendimiento y resiliencia para el endpoint `/api/climate-cells/upload`.

Genera datos sintéticos en formato JSONL y JSON array para validar: detección automática de formato, manejo de errores de parseo, validación de campos requeridos y throughput con lotes grandes (hasta 5000 registros).

```bash
node scripts/test-jsonl-upload.js
# o apuntando a otro entorno:
API_URL=https://mi-backend.onrender.com node scripts/test-jsonl-upload.js
```

**Salida esperada:** 11 pruebas con resumen de tasa de éxito.

---

## transform-climate-data.js

**Propósito:** Transforma el archivo `intercorp_riesgos_climaticos_db.json` al formato `climate_cells` compatible con el backend.

Agrupa registros por coordenada (lat/lon), mapea tipos de riesgo a variables climáticas estándar (txx, hd35, rx1day, etc.) y escribe el resultado en `intercorp_riesgos_climaticos_db_transformed.json`.

```bash
# Requiere intercorp_riesgos_climaticos_db.json en el directorio raíz
node scripts/transform-climate-data.js
```

Luego cargar el resultado al backend:

```bash
curl -X POST http://localhost:3001/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d @intercorp_riesgos_climaticos_db_transformed.json
```

**No requiere servidor activo** — lee y escribe archivos locales.
