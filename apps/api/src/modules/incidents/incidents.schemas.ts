import { z } from 'zod';
import { DISASTER_TYPES, INCIDENT_STATUSES, OPEN_INCIDENT_STATUSES } from '../../common/domain/enums';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const bothOrNeither = (value: { lat?: number | null; lon?: number | null }) =>
  (value.lat == null) === (value.lon == null);
const bothOrNeitherIssue = { message: 'lat and lon must be provided together', path: ['lat'] };

export const sosSchema = z
  .object({
    clientUuid: z.uuid(),
    lat: latitude.nullable().optional(),
    lon: longitude.nullable().optional(),
    accuracyM: z.number().nonnegative().max(100_000).nullable().optional(),
    reportedAt: z.iso.datetime({ offset: true }),
    type: z.enum(DISASTER_TYPES).default('OTHER'),
    peopleAffected: z.number().int().min(0).max(100_000).default(1),
  })
  .refine(bothOrNeither, bothOrNeitherIssue);
export type SosInput = z.infer<typeof sosSchema>;

export const reportSchema = z
  .object({
    clientUuid: z.uuid(),
    lat: latitude.nullable().optional(),
    lon: longitude.nullable().optional(),
    accuracyM: z.number().nonnegative().max(100_000).nullable().optional(),
    locationSource: z.enum(['GPS', 'MANUAL_PIN']).default('GPS'),
    reportedAt: z.iso.datetime({ offset: true }),
    type: z.enum(DISASTER_TYPES),
    description: z.string().trim().max(2000).optional(),
    addressText: z.string().trim().max(500).optional(),
    peopleAffected: z.number().int().min(0).max(100_000).default(1),
    hasElderly: z.boolean().default(false),
    hasChildren: z.boolean().default(false),
    hasInjured: z.boolean().default(false),
  })
  .refine(bothOrNeither, bothOrNeitherIssue);
export type ReportInput = z.infer<typeof reportSchema>;

export const updateDetailsSchema = z
  .object({
    type: z.enum(DISASTER_TYPES).optional(),
    description: z.string().trim().max(2000).optional(),
    addressText: z.string().trim().max(500).optional(),
    peopleAffected: z.number().int().min(0).max(100_000).optional(),
    hasElderly: z.boolean().optional(),
    hasChildren: z.boolean().optional(),
    hasInjured: z.boolean().optional(),
    manualPin: z.object({ lat: latitude, lon: longitude }).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdateDetailsInput = z.infer<typeof updateDetailsSchema>;

const csvOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((raw) => raw.split(',').map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

export const bboxSchema = z
  .string()
  .transform((raw) => raw.split(',').map(Number))
  .pipe(z.tuple([longitude, latitude, longitude, latitude]))
  .refine(([minLon, minLat, maxLon, maxLat]) => minLon < maxLon && minLat < maxLat, {
    message: 'bbox must be minLon,minLat,maxLon,maxLat with min < max',
  });

export const mapQuerySchema = z.object({
  bbox: bboxSchema,
  status: csvOf(INCIDENT_STATUSES).optional(),
  type: csvOf(DISASTER_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});
export type MapQuery = z.infer<typeof mapQuerySchema>;

export const queueQuerySchema = z.object({
  status: csvOf(INCIDENT_STATUSES).optional(),
  type: csvOf(DISASTER_TYPES).optional(),
  sosOnly: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type QueueQuery = z.infer<typeof queueQuerySchema>;

export const statusChangeSchema = z
  .object({
    status: z.enum(INCIDENT_STATUSES),
    note: z.string().trim().max(1000).optional(),
    duplicateOf: z.uuid().optional(),
  })
  .refine((value) => (value.status === 'REJECTED_DUPLICATE') === (value.duplicateOf !== undefined), {
    message: 'duplicateOf is required for REJECTED_DUPLICATE and not allowed otherwise',
    path: ['duplicateOf'],
  });
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

export const DEFAULT_MAP_STATUSES = OPEN_INCIDENT_STATUSES;
