import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuditService } from '../src/common/audit/audit.service';
import { RateLimitGuard } from '../src/common/rate-limit/rate-limit.guard';
import { RateLimitModule } from '../src/common/rate-limit/rate-limit.module';
import { RATE_LIMIT_REDIS } from '../src/common/rate-limit/sliding-window.limiter';
import { ENV } from '../src/config/env';
import { AuditHttpModule } from '../src/modules/audit/audit-http.module';
import { SyncModule } from '../src/modules/sync/sync.module';
import { loginAs, uniquePhone, type LoggedIn, type TestUserOptions } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

const DARBHANGA_TOWN = { lat: 26.1542, lon: 85.8918 };
const REPORTS_PER_HOUR = 10;
const OTP_VERIFICATIONS_PER_WINDOW = 30;

interface SyncResult {
  clientUuid: string | null;
  outcome: 'CREATED' | 'DUPLICATE' | 'CONFLICT' | 'INVALID';
  id?: string;
  error?: { code: string; message: string; details?: unknown };
}

const sosBody = (overrides: Record<string, unknown> = {}) => ({
  clientUuid: randomUUID(),
  ...DARBHANGA_TOWN,
  accuracyM: 15,
  reportedAt: new Date().toISOString(),
  ...overrides,
});

const reportBody = (overrides: Record<string, unknown> = {}) => ({
  ...sosBody(),
  type: 'FLOOD',
  description: 'Water is entering the houses on our lane',
  peopleAffected: 6,
  hasChildren: true,
  ...overrides,
});

const outboxOf = (size: number) =>
  Array.from({ length: size }, (_, index) =>
    index % 2 === 0 ? { kind: 'SOS', body: sosBody() } : { kind: 'REPORT', body: reportBody() },
  );

describe('platform: rate limiting, offline sync and the audit log', () => {
  let stack: TestStack;
  let t: TestApp;
  let otpVerifications = 0;
  let reporter: LoggedIn;
  let syncer: LoggedIn;
  let neighbour: LoggedIn;
  let official: LoggedIn;

  // Every sign-in spends one of this IP's OTP verifications, which the OTP limit test counts.
  const signIn = (options?: TestUserOptions) => {
    otpVerifications += 1;
    return loginAs(t, options);
  };
  const report = (who: LoggedIn, overrides: Record<string, unknown> = {}) =>
    t.http().post('/api/v1/incidents').set(who.auth).send(reportBody(overrides));
  const sos = (who: LoggedIn, overrides: Record<string, unknown> = {}) =>
    t.http().post('/api/v1/incidents/sos').set(who.auth).send(sosBody(overrides));
  const sync = (who: LoggedIn, items: unknown[]) => t.http().post('/api/v1/incidents/sync').set(who.auth).send({ items });

  // The limiter fails open until its Redis connection is ready, which would hide both
  // counting and refusals.
  const limiterReady = async (app: INestApplication) => {
    const limiterRedis = app.get<Redis>(RATE_LIMIT_REDIS);
    if (limiterRedis.status !== 'ready') await once(limiterRedis, 'ready');
  };
  const startApp = async (
    imports: NonNullable<ModuleMetadata['imports']>,
    customise: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
  ) => {
    const moduleRef = await customise(Test.createTestingModule({ imports }).overrideProvider(ENV).useValue(t.env)).compile();
    const app = configureApp(moduleRef.createNestApplication());
    await app.listen(0, '127.0.0.1');
    await limiterReady(app);
    return app;
  };
  const storedRows = (clientUuids: string[]) =>
    t.db.query<{ id: string; client_uuid: string; reporter_id: string; is_sos: boolean }>(
      'SELECT id, client_uuid, reporter_id, is_sos FROM incidents WHERE client_uuid = ANY($1::uuid[])',
      [clientUuids],
    );

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack, { imports: [RateLimitModule, AuditHttpModule, SyncModule], rateLimit: true });
    await limiterReady(t.app);

    reporter = await signIn();
    syncer = await signIn();
    neighbour = await signIn();
    official = await signIn({ role: 'GOVT_OFFICIAL' });
  });

  afterAll(async () => {
    await t?.close();
    await stopStack(stack);
  });

  describe('rate limiting', () => {
    it('accepts 10 detailed reports an hour from one user and refuses the 11th with 429 and Retry-After', async () => {
      for (let sent = 0; sent < REPORTS_PER_HOUR; sent += 1) {
        await report(reporter).expect(201);
      }

      const refused = await report(reporter).expect(429);

      expect(refused.body.error).toMatchObject({ code: 'RATE_LIMITED', details: { retryAfterSeconds: expect.any(Number) } });
      const { retryAfterSeconds } = refused.body.error.details as { retryAfterSeconds: number };
      expect(retryAfterSeconds).toBeGreaterThan(3_500);
      expect(retryAfterSeconds).toBeLessThanOrEqual(3_600);
      expect(refused.headers['retry-after']).toBe(String(retryAfterSeconds));
      const stored = await t.db.query('SELECT count(*)::int AS n FROM incidents WHERE reporter_id = $1 AND NOT is_sos', [
        reporter.userId,
      ]);
      expect(stored.rows[0].n).toBe(REPORTS_PER_HOUR);
    });

    it('counts reports per user, so a neighbour can still report', async () => {
      await report(neighbour).expect(201);
    });

    it('still counts per user when RateLimitModule is imported ahead of AuthModule', async () => {
      const limiterFirst = await startApp([RateLimitModule, AppModule]);
      try {
        const reportTo = (who: LoggedIn) =>
          request(limiterFirst.getHttpServer()).post('/api/v1/incidents').set(who.auth).send(reportBody());

        await reportTo(reporter).expect(429);
        await reportTo(neighbour).expect(201);
      } finally {
        await limiterFirst.close();
      }
    });

    it('can be switched off for a test suite by overriding RateLimitGuard', async () => {
      const unlimited = await startApp([AppModule, RateLimitModule], (builder) =>
        builder.overrideProvider(RateLimitGuard).useValue({ canActivate: () => true }),
      );
      try {
        await request(unlimited.getHttpServer()).post('/api/v1/incidents').set(reporter.auth).send(reportBody()).expect(201);
      } finally {
        await unlimited.close();
      }
    });

    it('never limits SOS: 25 in a row succeed from a user who is out of reports', async () => {
      for (let sent = 0; sent < 25; sent += 1) {
        await sos(reporter).expect(201);
      }
    });

    it('never limits offline sync, even for a user who is out of reports', async () => {
      const response = await sync(reporter, [{ kind: 'REPORT', body: reportBody() }]).expect(200);

      expect(response.body.data.results).toEqual([expect.objectContaining({ outcome: 'CREATED' })]);
    });

    it('allows 10 OTP verifications per 15 minutes per IP, counting wrong codes', async () => {
      for (; otpVerifications < OTP_VERIFICATIONS_PER_WINDOW; otpVerifications += 1) {
        await t.http().post('/api/v1/auth/otp/verify').send({ phone: uniquePhone(), code: '000000' }).expect(401);
      }

      const refused = await t.http().post('/api/v1/auth/otp/verify').send({ phone: uniquePhone(), code: '000000' }).expect(429);

      expect(refused.body.error.code).toBe('RATE_LIMITED');
      const retryAfterSeconds = Number(refused.headers['retry-after']);
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    });
  });

  describe('POST /incidents/sync', () => {
    const newSos = sosBody();
    const newReport = reportBody({ type: 'BUILDING_COLLAPSE' });
    const neighboursClientUuid = randomUUID();
    const invalidClientUuid = randomUUID();
    const batchUuids = [newSos.clientUuid, neighboursClientUuid, invalidClientUuid, newReport.clientUuid];
    let batch: unknown[];
    let firstPass: SyncResult[];

    beforeAll(async () => {
      await sos(neighbour, { clientUuid: neighboursClientUuid }).expect(201);
      batch = [
        { kind: 'SOS', body: newSos },
        { kind: 'SOS', body: newSos },
        { kind: 'SOS', body: sosBody({ clientUuid: neighboursClientUuid }) },
        { kind: 'REPORT', body: reportBody({ clientUuid: invalidClientUuid, type: 'VOLCANO' }) },
        { kind: 'REPORT', body: newReport },
      ];
      firstPass = (await sync(syncer, batch).expect(200)).body.data.results;
    });

    it('answers every item in request order: CREATED, DUPLICATE, CONFLICT, INVALID, CREATED', () => {
      expect(firstPass.map((result) => result.outcome)).toEqual(['CREATED', 'DUPLICATE', 'CONFLICT', 'INVALID', 'CREATED']);
      expect(firstPass.map((result) => result.clientUuid)).toEqual([
        newSos.clientUuid,
        newSos.clientUuid,
        neighboursClientUuid,
        invalidClientUuid,
        newReport.clientUuid,
      ]);
      expect(firstPass[1]!.id).toBe(firstPass[0]!.id);
      expect(firstPass[2]).toEqual({
        clientUuid: neighboursClientUuid,
        outcome: 'CONFLICT',
        error: expect.objectContaining({ code: 'CLIENT_UUID_CONFLICT' }),
      });
      expect(firstPass[3]!.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { fieldErrors: { type: expect.any(Array) } } });
    });

    it('stores exactly one row per clientUuid and leaves the conflicting one with its owner', async () => {
      const rows = new Map((await storedRows(batchUuids)).rows.map((row) => [row.client_uuid, row]));

      expect(rows.size).toBe(3);
      expect(rows.get(newSos.clientUuid)).toEqual({
        id: firstPass[0]!.id,
        client_uuid: newSos.clientUuid,
        reporter_id: syncer.userId,
        is_sos: true,
      });
      expect(rows.get(newReport.clientUuid)).toMatchObject({ id: firstPass[4]!.id, reporter_id: syncer.userId, is_sos: false });
      expect(rows.get(neighboursClientUuid)).toMatchObject({ reporter_id: neighbour.userId });
      expect(rows.has(invalidClientUuid)).toBe(false);
    });

    it('creates nothing when the whole batch is replayed (O2 at API level)', async () => {
      const replay: SyncResult[] = (await sync(syncer, batch).expect(200)).body.data.results;

      expect(replay.map((result) => result.outcome)).toEqual(['DUPLICATE', 'DUPLICATE', 'CONFLICT', 'INVALID', 'DUPLICATE']);
      expect(replay.map((result) => result.id)).toEqual(firstPass.map((result) => result.id));
      expect((await storedRows(batchUuids)).rowCount).toBe(3);
    });

    it('delivers a full 50-item outbox exactly once across a retry (O2)', async () => {
      const outbox = outboxOf(50);
      const clientUuids = outbox.map((item) => item.body.clientUuid);

      const first: SyncResult[] = (await sync(syncer, outbox).expect(200)).body.data.results;
      const retry: SyncResult[] = (await sync(syncer, outbox).expect(200)).body.data.results;

      expect(first.filter((result) => result.outcome === 'CREATED')).toHaveLength(50);
      expect(retry.filter((result) => result.outcome === 'DUPLICATE')).toHaveLength(50);
      const stored = await storedRows(clientUuids);
      expect(stored.rowCount).toBe(50);
      expect(new Set(stored.rows.map((row) => row.client_uuid)).size).toBe(50);
    });

    it('creates each report once when two deliveries of the same outbox race (O2)', async () => {
      const outbox = outboxOf(20);
      const clientUuids = outbox.map((item) => item.body.clientUuid);

      const deliveries = await Promise.all([sync(syncer, outbox).expect(200), sync(syncer, outbox).expect(200)]);

      const results = deliveries.flatMap((response) => response.body.data.results as SyncResult[]);
      for (const clientUuid of clientUuids) {
        const answers = results.filter((result) => result.clientUuid === clientUuid);
        expect(answers.map((result) => result.outcome).sort()).toEqual(['CREATED', 'DUPLICATE']);
        expect(answers[0]!.id).toBe(answers[1]!.id);
      }
      expect((await storedRows(clientUuids)).rowCount).toBe(20);
    });

    it('reports items it cannot read as INVALID and still delivers the rest', async () => {
      const unknownKind = sosBody();
      const delivered = sosBody();

      const results: SyncResult[] = (
        await sync(syncer, [42, { kind: 'PING', body: unknownKind }, { kind: 'SOS', body: delivered }]).expect(200)
      ).body.data.results;

      expect(results.map((result) => result.outcome)).toEqual(['INVALID', 'INVALID', 'CREATED']);
      expect(results.map((result) => result.clientUuid)).toEqual([null, unknownKind.clientUuid, delivered.clientUuid]);
    });

    it.each([
      ['an empty batch', []],
      ['more than 50 items', Array.from({ length: 51 }, () => ({ kind: 'SOS', body: sosBody() }))],
    ])('refuses %s', async (_case, items) => {
      const response = await sync(syncer, items).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /audit', () => {
    it('returns rows written through AuditService, newest first, filtered by entity', async () => {
      const audit = t.app.get(AuditService);
      const missionId = randomUUID();
      await audit.record({
        actorId: official.userId,
        action: 'mission.reporter_contact.viewed',
        entityType: 'mission',
        entityId: missionId,
        metadata: { via: 'mission detail' },
        ipAddress: '10.20.30.40',
      });
      await audit.record({
        actorId: neighbour.userId,
        action: 'mission.reporter_contact.viewed',
        entityType: 'mission',
        entityId: missionId,
      });
      await audit.record({ actorId: official.userId, action: 'volunteer.documents.viewed', entityType: 'volunteer', entityId: syncer.userId });

      const response = await t
        .http()
        .get('/api/v1/audit')
        .query({ entityType: 'mission', entityId: missionId })
        .set(official.auth)
        .expect(200);

      expect(response.body.data).toEqual([
        {
          id: expect.any(Number),
          actorId: neighbour.userId,
          action: 'mission.reporter_contact.viewed',
          entityType: 'mission',
          entityId: missionId,
          metadata: {},
          ipAddress: null,
          occurredAt: expect.any(String),
        },
        expect.objectContaining({ actorId: official.userId, metadata: { via: 'mission detail' }, ipAddress: '10.20.30.40' }),
      ]);
    });

    it('caps the number of rows at the limit, keeping the newest', async () => {
      const audit = t.app.get(AuditService);
      const facilityId = randomUUID();
      for (const action of ['facility.contact.viewed', 'facility.roster.viewed']) {
        await audit.record({ actorId: official.userId, action, entityType: 'facility', entityId: facilityId });
      }

      const response = await t
        .http()
        .get('/api/v1/audit')
        .query({ entityType: 'facility', entityId: facilityId, limit: 1 })
        .set(official.auth)
        .expect(200);

      expect(response.body.data).toEqual([expect.objectContaining({ action: 'facility.roster.viewed' })]);
    });

    it('rejects a limit above 200', async () => {
      const response = await t.http().get('/api/v1/audit').query({ limit: 201 }).set(official.auth).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('refuses citizens', async () => {
      const response = await t.http().get('/api/v1/audit').set(syncer.auth).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('with Redis down', () => {
    it('fails open: a user who was out of reports can report again, promptly', async () => {
      await stack.redis.stop();

      const started = Date.now();
      const response = await report(reporter).expect(201);

      expect(response.body.data.wasInserted).toBe(true);
      expect(Date.now() - started).toBeLessThan(1_000);
    });
  });
});
