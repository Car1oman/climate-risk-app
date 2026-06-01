/**
 * documentEmbeddingService — RAG con pgvector
 *
 * Flujo de indexación (al subir un documento):
 *   1. chunkText()     — divide el texto en fragmentos con overlap
 *   2. generateEmbedding() — llama a OpenAI text-embedding-3-small
 *   3. indexDocument() — guarda chunks + embeddings en document_chunks (Supabase)
 *
 * Flujo de recuperación (al hacer consulta):
 *   1. generateEmbedding() sobre el texto de consulta
 *   2. searchSimilarChunks() — búsqueda coseno vía pgvector RPC
 *
 * Requiere:
 *   - OPENAI_API_KEY en .env
 *   - Migración 001_document_chunks.sql ejecutada en Supabase
 */

import OpenAI from 'openai';
import { supabase } from '../supabaseClient.js';

// ── Constantes ───────────────────────────────────────────────────────────────
const CHUNK_SIZE    = 2000;   // chars ≈ 500 tokens (promedio 4 chars/token)
const CHUNK_OVERLAP = 200;    // chars ≈ 50 tokens de solapamiento
const MIN_CHUNK     = 80;     // descartar fragmentos menores
const EMBED_MODEL   = 'text-embedding-3-small';
const EMBED_DIMS    = 1536;
const MAX_INPUT     = 8000;   // chars máximos enviados a la API por chunk
const INSERT_BATCH  = 20;     // chunks por lote de inserción
const DEFAULT_TOP_K = 8;

// ── Cliente OpenAI (lazy init) ────────────────────────────────────────────────
let _openai = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY)
    throw new Error('OPENAI_API_KEY no configurada — embeddings no disponibles');
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Divide texto en fragmentos solapados.
 * @param {string} text
 * @param {number} size     chars por chunk (default: 2000)
 * @param {number} overlap  chars de solapamiento (default: 200)
 * @returns {{ content: string, chunk_index: number }[]}
 */
export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text?.trim()) return [];

  const chunks = [];
  let pos = 0;
  let idx = 0;

  while (pos < text.length) {
    const end     = Math.min(pos + size, text.length);
    const content = text.slice(pos, end).trim();

    if (content.length >= MIN_CHUNK) {
      chunks.push({ content, chunk_index: idx++ });
    }

    if (end >= text.length) break;
    pos = end - overlap;
  }

  return chunks;
}

// ── Embeddings ────────────────────────────────────────────────────────────────

/**
 * Genera embedding vectorial para un texto.
 * @param {string} text
 * @returns {Promise<number[]>} vector de 1536 dimensiones
 */
export async function generateEmbedding(text) {
  const res = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, MAX_INPUT),
  });
  return res.data[0].embedding;
}

// ── Indexación ─────────────────────────────────────────────────────────────────

/**
 * Indexa un documento completo: elimina chunks anteriores y crea nuevos.
 *
 * @param {string} documentId  UUID del documento en tabla archivos
 * @param {string} text        Texto completo extraído del documento
 * @param {object} metadata    Datos adicionales: { nombre, categoria, titulo, tipo }
 * @returns {Promise<{ indexed: number, skipped?: boolean }>}
 */
export async function indexDocument(documentId, text, metadata = {}) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[embeddings] OPENAI_API_KEY ausente — indexación omitida');
    return { indexed: 0, skipped: true };
  }

  // Limpiar chunks anteriores (en caso de re-indexación)
  const { error: delErr } = await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId);

  if (delErr) {
    console.warn('[embeddings] Error limpiando chunks anteriores:', delErr.message);
  }

  const chunks = chunkText(text);
  if (!chunks.length) {
    console.warn(`[embeddings] Sin chunks para doc ${documentId} (texto vacío o muy corto)`);
    return { indexed: 0 };
  }

  // Generar embeddings para cada chunk (secuencial para respetar rate limit)
  const records = [];
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.content);
      records.push({
        document_id: documentId,
        chunk_index: chunk.chunk_index,
        content:     chunk.content,
        token_count: Math.round(chunk.content.length / 4),
        embedding,
        metadata,
      });
    } catch (err) {
      console.warn(`[embeddings] chunk ${chunk.chunk_index} falló:`, err.message);
    }
  }

  if (!records.length) return { indexed: 0 };

  // Insertar en lotes
  for (let i = 0; i < records.length; i += INSERT_BATCH) {
    const { error } = await supabase
      .from('document_chunks')
      .insert(records.slice(i, i + INSERT_BATCH));

    if (error) throw new Error(`[embeddings] Error insertando lote: ${error.message}`);
  }

  console.log(`[embeddings] ${records.length} chunks indexados para doc ${documentId}`);
  return { indexed: records.length };
}

/**
 * Elimina todos los chunks de un documento (llamado al borrar el documento).
 * La FK ON DELETE CASCADE lo hace automáticamente, pero esta función
 * permite invocarlo explícitamente si se necesita.
 * @param {string} documentId
 */
export async function deleteDocumentChunks(documentId) {
  const { error } = await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId);

  if (error) console.warn('[embeddings] deleteDocumentChunks error:', error.message);
}

// ── Búsqueda semántica ────────────────────────────────────────────────────────

/**
 * Busca los chunks más similares al texto de consulta.
 *
 * @param {string} queryText  Contexto de la consulta (sector, ubicación, riesgos)
 * @param {number} topK       Cantidad de chunks a retornar (default: 8)
 * @returns {Promise<Array<{ id, document_id, chunk_index, content, metadata, similarity }>>}
 */
export async function searchSimilarChunks(queryText, topK = DEFAULT_TOP_K) {
  const embedding = await generateEmbedding(queryText);

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: embedding,
    match_count:     topK,
  });

  if (error) throw new Error(`[embeddings] similarity search: ${error.message}`);
  return data ?? [];
}
