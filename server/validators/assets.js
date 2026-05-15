import { z } from 'zod';

const coordinatesBase = {
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
};

export const createAssetSchema = z.object({
  name:           z.string().min(1).max(200).trim(),
  type:           z.string().min(1).max(100),
  district:       z.string().min(1).max(200).trim(),
  ...coordinatesBase,
  monthly_sales:  z.coerce.number().min(0),
  area_m2:        z.coerce.number().min(0).optional().nullable(),
  num_employees:  z.coerce.number().int().min(0).optional().nullable(),
  condition:      z.string().min(1).max(50),
});

export const updateAssetSchema = createAssetSchema;

export const bulkAssetsSchema = z.object({
  assets: z.array(createAssetSchema).min(1).max(500),
});

export const checkDuplicateSchema = z.object({
  name:      z.string().min(1),
  lat:       z.coerce.number().min(-90).max(90),
  lng:       z.coerce.number().min(-180).max(180),
  excludeId: z.string().uuid().optional(),
});
