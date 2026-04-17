# 🗺️ Guía de Migración a climate_cells en Supabase

Esta guía te ayudará a configurar la tabla `climate_cells` con PostGIS en tu proyecto Supabase.

---

## ⚙️ Prerequisitos

✅ Proyecto Supabase existente
✅ Acceso a la consola SQL
✅ Extensión PostGIS habilitada

---

## 1️⃣ Habilitar Extensión PostGIS en Supabase

Accede a tu proyecto Supabase → SQL Editor → Nueva Query

```sql
-- Habilitar extensión PostGIS
CREATE EXTENSION IF NOT EXISTS "postgis" with schema "extensions";

-- Verificar que está habilitado
SELECT extname FROM pg_extension WHERE extname = 'postgis';
```

✅ Deberías ver 'postgis' como resultado

---

## 2️⃣ Crear la Tabla climate_cells

```sql
-- Crear tabla principal
CREATE TABLE IF NOT EXISTS climate_cells (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lat FLOAT8 NOT NULL,
  lon FLOAT8 NOT NULL,
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS 
    (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Index para buscar por lat+lon exactos (UPSERT)
  UNIQUE(lat, lon),
  
  -- Index geoespacial para búsquedas de proximidad
  SPATIAL INDEX USING gist(geom)
);

-- Crear índice adicional para performance
CREATE INDEX IF NOT EXISTS climate_cells_geom_idx 
  ON climate_cells USING gist(geom);

CREATE INDEX IF NOT EXISTS climate_cells_lat_lon_idx 
  ON climate_cells(lat, lon);

-- RLS (Row Level Security) - Opcional pero recomendado
ALTER TABLE climate_cells ENABLE ROW LEVEL SECURITY;

-- Crear política para permitir lecturas públicas
CREATE POLICY "Allow public read"
  ON climate_cells
  FOR SELECT
  USING (true);

-- Crear política para inserciones/actualizaciones autenticadas
CREATE POLICY "Allow authenticated insert/update"
  ON climate_cells
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated')
  OR auth.role() = 'service_role';
```

---

## 3️⃣ Crear Función para Búsqueda Geoespacial

```sql
-- Función para encontrar el punto más cercano (IMPORTANTE para queries)
CREATE OR REPLACE FUNCTION get_nearest_climate_cell(
  p_lat FLOAT8,
  p_lon FLOAT8,
  p_radius_km INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  lat FLOAT8,
  lon FLOAT8,
  data JSONB,
  distance_m FLOAT8
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    c.id,
    c.lat,
    c.lon,
    c.data,
    ST_DistanceSphere(
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326),
      c.geom
    )::FLOAT8 AS distance_m
  FROM climate_cells c
  WHERE ST_DWithin(
    c.geom,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326),
    p_radius_km * 1000  -- Convertir km a metros
  )
  ORDER BY c.geom <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
  LIMIT 1;
$$;

-- Crear función para estadísticas
CREATE OR REPLACE FUNCTION get_climate_cells_stats()
RETURNS TABLE (
  total_cells BIGINT,
  coverage_area TEXT,
  last_update TIMESTAMP,
  bounds GEOMETRY
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    COUNT(*)::BIGINT as total_cells,
    'Perú'::TEXT as coverage_area,
    MAX(updated_at) as last_update,
    ST_Envelope(ST_Collect(geom)) as bounds
  FROM climate_cells;
$$;

-- Función para estadísticas detalladas
CREATE OR REPLACE FUNCTION get_climate_cells_detailed_stats()
RETURNS TABLE (
  total_records BIGINT,
  lat_min FLOAT8,
  lat_max FLOAT8,
  lon_min FLOAT8,
  lon_max FLOAT8,
  last_update TIMESTAMP,
  records_with_data BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    COUNT(*)::BIGINT,
    MIN(lat)::FLOAT8,
    MAX(lat)::FLOAT8,
    MIN(lon)::FLOAT8,
    MAX(lon)::FLOAT8,
    MAX(updated_at),
    COUNT(CASE WHEN data != '{}'::jsonb THEN 1 END)::BIGINT
  FROM climate_cells;
$$;
```

---

## 4️⃣ Crear Triggers para Auditoría (Opcional)

```sql
-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_climate_cells_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger para ejecutar función
DROP TRIGGER IF EXISTS climate_cells_updated_at_trigger ON climate_cells;
CREATE TRIGGER climate_cells_updated_at_trigger
  BEFORE UPDATE ON climate_cells
  FOR EACH ROW
  EXECUTE FUNCTION update_climate_cells_updated_at();

-- Tabla de auditoría (opcional para tracking de cambios)
CREATE TABLE IF NOT EXISTS climate_cells_audit (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  climate_cell_id BIGINT REFERENCES climate_cells(id) ON DELETE CASCADE,
  action TEXT,  -- 'INSERT', 'UPDATE', 'DELETE'
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  changed_by TEXT DEFAULT current_user
);

-- Función para auditoría
CREATE OR REPLACE FUNCTION audit_climate_cells()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO climate_cells_audit (climate_cell_id, action, new_data)
    VALUES (NEW.id, 'INSERT', row_to_json(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO climate_cells_audit (climate_cell_id, action, old_data, new_data)
    VALUES (NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO climate_cells_audit (climate_cell_id, action, old_data)
    VALUES (OLD.id, 'DELETE', row_to_json(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger para auditoría
DROP TRIGGER IF EXISTS climate_cells_audit_trigger ON climate_cells;
CREATE TRIGGER climate_cells_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON climate_cells
  FOR EACH ROW
  EXECUTE FUNCTION audit_climate_cells();
```

---

## 5️⃣ Configurar Políticas de Acceso (RLS)

Supabase → Autenticación → Políticas / Tu tabla climate_cells

```sql
-- Ya creadas arriba, pero aquí las detalles completas:

-- Política 1: Lectura pública
CREATE POLICY "Allow public read on climate_cells"
ON climate_cells
FOR SELECT
USING (true);

-- Política 2: Inserción para servidor backend (service_role)
CREATE POLICY "Allow backend writes on climate_cells"
ON climate_cells
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Política 3: Actualización para servidor backend
CREATE POLICY "Allow backend updates on climate_cells"
ON climate_cells
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Política 4: Eliminación para administradores
CREATE POLICY "Allow admin delete on climate_cells"
ON climate_cells
FOR DELETE
USING (auth.role() = 'service_role');
```

---

## 6️⃣ Migrar Datos Existentes (Si los tienes)

Si ya tienes datos en otra tabla, migra así:

```sql
-- Opción A: Si vienes de una tabla con estructura similar
INSERT INTO climate_cells (lat, lon, data)
SELECT 
  lat,
  lon,
  jsonb_build_object(
    'historical', jsonb_build_object(
      'txx', value,
      'source', source
    )
  ) as data
FROM old_climate_data_table
WHERE data IS NOT NULL
ON CONFLICT (lat, lon) DO UPDATE SET
  data = EXCLUDED.data;

-- Opción B: Limpiar e insertar nuevamente
DELETE FROM climate_cells;
-- Luego cargar datos nuevos...
```

---

## 7️⃣ Validar Configuración

Ejecuta estas queries para verificar:

```sql
-- Verificar tabla existe
SELECT * FROM climate_cells LIMIT 1;

-- Verificar índices
SELECT indexname FROM pg_indexes WHERE tablename = 'climate_cells';

-- Verificar función de búsqueda
SELECT * FROM get_nearest_climate_cell(-12.5, -75.5);

-- Verificar estadísticas
SELECT * FROM get_climate_cells_stats();

-- Verificar RLS activado
SELECT * FROM pg_tables 
WHERE tablename = 'climate_cells' AND rowsecurity = true;
```

---

## 8️⃣ Actualizar Backend en .env

Tu servidor ya debería tener estas variables. Verifica:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# Opcional: credenciales específicas para operaciones
SUPABASE_ANON_KEY=your-anon-key  # Para lecturas públicas
```

---

## 9️⃣ Probar Endpoints

```bash
# 1️⃣ Probar query de ubicación
curl "http://localhost:3001/api/climate-cells/query?lat=-12.5&lon=-75.5"

# 2️⃣ Probar carga de datos
curl -X POST http://localhost:3001/api/climate-cells/upload \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "lat": -12.5,
      "lon": -75.5,
      "data": {
        "historical": {"txx": 32.5, "hd35": 45},
        "ensemble-all-ssp245_2020-2039": {"txx": 33.2, "hd35": 65}
      }
    }]
  }'

# 3️⃣ Probar estado
curl "http://localhost:3001/api/climate-cells/status"
```

---

## 🔟 Troubleshooting

### Error: "relation 'climate_cells' does not exist"
**Solución:** Ejecuta el script de creación de tabla nuevamente (paso 2)

### Error: "PostGIS is not installed"
**Solución:** Habilita la extensión (paso 1)

### UPSERT no funciona
**Solución:** Verifica que existe el UNIQUE constraint en (lat, lon)
```sql
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name = 'climate_cells' AND constraint_type = 'UNIQUE';
```

### Búsqueda geoespacial lenta
**Solución:** Verifica que el índice espacial existe y está activo
```sql
REINDEX INDEX climate_cells_geom_idx;
```

### RLS bloquea acceso
**Solución:** Verifica políticas y roles
```sql
SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'climate_cells';
```

---

## 📊 Ejemplo de Estructura de Datos

Una vez configurado, tus datos se verían así en Supabase:

| id | lat | lon | geom | data | created_at | updated_at |
|----|-----|-----|------|------|------------|-----------|
| 1 | -12.5 | -75.5 | POINT(-75.5 -12.5) | {"historical": {"txx": 32.5, ...}, "ensemble-all-ssp245_2020-2039": {...}} | 2026-04-16... | 2026-04-17... |
| 2 | -12.3 | -75.4 | POINT(-75.4 -12.3) | {"historical": {...}, ...} | 2026-04-16... | 2026-04-17... |

---

## ✅ Checklist de Configuración

- [ ] PostGIS habilitado
- [ ] Tabla climate_cells creada
- [ ] Índices creados (lat_lon + geom)
- [ ] Funciones creadas (get_nearest_climate_cell)
- [ ] RLS habilitado y configurado
- [ ] Triggers de auditoría creados (opcional but recommended)
- [ ] Backend actualizado con importes de nuevos servicios
- [ ] Variables de entorno configuradas
- [ ] Endpoints probados localmente
- [ ] Datos cargados inicialmente

---

## 🚀 Siguientes Pasos

1. **Cargar datos iniciales:** Usa `/api/climate-cells/upload` con tu JSON de climate risks
2. **Actualizar UI:** Integra `/api/climate-cells/query` en tu componente de mapa
3. **Implementar visualización:** Muestra riesgos por horizonte temporal
4. **Testing:** Prueba flujo completo usuario entrada coordenadas → visualización

---

## 📞 Soporte

Si tienes problemas:

1. Verifica logs de Supabase (Logs → API)
2. Revisa errores del backend: `console.error` en server.js
3. Usa SQL Editor de Supabase para testear queries directamente
4. Consulta docs de PostGIS: https://postgis.net/

