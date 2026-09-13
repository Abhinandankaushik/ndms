import { Injectable } from '@nestjs/common';
import type { DisasterType, IncidentStatus, ReviewReason, ReviewStatus } from '../../common/domain/enums';
import { PrismaService } from '../../infra/database/prisma.service';

export interface ReviewRecord {
  id: string;
  incidentId: string;
  reason: ReviewReason;
  relatedIncidentId: string | null;
  details: unknown;
  flaggedBy: string | null;
  status: ReviewStatus;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface PendingReview extends ReviewRecord {
  incident: {
    districtId: number;
    type: DisasterType;
    status: IncidentStatus;
    isSos: boolean;
    lat: number | null;
    lon: number | null;
    reportedAt: Date;
    description: string | null;
  };
}

interface ReviewRow {
  id: string;
  incident_id: string;
  reason: ReviewReason;
  related_incident_id: string | null;
  details: unknown;
  flagged_by: string | null;
  status: ReviewStatus;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: Date;
  resolved_at: Date | null;
}

const toRecord = (row: ReviewRow): ReviewRecord => ({
  id: row.id,
  incidentId: row.incident_id,
  reason: row.reason,
  relatedIncidentId: row.related_incident_id,
  details: row.details,
  flaggedBy: row.flagged_by,
  status: row.status,
  resolvedBy: row.resolved_by,
  resolutionNote: row.resolution_note,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Returns null when the same reason is already pending for this incident.
  async create(review: {
    incidentId: string;
    reason: ReviewReason;
    relatedIncidentId: string | null;
    details: Record<string, unknown>;
    flaggedBy: string | null;
  }): Promise<ReviewRecord | null> {
    const rows = await this.prisma.$queryRaw<ReviewRow[]>`
      INSERT INTO incident_reviews (incident_id, reason, related_incident_id, details, flagged_by)
      VALUES (${review.incidentId}::uuid, ${review.reason}::review_reason, ${review.relatedIncidentId}::uuid,
              ${JSON.stringify(review.details)}::jsonb, ${review.flaggedBy}::uuid)
      ON CONFLICT (incident_id, reason) WHERE status = 'PENDING' DO NOTHING
      RETURNING id, incident_id, reason::text AS reason, related_incident_id, details, flagged_by,
                status::text AS status, resolved_by, resolution_note, created_at, resolved_at`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<(ReviewRecord & { districtId: number }) | null> {
    const rows = await this.prisma.$queryRaw<(ReviewRow & { district_id: number })[]>`
      SELECT r.id, r.incident_id, r.reason::text AS reason, r.related_incident_id, r.details, r.flagged_by,
             r.status::text AS status, r.resolved_by, r.resolution_note, r.created_at, r.resolved_at,
             i.district_id
      FROM incident_reviews r
      JOIN incidents i ON i.id = r.incident_id
      WHERE r.id = ${id}::uuid`;
    const row = rows[0];
    return row ? { ...toRecord(row), districtId: row.district_id } : null;
  }

  async listPending(districtId: number, limit: number): Promise<PendingReview[]> {
    const rows = await this.prisma.$queryRaw<
      (ReviewRow & {
        district_id: number;
        type: DisasterType;
        incident_status: IncidentStatus;
        is_sos: boolean;
        lat: number | null;
        lon: number | null;
        reported_at: Date;
        description: string | null;
      })[]
    >`
      SELECT r.id, r.incident_id, r.reason::text AS reason, r.related_incident_id, r.details, r.flagged_by,
             r.status::text AS status, r.resolved_by, r.resolution_note, r.created_at, r.resolved_at,
             i.district_id, i.type::text AS type, i.status::text AS incident_status, i.is_sos,
             ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lon, i.reported_at, i.description
      FROM incident_reviews r
      JOIN incidents i ON i.id = r.incident_id
      WHERE r.status = 'PENDING' AND i.district_id = ${districtId}::int
      ORDER BY r.created_at
      LIMIT ${limit}::int`;
    return rows.map((row) => ({
      ...toRecord(row),
      incident: {
        districtId: row.district_id,
        type: row.type,
        status: row.incident_status,
        isSos: row.is_sos,
        lat: row.lat,
        lon: row.lon,
        reportedAt: row.reported_at,
        description: row.description,
      },
    }));
  }

  async resolve(id: string, resolvedBy: string, note: string | null): Promise<ReviewRecord | null> {
    const rows = await this.prisma.$queryRaw<ReviewRow[]>`
      UPDATE incident_reviews
      SET status = 'RESOLVED', resolved_by = ${resolvedBy}::uuid, resolved_at = now(), resolution_note = ${note}::text
      WHERE id = ${id}::uuid AND status = 'PENDING'
      RETURNING id, incident_id, reason::text AS reason, related_incident_id, details, flagged_by,
                status::text AS status, resolved_by, resolution_note, created_at, resolved_at`;
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
