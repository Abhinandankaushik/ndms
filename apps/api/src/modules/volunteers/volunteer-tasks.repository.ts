import { Injectable } from '@nestjs/common';
import type { VolunteerTaskStatus } from '../../common/domain/enums';
import { pointSql, type LatLon } from '../../common/geo/geo-sql';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';

const TASK_COLUMNS = Prisma.raw(`
  t.id, t.district_id, t.created_by, t.incident_id, t.facility_id, t.title, t.description, t.required_skills,
  ST_Y(t.location::geometry) AS lat, ST_X(t.location::geometry) AS lon,
  t.status::text AS status, t.assigned_volunteer_id, t.created_at, t.updated_at, t.accepted_at, t.completed_at`);

// Plan §A5: a task is offered to a volunteer (`vp` with user `u`) only if they are
// verified and available, it lies within their service radius (served by the GiST index
// on the task location), and it needs no skills or at least one skill they have.
const TASK_MATCHES_VOLUNTEER = Prisma.raw(`
  vp.verification_status = 'VERIFIED'
  AND vp.is_available
  AND ST_DWithin(t.location, u.last_location, vp.service_radius_km * 1000)
  AND (cardinality(t.required_skills) = 0 OR t.required_skills && vp.skills)`);

// Exported so the e2e suite can EXPLAIN the exact statement the API runs.
export const nearbyTasksQuery = (volunteerId: string, limit: number) => Prisma.sql`
  SELECT ${TASK_COLUMNS}, ST_Distance(t.location, u.last_location)::float8 AS distance_m
  FROM users u
  JOIN volunteer_profiles vp ON vp.user_id = u.id
  JOIN volunteer_tasks t ON t.status = 'OPEN' AND ${TASK_MATCHES_VOLUNTEER}
  WHERE u.id = ${volunteerId}::uuid
  ORDER BY distance_m, t.created_at
  LIMIT ${limit}::int`;

export interface VolunteerTask {
  id: string;
  districtId: number;
  createdBy: string;
  incidentId: string | null;
  facilityId: string | null;
  title: string;
  description: string | null;
  requiredSkills: string[];
  lat: number;
  lon: number;
  status: VolunteerTaskStatus;
  assignedVolunteerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
}

export interface NearbyTask extends VolunteerTask {
  distanceM: number;
}

export interface NewTask {
  districtId: number;
  createdBy: string;
  incidentId: string | null;
  facilityId: string | null;
  title: string;
  description: string | null;
  requiredSkills: string[];
  location: LatLon;
}

interface TaskRow {
  id: string;
  district_id: number;
  created_by: string;
  incident_id: string | null;
  facility_id: string | null;
  title: string;
  description: string | null;
  required_skills: string[];
  lat: number;
  lon: number;
  status: VolunteerTaskStatus;
  assigned_volunteer_id: string | null;
  created_at: Date;
  updated_at: Date;
  accepted_at: Date | null;
  completed_at: Date | null;
}

const toTask = (row: TaskRow): VolunteerTask => ({
  id: row.id,
  districtId: row.district_id,
  createdBy: row.created_by,
  incidentId: row.incident_id,
  facilityId: row.facility_id,
  title: row.title,
  description: row.description,
  requiredSkills: row.required_skills,
  lat: row.lat,
  lon: row.lon,
  status: row.status,
  assignedVolunteerId: row.assigned_volunteer_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  acceptedAt: row.accepted_at,
  completedAt: row.completed_at,
});

@Injectable()
export class VolunteerTasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(task: NewTask): Promise<VolunteerTask> {
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      WITH created AS (
        INSERT INTO volunteer_tasks (district_id, created_by, incident_id, facility_id, title, description, required_skills, location)
        VALUES (${task.districtId}::int, ${task.createdBy}::uuid, ${task.incidentId}::uuid, ${task.facilityId}::uuid,
                ${task.title}::text, ${task.description}::text, ${task.requiredSkills}::text[], ${pointSql(task.location)})
        RETURNING *
      )
      SELECT ${TASK_COLUMNS} FROM created t`;
    return toTask(rows[0]!);
  }

  async findById(id: string): Promise<VolunteerTask | null> {
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      SELECT ${TASK_COLUMNS} FROM volunteer_tasks t WHERE t.id = ${id}::uuid`;
    return rows[0] ? toTask(rows[0]) : null;
  }

  async listInDistrict(
    districtId: number,
    statuses: readonly VolunteerTaskStatus[] | null,
    limit: number,
  ): Promise<VolunteerTask[]> {
    const statusFilter = statuses ? [...statuses] : null;
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      SELECT ${TASK_COLUMNS}
      FROM volunteer_tasks t
      WHERE t.district_id = ${districtId}::int
        AND (${statusFilter}::volunteer_task_status[] IS NULL OR t.status = ANY(${statusFilter}::volunteer_task_status[]))
      ORDER BY t.created_at DESC, t.id
      LIMIT ${limit}::int`;
    return rows.map(toTask);
  }

  async findNearby(volunteerId: string, limit: number): Promise<NearbyTask[]> {
    const rows = await this.prisma.$queryRaw<(TaskRow & { distance_m: number })[]>(nearbyTasksQuery(volunteerId, limit));
    return rows.map((row) => ({ ...toTask(row), distanceM: row.distance_m }));
  }

  async listAssignedTo(volunteerId: string, limit: number): Promise<VolunteerTask[]> {
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      SELECT ${TASK_COLUMNS}
      FROM volunteer_tasks t
      WHERE t.assigned_volunteer_id = ${volunteerId}::uuid
      ORDER BY (t.status = 'ACCEPTED') DESC, t.accepted_at DESC, t.id
      LIMIT ${limit}::int`;
    return rows.map(toTask);
  }

  // The status guard makes this first-wins: a concurrent accept blocks on the row lock,
  // re-checks status = 'OPEN' against the committed winner and matches nothing.
  async accept(taskId: string, volunteerId: string): Promise<VolunteerTask | null> {
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      WITH accepted AS (
        UPDATE volunteer_tasks t
        SET status = 'ACCEPTED', assigned_volunteer_id = vp.user_id, accepted_at = now()
        FROM volunteer_profiles vp
        JOIN users u ON u.id = vp.user_id
        WHERE t.id = ${taskId}::uuid
          AND t.status = 'OPEN'
          AND vp.user_id = ${volunteerId}::uuid
          AND ${TASK_MATCHES_VOLUNTEER}
        RETURNING t.*
      )
      SELECT ${TASK_COLUMNS} FROM accepted t`;
    return rows[0] ? toTask(rows[0]) : null;
  }

  async complete(taskId: string, volunteerId: string): Promise<VolunteerTask | null> {
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      WITH completed AS (
        UPDATE volunteer_tasks
        SET status = 'COMPLETED', completed_at = now()
        WHERE id = ${taskId}::uuid AND status = 'ACCEPTED' AND assigned_volunteer_id = ${volunteerId}::uuid
        RETURNING *
      )
      SELECT ${TASK_COLUMNS} FROM completed t`;
    return rows[0] ? toTask(rows[0]) : null;
  }

  async cancel(taskId: string): Promise<VolunteerTask | null> {
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      WITH cancelled AS (
        UPDATE volunteer_tasks
        SET status = 'CANCELLED'
        WHERE id = ${taskId}::uuid AND status IN ('OPEN', 'ACCEPTED')
        RETURNING *
      )
      SELECT ${TASK_COLUMNS} FROM cancelled t`;
    return rows[0] ? toTask(rows[0]) : null;
  }

  async incidentDistrictId(incidentId: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ district_id: number }[]>`
      SELECT district_id FROM incidents WHERE id = ${incidentId}::uuid`;
    return rows[0]?.district_id ?? null;
  }

  async facilityDistrictId(facilityId: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ district_id: number }[]>`
      SELECT district_id FROM facilities WHERE id = ${facilityId}::uuid`;
    return rows[0]?.district_id ?? null;
  }
}
