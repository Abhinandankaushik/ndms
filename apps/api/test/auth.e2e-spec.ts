import { Controller, Get, Module } from '@nestjs/common';
import { CurrentUser, Roles } from '../src/modules/auth/auth.decorators';
import type { AuthUser } from '../src/modules/auth/auth-user';
import { createUser, login, uniquePhone } from './support/auth';
import { createTestApp, DEV_OTP, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

@Controller('test-only')
class ProbeController {
  @Get('officials')
  @Roles('GOVT_OFFICIAL')
  officials(@CurrentUser() user: AuthUser) {
    return { role: user.role };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('auth', () => {
  let stack: TestStack;
  let t: TestApp;

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack, { imports: [ProbeModule] });
  });

  afterAll(async () => {
    await t?.close();
    await stopStack(stack);
  });

  it('registers a new phone as a citizen through OTP and returns a working access token', async () => {
    const phone = uniquePhone();

    const session = await login(t, phone);
    const me = await t.http().get('/api/v1/auth/me').set(session.auth).expect(200);

    expect(me.body.data).toMatchObject({ phone, role: 'CITIZEN', fullName: null });
  });

  it('rejects a wrong code without creating a user', async () => {
    const phone = uniquePhone();
    await t.http().post('/api/v1/auth/otp/send').send({ phone }).expect(200);

    const response = await t.http().post('/api/v1/auth/otp/verify').send({ phone, code: '000000' }).expect(401);

    expect(response.body.error.code).toBe('OTP_INVALID');
    const users = await t.db.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
    expect(users.rowCount).toBe(0);
  });

  it('rejects malformed phone numbers at the controller boundary', async () => {
    const response = await t.http().post('/api/v1/auth/otp/send').send({ phone: '9876543210' }).expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('locks the code after five wrong attempts', async () => {
    const phone = uniquePhone();
    await t.http().post('/api/v1/auth/otp/send').send({ phone }).expect(200);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await t.http().post('/api/v1/auth/otp/verify').send({ phone, code: '000000' }).expect(401);
    }

    const locked = await t.http().post('/api/v1/auth/otp/verify').send({ phone, code: DEV_OTP }).expect(429);

    expect(locked.body.error.code).toBe('OTP_LOCKED');
  });

  it('rotates the refresh token and revokes the family when an old one is replayed', async () => {
    const session = await login(t, uniquePhone());

    const first = await t.http().post('/api/v1/auth/refresh').set('Cookie', session.refreshCookie).expect(200);
    const rotatedCookie = ([] as string[]).concat(first.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    expect(rotatedCookie).not.toBe(session.refreshCookie);

    const replay = await t.http().post('/api/v1/auth/refresh').set('Cookie', session.refreshCookie).expect(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');

    const afterRevocation = await t.http().post('/api/v1/auth/refresh').set('Cookie', rotatedCookie).expect(401);
    expect(afterRevocation.body.error.code).toBe('REFRESH_INVALID');
  });

  it('logs out by revoking the session', async () => {
    const session = await login(t, uniquePhone());

    await t.http().post('/api/v1/auth/logout').set('Cookie', session.refreshCookie).expect(200);

    await t.http().post('/api/v1/auth/refresh').set('Cookie', session.refreshCookie).expect(401);
  });

  it('carries the role and district from the database into the token', async () => {
    const official = await createUser(t.db, { role: 'GOVT_OFFICIAL', districtId: t.districtId });

    const session = await login(t, official.phone);
    const me = await t.http().get('/api/v1/auth/me').set(session.auth).expect(200);

    expect(me.body.data).toMatchObject({ role: 'GOVT_OFFICIAL', districtId: t.districtId });
  });

  it.each([
    ['no token', undefined, 401, 'AUTH_REQUIRED'],
    ['a garbage token', 'Bearer not-a-jwt', 401, 'TOKEN_INVALID'],
  ])('refuses protected routes with %s', async (_case, header, status, code) => {
    const call = t.http().get('/api/v1/auth/me');
    if (header) call.set('Authorization', header);

    const response = await call.expect(status);

    expect(response.body.error.code).toBe(code);
  });

  it('enforces @Roles: a citizen gets 403, an official gets through', async () => {
    const citizen = await login(t, uniquePhone());
    const official = await login(t, (await createUser(t.db, { role: 'GOVT_OFFICIAL', districtId: t.districtId })).phone);

    const denied = await t.http().get('/api/v1/test-only/officials').set(citizen.auth).expect(403);
    await t.http().get('/api/v1/test-only/officials').set(official.auth).expect(200);

    expect(denied.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('updates the display name', async () => {
    const session = await login(t, uniquePhone());

    const response = await t.http().patch('/api/v1/auth/me').set(session.auth).send({ fullName: 'Asha Devi' }).expect(200);

    expect(response.body.data.fullName).toBe('Asha Devi');
  });
});
