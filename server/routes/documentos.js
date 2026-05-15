import express from 'express';
import multer from 'multer';
import {
  uploadDocumento,
  getDocumentos,
  deleteDocumento,
  CATEGORIAS,
} from '../services/documentosService.js';
import { getDocumentosEnrichment } from '../services/documentosEnrichmentService.js';
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

// GET /api/documentos/context
// Catálogo de documentos subidos para enriquecer prompts de IA — caché 30 min
router.get('/context', async (req, res) => {
  const cacheKey = 'documentos-context';
  const now = Date.now();
  const TTL_30MIN = 1000 * 60 * 30;

  if (climateCache[cacheKey] && now - climateCache[cacheKey].timestamp < TTL_30MIN) {
    return res.json(climateCache[cacheKey].data);
  }

  const data = await getDocumentosEnrichment();
  if (data.total > 0) climateCache[cacheKey] = { data, timestamp: now };
  return res.json(data); // nunca retorna 500 — los documentos son enriquecimiento opcional
});

export default router;
