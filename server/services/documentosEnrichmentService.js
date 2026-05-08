import { supabase } from '../supabaseClient.js';

const CATEGORY_LABELS = {
  riesgo:     'Análisis de riesgos climáticos',
  impacto:    'Evaluación de impactos',
  adaptacion: 'Medidas de adaptación',
  informe:    'Informes y reportes',
};

// Inferir categoría desde nombre/descripción cuando la columna categoria está vacía
function inferCategory(doc) {
  if (doc.categoria) return doc.categoria;
  const text = `${doc.nombre} ${doc.descripcion || ''}`.toLowerCase();
  if (/riesgo|matriz|amenaza|catálog|catalog|peligro/.test(text)) return 'riesgo';
  if (/adaptaci|medida|mitigac|resilien|estrategia/.test(text))  return 'adaptacion';
  if (/impacto|pérdida|perdida|daño|consecuencia/.test(text))    return 'impacto';
  return 'informe';
}

// Nombre legible del documento (prioriza descripción, limpia el nombre técnico si no hay)
function displayName(doc) {
  if (doc.descripcion?.trim()) return doc.descripcion.trim();
  // Limpiar nombre normalizado → quitar timestamps, extensiones, guiones
  return doc.nombre
    .replace(/^\d+_/, '')           // timestamp al inicio
    .replace(/\.[^.]+$/, '')        // extensión
    .replace(/_/g, ' ')             // guiones bajos → espacios
    .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
}

export async function getDocumentosEnrichment() {
  try {
    const { data, error } = await supabase
      .from('archivos')
      .select('id, nombre, descripcion, categoria, tipo, created_at')
      .order('created_at', { ascending: false });

    if (error || !data?.length) return { total: 0, by_category: {}, ai_context: null };

    // Agrupar por categoría
    const byCategory = {};
    for (const doc of data) {
      const cat = inferCategory(doc);
      byCategory[cat] ??= [];
      byCategory[cat].push({
        nombre:      doc.nombre,
        display:     displayName(doc),
        tipo:        doc.tipo,
      });
    }

    // Construir texto de contexto para el prompt de IA
    const lines = Object.entries(byCategory).map(([cat, docs]) => {
      const label  = CATEGORY_LABELS[cat] || cat;
      const titles = docs.slice(0, 3).map(d => d.display).join('; ');
      return `- ${label}: ${titles}`;
    });

    const ai_context = lines.length
      ? `Documentos de referencia disponibles en la plataforma:\n${lines.join('\n')}`
      : null;

    return {
      total:       data.length,
      by_category: byCategory,
      ai_context,
    };
  } catch {
    return { total: 0, by_category: {}, ai_context: null };
  }
}
