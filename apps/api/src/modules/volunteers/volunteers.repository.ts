import { Injectable } from '@nestjs/common';
import type { VerificationStatus } from '../../common/domain/enums';
import { pointSql, type LatLon } from '../../common/geo/geo-sql';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';

// Expects the profile as `vp` and its user as `u`: a volunteer's position is the user's
// last_location, which task matching measures from.
const PROFILE_COLUMNS = Prisma.raw(`
  vp.user_id, vp.skills, vp.is_available, vp.service_radius_km::int AS service_radius_km,
  vp.verification_status::text AS verification_status, vp.reviewed_by, vp.reviewed_at, vp.rejection_reason,
  ST_Y(u.last_location::geometry) AS lat, ST_X(u.last_location::geometry) AS lon, u.last_location_at,
  vp.created_at, vp.updated_at`);

export interface VolunteerProfile {
  userId: string;
  skills: string[];
  isAvailable: boolean;
  serviceRadiusKm: number;
  verificationStatus: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  lat: number | null;
  lon: number | null;
  locationUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VolunteerApplicant extends VolunteerProfile {
  phone: string;
  fullName: string | null;
}

export interface Registration {
  skills: string[];
  serviceRadiusKm: number;
  location: LatLon;
}

export interface ProfileChanges {
  skills?: string[];
  serviceRadiusKm?: number;
  isAvailable?: boolean;
  location?: LatLon;
}

export interface ReviewDecision {
  userId: string;
  reviewerId: string;
  districtId: number;
  decision: 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
}

interface ProfileRow {
  user_id: string;
  skills: string[];
  is_available: boolean;
  service_radius_km: number;
  verification_status: VerificationStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  lat: number | null;
  lon: number | null;
  last_location_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const toProfile = (row: ProfileRow): VolunteerProfile => ({
  userId: row.user_id,
  skills: row.skills,
  isAvailable: row.is_available,
  serviceRadiusKm: row.service_radius_km,
  verificationStatus: row.verification_status,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  rejectionReason: row.rejection_reason,
  lat: row.lat,
  lon: row.lon,
  locationUpdatedAt: row.last_location_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type Queryable = Pick<PrismaService, '$queryRaw' | '$executeRaw'>;

// Writes lock the profile row before the user row, the same order as review, so a
// re-registration racing an official's decision cannot deadlock.
@Injectable()
export class VolunteersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async districtsCovering(point: LatLon): Promise<number[]> {
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT d.id FROM districts d WHERE ST_Covers(d.boundary, ${pointSql(point)}) ORDER BY d.id`;
    return rows.map((row) => row.id);
  }

  async findByUser(userId: string, db: Queryable = this.prisma): Promise<VolunteerProfile | null> {
    const rows = await db.$queryRaw<ProfileRow[]>`
      SELECT ${PROFILE_COLUMNS}
      FROM volunteer_profiles vp
      JOIN users u ON u.id = vp.user_id
      WHERE vp.user_id = ${userId}::uuid`;
    return rows[0] ? toProfile(rows[0]) : null;
  }

  async findInDistrict(userId: string, districtId: number): Promise<VolunteerProfile | null> {
    const rows = await this.prisma.$queryRaw<ProfileRow[]>`
      SELECT ${PROFILE_COLUMNS}
      FROM volunteer_profiles vp
      JOIN users u ON u.id = vp.user_id
      JOIN districts d ON d.id = ${districtId}::int AND ST_Covers(d.boundary, u.last_location)
      WHERE vp.user_id = ${userId}::uuid`;
    return rows[0] ? toProfile(rows[0]) : null;
  }

  // Registering again after a rejection is a fresh application, so the old review is
  // cleared (the table's CHECK demands it for PENDING). A verified volunteer who submits
  // the form again only updates their details and keeps the verification.
  register(userId: string, registration: Registration): Promise<VolunteerProfile> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO volunteer_profiles AS vp (user_id, skills, service_radius_km)
        VALUES (${userId}::uuid, ${registration.skills}::text[], ${registration.serviceRadiusKm}::smallint)
        ON CONFLICT (user_id) DO UPDATE SET
          skills = EXCLUDED.skills,
          service_radius_km = EXCLUDED.service_radius_km,
          verification_status = CASE WHEN vp.verification_status = 'VERIFIED' THEN vp.verification_status ELSE 'PENDING' END,
          reviewed_by = CASE WHEN vp.verification_status = 'VERIFIED' THEN vp.reviewed_by END,
          reviewed_at = CASE WHEN vp.verification_status = 'VERIFIED' THEN vp.reviewed_at END,
          rejection_reason = NULL`;
      await this.moveUser(userId, registration.location, tx);
      return (await this.findByUser(userId, tx))!;
    });
  }

  update(userId: string, changes: ProfileChanges): Promise<VolunteerProfile | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE volunteer_profiles SET
          skills = COALESCE(${changes.skills ?? null}::text[], skills),
          service_radius_km = COALESCE(${changes.serviceRadiusKm ?? null}::smallint, service_radius_km),
          is_available = COALESCE(${changes.isAvailable ?? null}::boolean, is_available)
        WHERE user_id = ${userId}::uuid`;
      if (updated === 0) return null;
      if (changes.location) await this.moveUser(userId, changes.location, tx);
      return this.findByUser(userId, tx);
    });
  }

  async listInDistrict(districtId: number, status: VerificationStatus, limit: number): Promise<VolunteerApplicant[]> {
    const rows = await this.prisma.$queryRaw<(ProfileRow & { phone: string; full_name: string | null })[]>`
      SELECT ${PROFILE_COLUMNS}, u.phone, u.full_name
      FROM volunteer_profiles vp
      JOIN users u ON u.id = vp.user_id
      JOIN districts d ON d.id = ${districtId}::int AND ST_Covers(d.boundary, u.last_location)
      WHERE vp.verification_status = ${status}::verification_status
      ORDER BY vp.created_at, vp.user_id
      LIMIT ${limit}::int`;
    return rows.map((row) => ({ ...toProfile(row), phone: row.phone, fullName: row.full_name }));
  }

  // One statement, so the decision and the account change land together. Only PENDING
  // applications match, which makes concurrent decisions by two officials first-wins.
  // Staff accounts keep their role and district: review must never re-scope them.
  async review(review: ReviewDecision): Promise<VolunteerProfile | null> {
    const rows = await this.prisma.$queryRaw<ProfileRow[]>`
      WITH reviewed AS (
        UPDATE volunteer_profiles vp SET
          verification_status = ${review.decision}::verification_status,
          reviewed_by = ${review.reviewerId}::uuid,
          reviewed_at = now(),
          rejection_reason = ${review.rejectionReason}::text
        FROM users u
        JOIN districts d ON d.id = ${review.districtId}::int AND ST_Covers(d.boundary, u.last_location)
        WHERE vp.user_id = ${review.userId}::uuid
          AND u.id = vp.user_id
          AND vp.verification_status = 'PENDING'
        RETURNING vp.*
      ),
      promoted AS (
        UPDATE users u SET
          role = 'VOLUNTEER',
          district_id = ${review.districtId}::int
        FROM reviewed
        WHERE u.id = reviewed.user_id
          AND reviewed.verification_status = 'VERIFIED'
          AND u.role IN ('CITIZEN', 'VOLUNTEER')
      )
      SELECT ${PROFILE_COLUMNS}
      FROM reviewed vp
      JOIN users u ON u.id = vp.user_id`;
    return rows[0] ? toProfile(rows[0]) : null;
  }

  private async moveUser(userId: string, location: LatLon, db: Queryable): Promise<void> {
    await db.$executeRaw`
      UPDATE users SET last_location = ${pointSql(location)}, last_location_at = now()
      WHERE id = ${userId}::uuid`;
  }
}
