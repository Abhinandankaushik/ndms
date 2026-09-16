import { z } from 'zod';
import { ALERT_SEVERITIES, USER_ROLES } from '../../common/domain/enums';
import { geofenceSchema } from './geofence.schema';

export const issueAlertSchema = z.object({
  severity: z.enum(ALERT_SEVERITIES),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  targetRoles: z
    .array(z.enum(USER_ROLES))
    .default([])
    .transform((roles) => [...new Set(roles)]),
  geofence: geofenceSchema.nullable().optional(),
  expiresAt: z.iso
    .datetime({ offset: true })
    .refine((value) => Date.parse(value) > Date.now(), { message: 'expiresAt must be in the future' })
    .nullable()
    .optional(),
});
export type IssueAlertInput = z.infer<typeof issueAlertSchema>;

const blankAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const activeAlertsQuerySchema = z
  .object({
    lat: blankAsMissing(z.coerce.number().min(-90).max(90)),
    lon: blankAsMissing(z.coerce.number().min(-180).max(180)),
  })
  .refine((value) => (value.lat === undefined) === (value.lon === undefined), {
    message: 'lat and lon must be provided together',
    path: ['lat'],
  });
export type ActiveAlertsQuery = z.infer<typeof activeAlertsQuerySchema>;
