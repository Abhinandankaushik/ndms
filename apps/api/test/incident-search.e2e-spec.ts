import { randomUUID } from 'node:crypto';
import { loginAs, type LoggedIn } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

const DARBHANGA_TOWN = { lat: 26.1542, lon: 85.8918 };

describe('incident search', () => {
  let stack: TestStack;
  let t: TestApp;
  let citizen: LoggedIn;
  let otherCitizen: LoggedIn;
  let official: LoggedIn;
  let rescuer: LoggedIn;

  let needleId: string;
  let otherReporterId: string;

  const report = async (who: LoggedIn, overrides: Record<string, unknown> = {}): Promise<string> => {
    const response = await t
      .http()
      .post('/api/v1/incidents')
      .set(who.auth)
      .send({
        clientUuid: randomUUID(),
        ...DARBHANGA_TOWN,
        locationSource: 'GPS',
        reportedAt: new Date().toISOString(),
        type: 'FLOOD',
        ...overrides,
      })
      .expect((res) => {
        if (res.status !== 201) throw new Error(`report failed: ${res.status} ${JSON.stringify(res.body)}`);
      });
    return response.body.data.id as string;
  };

  const search = (who: LoggedIn, query: Record<string, unknown>) =>
    t.http().get('/api/v1/incidents/search').query(query).set(who.auth);

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack);
    citizen = await loginAs(t);
    otherCitizen = await loginAs(t);
    official = await loginAs(t, { role: 'GOVT_OFFICIAL' });
    rescuer = await loginAs(t, { role: 'RESCUE_TEAM' });

    needleId = await report(citizen, {
      addressText: 'Near Singhwara crossing',
      description: 'Waist deep water by the culvert',
    });
    await report(citizen, { addressText: 'Near Bariaul', description: 'Road washed out' });
    otherReporterId = await report(otherCitizen, { addressText: 'Near Kalyanpur', description: 'Power line down' });
  });

  afterAll(async () => {
    await t?.close();
    await stopStack(stack);
  });

  const idsOf = (body: { data: { id: string }[] }) => body.data.map((row) => row.id);

  describe('branch selection', () => {
    it('finds one incident by its full id and says which branch ran', async () => {
      const response = await search(official, { q: needleId }).expect(200);

      expect(idsOf(response.body)).toEqual([needleId]);
      expect(response.body.meta).toEqual({ match: 'id', count: 1 });
    });

    it('finds an incident from the first characters of its id, as a team would radio it in', async () => {
      const response = await search(official, { q: needleId.slice(0, 8) }).expect(200);

      expect(idsOf(response.body)).toContain(needleId);
      expect(response.body.meta.match).toBe('id_prefix');
    });

    it('matches free text on the address', async () => {
      const response = await search(official, { q: 'Singhwara' }).expect(200);

      expect(idsOf(response.body)).toEqual([needleId]);
      expect(response.body.meta.match).toBe('text');
    });

    it('matches free text on the description', async () => {
      const response = await search(official, { q: 'culvert' }).expect(200);

      expect(idsOf(response.body)).toEqual([needleId]);
    });

    it('is case insensitive and matches a substring', async () => {
      const response = await search(official, { q: 'SINGHWAR' }).expect(200);

      expect(idsOf(response.body)).toEqual([needleId]);
    });

    it('returns an empty list rather than an error when nothing matches', async () => {
      const response = await search(official, { q: 'nothinghereatall' }).expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta).toEqual({ match: 'text', count: 0 });
    });
  });

  describe('reporter phone', () => {
    it("finds every report from one reporter by the number as it is stored", async () => {
      const response = await search(official, { q: citizen.phone }).expect(200);

      expect(response.body.meta.match).toBe('phone');
      expect(idsOf(response.body)).toContain(needleId);
      expect(idsOf(response.body)).not.toContain(otherReporterId);
    });

    // Officers type the local number off a call log; the column holds it E.164.
    it('finds the same reporter from the local digits without the country code', async () => {
      const local = citizen.phone.replace(/^\+91/, '');
      const response = await search(official, { q: local }).expect(200);

      expect(response.body.meta.match).toBe('phone');
      expect(idsOf(response.body)).toContain(needleId);
    });

    it('ignores spaces and dashes in a typed number', async () => {
      const spaced = citizen.phone.replace(/^\+91(\d{5})(\d{5})$/, '$1 $2');
      const response = await search(official, { q: spaced }).expect(200);

      expect(idsOf(response.body)).toContain(needleId);
    });

    it('refuses a phone search from a rescue team, because it would expose reporter contact details', async () => {
      const response = await search(rescuer, { q: citizen.phone }).expect(403);

      expect(response.body.error.code).toBe('PHONE_SEARCH_FORBIDDEN');
    });

    it('still lets a rescue team search free text', async () => {
      const response = await search(rescuer, { q: 'Singhwara' }).expect(200);

      expect(idsOf(response.body)).toEqual([needleId]);
    });
  });

  describe('validation and access', () => {
    it('rejects a term shorter than two characters', async () => {
      await search(official, { q: 'a' }).expect(400);
    });

    it('rejects a window whose start is after its end', async () => {
      await search(official, {
        q: 'Singhwara',
        from: '2026-09-21T00:00:00Z',
        to: '2026-09-01T00:00:00Z',
      }).expect(400);
    });

    it('narrows results to a reported-at window', async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const response = await search(official, { q: 'Singhwara', from: future }).expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('is closed to citizens', async () => {
      await search(citizen, { q: 'Singhwara' }).expect(403);
    });
  });

  describe('GET /incidents/queue sorting', () => {
    it('defaults to priority order, which leaves the newest report out of reach', async () => {
      const response = await t.http().get('/api/v1/incidents/queue').query({ limit: 200 }).set(official.auth).expect(200);

      expect(response.body.meta).toBeNull();
      const scores = response.body.data.map((row: { priorityScore: number | null }) => row.priorityScore);
      const scored = scores.filter((score: number | null) => score !== null);
      expect([...scored]).toEqual([...scored].sort((a: number, b: number) => b - a));
    });

    it('puts the report that just arrived first when sorted newest', async () => {
      const arrival = await report(citizen, { addressText: 'Newest arrival', description: 'just now' });
      const response = await t
        .http()
        .get('/api/v1/incidents/queue')
        .query({ sort: 'newest', limit: 5 })
        .set(official.auth)
        .expect(200);

      expect(response.body.data[0].id).toBe(arrival);
    });

    it('filters the queue to a reported-at window', async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const response = await t
        .http()
        .get('/api/v1/incidents/queue')
        .query({ sort: 'newest', from: future })
        .set(official.auth)
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('rejects an unknown sort', async () => {
      await t.http().get('/api/v1/incidents/queue').query({ sort: 'sideways' }).set(official.auth).expect(400);
    });
  });
});
