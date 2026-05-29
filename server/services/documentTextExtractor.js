/**
 * documentTextExtractor — Extrae texto legible de documentos PDF, XLSX, DOCX.
 *
 * Cada función acepta un buffer y retorna el texto plano extraído.
 * El límite por documento evita contextos demasiado grandes para la IA.
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const MAX_CHARS_PER_DOC = 3_000;

/**
 * Extrae texto de un buffer PDF.
 */
async function extractPDF(buffer) {
  const pdf = new PDFParse({ data: buffer });
  await pdf.load();
  const result = await pdf.getText();
  await pdf.destroy();
  return result.text || '';
}

/**
 * Extrae texto de un buffer XLSX/XLS.
 * Concatena todas las celdas de todas las hojas en texto plano.
 */
function extractExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const ref = sheet['!ref'];
    if (!ref) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const textRows = rows
      .filter(row => row.some(cell => cell != null && String(cell).trim()))
      .map(row => row.map(cell => (cell ?? '')).join(' | '));

    if (textRows.length > 0) {
      parts.push(`--- Hoja: ${sheetName} ---`);
      parts.push(...textRows);
    }
  }

  return parts.join('\n');
}

/**
 * Extrae texto de un buffer DOCX usando mammoth.
 */
async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/**
 * Detecta el tipo de archivo por extensión y extrae el texto.
 *
 * @param {Buffer} buffer        - Contenido del archivo
 * @param {string} tipo          - 'pdf' | 'xlsx' | 'xls' | 'docx' | 'doc'
 * @returns {Promise<string>}    - Texto extraído (vacío si no se pudo extraer)
 */
export async function extractText(buffer, tipo) {
  try {
    let text = '';

    switch (tipo) {
      case 'pdf':
        text = await extractPDF(buffer);
        break;
      case 'xlsx':
      case 'xls':
        text = extractExcel(buffer);
        break;
      case 'docx':
        text = await extractDocx(buffer);
        break;
      case 'doc':
        // .doc (legacy) no tiene parser sencillo — devolver vacío
        text = '';
        break;
      default:
        text = '';
    }

    // Limitar longitud y limpiar
    const cleaned = text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return cleaned.length > MAX_CHARS_PER_DOC
      ? cleaned.slice(0, MAX_CHARS_PER_DOC) + '\n[...truncado...]'
      : cleaned;
  } catch (err) {
    console.warn(`[extractText] Error extrayendo texto (${tipo}):`, err.message);
    return '';
  }
}
