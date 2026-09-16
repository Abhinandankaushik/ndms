import { z } from 'zod';
import { FACILITY_KINDS, INVENTORY_ITEMS } from '../../common/domain/enums';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { phoneSchema } from '../auth/auth.schemas';
import { bboxSchema } from '../incidents/incidents.schemas';

const MAX_OCCUPANCY_DELTA = 10_000;
const MAX_CAPACITY = 1_000_000;
const MAX_STOCK_DELTA = 1_000_000;
const MAX_ATTRIBUTES_JSON_LENGTH = 10_000;

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

// Number('') is 0, so a blank `lat=` would otherwise search from 0°, 0° instead of failing.
const coordinateParam = (range: z.ZodNumber) => z.string().trim().min(1).transform(Number).pipe(range);

// Forms submit an emptied optional input as '', which means "no value", not a malformed one.
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const nullIfBlank = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable().optional());

const facilityName = z.string().trim().min(1).max(200);
const address = nullIfBlank(z.string().trim().max(500));
const contactPhone = nullIfBlank(
  z
    .string()
    .transform((raw) => raw.replace(/[\s()-]/g, ''))
    .pipe(phoneSchema),
);
const capacity = z.number().int().min(0).max(MAX_CAPACITY);
const amenities = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .transform((list) => [...new Set(list)]);
const attributes = z
  .record(z.string(), z.json())
  .refine((value) => JSON.stringify(value).length <= MAX_ATTRIBUTES_JSON_LENGTH, {
    message: `attributes must serialise to at most ${MAX_ATTRIBUTES_JSON_LENGTH} characters of JSON`,
  });

export const nearbyQuerySchema = z.object({
  lat: coordinateParam(latitude),
  lon: coordinateParam(longitude),
  kind: z.enum(FACILITY_KINDS).default('SHELTER'),
  withSpaceOnly: z.stringbool().default(true),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

export const viewportQuerySchema = z.object({
  bbox: bboxSchema,
  kind: z.enum(FACILITY_KINDS).optional(),
});
export type ViewportQuery = z.infer<typeof viewportQuerySchema>;

export const createFacilitySchema = z.object({
  kind: z.enum(FACILITY_KINDS),
  name: facilityName,
  lat: latitude,
  lon: longitude,
  address,
  contactPhone,
  capacity,
  amenities: amenities.default([]),
  attributes: attributes.default({}),
});
export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;

// Strict so an absolute `occupancy` sent here fails loudly instead of being silently dropped:
// occupancy only ever moves by delta (CLAUDE.md rule 4).
export const updateFacilitySchema = z
  .strictObject({
    name: facilityName.optional(),
    capacity: capacity.optional(),
    isOperational: z.boolean().optional(),
    address,
    contactPhone,
    amenities: amenities.optional(),
    attributes: attributes.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;

export const occupancyChangeSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-MAX_OCCUPANCY_DELTA)
    .max(MAX_OCCUPANCY_DELTA)
    .refine((delta) => delta !== 0, { message: 'delta must not be zero' }),
});
export type OccupancyChangeInput = z.infer<typeof occupancyChangeSchema>;

export const inventoryChangeSchema = z
  .object({
    delta: z.number().int().min(-MAX_STOCK_DELTA).max(MAX_STOCK_DELTA).optional(),
    lowStockThreshold: z.number().int().min(0).max(MAX_STOCK_DELTA).nullable().optional(),
  })
  .refine((value) => value.delta !== undefined || value.lowStockThreshold !== undefined, {
    message: 'Provide delta, lowStockThreshold or both',
  });
export type InventoryChangeInput = z.infer<typeof inventoryChangeSchema>;

export const inventoryItemParam = new ZodValidationPipe(z.enum(INVENTORY_ITEMS));
