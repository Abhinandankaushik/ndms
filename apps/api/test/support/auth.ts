import type { Client } from 'pg';
import type { UserRole } from '../../src/common/domain/enums';
import { DEV_OTP, type TestApp } from './test-app';

let phoneCounter = 0;

export function uniquePhone(): string {
  phoneCounter += 1;
  return `+9190${String(process.pid % 1000).padStart(3, '0')}${String(phoneCounter).padStart(5, '0')}`;
}

export interface TestUserOptions {
  phone?: string;
  role?: UserRole;
  districtId?: number | null;
  rescueTeamId?: string | null;
  facilityId?: string | null;
  fullName?: string | null;
}

export async function createUser(db: Client, options: TestUserOptions = {}): Promise<{ id: string; phone: string }> {
  const phone = options.phone ?? uniquePhone();
  const result = await db.query<{ id: string }>(
    `INSERT INTO users (phone, role, district_id, rescue_team_id, facility_id, full_name, phone_verified_at)
     VALUES ($1, $2::user_role, $3, $4, $5, $6, now())
     RETURNING id`,
    [
      phone,
      options.role ?? 'CITIZEN',
      options.districtId ?? null,
      options.rescueTeamId ?? null,
      options.facilityId ?? null,
      options.fullName ?? null,
    ],
  );
  return { id: result.rows[0]!.id, phone };
}

export interface LoggedIn {
  userId: string;
  phone: string;
  accessToken: string;
  refreshCookie: string;
  auth: { Authorization: string };
}

export async function login(testApp: TestApp, phone: string): Promise<LoggedIn> {
  await testApp.http().post('/api/v1/auth/otp/send').send({ phone }).expect(200);
  const response = await testApp.http().post('/api/v1/auth/otp/verify').send({ phone, code: DEV_OTP }).expect(200);
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  const refreshCookie = cookies.find((cookie) => cookie.startsWith('ndms_refresh='));
  if (!refreshCookie) throw new Error('Login did not set the refresh cookie');

  const body = response.body as { data: { accessToken: string; user: { id: string } } };
  return {
    userId: body.data.user.id,
    phone,
    accessToken: body.data.accessToken,
    refreshCookie: refreshCookie.split(';')[0]!,
    auth: { Authorization: `Bearer ${body.data.accessToken}` },
  };
}

export async function loginAs(testApp: TestApp, options: TestUserOptions = {}): Promise<LoggedIn> {
  const role = options.role ?? 'CITIZEN';
  const needsDistrict = role === 'GOVT_OFFICIAL' || role === 'RESCUE_TEAM' || role === 'FACILITY_MANAGER';
  const user = await createUser(testApp.db, {
    ...options,
    districtId: options.districtId === undefined && needsDistrict ? testApp.districtId : options.districtId,
  });
  return login(testApp, user.phone);
}
