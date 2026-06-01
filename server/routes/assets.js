import express from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import {
  createAssetSchema,
  updateAssetSchema,
  bulkAssetsSchema,
  checkDuplicateSchema,
} from '../validators/assets.js';

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findOrCreatePlace(lat, lng, district) {
  const { data: existing } = await supabase
    .from('places')
    .select('id')
    .eq('lat', lat)
    .eq('lng', lng)
    .maybeSingle();

  if (existing) return existing.id;

  const direccion = district ? district.trim() : `${lat},${lng}`;
  const { data: newPlace, error } = await supabase
    .from('places')
    .insert({ direccion, district: district?.trim() ?? null, lat, lng, source: 'manual' })
    .select('id')
    .single();

  if (error) throw new Error(`Error al crear ubicación: ${error.message}`);
  return newPlace.id;
}

async function getAssetWithDetails(id) {
  const { data } = await supabase
    .from('asset_risk_summary')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

// ── GET / ────────────────────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  const { data, error } = await supabase.from('asset_risk_summary').select('*');
  if (error) return res.status(500).json(error);
  res.json(data);
});

// ── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const data = await getAssetWithDetails(req.params.id);
  if (!data) return res.status(404).json({ error: 'Activo no encontrado' });
  res.json(data);
});

// ── POST /check-duplicate ────────────────────────────────────────────────────

router.post('/check-duplicate', requireAuth, validate(checkDuplicateSchema), async (req, res) => {
  try {
    const { name, lat, lng, excludeId } = req.body;

    let query = supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng);

    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Error al verificar duplicados' });

    res.json({ exists: data && data.length > 0 });
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── POST / (CREATE) ──────────────────────────────────────────────────────────

router.post('/', requireAuth, strictLimiter, validate(createAssetSchema), async (req, res) => {
  try {
    const { name, type, district, lat, lng, monthly_sales, area_m2, num_employees, condition } = req.body;

    if (!name || !type || !district || lat === undefined || lng === undefined || monthly_sales === undefined || !condition) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }
    if (monthly_sales < 0) {
      return res.status(400).json({ error: 'Ventas mensuales deben ser >= 0' });
    }

    // Verificar duplicado
    const { data: existing } = await supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Activo duplicado' });
    }

    // 1. Find or create place
    const placeId = await findOrCreatePlace(lat, lng, district);

    // 2. Insert asset
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({ name: name.trim(), type, place_id: placeId, nombre_normalizado: name.trim().toLowerCase() })
      .select()
      .single();

    if (assetError) return res.status(500).json({ error: 'Error al crear el activo' });

    // 3. Insert metrics
    await supabase.from('asset_metrics').insert({
      asset_id: asset.id, monthly_sales, area_m2, num_employees, condition,
      updated_at: new Date().toISOString(),
    });

    const full = await getAssetWithDetails(asset.id);
    res.status(201).json(full);
  } catch (error) {
    console.error('Error in POST /api/assets:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── PUT /:id (UPDATE) ────────────────────────────────────────────────────────

router.put('/:id', requireAuth, strictLimiter, validate(updateAssetSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, district, lat, lng, monthly_sales, area_m2, num_employees, condition } = req.body;

    if (!name || !type || !district || lat === undefined || lng === undefined || monthly_sales === undefined || !condition) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }
    if (monthly_sales < 0) {
      return res.status(400).json({ error: 'Ventas mensuales deben ser >= 0' });
    }

    // Verificar duplicado (excluyendo el actual)
    const { data: dup } = await supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng)
      .neq('id', id);

    if (dup && dup.length > 0) return res.status(409).json({ error: 'Activo duplicado' });

    // 1. Get current asset to find place_id
    const { data: current } = await supabase
      .from('assets')
      .select('id, place_id')
      .eq('id', id)
      .single();

    if (!current) return res.status(404).json({ error: 'Activo no encontrado' });

    // 2. Find or create place (coordinates may have changed)
    const placeId = await findOrCreatePlace(lat, lng, district);

    // Sync district in case only the district text changed (coordinates unchanged)
    if (district) {
      await supabase.from('places').update({ district: district.trim() }).eq('id', placeId);
    }

    // 3. Update asset
    const { error: assetError } = await supabase
      .from('assets')
      .update({ name: name.trim(), type, place_id: placeId, nombre_normalizado: name.trim().toLowerCase() })
      .eq('id', id);

    if (assetError) return res.status(500).json({ error: 'Error al actualizar el activo' });

    // 4. Upsert metrics
    const { data: existingMetrics } = await supabase
      .from('asset_metrics')
      .select('id')
      .eq('asset_id', id)
      .maybeSingle();

    if (existingMetrics) {
      await supabase
        .from('asset_metrics')
        .update({ monthly_sales, area_m2, num_employees, condition, updated_at: new Date().toISOString() })
        .eq('asset_id', id);
    } else {
      await supabase
        .from('asset_metrics')
        .insert({ asset_id: id, monthly_sales, area_m2, num_employees, condition, updated_at: new Date().toISOString() });
    }

    const full = await getAssetWithDetails(id);
    res.json(full);
  } catch (error) {
    console.error('Error in PUT /api/assets/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, strictLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    await supabase.from('asset_metrics').delete().eq('asset_id', id);
    const { error } = await supabase.from('assets').delete().eq('id', id);

    if (error) return res.status(500).json({ error: 'Error al eliminar el activo' });
    res.status(204).send();
  } catch (error) {
    console.error('Error in DELETE /api/assets/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── POST /bulk ───────────────────────────────────────────────────────────────

router.post('/bulk', requireAuth, strictLimiter, validate(bulkAssetsSchema), async (req, res) => {
  try {
    const { assets } = req.body;
    if (!Array.isArray(assets)) {
      return res.status(400).json({ error: 'Se esperaba un array de activos' });
    }

    const results = { total: assets.length, inserted: 0, duplicates: 0, errors: [] };
    const batchSize = 10;

    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);

      for (const asset of batch) {
        try {
          const { name, type, district, lat, lng, monthly_sales, area_m2, num_employees, condition } = asset;

          if (!name || !type || !district || lat === undefined || lng === undefined || monthly_sales === undefined || !condition) {
            results.errors.push({ index: i + results.inserted + results.duplicates, error: 'Campos obligatorios faltantes' });
            continue;
          }
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            results.errors.push({ index: i + results.inserted + results.duplicates, error: 'Coordenadas inválidas' });
            continue;
          }
          if (monthly_sales < 0) {
            results.errors.push({ index: i + results.inserted + results.duplicates, error: 'Ventas mensuales deben ser >= 0' });
            continue;
          }

          const { data: existing } = await supabase
            .from('asset_risk_summary')
            .select('id')
            .eq('name', name.trim())
            .eq('lat', lat)
            .eq('lng', lng);

          if (existing && existing.length > 0) {
            results.duplicates++;
            continue;
          }

          const placeId = await findOrCreatePlace(lat, lng, district);

          const { data: insertedAsset, error: assetError } = await supabase
            .from('assets')
            .insert({ name: name.trim(), type, place_id: placeId, nombre_normalizado: name.trim().toLowerCase() })
            .select()
            .single();

          if (assetError) {
            results.errors.push({ index: i + results.inserted + results.duplicates, error: assetError.message });
            continue;
          }

          await supabase.from('asset_metrics').insert({
            asset_id: insertedAsset.id, monthly_sales, area_m2, num_employees, condition,
            updated_at: new Date().toISOString(),
          });

          results.inserted++;
        } catch (error) {
          results.errors.push({ index: i + results.inserted + results.duplicates, error: error.message });
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error in POST /api/assets/bulk:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
