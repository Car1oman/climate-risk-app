import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// G6 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, MEDIA-ALTA): antes de
// este módulo, EvidenceArtifactBuilder.build() (pipeline/artifact/builder.js)
// solo vivía en un `Map` en memoria de proceso (pipeline/orchestration/engine.js).
// Todo el historial de trazabilidad se perdía en cada reinicio/deploy, y el
// Map crecía sin límite mientras el proceso vivía — comprometiendo el
// objetivo declarado de auditabilidad del pipeline para cualquier ejecución
// anterior a un reinicio.
//
// Esta es una solución de persistencia deliberadamente simple (JSON en
// disco, sin nueva dependencia de base de datos): resuelve la pérdida total
// de historial sin requerir una decisión de infraestructura (elegir motor de
// BD, credenciales, migraciones) que no correspondía tomar unilateralmente.
// Si en el futuro se requiere durabilidad multi-instancia/multi-máquina, el
// camino natural es migrar este módulo a la tabla Supabase que el proyecto
// ya usa en otros puntos (Layer1_ClimateDataFusion) — la interfaz
// (saveArtifact/loadArtifact/purgeOlderThan) está diseñada para que ese swap
// no requiera cambios en engine.js.
const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, "storage");
const BY_ARTIFACT_ID_DIR = join(STORAGE_DIR, "by-artifact-id");

let dirsReady = null;
async function ensureDirs() {
  if (!dirsReady) {
    dirsReady = (async () => {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.mkdir(BY_ARTIFACT_ID_DIR, { recursive: true });
    })();
  }
  return dirsReady;
}

// Escribe el artefacto completo bajo execution_id (clave primaria de
// almacenamiento) y un archivo puntero liviano bajo artifact_id (evita
// duplicar el JSON completo, potencialmente varios MB, por las 2 claves con
// las que engine.js ya indexaba el Map en memoria).
export async function saveArtifact(artifact) {
  await ensureDirs();
  const body = JSON.stringify(artifact);
  await fs.writeFile(join(STORAGE_DIR, `${artifact.execution_id}.json`), body, "utf-8");
  await fs.writeFile(
    join(BY_ARTIFACT_ID_DIR, `${artifact.artifact_id}.json`),
    JSON.stringify({ execution_id: artifact.execution_id }),
    "utf-8"
  );
}

// Resuelve traceId (puede ser execution_id o artifact_id, igual que el Map
// en memoria de engine.js aceptaba ambas claves indistintamente) contra el
// almacenamiento en disco. Retorna null si no existe — no lanza, para que el
// caller (engine.getTrace) pueda tratarlo igual que un cache-miss en memoria.
export async function loadArtifact(traceId) {
  await ensureDirs();
  const directPath = join(STORAGE_DIR, `${traceId}.json`);
  try {
    const raw = await fs.readFile(directPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    // No es un execution_id — probar como artifact_id vía el puntero.
  }
  try {
    const pointerRaw = await fs.readFile(join(BY_ARTIFACT_ID_DIR, `${traceId}.json`), "utf-8");
    const { execution_id } = JSON.parse(pointerRaw);
    const raw = await fs.readFile(join(STORAGE_DIR, `${execution_id}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Purga artefactos más antiguos que maxAgeMs, usando su propio
// `created_at` (no mtime del archivo, que podría diferir si el archivo se
// reescribe) como fuente de verdad del momento de ejecución. No falla el
// proceso llamador si un archivo individual no se puede borrar/parsear —
// purga es una tarea de mantenimiento, no una operación crítica del pipeline.
export async function purgeOlderThan(maxAgeMs) {
  await ensureDirs();
  const cutoff = Date.now() - maxAgeMs;
  let purged = 0;
  const files = await fs.readdir(STORAGE_DIR).catch(() => []);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = join(STORAGE_DIR, file);
    try {
      const raw = await fs.readFile(fullPath, "utf-8");
      const artifact = JSON.parse(raw);
      const createdAtMs = Date.parse(artifact.created_at);
      if (Number.isFinite(createdAtMs) && createdAtMs < cutoff) {
        await fs.unlink(fullPath);
        await fs.unlink(join(BY_ARTIFACT_ID_DIR, `${artifact.artifact_id}.json`)).catch(() => {});
        purged += 1;
      }
    } catch {
      // Archivo corrupto/no parseable — se deja para inspección manual, no
      // se borra a ciegas (podría ser un artefacto en escritura concurrente).
    }
  }
  return purged;
}
