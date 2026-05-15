import { z } from 'zod';

export const createAlertSchema = z.object({
  title:       z.string().min(1).max(300).trim(),
  description: z.string().max(2000).optional().nullable(),
  severity:    z.enum(['critical', 'warning', 'info']),
  type:        z.string().max(100).optional().nullable(),
  source:      z.string().max(200).optional().nullable(),
  region:      z.string().max(200).optional().nullable(),
  asset_id:    z.string().uuid().optional().nullable(),
});
