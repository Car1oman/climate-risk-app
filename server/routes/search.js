import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

// Bounding box de Perú para validar resultados de APIs externas
const PERU_BOUNDS = { latMin: -18.5, latMax: 0.1, lngMin: -81.5, lngMax: -68.5 };

function isInPeru(lat, lng) {
  return lat >= PERU_BOUNDS.latMin && lat <= PERU_BOUNDS.latMax
      && lng >= PERU_BOUNDS.lngMin && lng <= PERU_BOUNDS.lngMax;
}

// Limpia ruido léxico antes de geocodificar
function cleanAddress(q) {
  return q
    .replace(/\bintersection with\b/gi, '&')
    .replace(/\bs\/n\b|\bsn\b|\bsin\s+número\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Normaliza query para APIs externas: garantiza contexto Perú
function normalizeGeoQuery(raw) {
  const q = cleanAddress(raw.trim());
  const lower = q.toLowerCase();
  if (lower.includes('peru') || lower.includes('perú')) return q;
  return `${q}, Lima, Peru`;
}

// Ruta de prueba
router.get('/test', (req, res) => {
  res.json({ message: 'Backend funcionando 🚀' });
});

/**
 * GET /api/search?q=
 * Búsqueda geográfica híbrida con contexto forzado a Perú.
 * Orden: assets (BD) → places (BD) → Mapbox → Google → guardar en places.
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const rawQuery = q.trim();

    // ── 1 & 2. Buscar en BD (assets primero, luego places) ──────────────────
    const [{ data: assetResults, error: assetError }, { data: placeResults, error: placeError }] =
      await Promise.all([
        supabase.rpc('search_assets', { query: rawQuery }),
        supabase.rpc('search_places', { query: rawQuery }),
      ]);

    if (assetError) console.warn('search_assets:', assetError.message);
    if (placeError)  console.warn('search_places:', placeError.message);

    // Filtrar resultados de BD: solo los que están dentro de Perú
    const validAssets = (assetResults || []).filter(r => isInPeru(r.lat, r.lng));
    const validPlaces = (placeResults  || []).filter(r => isInPeru(r.lat, r.lng));
    const fromDB = [...validAssets, ...validPlaces];

    if (fromDB.length > 0) return res.json(fromDB);

    // ── 3. Preparar query normalizado para APIs externas ────────────────────
    const geoQuery = normalizeGeoQuery(rawQuery);
    const isIntersection = rawQuery.includes('&');
    let geoResults = null;

    // ── 4. Google Geocoding (primario) ──────────────────────────────────────
    if (!geoResults && process.env.GOOGLE_GEOCODING_KEY) {
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', geoQuery);
        url.searchParams.set('components', 'country:PE');
        url.searchParams.set('key', process.env.GOOGLE_GEOCODING_KEY);
        url.searchParams.set('language', 'es');

        const r = await fetch(url.toString());
        if (!r.ok) {
          console.warn(`Google Geocoding HTTP ${r.status} para: ${geoQuery}`);
        } else {
          const d = await r.json();
          const items = (d.results || []).filter(item => {
            const loc = item.geometry?.location;
            return loc && isInPeru(loc.lat, loc.lng);
          });
          if (items.length > 0) {
            geoResults = items.map(item => ({
              direccion:     item.formatted_address,
              lat:           item.geometry.location.lat,
              lng:           item.geometry.location.lng,
              source:        'google',
              place_type_db: item.types?.[0] || 'place',
            }));
          }
        }
      } catch (e) { console.warn('Google Geocoding error:', e.message); }
    }

    // ── 5. Mapbox Geocoding (fallback) ──────────────────────────────────────
    if (!geoResults && process.env.MAPBOX_TOKEN) {
      try {
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(geoQuery)}.json`
        );
        url.searchParams.set('access_token', process.env.MAPBOX_TOKEN);
        url.searchParams.set('country', 'PE');
        url.searchParams.set('limit', '5');
        url.searchParams.set('language', 'es');
        url.searchParams.set('types', isIntersection ? 'address,poi' : 'place,locality,neighborhood,address');
        url.searchParams.set('proximity', '-76.95,-12.05');
        url.searchParams.set('bbox', '-81.5,-18.5,-68.5,0.1');
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('fuzzyMatch', 'true');

        const r = await fetch(url.toString());
        if (!r.ok) {
          console.warn(`Mapbox Geocoding HTTP ${r.status} para: ${geoQuery}`);
        } else {
          const d = await r.json();
          const features = (d.features || []).filter(f => {
            const [fLng, fLat] = f.center || [];
            return fLat != null && fLng != null && isInPeru(fLat, fLng);
          });
          if (features.length > 0) {
            geoResults = features.map(f => ({
              direccion:     f.place_name,
              lat:           f.center[1],
              lng:           f.center[0],
              source:        'mapbox',
              place_type_db: f.place_type?.[0] || 'place',
            }));
          }
        }
      } catch (e) { console.warn('Mapbox error:', e.message); }
    }

    if (!geoResults || geoResults.length === 0) return res.json([]);

    // ── 5. Guardar en places y devolver ─────────────────────────────────────
    const saved = [];
    for (const geo of geoResults) {
      const { data: inserted, error: insertErr } = await supabase
        .from('places')
        .insert({
          direccion:  geo.direccion,
          lat:        geo.lat,
          lng:        geo.lng,
          source:     geo.source,
        })
        .select('id, direccion, lat, lng')
        .single();

      if (insertErr) {
        // Conflicto por unique_place_address → recuperar existente
        if (insertErr.code !== '23505') console.error('Insert place error:', insertErr.message);
        const { data: existing } = await supabase
          .from('places')
          .select('id, direccion, lat, lng')
          .ilike('direccion', geo.direccion)
          .limit(1)
          .maybeSingle();
        if (existing) saved.push({ ...existing, tipo: 'place', source: geo.source });
      } else if (inserted) {
        saved.push({ ...inserted, tipo: 'place', source: geo.source });
      }
    }

    return res.json(saved);
  } catch (error) {
    console.error('Error en /api/search:', error.message);
    return res.status(500).json({ error: 'Error en la búsqueda' });
  }
});

/**
 * POST /api/places/assets
 * Registra un nuevo activo en una ubicación existente
 * Body: { place_id, name, unidad_negocio }
 */
router.post('/places/assets', async (req, res) => {
  try {
    const { place_id, name, unidad_negocio } = req.body;
    if (!place_id || !name?.trim()) {
      return res.status(400).json({ error: 'place_id y name son requeridos' });
    }

    const { data: place } = await supabase
      .from('places')
      .select('id')
      .eq('id', place_id)
      .single();

    if (!place) return res.status(404).json({ error: 'Ubicación no encontrada' });

    const { data: asset, error } = await supabase
      .from('assets')
      .insert({
        place_id,
        name: name.trim(),
        unidad_negocio: unidad_negocio || null,
        status: 'enriched',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya existe un activo con ese nombre en esta ubicación' });
      }
      console.error('Error insertando asset:', error.message);
      return res.status(500).json({ error: 'Error al registrar el activo' });
    }

    return res.status(201).json(asset);
  } catch (error) {
    console.error('Error en POST /api/places/assets:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
