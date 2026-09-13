import { Injectable } from '@nestjs/common';
import type { UserRole } from '../../common/domain/enums';
import { PrismaService } from '../../infra/database/prisma.service';

export interface UserRecord {
  id: string;
  phone: string;
  fullName: string | null;
  role: UserRole;
  districtId: number | null;
  rescueTeamId: string | null;
  facilityId: string | null;
  isActive: boolean;
}

interface UserRow {
  id: string;
  phone: string;
  full_name: string | null;
  role: UserRole;
  district_id: number | null;
  rescue_team_id: string | null;
  facility_id: string | null;
  is_active: boolean;
}

const toRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  phone: row.phone,
  fullName: row.full_name,
  role: row.role,
  districtId: row.district_id,
  rescueTeamId: row.rescue_team_id,
  facilityId: row.facility_id,
  isActive: row.is_active,
});

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertVerifiedByPhone(phone: string): Promise<UserRecord> {
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      INSERT INTO users (phone, phone_verified_at)
      VALUES (${phone}, now())
      ON CONFLICT (phone) DO UPDATE SET phone_verified_at = COALESCE(users.phone_verified_at, EXCLUDED.phone_verified_at)
      RETURNING id, phone, full_name, role::text AS role, district_id, rescue_team_id, facility_id, is_active`;
    return toRecord(rows[0]!);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      SELECT id, phone, full_name, role::text AS role, district_id, rescue_team_id, facility_id, is_active
      FROM users
      WHERE id = ${id}::uuid`;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async updateFullName(id: string, fullName: string): Promise<UserRecord | null> {
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      UPDATE users SET full_name = ${fullName}
      WHERE id = ${id}::uuid
      RETURNING id, phone, full_name, role::text AS role, district_id, rescue_team_id, facility_id, is_active`;
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
