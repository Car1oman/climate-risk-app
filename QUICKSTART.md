# ⚡ Quick Start: Sistema de Climate Cells

**Tiempo total:** 30 minutos  
**Dificultad:** Intermedia

---

## TL;DR - Lo Esencial en 30 Segundos

```
1. Configura climate_cells en Supabase (SQL)
2. Carga datos transformados (API POST)
3. Consulta datos desde el mapa (API GET)
4. Muestra riesgos al usuario (UI)
```

---

## 📋 Paso 1: Supabase Setup (10 min)

### Opción A: Automático (Recomendado)
```sql
-- Copia TODO desde SUPABASE_SETUP.md
-- Pega en: Dashboard Supabase → SQL Editor
-- Ejecuta cada sección en orden
```

### Opción B: Manual mínimo
```sql
-- Habilitar PostGIS
CREATE EXTENSION IF NOT EXISTS "postgis" with schema "extensions";

-- Tabla básica
CREATE TABLE climate_cells (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lat FLOAT8 NOT NULL,
  lon FLOAT8 NOT NULL,
  geom GEOGRAPHY(POINT, 4326),
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(lat, lon)
);

-- Función de búsqueda
CREATE OR REPLACE FUNCTION get_nearest_climate_cell(
  p_lat FLOAT8, p_lon FLOAT8, p_radius_km INT DEFAULT 50
) RETURNS TABLE (
  id BIGINT, lat FLOAT8, lon FLOAT8, data JSONB, distance_m FLOAT8
) LANGUAGE SQL STABLE AS $$
  SELECT 
    c.id, c.lat, c.lon, c.data,
    ST_DistanceSphere(
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326), c.geom
    )::FLOAT8
  FROM climate_cells c
  WHERE ST_DWithin(c.geom, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326), p_radius_km * 1000)
  ORDER BY c.geom <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
  LIMIT 1;
$$;
```

✅ **Verifica:**
```sql
SELECT * FROM climate_cells LIMIT 1;
```

---

## 🔄 Paso 2: Transformar Datos (5 min)

### Si tienes intercorp_riesgos_climaticos_db.json:
```bash
node scripts/transform-climate-data.js
```

**Genera:** `intercorp_riesgos_climaticos_db_transformed.json`

---

## 📤 Paso 3: Cargar Datos (5 min)

### Opción A: CLI
```bash
curl -X POST http://localhost:3001/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d @intercorp_riesgos_climaticos_db_transformed.json
```

### Opción B: Frontend (JavaScript)
```javascript
const data = await fetch('/intercorp_riesgos_climaticos_db_transformed.json')
  .then(r => r.json());

const response = await fetch('/api/climate-cells/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: data.data })
});

console.log(await response.json());
```

### Opción C: Programáticamente
```bash
npm run server
# En otra terminal:
node scripts/test-climate-api.js
```

---

## 🧪 Paso 4: Probar (5 min)

### Manual
```bash
# Query
curl "http://localhost:3001/api/climate-cells/query?lat=-12.5&lon=-75.5"

# Status
curl "http://localhost:3001/api/climate-cells/status"
```

### Automatizado
```bash
node scripts/test-climate-api.js
```

---

## 🎯 Paso 5: Integrar en UI (Ejemplo)

### Componente React
```jsx
import { useState, useEffect } from 'react';

export function ClimateRiskViewer() {
  const [location, setLocation] = useState({ lat: -12.5, lon: -75.5 });
  const [climateData, setClimateData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClimateData();
  }, [location]);

  const fetchClimateData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/climate-cells/query?lat=${location.lat}&lon=${location.lon}`
      );
      const data = await response.json();
      setClimateData(data);
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  if (loading) return <div>Cargando...</div>;
  if (!climateData) return <div>Sin datos</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h2>Análisis Climático</h2>
      <p>Ubicación: {climateData.location.lat}, {climateData.location.lon}</p>

      {climateData.risks_interpretation?.map((horizon, idx) => (
        <div key={idx} style={{ border: '1px solid #ddd', padding: '10px', margin: '10px 0' }}>
          <h3>{horizon.period}</h3>
          {horizon.insights?.map((insight, i) => (
            <div key={i} style={{ padding: '5px' }}>
              <p><strong>{insight.variable}:</strong> {insight.text}</p>
              <p style={{ fontSize: '0.9em', color: '#666' }}>
                Severidad: {insight.severity}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

## 🗺️ Paso 6: Integrar con Mapa

### Ejemplo con Leaflet
```jsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useState } from 'react';

export function ClimateMap() {
  const [selectedCoords, setSelectedCoords] = useState([-12.5, -75.5]);

  const handleMapClick = (e) => {
    setSelectedCoords([e.latlng.lat, e.latlng.lng]);
    // fetchClimateData(e.latlng.lat, e.latlng.lng)
  };

  return (
    <MapContainer center={selectedCoords} zoom={10} style={{ height: '500px' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={selectedCoords}>
        <Popup>
          Haz click en el mapa para ver riesgos climáticos
        </Popup>
      </Marker>
    </MapContainer>
  );
}
```

---

## 🔍 Respuesta Típica de API

```json
{
  "location": { "lat": -12.5, "lon": -75.5 },
  "climate": {
    "past": {
      "txx": {
        "name": "Temperatura Máxima Extrema",
        "unit": "°C",
        "value": 32.5
      },
      "hd35": {
        "name": "Días >35°C",
        "unit": "días/año",
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
          "text": "La temperatura máxima extrema AUMENTA de 32.5°C a 33.2°C (+0.7°C)",
          "severity": "low"
        }
      ]
    }
  ]
}
```

---

## 📞 Comandos Útiles

```bash
# Iniciar servidor
npm run server

# Probar API
node scripts/test-climate-api.js

# Transformar datos
node scripts/transform-climate-data.js

# Build frontend
npm run build

# Limpiar datos (SQL en Supabase)
DELETE FROM climate_cells;
```

---

## 🚨 Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `relation 'climate_cells' does not exist` | Tabla no creada | Ver SUPABASE_SETUP.md |
| `404: No hay datos` | Base vacía | Cargar con /upload |
| `timeout` | Servidor no corre | `npm run server` |
| `CORS error` | Navegador bloqueando | Check CORS en backend |

---

## ✅ Checklist de Lanzamiento

- [ ] Supabase setup completado
- [ ] Función get_nearest_climate_cell() creada
- [ ] Datos transformados
- [ ] Datos cargados a climate_cells
- [ ] npm run server funciona
- [ ] API query devuelve datos
- [ ] UI integrada
- [ ] Build production hecho
- [ ] Deploy a Vercel completado

---

## 📚 Documentación Completa

- **API Reference:** API_CLIMATE_CELLS.md
- **Supabase Setup:** SUPABASE_SETUP.md
- **Implementation Notes:** IMPLEMENTATION_NOTES.md

---

## 🎬 Siguiente: ¿Qué Hacer Ahora?

1. **Si NO tienes tabla en Supabase aún:**
   → Ejecuta SUPABASE_SETUP.md primero

2. **Si tienes tabla pero sin datos:**
   → `node scripts/transform-climate-data.js`
   → `curl ... /api/climate-cells/upload`

3. **Si todo está corriendo:**
   → Integra en UI (ejemplos arriba)
   → Deploy a producción
   → Celebra 🎉

---

## 💬 Preguntas?

Consulta:
- **Hago POST pero da error:** Ver sección "Validaciones" de API_CLIMATE_CELLS.md
- **Query devuelve null:** Verificar datos cargados: `SELECT COUNT(*) FROM climate_cells;`
- **Performance lenta:** Check índices: `REINDEX INDEX climate_cells_geom_idx;`

---

**¡Listo para empezar!** 🚀

