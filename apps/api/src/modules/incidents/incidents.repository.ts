import { Injectable } from '@nestjs/common';
import type { DisasterType, IncidentStatus, LocationSource } from '../../common/domain/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import type { QueueSort } from './incidents.schemas';

export interface ReportedWindow {
  from: Date | null;
  to: Date | null;
}

// Enums come back as text and NUMERIC as float8 so rows serialise to JSON without
// Prisma Decimal objects.
const INCIDENT_COLUMNS = Prisma.raw(`
  i.id, i.client_uuid, i.district_id, i.reporter_id, i.type::text AS type, i.status::text AS status, i.is_sos,
  ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lon,
  i.location_source::text AS location_source, i.location_accuracy_m, i.address_text, i.description,
  i.people_affected, i.has_elderly, i.has_children, i.has_injured,
  i.priority_score::float8 AS priority_score, i.severity_level, i.duplicate_of,
  i.reported_at, i.created_at, i.updated_at, i.resolved_at`);

export interface NewIncident {
  clientUuid: string;
  reporterId: string;
  reporterDistrictId: number | null;
  type: DisasterType;
  isSos: boolean;
  lat: number | null;
  lon: number | null;
  locationSource: LocationSource;
  accuracyM: number | null;
  addressText: string | null;
  description: string | null;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  reportedAt: Date;
}

export interface UpsertResult {
  id: string;
  districtId: number;
  status: IncidentStatus;
  reportedAt: Date;
  wasInserted: boolean;
}

export interface IncidentRecord {
  id: string;
  clientUuid: string;
  districtId: number;
  reporterId: string;
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
  lat: number | null;
  lon: number | null;
  locationSource: LocationSource;
  accuracyM: number | null;
  addressText: string | null;
  description: string | null;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  priorityScore: number | null;
  severityLevel: number | null;
  duplicateOf: string | null;
  reportedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface MapMarker {
  id: string;
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
  lat: number;
  lon: number;
  accuracyM: number | null;
  priorityScore: number | null;
  peopleAffected: number;
  reportedAt: Date;
}

export interface StatusLogEntry {
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus;
  changedBy: string | null;
  note: string | null;
  changedAt: Date;
}

interface IncidentRow {
  id: string;
  client_uuid: string;
  district_id: number;
  reporter_id: string;
  type: DisasterType;
  status: IncidentStatus;
  is_sos: boolean;
  lat: number | null;
  lon: number | null;
  location_source: LocationSource;
  location_accuracy_m: number | null;
  address_text: string | null;
  description: string | null;
  people_affected: number;
  has_elderly: boolean;
  has_children: boolean;
  has_injured: boolean;
  priority_score: number | null;
  severity_level: number | null;
  duplicate_of: string | null;
  reported_at: Date;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

const toRecord = (row: IncidentRow): IncidentRecord => ({
  id: row.id,
  clientUuid: row.client_uuid,
  districtId: row.district_id,
  reporterId: row.reporter_id,
  type: row.type,
  status: row.status,
  isSos: row.is_sos,
  lat: row.lat,
  lon: row.lon,
  locationSource: row.location_source,
  accuracyM: row.location_accuracy_m,
  addressText: row.address_text,
  description: row.description,
  peopleAffected: row.people_affected,
  hasElderly: row.has_elderly,
  hasChildren: row.has_children,
  hasInjured: row.has_injured,
  priorityScore: row.priority_score,
  severityLevel: row.severity_level,
  duplicateOf: row.duplicate_of,
  reportedAt: row.reported_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  resolvedAt: row.resolved_at,
});

type Queryable = Pick<PrismaService, '$queryRaw' | '$executeRaw'>;

@Injectable()
export class IncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // One statement: resolve the district, clamp the device clock, upsert on client_uuid and
  // write the first status-log row. A replay by the same reporter returns the existing row;
  // a client_uuid owned by someone else returns nothing.
  async upsert(incident: NewIncident): Promise<UpsertResult | null> {
    const rows = await this.prisma.$queryRaw<
      { id: string; district_id: number; status: IncidentStatus; reported_at: Date; was_inserted: boolean }[]
    >`
      WITH point AS (
        SELECT CASE
                 WHEN ${incident.lon}::float8 IS NULL THEN NULL
                 ELSE ST_SetSRID(ST_MakePoint(${incident.lon}::float8, ${incident.lat}::float8), 4326)::geography
               END AS location
      ),
      district AS (
        SELECT COALESCE(
          (SELECT d.id FROM districts d, point p
            WHERE p.location IS NOT NULL AND ST_Covers(d.boundary, p.location) LIMIT 1),
          ${incident.reporterDistrictId}::int,
          (SELECT d.id FROM districts d, point p
            WHERE p.location IS NOT NULL ORDER BY d.boundary <-> p.location LIMIT 1),
          (SELECT d.id FROM districts d ORDER BY d.id LIMIT 1)
        ) AS id
      ),
      upserted AS (
        INSERT INTO incidents (
          client_uuid, district_id, reporter_id, type, is_sos, location, location_source,
          location_accuracy_m, address_text, description, people_affected,
          has_elderly, has_children, has_injured, reported_at
        )
        SELECT ${incident.clientUuid}::uuid, district.id, ${incident.reporterId}::uuid,
               ${incident.type}::disaster_type, ${incident.isSos}::boolean, point.location,
               ${incident.locationSource}::location_source, ${incident.accuracyM}::real,
               ${incident.addressText}::text, ${incident.description}::text, ${incident.peopleAffected}::int,
               ${incident.hasElderly}::boolean, ${incident.hasChildren}::boolean, ${incident.hasInjured}::boolean,
               LEAST(GREATEST(${incident.reportedAt}::timestamptz, now() - interval '24 hours'), now())
        FROM point, district
        ON CONFLICT (client_uuid) DO UPDATE SET updated_at = now()
          WHERE incidents.reporter_id = EXCLUDED.reporter_id
        RETURNING id, district_id, status::text AS status, reported_at, (xmax = 0) AS was_inserted
      ),
      logged AS (
        INSERT INTO incident_status_log (incident_id, from_status, to_status, changed_by)
        SELECT id, NULL, 'REPORTED', ${incident.reporterId}::uuid FROM upserted WHERE was_inserted
      )
      SELECT id, district_id, status, reported_at, was_inserted FROM upserted`;

    const row = rows[0];
    return row
      ? {
          id: row.id,
          districtId: row.district_id,
          status: row.status,
          reportedAt: row.reported_at,
          wasInserted: row.was_inserted,
        }
      : null;
  }

  async findById(id: string, db: Queryable = this.prisma): Promise<IncidentRecord | null> {
    const rows = await db.$queryRaw<IncidentRow[]>`
      SELECT ${INCIDENT_COLUMNS}
      FROM incidents i
      WHERE i.id = ${id}::uuid`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findInBoundingBox(
    districtId: number,
    bbox: [number, number, number, number],
    statuses: readonly IncidentStatus[],
    types: readonly DisasterType[] | null,
    limit: number,
  ): Promise<MapMarker[]> {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        type: DisasterType;
        status: IncidentStatus;
        is_sos: boolean;
        lat: number;
        lon: number;
        location_accuracy_m: number | null;
        priority_score: number | null;
        people_affected: number;
        reported_at: Date;
      }[]
    >`
      SELECT i.id, i.type::text AS type, i.status::text AS status, i.is_sos,
             ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lon,
             i.location_accuracy_m, i.priority_score::float8 AS priority_score,
             i.people_affected, i.reported_at
      FROM incidents i
      WHERE i.location && ST_MakeEnvelope(${minLon}::float8, ${minLat}::float8, ${maxLon}::float8, ${maxLat}::float8, 4326)::geography
        AND i.district_id = ${districtId}::int
        AND i.status = ANY(${[...statuses]}::incident_status[])
        AND (${types ? [...types] : null}::disaster_type[] IS NULL OR i.type = ANY(${types ? [...types] : null}::disaster_type[]))
      ORDER BY i.reported_at DESC
      LIMIT ${limit}::int`;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      isSos: row.is_sos,
      lat: row.lat,
      lon: row.lon,
      accuracyM: row.location_accuracy_m,
      priorityScore: row.priority_score,
      peopleAffected: row.people_affected,
      reportedAt: row.reported_at,
    }));
  }

  // Unscored reports sort after scored ones but stay visible, oldest first (plan §A2.3).
  // `newest` exists because that ordering buries a fresh report under every scored one:
  // it is the only way an officer sees a report that has just arrived.
  async findQueue(
    districtId: number,
    statuses: readonly IncidentStatus[],
    types: readonly DisasterType[] | null,
    sosOnly: boolean,
    sort: QueueSort,
    window: ReportedWindow,
    limit: number,
    offset: number,
  ): Promise<IncidentRecord[]> {
    const order =
      sort === 'newest'
        ? Prisma.raw('i.reported_at DESC, i.id')
        : Prisma.raw('i.priority_score DESC NULLS LAST, i.reported_at ASC');
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      SELECT ${INCIDENT_COLUMNS}
      FROM incidents i
      WHERE i.district_id = ${districtId}::int
        AND i.status = ANY(${[...statuses]}::incident_status[])
        AND (${types ? [...types] : null}::disaster_type[] IS NULL OR i.type = ANY(${types ? [...types] : null}::disaster_type[]))
        AND (NOT ${sosOnly}::boolean OR i.is_sos)
        AND (${window.from}::timestamptz IS NULL OR i.reported_at >= ${window.from}::timestamptz)
        AND (${window.to}::timestamptz IS NULL OR i.reported_at <= ${window.to}::timestamptz)
      ORDER BY ${order}
      LIMIT ${limit}::int OFFSET ${offset}::int`;
    return rows.map(toRecord);
  }

  async searchById(districtId: number, id: string, window: ReportedWindow): Promise<IncidentRecord[]> {
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      SELECT ${INCIDENT_COLUMNS}
      FROM incidents i
      WHERE i.district_id = ${districtId}::int
        AND i.id = ${id}::uuid
        AND (${window.from}::timestamptz IS NULL OR i.reported_at >= ${window.from}::timestamptz)
        AND (${window.to}::timestamptz IS NULL OR i.reported_at <= ${window.to}::timestamptz)`;
    return rows.map(toRecord);
  }

  async searchByIdPrefix(
    districtId: number,
    prefix: string,
    window: ReportedWindow,
    limit: number,
    offset: number,
  ): Promise<IncidentRecord[]> {
    // Matches the text_pattern_ops index from 20260921090000; the dashes are stripped from
    // the term, so the pattern is built against the id with its dashes removed too.
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      SELECT ${INCIDENT_COLUMNS}
      FROM incidents i
      WHERE i.district_id = ${districtId}::int
        AND (i.id::text LIKE ${prefix + '%'} OR replace(i.id::text, '-', '') LIKE ${prefix + '%'})
        AND (${window.from}::timestamptz IS NULL OR i.reported_at >= ${window.from}::timestamptz)
        AND (${window.to}::timestamptz IS NULL OR i.reported_at <= ${window.to}::timestamptz)
      ORDER BY i.reported_at DESC, i.id
      LIMIT ${limit}::int OFFSET ${offset}::int`;
    return rows.map(toRecord);
  }

  async searchByReporterPhone(
    districtId: number,
    phone: string,
    window: ReportedWindow,
    limit: number,
    offset: number,
  ): Promise<IncidentRecord[]> {
    // Officers type the local number; the column holds it E.164 with +91. Comparing the
    // trailing digits accepts both without the caller having to know which form is stored.
    const digits = phone.replace(/\D/g, '');
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      SELECT ${INCIDENT_COLUMNS}
      FROM incidents i
      JOIN users u ON u.id = i.reporter_id
      WHERE i.district_id = ${districtId}::int
        AND right(regexp_replace(u.phone, '[^0-9]', '', 'g'), length(${digits})) = ${digits}
        AND (${window.from}::timestamptz IS NULL OR i.reported_at >= ${window.from}::timestamptz)
        AND (${window.to}::timestamptz IS NULL OR i.reported_at <= ${window.to}::timestamptz)
      ORDER BY i.reported_at DESC, i.id
      LIMIT ${limit}::int OFFSET ${offset}::int`;
    return rows.map(toRecord);
  }

  async searchByText(
    districtId: number,
    term: string,
    window: ReportedWindow,
    limit: number,
    offset: number,
  ): Promise<IncidentRecord[]> {
    // ILIKE serves the trigram GIN index and finds substrings that similarity() ranks too
    // low to return; similarity only orders what ILIKE already matched.
    const pattern = `%${term}%`;
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      SELECT ${INCIDENT_COLUMNS}
      FROM incidents i
      WHERE i.district_id = ${districtId}::int
        AND (i.address_text ILIKE ${pattern} OR i.description ILIKE ${pattern})
        AND (${window.from}::timestamptz IS NULL OR i.reported_at >= ${window.from}::timestamptz)
        AND (${window.to}::timestamptz IS NULL OR i.reported_at <= ${window.to}::timestamptz)
      ORDER BY GREATEST(
                 similarity(COALESCE(i.address_text, ''), ${term}),
                 similarity(COALESCE(i.description, ''), ${term})
               ) DESC,
               i.reported_at DESC, i.id
      LIMIT ${limit}::int OFFSET ${offset}::int`;
    return rows.map(toRecord);
  }

  async findByReporter(reporterId: string, limit: number): Promise<IncidentRecord[]> {
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      SELECT ${INCIDENT_COLUMNS}
      FROM incidents i
      WHERE i.reporter_id = ${reporterId}::uuid
      ORDER BY i.reported_at DESC
      LIMIT ${limit}::int`;
    return rows.map(toRecord);
  }

  async statusLog(incidentId: string): Promise<StatusLogEntry[]> {
    const rows = await this.prisma.$queryRaw<
      { from_status: IncidentStatus | null; to_status: IncidentStatus; changed_by: string | null; note: string | null; changed_at: Date }[]
    >`
      SELECT from_status::text AS from_status, to_status::text AS to_status, changed_by, note, changed_at
      FROM incident_status_log
      WHERE incident_id = ${incidentId}::uuid
      ORDER BY changed_at, id`;
    return rows.map((row) => ({
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedBy: row.changed_by,
      note: row.note,
      changedAt: row.changed_at,
    }));
  }

  async updateDetails(
    id: string,
    details: {
      type?: DisasterType;
      description?: string;
      addressText?: string;
      peopleAffected?: number;
      hasElderly?: boolean;
      hasChildren?: boolean;
      hasInjured?: boolean;
      manualPin?: { lat: number; lon: number };
    },
  ): Promise<IncidentRecord | null> {
    const pin = details.manualPin ?? null;
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      WITH updated AS (
        UPDATE incidents SET
          type = COALESCE(${details.type ?? null}::disaster_type, type),
          description = COALESCE(${details.description ?? null}::text, description),
          address_text = COALESCE(${details.addressText ?? null}::text, address_text),
          people_affected = COALESCE(${details.peopleAffected ?? null}::int, people_affected),
          has_elderly = COALESCE(${details.hasElderly ?? null}::boolean, has_elderly),
          has_children = COALESCE(${details.hasChildren ?? null}::boolean, has_children),
          has_injured = COALESCE(${details.hasInjured ?? null}::boolean, has_injured),
          location = CASE WHEN ${pin?.lon ?? null}::float8 IS NULL THEN location
                          ELSE ST_SetSRID(ST_MakePoint(${pin?.lon ?? null}::float8, ${pin?.lat ?? null}::float8), 4326)::geography END,
          location_source = CASE WHEN ${pin?.lon ?? null}::float8 IS NULL THEN location_source ELSE 'MANUAL_PIN' END,
          location_accuracy_m = CASE WHEN ${pin?.lon ?? null}::float8 IS NULL THEN location_accuracy_m ELSE NULL END
        WHERE id = ${id}::uuid
        RETURNING *
      )
      SELECT ${INCIDENT_COLUMNS} FROM updated i`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async changeStatus(
    id: string,
    apply: (current: IncidentRecord) => void,
    change: { to: IncidentStatus; actorId: string; note: string | null; duplicateOf: string | null },
  ): Promise<{ before: IncidentRecord; after: IncidentRecord } | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM incidents WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked[0]) return null;

      const before = (await this.findById(id, tx))!;
      apply(before);

      await tx.$executeRaw`
        UPDATE incidents SET
          status = ${change.to}::incident_status,
          duplicate_of = ${change.duplicateOf}::uuid,
          resolved_at = CASE WHEN ${change.to}::incident_status = 'RESOLVED' THEN now() ELSE NULL END
        WHERE id = ${id}::uuid`;
      await tx.$executeRaw`
        INSERT INTO incident_status_log (incident_id, from_status, to_status, changed_by, note)
        VALUES (${id}::uuid, ${before.status}::incident_status, ${change.to}::incident_status, ${change.actorId}::uuid, ${change.note}::text)`;

      const after = (await this.findById(id, tx))!;
      return { before, after };
    });
  }
}

