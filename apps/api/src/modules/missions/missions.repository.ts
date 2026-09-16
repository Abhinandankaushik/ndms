import { Injectable } from '@nestjs/common';
import type { MissionStatus } from '../../common/domain/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import {
  ACCEPTED_MISSION_STATUSES,
  OPEN_MISSION_STATUSES,
  type StepDecision,
  type TeamEffect,
} from './mission-transitions';

// Inlined as literals rather than bound: ON CONFLICT infers the partial index
// missions_one_open_per_incident_team_idx only from a predicate it can prove at plan time.
const statusListSql = (statuses: readonly MissionStatus[]) =>
  Prisma.raw(`(${statuses.map((status) => `'${status}'`).join(', ')})`);

export const OPEN_MISSION_STATUSES_SQL = statusListSql(OPEN_MISSION_STATUSES);
const ACCEPTED_MISSION_STATUSES_SQL = statusListSql(ACCEPTED_MISSION_STATUSES);

const MISSION_COLUMNS = Prisma.raw(`
  m.id, m.incident_id, m.team_id, m.assigned_by, m.status::text AS status, m.eta_minutes, m.rejection_reason,
  m.people_rescued, m.injured_count, m.hospital_required, m.outcome_notes,
  m.assigned_at, m.accepted_at, m.reached_at, m.completed_at, m.updated_at`);

export interface MissionRecord {
  id: string;
  incidentId: string;
  teamId: string;
  assignedBy: string;
  status: MissionStatus;
  etaMinutes: number | null;
  rejectionReason: string | null;
  peopleRescued: number | null;
  injuredCount: number | null;
  hospitalRequired: boolean | null;
  outcomeNotes: string | null;
  assignedAt: Date;
  acceptedAt: Date | null;
  reachedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface ScopedMission {
  mission: MissionRecord;
  districtId: number;
  teamName: string;
}

export interface ReporterContact {
  fullName: string | null;
  phone: string;
}

export type CreateOutcome =
  | { kind: 'CREATED'; mission: MissionRecord; teamName: string }
  | { kind: 'TEAM_NOT_FOUND' | 'TEAM_UNAVAILABLE' | 'ALREADY_OPEN' };

export interface MissionStep {
  to: MissionStatus;
  rejectionReason: string | null;
  peopleRescued: number | null;
  injuredCount: number | null;
  hospitalRequired: boolean | null;
  outcomeNotes: string | null;
  teamEffect: TeamEffect | null;
}

export type StepOutcome =
  | { kind: 'APPLIED'; from: MissionStatus; scoped: ScopedMission }
  | { kind: 'REPLAYED'; scoped: ScopedMission }
  | { kind: 'TEAM_UNAVAILABLE' };

interface MissionRow {
  id: string;
  incident_id: string;
  team_id: string;
  assigned_by: string;
  status: MissionStatus;
  eta_minutes: number | null;
  rejection_reason: string | null;
  people_rescued: number | null;
  injured_count: number | null;
  hospital_required: boolean | null;
  outcome_notes: string | null;
  assigned_at: Date;
  accepted_at: Date | null;
  reached_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}

type ScopedMissionRow = MissionRow & { district_id: number; team_name: string };

const toMission = (row: MissionRow): MissionRecord => ({
  id: row.id,
  incidentId: row.incident_id,
  teamId: row.team_id,
  assignedBy: row.assigned_by,
  status: row.status,
  etaMinutes: row.eta_minutes,
  rejectionReason: row.rejection_reason,
  peopleRescued: row.people_rescued,
  injuredCount: row.injured_count,
  hospitalRequired: row.hospital_required,
  outcomeNotes: row.outcome_notes,
  assignedAt: row.assigned_at,
  acceptedAt: row.accepted_at,
  reachedAt: row.reached_at,
  completedAt: row.completed_at,
  updatedAt: row.updated_at,
});

type Queryable = Pick<PrismaService, '$queryRaw' | '$executeRaw'>;

class TeamUnavailable extends Error {}

@Injectable()
export class MissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // The team row is share-locked so a concurrent accept cannot occupy the team between the
  // availability check and the insert.
  create(input: {
    incidentId: string;
    teamId: string;
    districtId: number;
    assignedBy: string;
    etaMinutes: number | null;
  }): Promise<CreateOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const teams = await tx.$queryRaw<{ name: string; is_available: boolean }[]>`
        SELECT name, is_available
        FROM rescue_teams
        WHERE id = ${input.teamId}::uuid AND district_id = ${input.districtId}::int
        FOR SHARE`;
      const team = teams[0];
      if (!team) return { kind: 'TEAM_NOT_FOUND' };
      if (!team.is_available) return { kind: 'TEAM_UNAVAILABLE' };

      const rows = await tx.$queryRaw<MissionRow[]>`
        INSERT INTO missions AS m (incident_id, team_id, assigned_by, eta_minutes)
        VALUES (${input.incidentId}::uuid, ${input.teamId}::uuid, ${input.assignedBy}::uuid, ${input.etaMinutes}::int)
        ON CONFLICT (incident_id, team_id) WHERE status IN ${OPEN_MISSION_STATUSES_SQL} DO NOTHING
        RETURNING ${MISSION_COLUMNS}`;
      return rows[0] ? { kind: 'CREATED', mission: toMission(rows[0]), teamName: team.name } : { kind: 'ALREADY_OPEN' };
    });
  }

  findScoped(id: string): Promise<ScopedMission | null> {
    return this.selectScoped(this.prisma, id, Prisma.empty);
  }

  async listForDistrict(filter: {
    districtId: number;
    statuses: readonly MissionStatus[] | null;
    incidentId: string | null;
    limit: number;
  }): Promise<MissionRecord[]> {
    const statuses = filter.statuses ? [...filter.statuses] : null;
    const rows = await this.prisma.$queryRaw<MissionRow[]>`
      SELECT ${MISSION_COLUMNS}
      FROM missions m
      JOIN incidents i ON i.id = m.incident_id
      WHERE i.district_id = ${filter.districtId}::int
        AND (${statuses}::mission_status[] IS NULL OR m.status = ANY(${statuses}::mission_status[]))
        AND (${filter.incidentId}::uuid IS NULL OR m.incident_id = ${filter.incidentId}::uuid)
      ORDER BY m.assigned_at DESC
      LIMIT ${filter.limit}::int`;
    return rows.map(toMission);
  }

  // Open missions first, in the incident queue's order; finished ones after, most recent first.
  async listForTeam(teamId: string, limit: number): Promise<MissionRecord[]> {
    const rows = await this.prisma.$queryRaw<MissionRow[]>`
      SELECT ${MISSION_COLUMNS}
      FROM missions m
      JOIN incidents i ON i.id = m.incident_id
      WHERE m.team_id = ${teamId}::uuid
      ORDER BY m.status IN ${OPEN_MISSION_STATUSES_SQL} DESC,
               CASE WHEN m.status IN ${OPEN_MISSION_STATUSES_SQL} THEN i.priority_score END DESC NULLS LAST,
               CASE WHEN m.status IN ${OPEN_MISSION_STATUSES_SQL} THEN i.reported_at END ASC,
               m.updated_at DESC
      LIMIT ${limit}::int`;
    return rows.map(toMission);
  }

  async findReporterContact(incidentId: string): Promise<ReporterContact | null> {
    const rows = await this.prisma.$queryRaw<{ full_name: string | null; phone: string }[]>`
      SELECT u.full_name, u.phone
      FROM incidents i
      JOIN users u ON u.id = i.reporter_id
      WHERE i.id = ${incidentId}::uuid`;
    return rows[0] ? { fullName: rows[0].full_name, phone: rows[0].phone } : null;
  }

  // Locks the mission and its team before changing either. Two taps cannot both apply a step,
  // and an assignment racing this step (it holds the team row while its insert checks this
  // mission in the open-mission index) waits for us or we for it, never both.
  async applyStep(
    id: string,
    decide: (current: ScopedMission) => StepDecision,
    step: MissionStep,
  ): Promise<StepOutcome | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.selectScoped(tx, id, Prisma.sql`FOR UPDATE OF m, rt`);
        if (!current) return null;
        if (decide(current) === 'REPLAY') return { kind: 'REPLAYED', scoped: current };

        await this.updateStatus(tx, id, step);
        if (step.teamEffect === 'OCCUPY' && !(await this.occupyTeam(tx, current.mission.teamId))) {
          throw new TeamUnavailable();
        }
        if (step.teamEffect === 'RELEASE') await this.releaseTeam(tx, current.mission.teamId);

        return { kind: 'APPLIED', from: current.mission.status, scoped: (await this.selectScoped(tx, id, Prisma.empty))! };
      });
    } catch (error) {
      if (error instanceof TeamUnavailable) return { kind: 'TEAM_UNAVAILABLE' };
      throw error;
    }
  }

  async countOpenMissions(incidentId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM missions m
      WHERE m.incident_id = ${incidentId}::uuid AND m.status IN ${OPEN_MISSION_STATUSES_SQL}`;
    return rows[0]?.count ?? 0;
  }

  private async selectScoped(db: Queryable, id: string, locking: Prisma.Sql): Promise<ScopedMission | null> {
    const rows = await db.$queryRaw<ScopedMissionRow[]>`
      SELECT ${MISSION_COLUMNS}, i.district_id, rt.name AS team_name
      FROM missions m
      JOIN incidents i ON i.id = m.incident_id
      JOIN rescue_teams rt ON rt.id = m.team_id
      WHERE m.id = ${id}::uuid
      ${locking}`;
    const row = rows[0];
    return row ? { mission: toMission(row), districtId: row.district_id, teamName: row.team_name } : null;
  }

  private async updateStatus(db: Queryable, id: string, step: MissionStep): Promise<void> {
    await db.$executeRaw`
      UPDATE missions SET
        status = ${step.to}::mission_status,
        rejection_reason = COALESCE(${step.rejectionReason}::text, rejection_reason),
        people_rescued = COALESCE(${step.peopleRescued}::int, people_rescued),
        injured_count = COALESCE(${step.injuredCount}::int, injured_count),
        hospital_required = COALESCE(${step.hospitalRequired}::boolean, hospital_required),
        outcome_notes = COALESCE(${step.outcomeNotes}::text, outcome_notes),
        accepted_at = CASE WHEN ${step.to}::mission_status = 'ACCEPTED' THEN now() ELSE accepted_at END,
        reached_at = CASE WHEN ${step.to}::mission_status = 'ON_SITE' THEN now() ELSE reached_at END,
        completed_at = CASE WHEN ${step.to}::mission_status = 'COMPLETED' THEN now() ELSE completed_at END
      WHERE id = ${id}::uuid`;
  }

  // A team works one accepted mission at a time; the conditional update is the check.
  private async occupyTeam(db: Queryable, teamId: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      UPDATE rescue_teams SET is_available = false
      WHERE id = ${teamId}::uuid AND is_available
      RETURNING id`;
    return rows.length > 0;
  }

  // "Available again" still holds a team back while it works another mission it accepted.
  private async releaseTeam(db: Queryable, teamId: string): Promise<void> {
    await db.$executeRaw`
      UPDATE rescue_teams SET is_available = NOT EXISTS (
        SELECT 1 FROM missions m
        WHERE m.team_id = ${teamId}::uuid AND m.status IN ${ACCEPTED_MISSION_STATUSES_SQL}
      )
      WHERE id = ${teamId}::uuid`;
  }
}
