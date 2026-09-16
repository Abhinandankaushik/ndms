import type { Team } from '@/lib/api/types';

// Teams ping every 10 s while on duty; a position this old no longer says where the team is.
const STALE_POSITION_MS = 15 * 60_000;

export function isStalePosition(team: Pick<Team, 'locationUpdatedAt'>, now: number): boolean {
  return team.locationUpdatedAt === null || now - Date.parse(team.locationUpdatedAt) > STALE_POSITION_MS;
}
