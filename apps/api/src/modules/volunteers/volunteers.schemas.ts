import { z } from 'zod';
import { VERIFICATION_STATUSES, VOLUNTEER_TASK_STATUSES } from '../../common/domain/enums';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

// Matching uses the && array operator, which compares exact strings, so "first aid" and
// "FIRST_AID" must be stored identically on volunteers and tasks.
const skill = z
  .string()
  .transform((raw) => raw.trim().toUpperCase().replace(/[\s-]+/g, '_'))
  .pipe(z.string().regex(/^[A-Z0-9_]{2,40}$/, 'A skill is 2-40 letters, digits or underscores'));

const skillList = z
  .array(skill)
  .max(20)
  .transform((skills) => [...new Set(skills)]);

const serviceRadiusKm = z.number().int().min(1).max(100);

export const registerSchema = z.object({
  skills: skillList,
  serviceRadiusKm,
  lat: latitude,
  lon: longitude,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const updateProfileSchema = z
  .object({
    skills: skillList.optional(),
    serviceRadiusKm: serviceRadiusKm.optional(),
    isAvailable: z.boolean().optional(),
    lat: latitude.optional(),
    lon: longitude.optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lon === undefined), {
    message: 'lat and lon must be provided together',
    path: ['lat'],
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const presignDocumentSchema = z.object({
  contentType: z.enum(DOCUMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
});
export type PresignDocumentInput = z.infer<typeof presignDocumentSchema>;

export const confirmDocumentSchema = z.object({ mediaId: z.uuid() });
export type ConfirmDocumentInput = z.infer<typeof confirmDocumentSchema>;

export const listVolunteersQuerySchema = z.object({
  status: z.enum(VERIFICATION_STATUSES).default('PENDING'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListVolunteersQuery = z.infer<typeof listVolunteersQuerySchema>;

export const reviewSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  rejectionReason: z.string().trim().min(1).max(1000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  requiredSkills: skillList.default([]),
  lat: latitude,
  lon: longitude,
  incidentId: z.uuid().optional(),
  facilityId: z.uuid().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const listTasksQuerySchema = z.object({
  status: z
    .string()
    .transform((raw) => raw.split(',').map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.enum(VOLUNTEER_TASK_STATUSES)).min(1))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
