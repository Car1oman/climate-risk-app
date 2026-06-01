import express from 'express';
import multer from 'multer';
import {
  uploadDocumento,
  getDocumentos,
  deleteDocumento,
  CATEGORIAS,
} from '../services/documentosService.js';
import {
  getDocumentosEnrichment,
  getSemanticContext,
} from '../services/documentosEnrichmentService.js';
import { indexDocument } from '../services/documentEmbeddingService.js';
import { extractTextFull } from '../services/documentTextExtractor.js';
import { climateCache, CACHE_TTL } from '../shared/cache.js';
import { requireAuth } from '../middleware/auth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Multer: almacena en memoria (el buffer se pasa a Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — defensa extra
});

/**
 * POST /api/documentos/upload
 * Sube un documento a Storage y registra metadata en "archivos".
 * multipart/form-data:
 *   - archivo   (File)   — requerido
 *   - descripcion (string) — opcional
 *   - categoria  (string) — opcional: riesgo | impacto | adaptacion | informe
 */
router.post('/upload', requireAuth, strictLimiter, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo (campo: "archivo")' });
    }

    const { descripcion, categoria } = req.body;
    const doc = await uploadDocumento(req.file, descripcion || null, categoria || null);

    return res.status(201).json({
      success: true,
      documento: doc,
    });
  } catch (err) {
    console.error('❌ /api/documentos/upload:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/documentos
 * Lista todos los documentos, con filtro opcional ?categoria=riesgo
 */
router.get('/', async (req, res) => {
  try {
    const { categoria } = req.query;
    const docs = await getDocumentos(categoria || null);
    return res.json(docs);
  } catch (err) {
    console.error('❌ /api/documentos:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/documentos/:id
 * Elimina el documento de la BD y del Storage.
 */
router.delete('/:id', requireAuth, strictLimiter, async (req, res) => {
  try {
    const result = await deleteDocumento(req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('❌ /api/documentos/:id DELETE:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/documentos/categorias
 * Devuelve las categorías disponibles.
 */
router.get('/categorias', (_req, res) => {
  res.json(CATEGORIAS);
});

/**
 * GET /api/documentos/context
 *
 * Sin parámetros  → catálogo completo (legacy, caché 30 min).
 * Con ?sector=, ?query=, o ?lat=&lon= → búsqueda semántica por similitud.
 *
 * Query params opcionales:
 *   sector  - slug del sector (retail, agro, minería…)
 *   lat/lon - coordenadas de la ubicación analizada
 *   query   - texto libre adicional para la consulta semántica
 *   topK    - cantidad de chunks a recuperar (default: 8)
 */
router.get('/context', async (req, res) => {
  const { sector, lat, lon, query, topK } = req.query;

  // ── Ruta semántica (cuando se proporciona contexto de consulta) ───────────
  if (sector || query) {
    const queryParts = [
      sector && `sector: ${sector}`,
      lat && lon && `ubicación lat ${lat} lon ${lon}`,
      query,
    ].filter(Boolean);

    const queryText = queryParts.join(', ');
    const k = parseInt(topK, 10) || 8;

    const semanticCtx = await getSemanticContext(queryText, k);
    if (semanticCtx) {
      return res.json({
        total:       semanticCtx.topK,
        mode:        'semantic',
        ai_context:  semanticCtx.ai_context,
        by_category: {},   // shape legacy preservada para compatibilidad frontend
      });
    }
    // Si OPENAI_API_KEY no está configurada o no hay chunks → fallback a legacy
  }

  // ── Ruta legacy: catálogo completo con caché 30 min ──────────────────────
  const cacheKey = 'documentos-context';
  const now = Date.now();
  const TTL_30MIN = 1000 * 60 * 30;

  if (climateCache[cacheKey] && now - climateCache[cacheKey].timestamp < TTL_30MIN) {
    return res.json(climateCache[cacheKey].data);
  }

  const data = await getDocumentosEnrichment();
  if (data.total > 0) climateCache[cacheKey] = { data, timestamp: now };
  return res.json(data); // nunca retorna 500
});

/**
 * POST /api/documentos/reindex
 * Re-indexa todos los documentos existentes con embeddings.
 * Útil para migrar documentos subidos antes de activar el RAG.
 */
router.post('/reindex', requireAuth, strictLimiter, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'OPENAI_API_KEY no configurada — embeddings no disponibles',
    });
  }

  const docs = await getDocumentos();
  if (!docs.length) return res.json({ indexed: 0, failed: 0, total: 0 });

  let indexed = 0;
  let failed  = 0;
  const errors = [];

  for (const doc of docs) {
    if (!doc.url) { failed++; continue; }

    try {
      const fetchRes = await fetch(doc.url);
      if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);

      const buffer   = Buffer.from(await fetchRes.arrayBuffer());
      const fullText = await extractTextFull(buffer, doc.tipo);

      if (!fullText.trim()) { failed++; continue; }

      const titulo = doc.descripcion?.trim() ||
        doc.nombre.replace(/[._-]/g, ' ').replace(/^\d+ /, '');

      await indexDocument(doc.id, fullText, {
        nombre:    doc.nombre,
        categoria: doc.categoria || 'informe',
        titulo,
        tipo:      doc.tipo,
      });

      indexed++;
    } catch (err) {
      failed++;
      errors.push({ nombre: doc.nombre, error: err.message });
      console.warn(`[reindex] Falló "${doc.nombre}":`, err.message);
    }
  }

  return res.json({
    total:   docs.length,
    indexed,
    failed,
    ...(errors.length ? { errors } : {}),
  });
});

export default router;
