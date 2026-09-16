import { Injectable } from '@nestjs/common';
import type { AlertSeverity, UserRole } from '../../common/domain/enums';
import { pointSql, type LatLon } from '../../common/geo/geo-sql';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import type { StoredGeofence } from './geofence.schema';

const ALERT_COLUMNS = Prisma.raw(`
  a.id, a.district_id, a.severity::text AS severity, a.title, a.message,
  a.target_roles::text[] AS target_roles, ST_AsGeoJSON(a.geofence::geometry, 6)::json AS geofence,
  a.issued_at, a.expires_at, a.cancelled_at`);

// GeoJSON is WGS 84 by definition, and positions may carry an altitude the 2D column cannot store.
const geofenceGeometrySql = (geojson: string | null) =>
  Prisma.sql`ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326))`;

export interface AlertRecord {
  id: string;
  districtId: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  targetRoles: UserRole[];
  geofence: StoredGeofence | null;
  issuedAt: Date;
  expiresAt: Date | null;
  cancelledAt: Date | null;
}

export interface NewAlert {
  districtId: number;
  createdBy: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  targetRoles: UserRole[];
  geofenceGeoJson: string | null;
  expiresAt: string | null;
}

export interface GeofenceInspection {
  isValid: boolean;
  invalidReason: string | null;
  intersectsDistrict: boolean;
}

interface AlertRow {
  id: string;
  district_id: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  target_roles: UserRole[];
  geofence: StoredGeofence | null;
  issued_at: Date;
  expires_at: Date | null;
  cancelled_at: Date | null;
}

const toRecord = (row: AlertRow): AlertRecord => ({
  id: row.id,
  districtId: row.district_id,
  severity: row.severity,
  title: row.title,
  message: row.message,
  targetRoles: row.target_roles,
  geofence: row.geofence,
  issuedAt: row.issued_at,
  expiresAt: row.expires_at,
  cancelledAt: row.cancelled_at,
});

@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Spatial predicates on an invalid polygon can raise or answer wrongly, so the CASE only
  // tests the district intersection once the polygon is known to be valid.
  async inspectGeofence(geojson: string, districtId: number): Promise<GeofenceInspection> {
    const rows = await this.prisma.$queryRaw<
      { is_valid: boolean; invalid_reason: string | null; intersects_district: boolean }[]
    >`
      WITH fence AS (
        SELECT geom, ST_IsValid(geom) AS is_valid
        FROM (SELECT ${geofenceGeometrySql(geojson)} AS geom) parsed
      )
      SELECT fence.is_valid,
             CASE WHEN fence.is_valid THEN NULL ELSE ST_IsValidReason(fence.geom) END AS invalid_reason,
             CASE WHEN fence.is_valid
                  THEN EXISTS (
                    SELECT 1 FROM districts d
                    WHERE d.id = ${districtId}::int AND ST_Intersects(d.boundary, fence.geom::geography)
                  )
                  ELSE false
             END AS intersects_district
      FROM fence`;
    const row = rows[0]!;
    return { isValid: row.is_valid, invalidReason: row.invalid_reason, intersectsDistrict: row.intersects_district };
  }

  // Returns null when expiresAt is no longer in the future by the database clock, which the
  // table's CHECK would otherwise turn into a constraint violation.
  async insert(alert: NewAlert): Promise<AlertRecord | null> {
    const rows = await this.prisma.$queryRaw<AlertRow[]>`
      WITH inserted AS (
        INSERT INTO alerts (district_id, created_by, severity, title, message, target_roles, geofence, expires_at)
        SELECT ${alert.districtId}::int, ${alert.createdBy}::uuid, ${alert.severity}::alert_severity,
               ${alert.title}::text, ${alert.message}::text, ${alert.targetRoles}::user_role[],
               ST_Multi(${geofenceGeometrySql(alert.geofenceGeoJson)})::geography, ${alert.expiresAt}::timestamptz
        WHERE ${alert.expiresAt}::timestamptz IS NULL OR ${alert.expiresAt}::timestamptz > now()
        RETURNING *
      )
      SELECT ${ALERT_COLUMNS} FROM inserted a`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByDistrict(districtId: number, limit: number): Promise<AlertRecord[]> {
    const rows = await this.prisma.$queryRaw<AlertRow[]>`
      SELECT ${ALERT_COLUMNS}
      FROM alerts a
      WHERE a.district_id = ${districtId}::int
      ORDER BY a.issued_at DESC
      LIMIT ${limit}::int`;
    return rows.map(toRecord);
  }

  async findInDistrict(id: string, districtId: number): Promise<AlertRecord | null> {
    const rows = await this.prisma.$queryRaw<AlertRow[]>`
      SELECT ${ALERT_COLUMNS}
      FROM alerts a
      WHERE a.id = ${id}::uuid AND a.district_id = ${districtId}::int`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  // A NULL geofence covers the whole district. Without a position nobody can be placed inside
  // a geofence, so only whole-district alerts apply.
  async findActive(role: UserRole, position: LatLon | null, limit: number): Promise<AlertRecord[]> {
    const rows = await this.prisma.$queryRaw<AlertRow[]>`
      WITH caller AS (
        SELECT ${position ? pointSql(position) : Prisma.sql`NULL::geography`} AS position
      ),
      caller_districts AS (
        SELECT d.id FROM districts d, caller WHERE ST_Covers(d.boundary, caller.position)
      )
      SELECT ${ALERT_COLUMNS}
      FROM alerts a, caller
      WHERE a.cancelled_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND (cardinality(a.target_roles) = 0 OR ${role}::user_role = ANY (a.target_roles))
        AND (
          (a.geofence IS NOT NULL AND ST_Covers(a.geofence, caller.position))
          OR (a.geofence IS NULL AND (caller.position IS NULL OR a.district_id IN (SELECT id FROM caller_districts)))
        )
      ORDER BY a.issued_at DESC
      LIMIT ${limit}::int`;
    return rows.map(toRecord);
  }

  async cancel(id: string, districtId: number): Promise<AlertRecord | null> {
    const rows = await this.prisma.$queryRaw<AlertRow[]>`
      WITH cancelled AS (
        UPDATE alerts SET cancelled_at = now()
        WHERE id = ${id}::uuid AND district_id = ${districtId}::int AND cancelled_at IS NULL
        RETURNING *
      )
      SELECT ${ALERT_COLUMNS} FROM cancelled a`;
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
