import { z } from 'zod';
import { MISSION_STATUSES } from '../../common/domain/enums';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const csvOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((raw) => raw.split(',').map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

export const nearestTeamsQuerySchema = z.object({
  incidentId: z.uuid(),
  capability: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});
export type NearestTeamsQueryInput = z.infer<typeof nearestTeamsQuerySchema>;

export const teamLocationSchema = z.object({
  lat: latitude,
  lon: longitude,
  accuracyM: z.number().nonnegative().max(100_000).nullable().optional(),
  recordedAt: z.iso.datetime({ offset: true }),
});
export type TeamLocationInput = z.infer<typeof teamLocationSchema>;

export const assignMissionSchema = z.object({
  incidentId: z.uuid(),
  teamId: z.uuid(),
  etaMinutes: z.number().int().min(0).max(1_440).nullable().optional(),
});
export type AssignMissionInput = z.infer<typeof assignMissionSchema>;

export const missionListQuerySchema = z.object({
  status: csvOf(MISSION_STATUSES).optional(),
  incidentId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type MissionListQuery = z.infer<typeof missionListQuerySchema>;

const OUTCOME_NOTE_STATUSES: readonly string[] = ['COMPLETED', 'CANCELLED'];

export const missionStatusChangeSchema = z
  .object({
    status: z.enum(MISSION_STATUSES),
    rejectionReason: z.string().trim().min(1).max(1_000).optional(),
    peopleRescued: z.number().int().min(0).max(100_000).optional(),
    injuredCount: z.number().int().min(0).max(100_000).optional(),
    hospitalRequired: z.boolean().optional(),
    outcomeNotes: z.string().trim().min(1).max(2_000).optional(),
  })
  .refine((value) => (value.status === 'REJECTED') === (value.rejectionReason !== undefined), {
    message: 'rejectionReason is required for REJECTED and not allowed otherwise',
    path: ['rejectionReason'],
  })
  .refine((value) => value.status !== 'COMPLETED' || value.peopleRescued !== undefined, {
    message: 'peopleRescued is required for COMPLETED',
    path: ['peopleRescued'],
  })
  .refine(
    (value) =>
      value.status === 'COMPLETED' ||
      (value.peopleRescued === undefined && value.injuredCount === undefined && value.hospitalRequired === undefined),
    { message: 'Rescue outcome counts are only allowed for COMPLETED', path: ['status'] },
  )
  .refine((value) => value.outcomeNotes === undefined || OUTCOME_NOTE_STATUSES.includes(value.status), {
    message: 'outcomeNotes is only allowed for COMPLETED or CANCELLED',
    path: ['outcomeNotes'],
  });
export type MissionStatusChangeInput = z.infer<typeof missionStatusChangeSchema>;
