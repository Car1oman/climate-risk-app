/**
 * Servicio de gestión de documentos climáticos
 *
 * Flujo de subida:
 *   1. Validar tipo y tamaño del archivo
 *   2. Normalizar nombre (lowercase, sin espacios ni caracteres especiales)
 *   3. Verificar duplicado por nombre en la tabla "archivos"
 *   4. Subir a Supabase Storage (bucket: documentos-climaticos)
 *   5. Insertar metadata en "archivos"
 *   6. Rollback: si falla la BD → eliminar el archivo del storage
 *
 * IMPORTANTE: La tabla "archivos" debe tener la columna "categoria".
 * Si aún no existe, ejecutar en Supabase SQL Editor:
 *   ALTER TABLE archivos ADD COLUMN IF NOT EXISTS categoria TEXT;
 */
import { supabase } from '../supabaseClient.js';
import { extractTextFull } from './documentTextExtractor.js';
import { indexDocument } from './documentEmbeddingService.js';

// ── Constantes ──────────────────────────────────────────────────────────────

const BUCKET = 'documentos-climaticos';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// MIME types permitidos → extensión canónica
const ALLOWED_TYPES = {
  'application/pdf':                                                            'pdf',
  'application/vnd.ms-excel':                                                  'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':         'xlsx',
  'application/msword':                                                         'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':   'docx',
};

const CATEGORIAS = ['riesgo', 'impacto', 'adaptacion', 'informe'];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizar nombre de archivo:
 *   - minúsculas
 *   - eliminar tildes/diacríticos
 *   - reemplazar espacios y caracteres especiales por guión bajo
 *   - colapsar guiones bajos consecutivos
 */
const normalizeName = (raw) =>
  raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')          // quitar diacríticos
    .replace(/[^a-z0-9._-]/g, '_')           // solo alfanumérico, punto, guión
    .replace(/_+/g, '_')                      // colapsar _
    .replace(/^_+|_+$/g, '');                // trim _

/**
 * Extraer la ruta relativa dentro del bucket a partir de la URL pública.
 * URL: https://{ref}.supabase.co/storage/v1/object/public/{bucket}/{path}
 */
const storagePathFromUrl = (publicUrl) => {
  try {
    const url = new URL(publicUrl);
    const marker = `/public/${BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    return idx >= 0 ? url.pathname.slice(idx + marker.length) : null;
  } catch {
    return null;
  }
};

// ── Inicialización del bucket ────────────────────────────────────────────────

/**
 * Asegura que el bucket exista; lo crea como público si no existe.
 * Se llama una sola vez por proceso (se cachea el resultado).
 */
let bucketReady = false;
const ensureBucket = async () => {
  if (bucketReady) return;

  const { error: getErr } = await supabase.storage.getBucket(BUCKET);

  if (getErr) {
    // El bucket no existe → crearlo como público
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SIZE_BYTES,
    });

    if (createErr && createErr.message !== 'Bucket already exists') {
      throw new Error(`No se pudo crear el bucket "${BUCKET}": ${createErr.message}`);
    }

    console.log(`✅ Bucket "${BUCKET}" creado automáticamente`);
  }

  bucketReady = true;
};

// ── Operaciones ──────────────────────────────────────────────────────────────

/**
 * Subir un documento y registrar su metadata.
 *
 * @param {{ buffer: Buffer, originalname: string, mimetype: string, size: number }} file
 * @param {string|null} descripcion
 * @param {string|null} categoria  - 'riesgo' | 'impacto' | 'adaptacion' | 'informe'
 * @returns {Promise<object>} Registro insertado en "archivos"
 */
const uploadDocumento = async (file, descripcion, categoria) => {
  // ── Validar tipo ──────────────────────────────────────────────────────────
  if (!ALLOWED_TYPES[file.mimetype]) {
    throw Object.assign(
      new Error(`Tipo no permitido: ${file.mimetype}. Acepta: PDF, XLS, XLSX, DOC, DOCX`),
      { status: 400 }
    );
  }

  // ── Validar tamaño ────────────────────────────────────────────────────────
  if (file.size > MAX_SIZE_BYTES) {
    throw Object.assign(
      new Error(`Archivo demasiado grande: ${(file.size / 1024 / 1024).toFixed(1)} MB (máximo 10 MB)`),
      { status: 400 }
    );
  }

  // ── Validar categoría ──────────────────────────────────────────────────────
  if (categoria && !CATEGORIAS.includes(categoria)) {
    throw Object.assign(
      new Error(`Categoría inválida. Opciones: ${CATEGORIAS.join(', ')}`),
      { status: 400 }
    );
  }

  // ── Normalizar nombre ─────────────────────────────────────────────────────
  const rawBase = file.originalname.replace(/\.[^.]+$/, '');  // sin extensión
  const ext     = file.originalname.split('.').pop().toLowerCase();
  const nombreNorm = normalizeName(rawBase) + (ext ? `.${ext}` : '');
  const tipo       = ALLOWED_TYPES[file.mimetype];

  if (!nombreNorm || nombreNorm === `.${ext}`) {
    throw Object.assign(
      new Error('El nombre del archivo es inválido después de normalizar'),
      { status: 400 }
    );
  }

  // ── Verificar duplicado ───────────────────────────────────────────────────
  const { data: existing, error: dupErr } = await supabase
    .from('archivos')
    .select('id, nombre')
    .eq('nombre', nombreNorm)
    .maybeSingle();

  if (dupErr && dupErr.code !== 'PGRST116') throw dupErr;

  if (existing) {
    throw Object.assign(
      new Error(`Ya existe un archivo llamado "${nombreNorm}". Renombra el archivo para continuar.`),
      { status: 409 }
    );
  }

  // ── Asegurar bucket ───────────────────────────────────────────────────────
  await ensureBucket();

  // ── Subir a Storage ───────────────────────────────────────────────────────
  // Prefijo con timestamp para evitar colisiones en el bucket aunque haya rollback
  const storagePath = `${Date.now()}_${nombreNorm}`;

  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (storageErr) {
    throw new Error(`Error al subir al storage: ${storageErr.message}`);
  }

  // ── Obtener URL pública ───────────────────────────────────────────────────
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // ── Insertar en BD (con rollback si falla) ─────────────────────────────────
  // Detectar si la columna 'categoria' existe para evitar error en schema cache.
  // Si no existe, se omite del INSERT. Para activarla ejecutar en Supabase:
  //   ALTER TABLE archivos ADD COLUMN IF NOT EXISTS categoria TEXT;
  const record = {
    nombre:        nombreNorm,
    tipo,
    url:           publicUrl,
    tamanio_bytes: file.size,
    descripcion:   descripcion?.trim() || null,
    created_at:    new Date().toISOString(),
  };

  // Solo incluir categoria si el campo viene informado; Supabase fallará si la
  // columna no existe, por eso la probamos con un INSERT de prueba... o mejor:
  // simplemente la omitimos hasta que el schema la tenga.
  // DESCOMENTA la siguiente línea después de ejecutar el ALTER TABLE:
  // if (categoria) record.categoria = categoria;

  const { data: dbData, error: dbErr } = await supabase
    .from('archivos')
    .insert(record)
    .select()
    .single();

  if (dbErr) {
    // Rollback: eliminar el archivo ya subido al storage
    console.warn('⚠️  Rollback storage — eliminando:', storagePath);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Error al guardar en base de datos: ${dbErr.message}`);
  }

  console.log(`✅ Documento subido: ${nombreNorm} (${(file.size / 1024).toFixed(1)} KB)`);

  // Indexación semántica en background — no bloquea la respuesta HTTP
  setImmediate(async () => {
    try {
      const fullText = await extractTextFull(file.buffer, tipo);
      if (fullText.trim()) {
        const titulo = descripcion?.trim() || nombreNorm.replace(/[._-]/g, ' ').replace(/^\d+ /, '');
        await indexDocument(dbData.id, fullText, {
          nombre:    nombreNorm,
          categoria: categoria || 'informe',
          titulo,
          tipo,
        });
      }
    } catch (err) {
      console.warn(`[documentos] Indexación background falló para "${nombreNorm}":`, err.message);
    }
  });

  return dbData;
};

/**
 * Listar documentos, con filtro opcional por categoría.
 */
const getDocumentos = async (_categoria = null) => {
  // Filtro por categoria deshabilitado hasta agregar la columna:
  //   ALTER TABLE archivos ADD COLUMN IF NOT EXISTS categoria TEXT;
  const { data, error } = await supabase
    .from('archivos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

/**
 * Eliminar un documento de la BD y del storage.
 * Si falla el storage el registro en BD ya fue eliminado (no bloquea la operación).
 */
const deleteDocumento = async (id) => {
  // Obtener registro
  const { data: doc, error: fetchErr } = await supabase
    .from('archivos')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!doc) throw Object.assign(new Error('Documento no encontrado'), { status: 404 });

  // Eliminar de BD
  const { error: delErr } = await supabase
    .from('archivos')
    .delete()
    .eq('id', id);

  if (delErr) throw delErr;

  // Eliminar del storage (best-effort)
  const storagePath = storagePathFromUrl(doc.url);
  if (storagePath) {
    const { error: stErr } = await supabase.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (stErr) {
      console.warn(`⚠️  No se pudo eliminar del storage "${storagePath}":`, stErr.message);
    }
  }

  return { deleted: true, nombre: doc.nombre };
};

export { uploadDocumento, getDocumentos, deleteDocumento, CATEGORIAS };
