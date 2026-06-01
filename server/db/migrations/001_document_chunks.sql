-- ============================================================
-- Migration 001: document_chunks + pgvector similarity search
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- ============================================================

-- 1. Habilitar extensión pgvector (ya disponible en Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla de chunks con embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID      NOT NULL REFERENCES archivos(id) ON DELETE CASCADE,
  chunk_index  INTEGER   NOT NULL,
  content      TEXT      NOT NULL,
  token_count  INTEGER,
  embedding    vector(1536),       -- text-embedding-3-small (OpenAI)
  metadata     JSONB     DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. Índice de similitud coseno (IVFFlat — rápido en Supabase)
--    lists = 100 es adecuado para colecciones de hasta ~100k chunks.
--    Re-crear con lists más alto si la colección crece significativamente.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Índice auxiliar para filtros por documento
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON document_chunks (document_id);

-- 4. Función RPC para búsqueda por similitud coseno
--    Llamada desde el servidor Node con:
--      supabase.rpc('match_document_chunks', { query_embedding, match_count })
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_count     INT DEFAULT 8
)
RETURNS TABLE (
  id           UUID,
  document_id  UUID,
  chunk_index  INTEGER,
  content      TEXT,
  metadata     JSONB,
  similarity   FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- Verificación (ejecutar después de la migración):
--   SELECT COUNT(*) FROM document_chunks;
--   SELECT proname FROM pg_proc WHERE proname = 'match_document_chunks';
-- ============================================================
