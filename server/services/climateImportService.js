/**
 * Servicio de importación de datos climáticos a climate_cells
 * Soporte robusto para JSON array y JSONL (JSON Lines)
 *
 * JSONL format (formato del ETL):
 *   {"lat": -12.5, "lon": -75.5, "geom": "POINT(-75.5 -12.5)", "data": {...}}
 *   {"lat": -12.3, "lon": -75.4, "data": {...}}
 *
 * Características:
 * - Detección automática de formato (JSON array vs JSONL)
 * - Procesamiento JSONL línea por línea (no parse total)
 * - Normalización y generación automática de geom
 * - UPSERT eficiente por lotes (ON CONFLICT lat,lon)
 * - Validación granular: continúa ante registros inválidos
 * - Resumen detallado: total / inserted / updated / failed
 */
import { supabase } from '../supabaseClient.js';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// 1. DETECCIÓN DE FORMATO
// ---------------------------------------------------------------------------

/**
 * Detectar si el contenido es JSON array o JSONL.
 * @param {string} content
 * @returns {'json'|'jsonl'|'invalid'}
 */
const detectFileFormat = (content) => {
  if (!content || typeof content !== 'string') return 'invalid';

  const trimmed = content.trimStart();
  if (trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('{')) return 'jsonl';
  return 'json'; // fallback
};

// ---------------------------------------------------------------------------
// 2. VALIDACIÓN POR REGISTRO
// ---------------------------------------------------------------------------

/**
 * Validar estructura de un registro climático.
 * @param {*} record
 * @param {number} lineIndex - Para mensajes de error
 * @returns {{ isValid: boolean, errors: string[] }}
 */
const validateClimateRecord = (record, lineIndex) => {
  const errors = [];
  const prefix = `Línea ${lineIndex}`;

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { isValid: false, errors: [`${prefix}: no es un objeto JSON válido`] };
  }

  // Validar lat
  if (record.lat === undefined || record.lat === null) {
    errors.push(`${prefix}: 'lat' es requerido`);
  } else {
    const lat = parseFloat(record.lat);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push(`${prefix}: 'lat' inválido (rango [-90,90], valor: ${record.lat})`);
    }
  }

  // Validar lon (acepta 'lon' o 'lng')
  const hasLon = record.lon !== undefined || record.lng !== undefined;
  if (!hasLon) {
    errors.push(`${prefix}: 'lon' o 'lng' es requerido`);
  } else {
    const lonValue = record.lon ?? record.lng;
    const lon = parseFloat(lonValue);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      errors.push(`${prefix}: 'lon' inválido (rango [-180,180], valor: ${lonValue})`);
    }
  }

  // Validar data
  if (record.data === undefined || record.data === null) {
    errors.push(`${prefix}: 'data' es requerido`);
  } else if (typeof record.data !== 'object' || Array.isArray(record.data)) {
    errors.push(`${prefix}: 'data' debe ser un objeto JSON válido`);
  }

  // Validar geom (opcional — se ignora en normalización pero se valida si viene)
  // Acepta: "POINT(lon lat)" o "SRID=4326;POINT(lon lat)"
  if (record.geom !== undefined && record.geom !== null) {
    const g = typeof record.geom === 'string' ? record.geom.toUpperCase() : '';
    if (!g.includes('POINT')) {
      errors.push(`${prefix}: 'geom' inválido — debe contener POINT(lon lat)`);
    }
  }

  return { isValid: errors.length === 0, errors };
};

// ---------------------------------------------------------------------------
// 3. NORMALIZACIÓN
// ---------------------------------------------------------------------------

/**
 * Normalizar un registro para inserción en climate_cells.
 * Genera geom automáticamente si no existe.
 * @param {object} record
 * @returns {{ lat: number, lon: number, geom: string, data: object }}
 */
const normalizeRecord = (record) => {
  const lat = parseFloat(record.lat);
  const lon = parseFloat(record.lon ?? record.lng);

  // GEOGRAPHY(POINT, 4326) requires EWKT with explicit SRID
  // Always recompute from lat/lon to guarantee correctness
  const geom = `SRID=4326;POINT(${lon} ${lat})`;

  return {
    lat,
    lon,
    geom,
    data: (typeof record.data === 'object' && record.data !== null) ? record.data : {},
  };
};

// ---------------------------------------------------------------------------
// 4. PARSEO DE ARCHIVO (JSON array o JSONL)
// ---------------------------------------------------------------------------

/**
 * Parsear archivo detectando automáticamente el formato.
 *
 * Para JSONL: lee línea por línea, ignora vacías, captura errores por línea.
 * Para JSON array: parse completo, admite [] o { data: [] }.
 *
 * @param {string} fileContent
 * @param {'auto'|'json'|'jsonl'} formatHint
 * @returns {{ records: object[], detectedFormat: string, errors: object[], totalLines: number }}
 */
const parseClimateFile = (fileContent, formatHint = 'auto') => {
  if (!fileContent || typeof fileContent !== 'string') {
    throw new Error('Contenido de archivo inválido o vacío');
  }

  if (Buffer.byteLength(fileContent, 'utf8') > MAX_FILE_BYTES) {
    throw new Error(`Archivo demasiado grande (límite: ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
  }

  const records = [];
  const errors = [];

  const detectedFormat = (formatHint === 'auto')
    ? detectFileFormat(fileContent)
    : formatHint.toLowerCase();

  console.log(`📋 Formato detectado: ${detectedFormat}`);

  if (detectedFormat === 'jsonl') {
    // ── JSONL: línea por línea ──────────────────────────────────────────────
    const lines = fileContent.split('\n');
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const trimmedLine = line.trim();

      if (!trimmedLine) continue; // ignorar vacías

      try {
        const record = JSON.parse(trimmedLine);
        records.push(record);
      } catch (parseError) {
        errors.push({
          line: lineNumber,
          error: `JSON inválido: ${parseError.message}`,
          content: trimmedLine.substring(0, 120),
        });
        // Continuar con la siguiente línea
      }
    }

    console.log(`✅ JSONL: ${records.length} registros, ${errors.length} líneas con error`);
  } else {
    // ── JSON array ──────────────────────────────────────────────────────────
    let parsed;
    try {
      parsed = JSON.parse(fileContent);
    } catch (e) {
      throw new Error(`JSON inválido: ${e.message}`);
    }

    if (Array.isArray(parsed)) {
      records.push(...parsed);
    } else if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray(parsed.data)
    ) {
      records.push(...parsed.data);
    } else {
      throw new Error('JSON debe ser un array [] o un objeto con campo "data": [...]');
    }

    console.log(`✅ JSON: ${records.length} registros parseados`);
  }

  return {
    records,
    detectedFormat,
    errors,           // errores por línea (JSONL)
    totalLines: fileContent.split('\n').length,
  };
};

// ---------------------------------------------------------------------------
// 5. PROCESAMIENTO (validación + normalización)
// ---------------------------------------------------------------------------

/**
 * Validar y normalizar registros antes del UPSERT.
 * Los inválidos se registran pero NO detienen el proceso.
 *
 * @param {object[]} records
 * @returns {{ validRecords: object[], invalidRecords: object[], validationErrors: string[] }}
 */
const processRecordsForUpsert = (records) => {
  const validRecords = [];
  const invalidRecords = [];
  const validationErrors = [];

  records.forEach((record, index) => {
    const lineIndex = index + 1;
    const validation = validateClimateRecord(record, lineIndex);

    if (!validation.isValid) {
      validationErrors.push(...validation.errors);
      invalidRecords.push({ index: lineIndex, record, errors: validation.errors });
      return;
    }

    try {
      const normalized = normalizeRecord(record);
      validRecords.push(normalized);
    } catch (error) {
      const msg = `Línea ${lineIndex}: error en normalización — ${error.message}`;
      validationErrors.push(msg);
      invalidRecords.push({ index: lineIndex, record, errors: [msg] });
    }
  });

  return {
    validRecords,
    invalidRecords,
    validationErrors,
    totalInput: records.length,
    totalValid: validRecords.length,
    totalErrors: validationErrors.length,
  };
};

// ---------------------------------------------------------------------------
// 6. UPSERT EFICIENTE POR LOTES
// ---------------------------------------------------------------------------

/**
 * UPSERT en lotes con ON CONFLICT (lat, lon) DO UPDATE SET data.
 * Continúa aunque un lote falle — registra el error y sigue.
 *
 * @param {object[]} records - Registros ya normalizados
 * @param {number} batchSize
 * @returns {{ total, inserted, updated, failed, batches, duration_ms, records_per_second, errors }}
 */
const upsertClimateData = async (records, batchSize = DEFAULT_BATCH_SIZE) => {
  const results = {
    total: records.length,
    inserted: 0,
    updated: 0,
    failed: 0,
    batches: 0,
    duration_ms: 0,
    records_per_second: 0,
    errors: [],
  };

  if (records.length === 0) return results;

  const startTime = Date.now();

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    results.batches++;

    try {
      const { error } = await supabase
        .from('climate_cells')
        .upsert(
          batch.map((r) => ({
            lat: r.lat,
            lon: r.lon,
            geom: r.geom,   // SRID=4326;POINT(lon lat) — EWKT para PostGIS geography
            data: r.data,
            // Sin updated_at — la tabla no tiene esa columna
          })),
          {
            onConflict: 'lat,lon',  // referencia al UNIQUE INDEX idx_unique_location
            ignoreDuplicates: false, // false = DO UPDATE (reemplaza data existente)
          }
        );

      if (error) {
        console.error(`⚠️  Error lote ${results.batches}:`, error.message);
        results.errors.push({
          batch: results.batches,
          error: error.message,
          recordCount: batch.length,
        });
        results.failed += batch.length;
      } else {
        // Supabase no distingue insert vs update en upsert bulk,
        // se contabiliza todo como insertado/actualizado
        results.inserted += batch.length;
      }
    } catch (err) {
      console.error(`❌ Error crítico lote ${results.batches}:`, err.message);
      results.errors.push({
        batch: results.batches,
        error: err.message,
        recordCount: batch.length,
      });
      results.failed += batch.length;
    }
  }

  results.duration_ms = Date.now() - startTime;
  results.records_per_second =
    results.duration_ms > 0
      ? Math.round((results.total / results.duration_ms) * 1000)
      : 0;

  console.log(`
✅ UPSERT COMPLETADO:
   • Total:               ${results.total}
   • Insertados/Updated:  ${results.inserted}
   • Fallidos:            ${results.failed}
   • Lotes:               ${results.batches}
   • Tiempo:              ${results.duration_ms}ms
   • Velocidad:           ${results.records_per_second} registros/segundo
  `);

  return results;
};

// ---------------------------------------------------------------------------
// 7. FLUJO COMPLETO: Parse → Process → Upsert
// ---------------------------------------------------------------------------

/**
 * Función principal que orquesta las 3 fases.
 * Retorna un objeto con { parseResult, processResult, upsertResult }
 * compatible con el endpoint POST /api/climate-cells/upload.
 *
 * @param {string} fileContent
 * @param {'auto'|'json'|'jsonl'} formatHint
 * @returns {{ parseResult, processResult, upsertResult }}
 */
const uploadClimateFile = async (fileContent, formatHint = 'auto') => {
  // ── Fase 1: Parseo ────────────────────────────────────────────────────────
  const parseResult = parseClimateFile(fileContent, formatHint);
  // Normalizar estructura para que server.js pueda acceder a .errors array
  // parseResult ya tiene: { records, detectedFormat, errors, totalLines }

  if (parseResult.records.length === 0 && parseResult.errors.length === 0) {
    throw new Error('El archivo está vacío o no contiene registros válidos');
  }

  // ── Fase 2: Procesamiento ─────────────────────────────────────────────────
  const processResult = processRecordsForUpsert(parseResult.records);
  // processResult: { validRecords, invalidRecords, validationErrors, ... }

  if (processResult.validRecords.length === 0) {
    // Devolver sin upsert si no hay registros válidos
    return {
      parseResult,
      processResult,
      upsertResult: {
        total: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        batches: 0,
        duration_ms: 0,
        records_per_second: 0,
        errors: [],
      },
    };
  }

  // ── Fase 3: Upsert ────────────────────────────────────────────────────────
  const upsertResult = await upsertClimateData(processResult.validRecords);

  return { parseResult, processResult, upsertResult };
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  detectFileFormat,
  validateClimateRecord,
  normalizeRecord,
  parseClimateFile,
  processRecordsForUpsert,
  upsertClimateData,
  uploadClimateFile,
};
