import { z } from 'zod';
import { bboxSchema } from '../incidents/incidents.schemas';

export const heatmapQuerySchema = z.object({
  bbox: bboxSchema,
  hours: z.coerce.number().int().min(1).max(720).default(24),
  cellDegrees: z.coerce.number().min(0.001).max(0.1).default(0.01),
});
export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;
