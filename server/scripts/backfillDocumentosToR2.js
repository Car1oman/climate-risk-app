/**
 * Backfill script — Copia objetos existentes de Supabase Storage → Cloudflare R2.
 *
 * Comportamiento:
 *   1. Consulta todos los registros en "archivos" cuya URL apunte a Supabase Storage.
 *   2. Por cada documento:
 *      a. Extrae la storage key del pathname de la URL Supabase.
 *      b. Verifica si el objeto ya existe en R2 (HeadObjectCommand).
 *         → Existe: registra como "ya existente" y omite.
 *      c. Descarga el archivo desde la URL pública de Supabase (fetch).
 *      d. Sube a R2 con la misma key (PutObjectCommand).
 *      e. Verifica la subida (HeadObjectCommand post-upload).
 *   3. Imprime resumen: total / copiados / fallidos / ya existentes.
 *
 * Garantías:
 *   - NO modifica la tabla "archivos" ni ningún campo en la BD.
 *   - Idempotente: reejecutable sin efectos secundarios; objetos ya en R2 se omiten.
 *   - No afecta tráfico productivo (lectura BD + escrituras aisladas en R2).
 *
 * Uso:
 *   node server/scripts/backfillDocumentosToR2.js
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_KEY
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// ── Entorno ───────────────────────────────────────────────────────────────────

const ENV = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  r2Endpoint:  process.env.R2_ENDPOINT,
  r2Access:    process.env.R2_ACCESS_KEY_ID,
  r2Secret:    process.env.R2_SECRET_ACCESS_KEY,
  r2Bucket:    process.env.R2_BUCKET,
  r2PublicUrl: (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, ''),
};

const missing = Object.entries(ENV).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('❌ Variables de entorno faltantes:', missing.join(', '));
  process.exit(1);
}

// ── Clientes ──────────────────────────────────────────────────────────────────

const supabase = createClient(ENV.supabaseUrl, ENV.supabaseKey);

const s3 = new S3Client({
  region: 'auto',
  endpoint: ENV.r2Endpoint,
  credentials: {
    accessKeyId:     ENV.r2Access,
    secretAccessKey: ENV.r2Secret,
  },
});

// ── Constantes ────────────────────────────────────────────────────────────────

const SUPABASE_BUCKET = 'documentos-climaticos';
const SUPABASE_MARKER = `/public/${SUPABASE_BUCKET}/`;
const PAGE_SIZE       = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extrae la storage key desde una URL pública de Supabase Storage.
 * URL esperada: https://{ref}.supabase.co/storage/v1/object/public/documentos-climaticos/{key}
 * Retorna null si la URL no corresponde a Supabase Storage.
 */
function keyFromSupabaseUrl(url) {
  try {
    const parsed = new URL(url);
    const idx = parsed.pathname.indexOf(SUPABASE_MARKER);
    if (idx < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + SUPABASE_MARKER.length));
  } catch {
    return null;
  }
}

/**
 * Verifica si una key existe en R2.
 * NoSuchKey / 404 → false. Cualquier otro error se relanza.
 */
async function existsInR2(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: ENV.r2Bucket, Key: key }));
    return true;
  } catch (err) {
    const status = err.$metadata?.httpStatusCode;
    if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey') {
      return false;
    }
    throw err;
  }
}

/**
 * Descarga un archivo desde una URL pública y retorna { buffer, contentType }.
 */
async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

/**
 * Obtiene todos los registros de "archivos" con paginación.
 */
async function fetchAllArchivos() {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('archivos')
      .select('id, nombre, url, tipo')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Error consultando archivos (offset ${offset}): ${error.message}`);

    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  BACKFILL  Supabase Storage → Cloudflare R2');
  console.log('════════════════════════════════════════════════\n');

  console.log('🔍 Consultando tabla archivos…');
  let all;
  try {
    all = await fetchAllArchivos();
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }

  const pending = all.filter(d => d.url && keyFromSupabaseUrl(d.url) !== null);

  console.log(`Total en BD              : ${all.length}`);
  console.log(`Con URL Supabase Storage : ${pending.length}`);
  console.log(`Sin URL Supabase (omit.) : ${all.length - pending.length}\n`);

  if (!pending.length) {
    console.log('✅ Ningún documento pendiente de migrar. Fin.');
    return;
  }

  const stats    = { total: pending.length, copied: 0, failed: 0, existing: 0 };
  const failures = [];

  for (let i = 0; i < pending.length; i++) {
    const doc  = pending[i];
    const tag  = `[${i + 1}/${pending.length}]`;
    const key  = keyFromSupabaseUrl(doc.url);

    // ── Paso 1: idempotencia ─────────────────────────────────────────────────
    let inR2;
    try {
      inR2 = await existsInR2(key);
    } catch (err) {
      console.error(`❌ ${tag} ${doc.nombre} — HeadObject error: ${err.message}`);
      stats.failed++;
      failures.push({ id: doc.id, nombre: doc.nombre, step: 'head-pre', reason: err.message });
      continue;
    }

    if (inR2) {
      console.log(`⏩ ${tag} ${doc.nombre} — ya existe en R2`);
      stats.existing++;
      continue;
    }

    // ── Paso 2: descargar desde Supabase ─────────────────────────────────────
    let buffer, contentType;
    try {
      ({ buffer, contentType } = await downloadFile(doc.url));
    } catch (err) {
      console.error(`❌ ${tag} ${doc.nombre} — descarga fallida: ${err.message}`);
      stats.failed++;
      failures.push({ id: doc.id, nombre: doc.nombre, step: 'download', reason: err.message });
      continue;
    }

    // ── Paso 3: subir a R2 con la misma key ──────────────────────────────────
    try {
      await s3.send(new PutObjectCommand({
        Bucket:      ENV.r2Bucket,
        Key:         key,
        Body:        buffer,
        ContentType: contentType,
      }));
    } catch (err) {
      console.error(`❌ ${tag} ${doc.nombre} — subida R2 fallida: ${err.message}`);
      stats.failed++;
      failures.push({ id: doc.id, nombre: doc.nombre, step: 'upload', reason: err.message });
      continue;
    }

    // ── Paso 4: verificar presencia en R2 ────────────────────────────────────
    try {
      const verified = await existsInR2(key);
      if (!verified) throw new Error('objeto no encontrado tras PutObject');
    } catch (err) {
      console.error(`❌ ${tag} ${doc.nombre} — verificación fallida: ${err.message}`);
      stats.failed++;
      failures.push({ id: doc.id, nombre: doc.nombre, step: 'verify', reason: err.message });
      continue;
    }

    console.log(`✅ ${tag} ${doc.nombre} → ${key}`);
    stats.copied++;
  }

  // ── Resumen final ─────────────────────────────────────────────────────────

  console.log('\n════════════════════════════════════════════════');
  console.log('  RESUMEN');
  console.log('════════════════════════════════════════════════');
  console.log(`  Total encontrados    : ${stats.total}`);
  console.log(`  Copiados             : ${stats.copied}`);
  console.log(`  Ya existentes en R2  : ${stats.existing}`);
  console.log(`  Fallidos             : ${stats.failed}`);
  console.log('════════════════════════════════════════════════');

  if (failures.length) {
    console.log('\n  Detalle de fallos:');
    failures.forEach(f =>
      console.log(`    • [id:${f.id}] ${f.nombre}  paso: ${f.step}  razón: ${f.reason}`)
    );
  }

  console.log('\n  ⚠️  La tabla "archivos" NO fue modificada.');
  console.log('      archivos.url conserva la URL original de Supabase Storage.\n');

  if (stats.failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});
