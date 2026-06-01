-- ============================================================
-- Migration 002: asset_risk_summary VIEW
-- Ejecutar en Supabase SQL Editor si la vista no existe
-- La vista ya fue creada en el proyecto; este archivo documenta
-- su definición canónica.
-- ============================================================

-- Vista que une assets + places + asset_metrics + risk_scores
-- en una sola fila por activo, usada por GET /api/assets
CREATE OR REPLACE VIEW public.asset_risk_summary AS
SELECT
  a.id,
  a.name,
  a.type,
  a.unidad_negocio,
  a.status,
  p.direccion,
  p.district,
  p.lat,
  p.lng,
  a.nombre_normalizado,
  am.monthly_sales,
  am.area_m2,
  am.num_employees,
  am.condition,
  am.updated_at          AS metrics_updated_at,
  COALESCE(rs.risk_score,      0)         AS risk_score,
  COALESCE(rs.risk_level,      'unknown') AS risk_level,
  COALESCE(rs.financial_impact, 0)        AS financial_impact,
  a.created_at
FROM assets a
LEFT JOIN places        p  ON p.id       = a.place_id
LEFT JOIN asset_metrics am ON am.asset_id = a.id
LEFT JOIN risk_scores   rs ON rs.asset_id = a.id;

-- Permisos para PostgREST (anon, authenticated, service_role)
GRANT SELECT ON public.asset_risk_summary TO anon, authenticated, service_role;

-- Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
