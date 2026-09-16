import { z } from 'zod';
import type { LatLon } from '../../common/geo/geo-sql';

export const LIVE_POSITION_TTL_SECONDS = 600;
const MIN_PING_INTERVAL_MS = 5_000;
const MIN_PING_DISTANCE_M = 20;
const MAX_RECORDED_AGE_MS = 24 * 3_600_000;
const EARTH_MEAN_RADIUS_M = 6_371_008.8;

export const teamPingSchema = z.object({
  teamId: z.uuid(),
  missionId: z.uuid().nullable(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().nullable(),
  recordedAt: z.iso.datetime(),
});
export type TeamPing = z.infer<typeof teamPingSchema>;

export function parseTeamPing(raw: string | null): TeamPing | null {
  if (raw === null) return null;
  try {
    const parsed = teamPingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function haversineMetres(from: LatLon, to: LatLon): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const halfChord =
    Math.sin(radians(to.lat - from.lat) / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(radians(to.lon - from.lon) / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(halfChord)));
}

// Same window as an incident's reported_at: a device clock may not claim the future or more
// than a day of lag.
export function clampRecordedAt(recordedAt: Date, now = new Date()): Date {
  const earliest = now.getTime() - MAX_RECORDED_AGE_MS;
  return new Date(Math.min(Math.max(recordedAt.getTime(), earliest), now.getTime()));
}

// Spacing is measured on device time, so pings queued offline and delivered in one burst keep
// their trail and the newest still wins; a ping older than the stored one is always dropped.
export function isThrottled(previous: TeamPing, next: LatLon & { recordedAt: Date }): boolean {
  const elapsedMs = next.recordedAt.getTime() - Date.parse(previous.recordedAt);
  return elapsedMs < MIN_PING_INTERVAL_MS || haversineMetres(previous, next) < MIN_PING_DISTANCE_M;
}
