import { Injectable } from '@nestjs/common';
import type { RescueAgency } from '../../common/domain/enums';
import { pointSql, type LatLon } from '../../common/geo/geo-sql';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import type { TeamPing } from './live-location';
import { OPEN_MISSION_STATUSES_SQL } from './missions.repository';

export interface TeamRecord {
  id: string;
  name: string;
  agency: RescueAgency;
  teamSize: number;
  capabilities: string[];
  isAvailable: boolean;
  lat: number;
  lon: number;
  locationUpdatedAt: Date | null;
  activeMissionId: string | null;
}

export interface NearbyTeam extends TeamRecord {
  distanceM: number;
}

export interface TeamLiveContext {
  districtId: number;
  missionId: string | null;
  incidentId: string | null;
}

export interface NearestTeamsQuery {
  districtId: number;
  point: LatLon;
  capability: string | null;
  limit: number;
}

interface TeamRow {
  id: string;
  name: string;
  agency: RescueAgency;
  team_size: number;
  capabilities: string[];
  is_available: boolean;
  lat: number;
  lon: number;
  location_updated_at: Date | null;
  active_mission_id: string | null;
}

const toTeam = (row: TeamRow): TeamRecord => ({
  id: row.id,
  name: row.name,
  agency: row.agency,
  teamSize: row.team_size,
  capabilities: row.capabilities,
  isAvailable: row.is_available,
  lat: row.lat,
  lon: row.lon,
  locationUpdatedAt: row.location_updated_at,
  activeMissionId: row.active_mission_id,
});

// A team can hold several open missions; the one it has accepted outranks any still waiting
// for its answer, then the most recently assigned.
const activeMissionJoin = (teamIdColumn: string) => Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT m.id, m.incident_id
    FROM missions m
    WHERE m.team_id = ${Prisma.raw(teamIdColumn)} AND m.status IN ${OPEN_MISSION_STATUSES_SQL}
    ORDER BY m.status = 'ASSIGNED', m.assigned_at DESC
    LIMIT 1
  ) active ON true`;

const TEAM_COLUMNS = Prisma.raw(`
  rt.id, rt.name, rt.agency::text AS agency, rt.team_size, rt.capabilities, rt.is_available,
  ST_Y(rt.current_location::geometry) AS lat, ST_X(rt.current_location::geometry) AS lon, rt.location_updated_at`);

// KNN inside a LIMITed subquery so the GiST index on current_location drives the ordering
// on its own, before the per-team mission lookup. Exported so the O4 test can EXPLAIN it.
export const nearestAvailableTeamsSql = ({ districtId, point, capability, limit }: NearestTeamsQuery) => Prisma.sql`
  SELECT nearest.*, active.id AS active_mission_id
  FROM (
    SELECT ${TEAM_COLUMNS}, ST_Distance(rt.current_location, ${pointSql(point)}) AS distance_m
    FROM rescue_teams rt
    WHERE rt.is_available
      AND rt.district_id = ${districtId}::int
      AND (${capability}::text IS NULL OR ${capability}::text = ANY(rt.capabilities))
    ORDER BY rt.current_location <-> ${pointSql(point)}
    LIMIT ${limit}::int
  ) nearest
  ${activeMissionJoin('nearest.id')}
  ORDER BY nearest.distance_m`;

@Injectable()
export class TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByDistrict(districtId: number): Promise<TeamRecord[]> {
    const rows = await this.prisma.$queryRaw<TeamRow[]>`
      SELECT ${TEAM_COLUMNS}, active.id AS active_mission_id
      FROM rescue_teams rt
      ${activeMissionJoin('rt.id')}
      WHERE rt.district_id = ${districtId}::int
      ORDER BY rt.name, rt.id`;
    return rows.map(toTeam);
  }

  async findNearestAvailable(query: NearestTeamsQuery): Promise<NearbyTeam[]> {
    const rows = await this.prisma.$queryRaw<(TeamRow & { distance_m: number })[]>(nearestAvailableTeamsSql(query));
    return rows.map((row) => ({ ...toTeam(row), distanceM: row.distance_m }));
  }

  async findLiveContext(teamId: string): Promise<TeamLiveContext | null> {
    const rows = await this.prisma.$queryRaw<
      { district_id: number; mission_id: string | null; incident_id: string | null }[]
    >`
      SELECT rt.district_id, active.id AS mission_id, active.incident_id
      FROM rescue_teams rt
      ${activeMissionJoin('rt.id')}
      WHERE rt.id = ${teamId}::uuid`;
    const row = rows[0];
    return row ? { districtId: row.district_id, missionId: row.mission_id, incidentId: row.incident_id } : null;
  }

  // One statement per batch: append the trail and move each team to its newest ping. Pings for
  // teams or missions that no longer exist are dropped or unlinked rather than failing the
  // batch, and a flush never moves a team back to an older position.
  async persistPings(pings: readonly TeamPing[]): Promise<number> {
    if (pings.length === 0) return 0;
    const rows = await this.prisma.$queryRaw<{ inserted: number }[]>`
      WITH batch AS (
        SELECT p.*
        FROM unnest(
          ${pings.map((ping) => ping.teamId)}::uuid[],
          ${pings.map((ping) => ping.missionId)}::uuid[],
          ${pings.map((ping) => ping.lat)}::float8[],
          ${pings.map((ping) => ping.lon)}::float8[],
          ${pings.map((ping) => ping.accuracyM)}::real[],
          ${pings.map((ping) => ping.recordedAt)}::timestamptz[]
        ) AS p (team_id, mission_id, lat, lon, accuracy_m, recorded_at)
        JOIN rescue_teams rt ON rt.id = p.team_id
      ),
      inserted AS (
        INSERT INTO team_location_pings (team_id, mission_id, location, accuracy_m, recorded_at)
        SELECT b.team_id, m.id, ST_SetSRID(ST_MakePoint(b.lon, b.lat), 4326)::geography, b.accuracy_m, b.recorded_at
        FROM batch b
        LEFT JOIN missions m ON m.id = b.mission_id
        RETURNING 1
      ),
      latest AS (
        SELECT DISTINCT ON (team_id) team_id, lat, lon, recorded_at
        FROM batch
        ORDER BY team_id, recorded_at DESC
      ),
      moved AS (
        UPDATE rescue_teams rt
        SET current_location = ST_SetSRID(ST_MakePoint(l.lon, l.lat), 4326)::geography,
            location_updated_at = l.recorded_at
        FROM latest l
        WHERE rt.id = l.team_id
          AND (rt.location_updated_at IS NULL OR rt.location_updated_at < l.recorded_at)
        RETURNING 1
      )
      SELECT count(*)::int AS inserted FROM inserted`;
    return rows[0]?.inserted ?? 0;
  }
}
