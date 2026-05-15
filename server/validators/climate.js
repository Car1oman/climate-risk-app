import { z } from 'zod';

export const coordQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export const climateRiskAnalysisSchema = z.object({
  lat:         z.coerce.number().min(-90).max(90),
  lon:         z.coerce.number().min(-180).max(180),
  assetId:     z.string().optional(),
  assetName:   z.string().max(200).optional(),
  assetType:   z.string().max(100).optional(),
  monthly_sales: z.coerce.number().min(0).optional(),
  num_employees: z.coerce.number().int().min(0).optional(),
  area_m2:     z.coerce.number().min(0).optional(),
  condition:   z.string().max(50).optional(),
}).passthrough(); // allow extra fields — climate analysis payload can be extended
