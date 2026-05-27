-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activos (
  id bigint NOT NULL DEFAULT nextval('activos_id_seq'::regclass),
  unidad_negocio text NOT NULL,
  direccion text,
  lat double precision NOT NULL CHECK (lat >= '-90'::integer::double precision AND lat <= 90::double precision),
  lon double precision NOT NULL CHECK (lon >= '-180'::integer::double precision AND lon <= 180::double precision),
  geom USER-DEFINED,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT activos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  severity text NOT NULL CHECK (severity = ANY (ARRAY['critical'::text, 'warning'::text, 'info'::text])),
  type text,
  source text,
  region text,
  asset_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT alerts_pkey PRIMARY KEY (id),
  CONSTRAINT alerts_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id)
);

CREATE TABLE public.archivos (
  id bigint NOT NULL DEFAULT nextval('archivos_id_seq'::regclass),
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['pdf'::text, 'xls'::text, 'xlsx'::text, 'doc'::text, 'docx'::text])),
  url text NOT NULL,
  tamanio_bytes bigint,
  descripcion text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT archivos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.asset_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  monthly_sales numeric,
  area_m2 numeric,
  num_employees integer,
  condition text,
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT asset_metrics_pkey PRIMARY KEY (id)
);

CREATE TABLE public.assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL,
  name text NOT NULL,
  unidad_negocio text,
  nombre_normalizado text,
  status text DEFAULT 'enriched'::text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT assets_pkey PRIMARY KEY (id),
  CONSTRAINT assets_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id)
);

CREATE TABLE public.climate_cells (
  id bigint NOT NULL DEFAULT nextval('climate_cells_id_seq'::regclass),
  lat double precision NOT NULL CHECK (lat >= '-90'::integer::double precision AND lat <= 90::double precision),
  lon double precision NOT NULL CHECK (lon >= '-180'::integer::double precision AND lon <= 180::double precision),
  geom USER-DEFINED NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT climate_cells_pkey PRIMARY KEY (id)
);

CREATE TABLE public.climate_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  temperature numeric,
  humidity numeric,
  wind_kph numeric,
  precipitation numeric,
  source text,
  recorded_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT climate_data_pkey PRIMARY KEY (id)
);

CREATE TABLE public.climate_dataset_control (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT climate_dataset_control_pkey PRIMARY KEY (id)
);

CREATE TABLE public.function_audit_debug (
  id bigint NOT NULL DEFAULT nextval('function_audit_debug_id_seq'::regclass),
  schema_name text,
  function_name text,
  arguments text,
  return_type text,
  function_type text,
  exists_in_db boolean,
  execution_attempted boolean,
  execution_success boolean,
  rows_returned integer,
  error_message text,
  inspected_at timestamp without time zone DEFAULT now(),
  CONSTRAINT function_audit_debug_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hazards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  flood numeric CHECK (flood >= 0::numeric AND flood <= 1::numeric),
  el_nino numeric CHECK (el_nino >= 0::numeric AND el_nino <= 1::numeric),
  earthquake numeric CHECK (earthquake >= 0::numeric AND earthquake <= 1::numeric),
  landslide numeric CHECK (landslide >= 0::numeric AND landslide <= 1::numeric),
  drought numeric CHECK (drought >= 0::numeric AND drought <= 1::numeric),
  source text,
  calculated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT hazards_pkey PRIMARY KEY (id)
);

CREATE TABLE public.places (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  direccion text NOT NULL,
  direccion_normalizada text,
  lat double precision NOT NULL CHECK (lat >= '-90'::integer::double precision AND lat <= 90::double precision),
  lng double precision NOT NULL CHECK (lng >= '-180'::integer::double precision AND lng <= 180::double precision),
  geom USER-DEFINED,
  source text DEFAULT 'mapbox'::text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT places_pkey PRIMARY KEY (id)
);

CREATE TABLE public.recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  content text NOT NULL,
  source text DEFAULT 'mock'::text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT recommendations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.risk_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  hazard_score numeric CHECK (hazard_score >= 0::numeric AND hazard_score <= 1::numeric),
  exposure_score numeric CHECK (exposure_score >= 0::numeric AND exposure_score <= 1::numeric),
  impact_score numeric CHECK (impact_score >= 0::numeric AND impact_score <= 1::numeric),
  calculated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT risk_components_pkey PRIMARY KEY (id)
);

CREATE TABLE public.risk_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  risk_score numeric CHECK (risk_score >= 0::numeric AND risk_score <= 1::numeric),
  risk_level text CHECK (risk_level = ANY (ARRAY['bajo'::text, 'medio'::text, 'alto'::text, 'critico'::text])),
  financial_impact numeric,
  calculated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT risk_scores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.spatial_ref_sys (
  srid integer NOT NULL CHECK (srid > 0 AND srid <= 998999),
  auth_name character varying,
  auth_srid integer,
  srtext character varying,
  proj4text character varying,
  CONSTRAINT spatial_ref_sys_pkey PRIMARY KEY (srid)
);
