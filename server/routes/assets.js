import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

//Acceso a la base de datos Supabase
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('asset_risk_summary')
    .select('*');

  if (error) return res.status(500).json(error);

  res.json(data);
});

//Endpoint detallado de un activo
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('asset_risk_summary')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return res.status(500).json(error);

  res.json(data);
});

// Verificar duplicados
router.post('/check-duplicate', async (req, res) => {
  try {
    const { name, lat, lng, excludeId } = req.body;

    let query = supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking duplicate:', error);
      return res.status(500).json({ error: 'Error al verificar duplicados' });
    }

    res.json({ exists: data && data.length > 0 });
  } catch (error) {
    console.error('Error in check-duplicate:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear activo
router.post('/', async (req, res) => {
  try {
    const {
      name,
      type,
      district,
      lat,
      lng,
      monthly_sales,
      area_m2,
      num_employees,
      condition
    } = req.body;

    // Validaciones básicas
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

    // 1. Insertar activo base
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({
        name: name.trim(),
        type,
        district: district.trim(),
        lat,
        lng,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (assetError) {
      console.error('Error creating asset:', assetError);
      return res.status(500).json({ error: 'Error al crear el activo' });
    }

    // 2. Insertar métricas
    const { error: metricsError } = await supabase
      .from('asset_metrics')
      .insert({
        asset_id: asset.id,
        monthly_sales,
        area_m2,
        num_employees,
        condition,
        updated_at: new Date().toISOString(),
      });

    if (metricsError) {
      console.error('Error creating metrics:', metricsError);
    }

    res.status(201).json(asset);
  } catch (error) {
    console.error('Error in POST /api/assets:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar activo
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      district,
      lat,
      lng,
      monthly_sales,
      area_m2,
      num_employees,
      condition
    } = req.body;

    // Validaciones básicas
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
    const { data: existing } = await supabase
      .from('asset_risk_summary')
      .select('id')
      .eq('name', name.trim())
      .eq('lat', lat)
      .eq('lng', lng)
      .neq('id', id);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Activo duplicado' });
    }

    // Actualizar
    const { data, error } = await supabase
      .from('assets')
      .update({
        name: name.trim(),
        type,
        district: district.trim(),
        lat,
        lng,
        monthly_sales,
        area_m2,
        num_employees,
        condition,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating asset:', error);
      return res.status(500).json({ error: 'Error al actualizar el activo' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in PUT /api/assets/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar activo
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting asset:', error);
      return res.status(500).json({ error: 'Error al eliminar el activo' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error in DELETE /api/assets/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Carga masiva de activos
router.post('/bulk', async (req, res) => {
  try {
    const { assets } = req.body;

    if (!Array.isArray(assets)) {
      return res.status(400).json({ error: 'Se esperaba un array de activos' });
    }

    const results = {
      total: assets.length,
      inserted: 0,
      duplicates: 0,
      errors: [],
    };

    // Procesar en lotes para mejor performance
    const batchSize = 10;
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const validBatch = [];

      for (const asset of batch) {
        try {
          // Validar campos
          const {
            name,
            type,
            district,
            lat,
            lng,
            monthly_sales,
            area_m2,
            num_employees,
            condition
          } = asset;

          if (!name || !type || !district || lat === undefined || lng === undefined || monthly_sales === undefined || !condition) {
            results.errors.push({ index: i + validBatch.length, error: 'Campos obligatorios faltantes' });
            continue;
          }

          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            results.errors.push({ index: i + validBatch.length, error: 'Coordenadas inválidas' });
            continue;
          }

          if (monthly_sales < 0) {
            results.errors.push({ index: i + validBatch.length, error: 'Ventas mensuales deben ser >= 0' });
            continue;
          }

          // Verificar duplicado
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

          validBatch.push({
            name: name.trim(),
            type,
            district: district.trim(),
            lat,
            lng,
            monthly_sales,
            area_m2,
            num_employees,
            condition,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (error) {
          results.errors.push({ index: i + validBatch.length, error: error.message });
        }
      }

      // Insertar batch válido
      if (validBatch.length > 0) {
        const { error } = await supabase
          .from('assets')
          .insert(validBatch);

        if (error) {
          console.error('Error inserting batch:', error);
          results.errors.push({ batch: i / batchSize, error: 'Error al insertar lote' });
        } else {
          results.inserted += validBatch.length;
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
