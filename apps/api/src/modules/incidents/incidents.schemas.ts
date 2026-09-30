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

const reportedWindow = {
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
};

const windowIsOrdered = (value: { from?: string; to?: string }) =>
  value.from === undefined || value.to === undefined || value.from <= value.to;
const windowIssue = { message: 'from must not be after to', path: ['from'] };

export const QUEUE_SORTS = ['priority', 'newest'] as const;
export type QueueSort = (typeof QUEUE_SORTS)[number];

export const queueQuerySchema = z
  .object({
    status: csvOf(INCIDENT_STATUSES).optional(),
    type: csvOf(DISASTER_TYPES).optional(),
    sosOnly: z.stringbool().optional(),
    sort: z.enum(QUEUE_SORTS).default('priority'),
    ...reportedWindow,
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(windowIsOrdered, windowIssue);
export type QueueQuery = z.infer<typeof queueQuerySchema>;

export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(200),
    ...reportedWindow,
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(windowIsOrdered, windowIssue);
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const SEARCH_MATCHES = ['id', 'id_prefix', 'phone', 'text'] as const;
export type SearchMatch = (typeof SEARCH_MATCHES)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^\+?[\d\s-]+$/;
const ID_PREFIX_PATTERN = /^[0-9a-f]{8,31}$/i;

/**
 * One box serves every lookup, so the shape of the term picks the branch (contract §Incidents).
 * Phone is tested before id prefix because digits are also valid hex: without that order
 * `9000000001` would be read as the start of an id rather than the number someone typed.
 */
export function classifySearchTerm(raw: string): { match: SearchMatch; term: string } {
  const term = raw.trim();
  if (UUID_PATTERN.test(term)) return { match: 'id', term: term.toLowerCase() };

  const digits = term.replace(/[\s-]/g, '');
  if (PHONE_PATTERN.test(term) && digits.replace('+', '').length >= 6 && digits.replace('+', '').length <= 15) {
    return { match: 'phone', term: digits };
  }

  const hex = term.replace(/-/g, '');
  if (ID_PREFIX_PATTERN.test(hex)) return { match: 'id_prefix', term: hex.toLowerCase() };

  return { match: 'text', term };
}

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
