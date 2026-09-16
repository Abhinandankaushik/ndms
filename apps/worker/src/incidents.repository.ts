import type { ClientBase } from 'pg';
import {
  OPEN_INCIDENT_STATUSES,
  type DisasterType,
  type IncidentStatus,
  type LocationSource,
  type ReviewReason,
  type ReviewStatus,
} from './contract';

type Db = Pick<ClientBase, 'query'>;

export interface IncidentForEnrichment {
  id: string;
  districtId: number;
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
  locationSource: LocationSource;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  minutesWaiting: number;
}

export interface DuplicateCandidate {
  id: string;
  distanceM: number;
  minutesApart: number;
}

export interface NewReview {
  reason: ReviewReason;
  relatedIncidentId: string | null;
  details: Record<string, unknown>;
}

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

export async function findIncidentForEnrichment(db: Db, incidentId: string): Promise<IncidentForEnrichment | null> {
  const result = await db.query<IncidentForEnrichment>(
    `SELECT id, district_id AS "districtId", type::text AS type, status::text AS status, is_sos AS "isSos",
            location_source::text AS "locationSource", people_affected AS "peopleAffected",
            has_elderly AS "hasElderly", has_children AS "hasChildren", has_injured AS "hasInjured",
            (extract(epoch FROM now() - reported_at) / 60)::float8 AS "minutesWaiting"
     FROM incidents
     WHERE id = $1::uuid`,
    [incidentId],
  );
  return result.rows[0] ?? null;
}

// Candidates must have reached the server before this report, so two reports of one event never
// flag each other and the earliest stays the original; a report synced late from offline still
// gets flagged against the live one. ST_DWithin on geography is served by incidents_location_gist.
export const DUPLICATE_CANDIDATE_SQL = `
  SELECT other.id,
         round(ST_Distance(other.location, incident.location)::numeric, 1)::float8 AS "distanceM",
         round((abs(extract(epoch FROM other.reported_at - incident.reported_at)) / 60)::numeric, 1)::float8 AS "minutesApart"
  FROM incidents incident
  JOIN incidents other
    ON other.type = incident.type
   AND other.status = ANY($2::incident_status[])
   AND ST_DWithin(other.location, incident.location, $3::float8)
   AND other.reported_at BETWEEN incident.reported_at - make_interval(mins => $4::int)
                             AND incident.reported_at + make_interval(mins => $4::int)
   AND (other.created_at, other.reported_at, other.id) < (incident.created_at, incident.reported_at, incident.id)
  WHERE incident.id = $1::uuid
  ORDER BY other.created_at, other.reported_at, other.id
  LIMIT 1`;

export async function findDuplicateCandidate(
  db: Db,
  incidentId: string,
  rule: { radiusM: number; windowMinutes: number },
): Promise<DuplicateCandidate | null> {
  const result = await db.query<DuplicateCandidate>(DUPLICATE_CANDIDATE_SQL, [
    incidentId,
    [...OPEN_INCIDENT_STATUSES],
    rule.radiusM,
    rule.windowMinutes,
  ]);
  return result.rows[0] ?? null;
}

// Writes the two enrichment columns and nothing else: the worker never moves a status (rule 8).
export async function saveScore(
  db: Db,
  incidentId: string,
  score: { priorityScore: number; severityLevel: number },
): Promise<void> {
  await db.query(`UPDATE incidents SET priority_score = $2::numeric, severity_level = $3::smallint WHERE id = $1::uuid`, [
    incidentId,
    score.priorityScore,
    score.severityLevel,
  ]);
}

// Returns null when the same reason is already pending, so a retried job adds no second review.
export async function insertReview(db: Db, incidentId: string, review: NewReview): Promise<ReviewRecord | null> {
  const result = await db.query<ReviewRecord>(
    `INSERT INTO incident_reviews (incident_id, reason, related_incident_id, details, flagged_by)
     VALUES ($1::uuid, $2::review_reason, $3::uuid, $4::jsonb, NULL)
     ON CONFLICT (incident_id, reason) WHERE status = 'PENDING' DO NOTHING
     RETURNING id, incident_id AS "incidentId", reason::text AS reason, related_incident_id AS "relatedIncidentId",
               details, flagged_by AS "flaggedBy", status::text AS status, resolved_by AS "resolvedBy",
               resolution_note AS "resolutionNote", created_at AS "createdAt", resolved_at AS "resolvedAt"`,
    [incidentId, review.reason, review.relatedIncidentId, JSON.stringify(review.details)],
  );
  return result.rows[0] ?? null;
}

export async function findUnscoredIncidentIds(
  db: Db,
  options: { createdMoreThanSecondsAgo: number; limit: number },
): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM incidents
     WHERE priority_score IS NULL
       AND status = ANY($1::incident_status[])
       AND created_at < now() - make_interval(secs => $2::int)
     ORDER BY reported_at, id
     LIMIT $3::int`,
    [[...OPEN_INCIDENT_STATUSES], options.createdMoreThanSecondsAgo, options.limit],
  );
  return result.rows.map((row) => row.id);
}
