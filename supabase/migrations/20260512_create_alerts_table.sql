-- Sprint 4: Real Alerts Infrastructure
-- Creates the alerts table and seeds initial data.

CREATE TABLE IF NOT EXISTS alerts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  severity    TEXT        NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  type        TEXT,
  source      TEXT,
  region      TEXT,
  asset_id    UUID        REFERENCES assets(id) ON DELETE SET NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_is_active   ON alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_severity    ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_asset_id    ON alerts(asset_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at  ON alerts(created_at DESC);

-- Seed: replace the three previously hardcoded alerts with real rows.
-- Severity mapping from old static file: alto->critical, medio->warning, bajo->info
INSERT INTO alerts (title, description, severity, type, source, region, is_active)
VALUES
  (
    'Alerta de inundación leve',
    'Riesgo de inundación detectado en zonas costeras de Lima. Se recomienda monitoreo continuo de activos en planicie fluvial.',
    'warning',
    'inundacion',
    'SENAMHI',
    'Lima Metropolitana',
    TRUE
  ),
  (
    'Monitoreo de El Niño activado',
    'Anomalías de temperatura en el Pacífico indican posible evento El Niño costero de intensidad alta. Impacto esperado en Q3 2026.',
    'critical',
    'elnino',
    'IGP',
    'Costa Norte',
    TRUE
  ),
  (
    'Inspección de infraestructura programada',
    'Revisión trimestral de activos en zonas de riesgo medio según evaluación del portafolio.',
    'info',
    'inspeccion',
    'Interno',
    'Nacional',
    FALSE
  )
ON CONFLICT DO NOTHING;
