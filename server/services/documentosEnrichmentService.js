import { supabase } from '../supabaseClient.js';
import { extractText } from './documentTextExtractor.js';
import { searchSimilarChunks } from './documentEmbeddingService.js';

const CATEGORY_LABELS = {
  riesgo:     'Análisis de riesgos climáticos',
  impacto:    'Evaluación de impactos',
  adaptacion: 'Medidas de adaptación',
  informe:    'Informes y reportes',
};

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

function resolveCategory(doc) {
  return (doc.categoria && VALID_CATEGORIES.has(doc.categoria)) ? doc.categoria : 'informe';
}

function displayName(doc) {
  if (doc.descripcion?.trim()) return doc.descripcion.trim();
  return doc.nombre
    .replace(/^\d+_/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Descarga un archivo desde su URL pública y extrae el texto.
 * Retorna string vacío si falla (sin lanzar error).
 */
async function fetchAndExtract(url, tipo) {
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const buffer = Buffer.from(await res.arrayBuffer());
    return await extractText(buffer, tipo);
  } catch (err) {
    console.warn(`[documentosEnrichment] No se pudo extraer "${url}":`, err.message);
    return '';
  }
}

/**
 * Recupera los chunks más relevantes para un contexto de consulta usando
 * búsqueda semántica por similitud coseno (pgvector).
 *
 * @param {string} queryText  Texto de la consulta: sector + ubicación + riesgos detectados
 * @param {number} topK       Cantidad de chunks a recuperar (default: 8)
 * @returns {Promise<{ mode: 'semantic', topK: number, ai_context: string, chunks: any[] } | null>}
 */
export async function getSemanticContext(queryText, topK = 8) {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const chunks = await searchSimilarChunks(queryText, topK);
    if (!chunks.length) return null;

    const contextLines = chunks.map((c) => {
      const meta  = c.metadata || {};
      const label = CATEGORY_LABELS[meta.categoria] || 'Documento de referencia';
      const title = meta.titulo || meta.nombre || 'Documento';
      return `[${label}: ${title}]\n${c.content}`;
    });

    const ai_context =
      `A continuación fragmentos relevantes de documentos de referencia (recuperados por similitud semántica):\n\n` +
      contextLines.join('\n\n');

    return {
      mode:       'semantic',
      topK:       chunks.length,
      ai_context,
      chunks,
    };
  } catch (err) {
    console.warn('[documentosEnrichment] Búsqueda semántica falló, usando fallback:', err.message);
    return null;
  }
}

export async function getDocumentosEnrichment() {
  try {
    const { data, error } = await supabase
      .from('archivos')
      .select('id, nombre, descripcion, categoria, tipo, url, created_at')
      .order('created_at', { ascending: false });

    if (error || !data?.length) return { total: 0, by_category: {}, ai_context: null };

    // Extraer texto de cada documento en paralelo
    const enriched = await Promise.all(
      data.map(async (doc) => {
        const texto = doc.url
          ? await fetchAndExtract(doc.url, doc.tipo)
          : '';
        const cat = resolveCategory(doc);
        return { doc, cat, texto };
      })
    );

    const byCategory = {};
    const excerpts = [];

    for (const { doc, cat, texto } of enriched) {
      byCategory[cat] ??= [];
      byCategory[cat].push({
        nombre:      doc.nombre,
        display:     displayName(doc),
        tipo:        doc.tipo,
      });

      if (texto) {
        const label = CATEGORY_LABELS[cat] || cat;
        const title = displayName(doc);
        excerpts.push(`[${label}: ${title}]\n${texto}`);
      }
    }

    // Construir ai_context con los textos reales extraídos
    let ai_context = null;
    if (excerpts.length > 0) {
      ai_context = `A continuación el contenido extraído de los documentos de referencia disponibles en la plataforma:\n\n${excerpts.join('\n\n')}`;
    } else if (Object.keys(byCategory).length > 0) {
      // Fallback: solo nombres (sin contenido extraído)
      const lines = Object.entries(byCategory).map(([cat, docs]) => {
        const label  = CATEGORY_LABELS[cat] || cat;
        const titles = docs.slice(0, 3).map(d => d.display).join('; ');
        return `- ${label}: ${titles}`;
      });
      ai_context = `Documentos de referencia disponibles en la plataforma (no se pudo extraer contenido):\n${lines.join('\n')}`;
    }

    return {
      total:       data.length,
      by_category: byCategory,
      ai_context,
    };
  } catch {
    return { total: 0, by_category: {}, ai_context: null };
  }
}
