# 📤 Guía de Carga JSONL - Endpoint `/api/climate-cells/upload`

## 📋 Resumen Ejecutivo

El endpoint `POST /api/climate-cells/upload` ahora soporta **uploading JSONL (JSON Lines)** con:
- ✅ **Detección automática** de formato (JSON vs JSONL)
- ✅ **Parseo línea-por-línea** resistente a errores
- ✅ **Validación granular** por registro
- ✅ **UPSERT eficiente** en base de datos
- ✅ **Estadísticas detalladas** de 3 fases del pipeline

---

## 🚀 Uso Rápido

### 1. Enviar Archivo JSONL

```bash
curl -X POST http://localhost:5000/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "data": "$(cat data.jsonl)",
  "format": "auto"
}
EOF
```

### 2. Enviar Archivo JSON Array

```bash
curl -X POST http://localhost:5000/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "data": "$(cat data.json)",
  "format": "auto"
}
EOF
```

### 3. Desde JavaScript/Node.js

```javascript
async function uploadClimateData(fileContent) {
  const response = await fetch('/api/climate-cells/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: fileContent,
      format: 'auto' // o 'json' o 'jsonl'
    })
  });
  
  const result = await response.json();
  console.log('Parse Phase:', result.phases.parse);
  console.log('Process Phase:', result.phases.process);
  console.log('Upsert Phase:', result.phases.upsert);
  return result;
}
```

---

## 📊 Formatos Soportados

### JSONL (JSON Lines) - RECOMENDADO PARA ETL

**Formato:** Una línea por registro, cada línea es un JSON válido

```jsonl
{"lat": -12.5, "lon": -75.5, "data": {"txx": 28.5, "hd35": 120}}
{"lat": -12.6, "lon": -75.6, "data": {"txx": 29.1, "hd35": 125}}
{"lat": -12.7, "lon": -75.7, "data": {"txx": 28.2, "hd35": 118}}
```

**Ventajas:**
- Procesamiento línea-por-línea (sin cargar archivo completo en memoria)
- Errores en una línea NO afectan otras líneas
- Ideal para archivos grandes
- Formato nativo de muchas herramientas ETL

### JSON Array - Formato Alternativo

**Formato:** Array de objetos

```json
[
  {"lat": -12.5, "lon": -75.5, "data": {"txx": 28.5, "hd35": 120}},
  {"lat": -12.6, "lon": -75.6, "data": {"txx": 29.1, "hd35": 125}},
  {"lat": -12.7, "lon": -75.7, "data": {"txx": 28.2, "hd35": 118}}
]
```

---

## 📝 Estructura de Registros

### Campos Requeridos

```javascript
{
  // Ubicación geoespacial (REQUERIDO)
  "lat": number,           // Latitud (-90 a 90)
  "lon": number,           // Longitud (-180 a 180)
  
  // Datos climáticos (REQUERIDO)
  "data": {
    // Cualquier variable climática
    "txx": number,         // Temperatura máxima histórica
    "hd35": number,        // Días con calor > 35°C
    "rx1day": number,      // Precipitación máxima en 1 día
    "cdd": number,         // Días seguidos sin lluvia
    // ... más variables según tu ETL
  }
}
```

### Campos Opcionales

```javascript
{
  "lat": number,
  "lon": number,
  "data": {...},
  
  // Geometría WKT opcional (si no la proporciones, se genera automáticamente)
  "geom": "POINT(-75.5 -12.5)",
  
  // Metadatos opcionales
  "cell_id": string,
  "region": string,
  "notes": string
}
```

---

## 📈 Respuesta del Endpoint

### Estructura Completa

```json
{
  "success": true,
  "phases": {
    "parse": {
      "detected_format": "jsonl",
      "total_records_parsed": 1500,
      "parse_errors": 3,
      "errors": [
        {
          "line": "42",
          "error": "Invalid JSON on line 42: Unexpected token"
        }
      ]
    },
    "process": {
      "valid_records": 1497,
      "normalized_records": 1497,
      "invalid_records": 3,
      "validation_errors": [
        {
          "line": 10,
          "record_index": 9,
          "message": "Missing required field: 'lat'",
          "record": {...}
        }
      ]
    },
    "upsert": {
      "total_processed": 1497,
      "batches_processed": 3,
      "duration_ms": 2450,
      "records_per_second": 611,
      "upsert_errors": []
    }
  },
  "summary": {
    "total_input_records": 1500,
    "successfully_processed": 1497,
    "skipped_invalid": 3,
    "database_errors": 0
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### Interpretación de Fases

#### 🔍 **Fase 1: Parse (Parseo)**
- Detecta automáticamente si es JSON o JSONL
- Lee línea-por-línea (JSONL) o completo (JSON)
- Continúa parsando incluso si encuentra errores
- **Resultado:** Array de registros parseados (incluso los "malos" se intenta parsear)

#### ✅ **Fase 2: Process (Validación & Normalización)**
- Valida cada registro (campos requeridos, tipos de datos)
- Normaliza la geometría (genera `POINT` si no existe)
- Separa registros válidos de inválidos
- **Resultado:** Registros listos para insertarse

#### 💾 **Fase 3: Upsert (Base de Datos)**
- Ejecuta UPSERT eficiente por lotes (batch de 500)
- Si (lat,lon) ya existe, actualiza; si no, inserta
- Registra errores de base de datos
- **Resultado:** Estadísticas de inserciones/actualizaciones

---

## 🔄 Pipeline Completo: Flujo de Datos

```
┌─────────────────────────────────────────────────────────────┐
│ INPUT: Archivo JSONL/JSON como String                      │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────▼─────────────┐
        │ FASE 1: PARSE             │
        │ - Auto-detect format      │
        │ - Línea-por-línea (JSONL) │
        │ - Tolerancia a errores    │
        └────────────────┬──────────┘
                         │
            ┌────────────▼──────────────┐
            │ Records Parseados         │
            │ (incluyendo los "malos")  │
            └────────────────┬──────────┘
                             │
              ┌──────────────▼──────────────────┐
              │ FASE 2: PROCESS                  │
              │ - Validar cada registro          │
              │ - Normalizar geometría           │
              │ - Separar válidos/inválidos      │
              └──────────────┬───────────────────┘
                             │
              ┌──────────────▼──────────────────┐
              │ Registros Válidos Normalizados  │
              │ (listos para DB)                 │
              └──────────────┬───────────────────┘
                             │
              ┌──────────────▼──────────────────┐
              │ FASE 3: UPSERT                   │
              │ - Batch processing (500 rec)    │
              │ - ON CONFLICT UPDATE            │
              │ - Estadísticas en tiempo real   │
              └──────────────┬───────────────────┘
                             │
                  ┌──────────▼─────────┐
                  │ ✅ ÉXITO           │
                  │ Datos en DB        │
                  │ + Estadísticas     │
                  └────────────────────┘
```

---

## 🛠️ Casos de Uso Comunes

### Caso 1: Carga Inicial de ETL

**Situación:** Tu ETL genera un archivo JSONL de 50,000 registros

**Proceso:**
```bash
# 1. Exportar JSONL desde ETL
python etl_pipeline.py > climate_data.jsonl

# 2. Cargar en el servidor
cat climate_data.jsonl | jq -Rs @json | curl -X POST \
  -H "Content-Type: application/json" \
  http://localhost:5000/api/climate-cells/upload \
  -d '{"data": '"$(cat climate_data.jsonl | jq -Rs .)"', "format": "jsonl"}'

# 3. Revisar estadísticas en la respuesta
```

**Resultado esperado:**
```json
{
  "success": true,
  "summary": {
    "total_input_records": 50000,
    "successfully_processed": 49998,
    "skipped_invalid": 2,
    "database_errors": 0
  }
}
```

### Caso 2: Actualización Parcial

**Situación:** Necesitas actualizar datos de ciertas celdas climáticas

**Proceso:**
1. Exporta solo las celdas que cambiaron desde tu ETL
2. Envía el JSONL con las mismas (lat, lon)
3. El endpoint detecta el UPSERT y actualiza automáticamente

```bash
# El endpoint detecta (lat,lon) existentes y actualiza el campo 'data'
curl -X POST http://localhost:5000/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "data": "{\"lat\": -12.5, \"lon\": -75.5, \"data\": {\"txx\": 29.5}}",
  "format": "jsonl"
}
EOF
```

**Resultado:**
- Si (lat,lon) existe: `UPDATE` el registro
- Si (lat,lon) no existe: `INSERT` nuevo registro

### Caso 3: Validación Previa

**Situación:** Quieres saber cuántos registros pasarán la validación antes de hacer UPSERT

**Proceso:**
1. Envía el archivo
2. Revisa `phases.process.valid_records` vs `invalid_records`
3. Si hay un 5% de rechazo o más, investigar errores

```javascript
const result = await fetch('/api/climate-cells/upload', {...});
const { phases, summary } = await result.json();

const validRatio = phases.process.valid_records / 
                   phases.parse.total_records_parsed;

if (validRatio < 0.95) {
  console.warn(`⚠️ Solo ${(validRatio * 100).toFixed(1)}% pasó validación`);
  console.log('Errores:', phases.process.validation_errors.slice(0, 10));
}
```

---

## 🐛 Troubleshooting

### Error: "Parámetro 'data' debe ser un string"

**Causa:** Enviaste data como array o objeto, no como string

**Solución:**
```javascript
// ❌ INCORRECTO
{ "data": [{lat: 10, lon: 20}] }

// ✅ CORRECTO  
{ "data": "[{\"lat\": 10, \"lon\": 20}]" }
```

### Error: "parse_errors" > 0 en respuesta

**Causa:** Algunos registros no son JSON válido

**Solución:**
1. Revisa `phases.parse.errors` para ver cuáles lines fallaron
2. Valida JSON manualmente: `cat data.jsonl | jq`
3. Corrige el ETL para generar JSON válido
4. El endpoint continúa procesando otros registros (no es bloqueante)

### Rendimiento Lento

**Síntoma:** `duration_ms` > 10 segundos para 10,000 registros

**Causas Posibles:**
- DB sobrecar
- Red lenta
- Archivo muy grande (>500 MB)

**Optimización:**
1. Divide el archivo en lotes de 10,000 registros
2. Envía lotes en paralelo (3-5 requests)
3. Monitorea: `records_per_second` debe ser > 100

---

## 📊 Monitoreo en Tiempo Real

### Script de Node.js para Monitorear Carga

```javascript
import fs from 'fs';

async function uploadAndMonitor(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const fileSize = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
  
  console.log(`📦 Cargando archivo: ${fileSize} MB`);
  
  const startTime = Date.now();
  const response = await fetch('http://localhost:5000/api/climate-cells/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: fileContent, format: 'auto' })
  });
  
  const result = await response.json();
  const totalTime = (Date.now() - startTime) / 1000;
  
  console.log('\n✅ Carga Completada');
  console.log('─'.repeat(60));
  console.log(`FASE 1 - PARSE`);
  console.log(`  Formato Detectado: ${result.phases.parse.detected_format}`);
  console.log(`  Registros Parseados: ${result.phases.parse.total_records_parsed}`);
  console.log(`  Errores: ${result.phases.parse.parse_errors}`);
  
  console.log(`\nFASE 2 - PROCESS`);
  console.log(`  Registros Válidos: ${result.phases.process.valid_records}`);
  console.log(`  Registros Inválidos: ${result.phases.process.invalid_records}`);
  
  console.log(`\nFASE 3 - UPSERT`);
  console.log(`  Registros Procesados: ${result.phases.upsert.total_processed}`);
  console.log(`  Duración: ${result.phases.upsert.duration_ms} ms`);
  console.log(`  Velocidad: ${result.phases.upsert.records_per_second.toFixed(0)} rec/sec`);
  
  console.log(`\nRESUMEN`);
  console.log(`  Total Input: ${result.summary.total_input_records}`);
  console.log(`  Exitosos: ${result.summary.successfully_processed}`);
  console.log(`  Descartados: ${result.summary.skipped_invalid}`);
  console.log(`  Errores DB: ${result.summary.database_errors}`);
  console.log(`  Tiempo Total: ${totalTime.toFixed(2)} segundos`);
}

uploadAndMonitor('data.jsonl');
```

---

## 🔗 Integración con ETL

### Python → Node.js

```python
import json
import requests

# Generar JSONL desde Python
def export_to_jsonl(data_list):
    return '\n'.join(json.dumps(item) for item in data_list)

# Cargar en el servidor
climate_data = [
    {"lat": -12.5, "lon": -75.5, "data": {"txx": 28.5}},
    # ... más registros
]

jsonl_content = export_to_jsonl(climate_data)

response = requests.post(
    'http://localhost:5000/api/climate-cells/upload',
    json={"data": jsonl_content, "format": "jsonl"}
)

result = response.json()
print(f"✅ {result['summary']['successfully_processed']} registros cargados")
```

### Procesamiento con GNU Parallel

```bash
# Dividir archivo grande en lotes
split -n l/10 huge_climate_data.jsonl chunk_

# Cargar lotes en paralelo
parallel --tag 'curl -X POST http://localhost:5000/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d "{\"data\": \"$(cat {})\", \"format\": \"jsonl\"}"' ::: chunk_*
```

---

## 📚 Referencias

- **API Completa:** [API_CLIMATE_CELLS.md](./API_CLIMATE_CELLS.md)
- **Arquitectura:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Setup Supabase:** [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- **Quick Start:** [QUICKSTART.md](./QUICKSTART.md)

---

**Versión:** 2.1 | **Último Update:** 2024-01-15 | **Estado:** ✅ Production Ready
