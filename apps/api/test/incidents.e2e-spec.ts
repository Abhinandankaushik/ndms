import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { INCIDENT_ENRICHMENT_QUEUE } from '../src/modules/incidents/enrichment.queue';
import { loginAs, type LoggedIn } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

const DARBHANGA_TOWN = { lat: 26.1542, lon: 85.8918 };
const PATNA = { lat: 25.5941, lon: 85.1376 };
const HOUR_MS = 3_600_000;

const sosBody = (overrides: Record<string, unknown> = {}) => ({
  clientUuid: randomUUID(),
  ...DARBHANGA_TOWN,
  accuracyM: 18.4,
  reportedAt: new Date().toISOString(),
  ...overrides,
});

describe('incidents', () => {
  let stack: TestStack;
  let t: TestApp;
  let citizen: LoggedIn;
  let otherCitizen: LoggedIn;
  let official: LoggedIn;
  let rescuer: LoggedIn;

  const sos = (who: LoggedIn, overrides: Record<string, unknown> = {}) =>
    t.http().post('/api/v1/incidents/sos').set(who.auth).send(sosBody(overrides));

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack);
    citizen = await loginAs(t);
    otherCitizen = await loginAs(t);
    official = await loginAs(t, { role: 'GOVT_OFFICIAL' });
    rescuer = await loginAs(t, { role: 'RESCUE_TEAM' });
  });

  afterAll(async () => {
    await t?.close();
    await stopStack(stack);
  });

  describe('POST /incidents/sos', () => {
    it('files the report in the district containing the point and logs REPORTED by the reporter', async () => {
      const response = await sos(citizen).expect(201);

      expect(response.body.data).toMatchObject({ districtId: t.districtId, status: 'REPORTED', wasInserted: true });
      const log = await t.db.query('SELECT to_status::text, changed_by FROM incident_status_log WHERE incident_id = $1', [
        response.body.data.id,
      ]);
      expect(log.rows).toEqual([{ to_status: 'REPORTED', changed_by: citizen.userId }]);
    });

    it('answers a replay of the same clientUuid with 200 and the same row', async () => {
      const body = sosBody();

      const first = await t.http().post('/api/v1/incidents/sos').set(citizen.auth).send(body).expect(201);
      const replay = await t.http().post('/api/v1/incidents/sos').set(citizen.auth).send(body).expect(200);

      expect(replay.body.data).toMatchObject({ id: first.body.data.id, wasInserted: false });
      const count = await t.db.query('SELECT count(*)::int AS n FROM incidents WHERE client_uuid = $1', [body.clientUuid]);
      expect(count.rows[0].n).toBe(1);
    });

    it('refuses a clientUuid that already belongs to another reporter', async () => {
      const body = sosBody();
      await t.http().post('/api/v1/incidents/sos').set(citizen.auth).send(body).expect(201);

      const response = await t.http().post('/api/v1/incidents/sos').set(otherCitizen.auth).send(body).expect(409);

      expect(response.body.error.code).toBe('CLIENT_UUID_CONFLICT');
    });

    it('accepts an SOS with no location and files it in the only district', async () => {
      const response = await sos(citizen, { lat: null, lon: null, accuracyM: null }).expect(201);

      const row = await t.db.query('SELECT location IS NULL AS no_location, location_source::text FROM incidents WHERE id = $1', [
        response.body.data.id,
      ]);
      expect(response.body.data.districtId).toBe(t.districtId);
      expect(row.rows[0]).toEqual({ no_location: true, location_source: 'NONE' });
    });

    it('files a point outside every district in the nearest district', async () => {
      const response = await sos(citizen, PATNA).expect(201);

      expect(response.body.data.districtId).toBe(t.districtId);
    });

    it('clamps a device clock three days slow to 24 hours before receipt', async () => {
      const response = await sos(citizen, { reportedAt: new Date(Date.now() - 72 * HOUR_MS).toISOString() }).expect(201);

      const row = await t.db.query('SELECT extract(epoch FROM created_at - reported_at)::int AS lag FROM incidents WHERE id = $1', [
        response.body.data.id,
      ]);
      expect(row.rows[0].lag).toBe(24 * 3600);
    });

    it('rejects a latitude without a longitude', async () => {
      const response = await sos(citizen, { lon: null }).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('queues enrichment with the incident id as the job id', async () => {
      const response = await sos(citizen).expect(201);

      const queue = new Queue(INCIDENT_ENRICHMENT_QUEUE, { connection: { url: t.env.REDIS_URL } });
      try {
        let job = null;
        for (let attempt = 0; attempt < 20 && !job; attempt += 1) {
          job = await queue.getJob(response.body.data.id);
          if (!job) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(job?.data).toEqual({ incidentId: response.body.data.id });
      } finally {
        await queue.close();
      }
    });
  });

  describe('responder views', () => {
    it('returns markers inside the viewport and nothing outside it', async () => {
      const inside = await sos(citizen, { lat: 26.16, lon: 85.9 }).expect(201);
      const outside = await sos(citizen, { lat: 26.3, lon: 86.2 }).expect(201);

      const response = await t
        .http()
        .get('/api/v1/incidents')
        .query({ bbox: '85.85,26.12,85.95,26.20' })
        .set(official.auth)
        .expect(200);

      const ids = (response.body.data as { id: string }[]).map((marker) => marker.id);
      expect(ids).toContain(inside.body.data.id);
      expect(ids).not.toContain(outside.body.data.id);
    });

    it('refuses the incident map to citizens', async () => {
      const response = await t.http().get('/api/v1/incidents').query({ bbox: '85,25,87,27' }).set(citizen.auth).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('orders the queue by priority with unscored reports after scored ones, oldest first', async () => {
      const low = await sos(citizen, { type: 'FIRE' }).expect(201);
      const high = await sos(citizen, { type: 'FIRE' }).expect(201);
      const unscored = await sos(citizen, { type: 'FIRE' }).expect(201);
      await t.db.query('UPDATE incidents SET priority_score = 20 WHERE id = $1', [low.body.data.id]);
      await t.db.query('UPDATE incidents SET priority_score = 90 WHERE id = $1', [high.body.data.id]);

      const response = await t.http().get('/api/v1/incidents/queue').query({ type: 'FIRE', limit: 200 }).set(official.auth).expect(200);

      const ids = (response.body.data as { id: string }[]).map((incident) => incident.id);
      expect(ids.indexOf(high.body.data.id)).toBeLessThan(ids.indexOf(low.body.data.id));
      expect(ids.indexOf(low.body.data.id)).toBeLessThan(ids.indexOf(unscored.body.data.id));
    });
  });

  describe('status changes', () => {
    it('lets an official verify a report and records who did it', async () => {
      const incident = await sos(citizen).expect(201);

      const response = await t
        .http()
        .patch(`/api/v1/incidents/${incident.body.data.id}/status`)
        .set(official.auth)
        .send({ status: 'VERIFIED', note: 'Confirmed by phone' })
        .expect(200);

      expect(response.body.data.status).toBe('VERIFIED');
      const log = await t.db.query(
        `SELECT from_status::text, to_status::text, changed_by, note FROM incident_status_log
         WHERE incident_id = $1 ORDER BY id DESC LIMIT 1`,
        [incident.body.data.id],
      );
      expect(log.rows[0]).toEqual({
        from_status: 'REPORTED',
        to_status: 'VERIFIED',
        changed_by: official.userId,
        note: 'Confirmed by phone',
      });
    });

    it('refuses a citizen', async () => {
      const incident = await sos(citizen).expect(201);

      await t.http().patch(`/api/v1/incidents/${incident.body.data.id}/status`).set(citizen.auth).send({ status: 'VERIFIED' }).expect(403);
    });

    it('refuses a transition the workflow does not allow', async () => {
      const incident = await sos(citizen).expect(201);

      const response = await t
        .http()
        .patch(`/api/v1/incidents/${incident.body.data.id}/status`)
        .set(official.auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(409);

      expect(response.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('requires duplicateOf for REJECTED_DUPLICATE and stores the link', async () => {
      const original = await sos(citizen).expect(201);
      const copy = await sos(otherCitizen).expect(201);
      const url = `/api/v1/incidents/${copy.body.data.id}/status`;

      await t.http().patch(url).set(official.auth).send({ status: 'REJECTED_DUPLICATE' }).expect(400);
      const response = await t
        .http()
        .patch(url)
        .set(official.auth)
        .send({ status: 'REJECTED_DUPLICATE', duplicateOf: original.body.data.id })
        .expect(200);

      expect(response.body.data).toMatchObject({ status: 'REJECTED_DUPLICATE', duplicateOf: original.body.data.id });
    });

    it('lets a rescue team move assigned work forward but not verify', async () => {
      const incident = await sos(citizen).expect(201);
      const url = `/api/v1/incidents/${incident.body.data.id}/status`;

      await t.http().patch(url).set(rescuer.auth).send({ status: 'VERIFIED' }).expect(409);
      await t.http().patch(url).set(official.auth).send({ status: 'ASSIGNED' }).expect(200);
      await t.http().patch(url).set(rescuer.auth).send({ status: 'IN_PROGRESS' }).expect(200);
    });
  });

  describe('reporter views', () => {
    it('lists my reports newest first and only mine', async () => {
      const mine = await sos(citizen).expect(201);
      const theirs = await sos(otherCitizen).expect(201);

      const response = await t.http().get('/api/v1/incidents/mine').set(citizen.auth).expect(200);

      const ids = (response.body.data as { id: string }[]).map((incident) => incident.id);
      expect(ids[0]).toBe(mine.body.data.id);
      expect(ids).not.toContain(theirs.body.data.id);
    });

    it('shows the timeline to the reporter and hides the incident from other citizens', async () => {
      const incident = await sos(citizen).expect(201);

      const own = await t.http().get(`/api/v1/incidents/${incident.body.data.id}`).set(citizen.auth).expect(200);
      await t.http().get(`/api/v1/incidents/${incident.body.data.id}`).set(otherCitizen.auth).expect(404);

      expect(own.body.data.timeline).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'REPORTED' })]);
    });

    it('lets the reporter add details and a manual pin to a location-less SOS', async () => {
      const incident = await sos(citizen, { lat: null, lon: null, accuracyM: null }).expect(201);

      const response = await t
        .http()
        .patch(`/api/v1/incidents/${incident.body.data.id}`)
        .set(citizen.auth)
        .send({ description: 'Water entering the house', hasChildren: true, manualPin: DARBHANGA_TOWN })
        .expect(200);

      expect(response.body.data).toMatchObject({
        description: 'Water entering the house',
        hasChildren: true,
        locationSource: 'MANUAL_PIN',
        lat: DARBHANGA_TOWN.lat,
        lon: DARBHANGA_TOWN.lon,
      });
    });
  });

  describe('review queue', () => {
    it('flags a report, lists it, and resolves it with a rejection attributed to the official', async () => {
      const incident = await sos(citizen).expect(201);
      const flagged = await t
        .http()
        .post(`/api/v1/incidents/${incident.body.data.id}/flags`)
        .set(official.auth)
        .send({ reason: 'POSSIBLE_FAKE', note: 'Caller hung up twice' })
        .expect(201);

      const pending = await t.http().get('/api/v1/reviews').set(official.auth).expect(200);
      expect((pending.body.data as { id: string }[]).map((review) => review.id)).toContain(flagged.body.data.id);
      const statusBeforeResolution = await t.db.query('SELECT status::text FROM incidents WHERE id = $1', [incident.body.data.id]);
      expect(statusBeforeResolution.rows[0].status).toBe('REPORTED');

      const resolved = await t
        .http()
        .post(`/api/v1/reviews/${flagged.body.data.id}/resolve`)
        .set(official.auth)
        .send({ resolutionNote: 'No such address', incidentStatus: 'REJECTED_FAKE' })
        .expect(201);

      expect(resolved.body.data).toMatchObject({ status: 'RESOLVED', resolvedBy: official.userId });
      const row = await t.db.query('SELECT status::text FROM incidents WHERE id = $1', [incident.body.data.id]);
      expect(row.rows[0].status).toBe('REJECTED_FAKE');
    });

    it('refuses a second pending flag for the same reason', async () => {
      const incident = await sos(citizen).expect(201);
      const url = `/api/v1/incidents/${incident.body.data.id}/flags`;
      await t.http().post(url).set(official.auth).send({ reason: 'LOCATION_UNCERTAIN' }).expect(201);

      const response = await t.http().post(url).set(official.auth).send({ reason: 'LOCATION_UNCERTAIN' }).expect(409);

      expect(response.body.error.code).toBe('REVIEW_ALREADY_PENDING');
    });
  });

  describe('with Redis down', () => {
    it('still accepts an SOS promptly', async () => {
      await stack.redis.stop();

      const started = Date.now();
      const response = await sos(citizen).expect(201);

      expect(response.body.data.status).toBe('REPORTED');
      expect(Date.now() - started).toBeLessThan(1_000);
    });
  });
});
