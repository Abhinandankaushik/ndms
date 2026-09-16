import { io, type Socket } from 'socket.io-client';
import { AlertsModule } from '../src/modules/alerts/alerts.module';
import { loginAs, type LoggedIn } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

const DARBHANGA_TOWN = { lat: 26.1542, lon: 85.8918 };
const ELSEWHERE_IN_DISTRICT = { lat: 26.0447, lon: 86.1017 };
const PATNA = { lat: 25.5941, lon: 85.1376 };

const ring = (minLon: number, minLat: number, maxLon: number, maxLat: number) => [
  [minLon, minLat],
  [maxLon, minLat],
  [maxLon, maxLat],
  [minLon, maxLat],
  [minLon, minLat],
];

const circleRing = (positions: number) => {
  const vertices = Array.from({ length: positions - 1 }, (_, index) => {
    const angle = (2 * Math.PI * index) / (positions - 1);
    return [85.89 + 0.02 * Math.cos(angle), 26.15 + 0.02 * Math.sin(angle)];
  });
  return [...vertices, vertices[0]!];
};

const TOWN_GEOFENCE = { type: 'Polygon', coordinates: [ring(85.87, 26.13, 85.91, 26.17)] };

interface AlertBody {
  id: string;
  districtId: number;
  severity: string;
  title: string;
  message: string;
  targetRoles: string[];
  geofence: { type: string; coordinates: number[][][][] } | null;
  issuedAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
}

let titleCounter = 0;
const uniqueTitle = () => `Flood warning ${(titleCounter += 1)}`;

describe('alerts', () => {
  let stack: TestStack;
  let t: TestApp;
  let official: LoggedIn;
  let citizen: LoggedIn;
  let rescuer: LoggedIn;
  let facilityManager: LoggedIn;
  let otherDistrictOfficial: LoggedIn;
  const sockets: Socket[] = [];

  const issue = (overrides: Record<string, unknown> = {}, who: LoggedIn = official) =>
    t
      .http()
      .post('/api/v1/alerts')
      .set(who.auth)
      .send({ severity: 'SEVERE', title: uniqueTitle(), message: 'Move to higher ground now', ...overrides });

  const activeIds = async (who: LoggedIn, position?: { lat: number; lon: number }) => {
    const response = await t.http().get('/api/v1/alerts/active').query(position ?? {}).set(who.auth).expect(200);
    return (response.body.data as AlertBody[]).map((alert) => alert.id);
  };

  const connect = (who: LoggedIn) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(t.baseUrl, { transports: ['websocket'], auth: { token: who.accessToken }, reconnection: false });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  const nextEvent = <T>(socket: Socket, name: string, match: (payload: T) => boolean, timeoutMs = 3_000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${name} within ${timeoutMs} ms`)), timeoutMs);
      const handler = (payload: T) => {
        if (!match(payload)) return;
        clearTimeout(timer);
        socket.off(name, handler);
        resolve(payload);
      };
      socket.on(name, handler);
    });

  const recordEvents = <T>(socket: Socket, name: string) => {
    const received: T[] = [];
    socket.on(name, (payload: T) => received.push(payload));
    return received;
  };

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack, { imports: [AlertsModule] });
    const otherDistrict = await t.db.query<{ id: number }>(
      `INSERT INTO districts (name, state, boundary)
       VALUES ('Synthetic', 'Test', ST_Multi(ST_MakeEnvelope(80, 20, 81, 21, 4326))::geography)
       RETURNING id`,
    );

    official = await loginAs(t, { role: 'GOVT_OFFICIAL' });
    citizen = await loginAs(t);
    rescuer = await loginAs(t, { role: 'RESCUE_TEAM' });
    facilityManager = await loginAs(t, { role: 'FACILITY_MANAGER' });
    otherDistrictOfficial = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: otherDistrict.rows[0]!.id });
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await t?.close();
    await stopStack(stack);
  });

  describe('POST /alerts', () => {
    it('stores the geofence as a MultiPolygon and broadcasts only to the targeted role room', async () => {
      const citizenSocket = await connect(citizen);
      const rescuerSocket = await connect(rescuer);
      const rescuerAlerts = recordEvents<{ id: string }>(rescuerSocket, 'alert:broadcast');
      const title = uniqueTitle();
      const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
      const broadcast = nextEvent<{ title: string }>(citizenSocket, 'alert:broadcast', (payload) => payload.title === title);

      const response = await issue({ title, targetRoles: ['CITIZEN'], geofence: TOWN_GEOFENCE, expiresAt }).expect(201);

      const alert = response.body.data as AlertBody;
      expect(alert).toEqual({
        id: expect.any(String),
        districtId: t.districtId,
        severity: 'SEVERE',
        title,
        message: 'Move to higher ground now',
        targetRoles: ['CITIZEN'],
        geofence: { type: 'MultiPolygon', coordinates: [TOWN_GEOFENCE.coordinates] },
        issuedAt: expect.any(String),
        expiresAt,
        cancelledAt: null,
      });
      await expect(broadcast).resolves.toEqual({
        id: alert.id,
        severity: 'SEVERE',
        title,
        message: 'Move to higher ground now',
        geofence: alert.geofence,
        issuedAt: alert.issuedAt,
        expiresAt,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(rescuerAlerts.map((payload) => payload.id)).not.toContain(alert.id);
    });

    it('reaches every role when no target roles are given', async () => {
      const managerSocket = await connect(facilityManager);
      const rescuerSocket = await connect(rescuer);
      const title = uniqueTitle();
      const toManager = nextEvent<{ title: string }>(managerSocket, 'alert:broadcast', (payload) => payload.title === title);
      const toRescuer = nextEvent<{ title: string }>(rescuerSocket, 'alert:broadcast', (payload) => payload.title === title);

      const response = await issue({ title }).expect(201);

      expect(response.body.data).toMatchObject({ targetRoles: [], geofence: null, expiresAt: null });
      await expect(toManager).resolves.toMatchObject({ id: response.body.data.id, geofence: null });
      await expect(toRescuer).resolves.toMatchObject({ id: response.body.data.id });
    });

    it('collapses repeated target roles and reads explicit nulls as no geofence and no expiry', async () => {
      const response = await issue({ targetRoles: ['CITIZEN', 'CITIZEN'], geofence: null, expiresAt: null }).expect(201);

      expect(response.body.data).toMatchObject({ targetRoles: ['CITIZEN'], geofence: null, expiresAt: null });
    });

    it('refuses a self-intersecting geofence with GEOFENCE_INVALID', async () => {
      const bowtie = [
        [85.87, 26.13],
        [85.91, 26.17],
        [85.91, 26.13],
        [85.87, 26.17],
        [85.87, 26.13],
      ];

      const response = await issue({ geofence: { type: 'Polygon', coordinates: [bowtie] } }).expect(422);

      expect(response.body.error).toMatchObject({ code: 'GEOFENCE_INVALID', details: { reason: expect.stringContaining('Self-intersection') } });
    });

    it('refuses a geofence that does not touch the district with GEOFENCE_OUTSIDE_DISTRICT', async () => {
      const aroundPatna = { type: 'Polygon', coordinates: [ring(85.1, 25.55, 85.18, 25.63)] };

      const response = await issue({ geofence: aroundPatna }).expect(422);

      expect(response.body.error.code).toBe('GEOFENCE_OUTSIDE_DISTRICT');
    });

    it.each([
      [
        'an unclosed ring',
        { geofence: { type: 'Polygon', coordinates: [ring(85.87, 26.13, 85.91, 26.17).slice(0, 4)] } },
        'geofence',
        'A ring must end at its first position',
      ],
      [
        'a ring with too few positions',
        { geofence: { type: 'Polygon', coordinates: [[[85.87, 26.13], [85.91, 26.13], [85.87, 26.13]]] } },
        'geofence',
        'A ring needs at least 4 positions',
      ],
      [
        'non-numeric positions',
        { geofence: { type: 'Polygon', coordinates: [[['85.87', '26.13'], [85.91, 26.13], [85.91, 26.17], ['85.87', '26.13']]] } },
        'geofence',
        'Invalid input',
      ],
      [
        'more than 1000 vertices',
        { geofence: { type: 'Polygon', coordinates: [circleRing(1001)] } },
        'geofence',
        'A geofence may have at most 1000 vertices',
      ],
      [
        'a geofence wider than 10 degrees',
        { geofence: { type: 'Polygon', coordinates: [ring(80, 20, 91, 27)] } },
        'geofence',
        'A geofence may span at most 10 degrees',
      ],
      [
        'a LineString geofence',
        { geofence: { type: 'LineString', coordinates: [[85.87, 26.13], [85.91, 26.17]] } },
        'geofence',
        'Invalid discriminator value',
      ],
      ['an expiry in the past', { expiresAt: new Date(Date.now() - 60_000).toISOString() }, 'expiresAt', 'expiresAt must be in the future'],
      ['an unknown target role', { targetRoles: ['ADMIN'] }, 'targetRoles', 'Invalid option'],
    ])('rejects %s as VALIDATION_FAILED', async (_case, overrides, field, message) => {
      const response = await issue(overrides).expect(400);

      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fieldErrors: { [field]: expect.arrayContaining([expect.stringContaining(message)]) } },
      });
    });

    it('accepts a geofence of exactly 1000 vertices', async () => {
      const response = await issue({ geofence: { type: 'Polygon', coordinates: [circleRing(1000)] } }).expect(201);

      expect(response.body.data.geofence.coordinates[0][0]).toHaveLength(1000);
    });

    it('drops altitudes from positions, because the geofence column is two-dimensional', async () => {
      const withAltitude = TOWN_GEOFENCE.coordinates[0]!.map(([lon, lat]) => [lon, lat, 52.5]);

      const response = await issue({ geofence: { type: 'Polygon', coordinates: [withAltitude] } }).expect(201);

      expect(response.body.data.geofence).toEqual({ type: 'MultiPolygon', coordinates: [TOWN_GEOFENCE.coordinates] });
    });

    it('refuses citizens', async () => {
      const response = await issue({}, citizen).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('refuses an official who has no district', async () => {
      const unassigned = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: null });

      const response = await issue({}, unassigned).expect(403);

      expect(response.body.error.code).toBe('NO_DISTRICT_SCOPE');
    });
  });

  describe('GET /alerts/active', () => {
    let townAlert: AlertBody;
    let districtAlert: AlertBody;
    let rescueOnlyAlert: AlertBody;
    let twoAreaAlert: AlertBody;

    beforeAll(async () => {
      townAlert = (await issue({ geofence: TOWN_GEOFENCE }).expect(201)).body.data;
      districtAlert = (await issue({}).expect(201)).body.data;
      rescueOnlyAlert = (await issue({ targetRoles: ['RESCUE_TEAM'] }).expect(201)).body.data;
      twoAreaAlert = (
        await issue({
          geofence: { type: 'MultiPolygon', coordinates: [[ring(85.6, 26.35, 85.65, 26.4)], [ring(86.08, 26.02, 86.12, 26.06)]] },
        }).expect(201)
      ).body.data;
    });

    it('includes a geofenced alert only for positions inside its geofence', async () => {
      const inTown = await activeIds(citizen, DARBHANGA_TOWN);
      const elsewhere = await activeIds(citizen, ELSEWHERE_IN_DISTRICT);
      const outsideDistrict = await activeIds(citizen, PATNA);

      expect(inTown).toEqual(expect.arrayContaining([townAlert.id, districtAlert.id]));
      expect(inTown).not.toContain(twoAreaAlert.id);
      expect(elsewhere).toEqual(expect.arrayContaining([districtAlert.id, twoAreaAlert.id]));
      expect(elsewhere).not.toContain(townAlert.id);
      expect(outsideDistrict).not.toContain(townAlert.id);
      expect(outsideDistrict).not.toContain(districtAlert.id);
    });

    it('without a position, returns the whole-district alerts only', async () => {
      const ids = await activeIds(citizen);

      expect(ids).toContain(districtAlert.id);
      expect(ids).not.toContain(townAlert.id);
      expect(ids).not.toContain(twoAreaAlert.id);
    });

    it("returns only alerts that target the caller's role", async () => {
      const forCitizen = await activeIds(citizen, DARBHANGA_TOWN);
      const forRescuer = await activeIds(rescuer, DARBHANGA_TOWN);

      expect(forCitizen).not.toContain(rescueOnlyAlert.id);
      expect(forRescuer).toEqual(expect.arrayContaining([rescueOnlyAlert.id, districtAlert.id]));
    });

    it('drops an alert once it has expired', async () => {
      const expiring = (await issue({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(201)).body.data as AlertBody;
      expect(await activeIds(citizen, DARBHANGA_TOWN)).toContain(expiring.id);

      await t.db.query(
        `UPDATE alerts SET issued_at = now() - interval '2 hours', expires_at = now() - interval '1 minute' WHERE id = $1`,
        [expiring.id],
      );

      expect(await activeIds(citizen, DARBHANGA_TOWN)).not.toContain(expiring.id);
    });

    it('treats blank lat and lon as no position', async () => {
      const response = await t.http().get('/api/v1/alerts/active?lat=&lon=').set(citizen.auth).expect(200);

      const ids = (response.body.data as AlertBody[]).map((alert) => alert.id);
      expect(ids).toContain(districtAlert.id);
      expect(ids).not.toContain(townAlert.id);
    });

    it('rejects a latitude without a longitude', async () => {
      const response = await t.http().get('/api/v1/alerts/active').query({ lat: 26.15 }).set(citizen.auth).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /alerts/:id/cancel', () => {
    it('withdraws the alert, tells its audience, records who did it and keeps it in history', async () => {
      const citizenSocket = await connect(citizen);
      const alert = (await issue({ targetRoles: ['CITIZEN'] }).expect(201)).body.data as AlertBody;
      const cancelledEvent = nextEvent<{ id: string }>(citizenSocket, 'alert:cancelled', (payload) => payload.id === alert.id);

      const response = await t.http().post(`/api/v1/alerts/${alert.id}/cancel`).set(official.auth).expect(201);

      expect(response.body.data).toMatchObject({ id: alert.id, cancelledAt: expect.any(String) });
      await expect(cancelledEvent).resolves.toEqual({ id: alert.id });
      expect(await activeIds(citizen)).not.toContain(alert.id);
      const history = await t.http().get('/api/v1/alerts').set(official.auth).expect(200);
      expect(history.body.data).toContainEqual(expect.objectContaining({ id: alert.id, cancelledAt: response.body.data.cancelledAt }));
      const audit = await t.db.query('SELECT actor_id, action FROM audit_log WHERE entity_type = $1 AND entity_id = $2', ['alert', alert.id]);
      expect(audit.rows).toEqual([{ actor_id: official.userId, action: 'alert.status.cancelled' }]);
    });

    it('answers a repeated cancel with the already cancelled alert', async () => {
      const alert = (await issue({}).expect(201)).body.data as AlertBody;
      const first = await t.http().post(`/api/v1/alerts/${alert.id}/cancel`).set(official.auth).expect(201);

      const again = await t.http().post(`/api/v1/alerts/${alert.id}/cancel`).set(official.auth).expect(201);

      expect(again.body.data.cancelledAt).toBe(first.body.data.cancelledAt);
    });

    it('refuses citizens', async () => {
      const alert = (await issue({}).expect(201)).body.data as AlertBody;

      const response = await t.http().post(`/api/v1/alerts/${alert.id}/cancel`).set(citizen.auth).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it("hides another district's alerts", async () => {
      const alert = (await issue({}).expect(201)).body.data as AlertBody;

      const response = await t.http().post(`/api/v1/alerts/${alert.id}/cancel`).set(otherDistrictOfficial.auth).expect(404);

      expect(response.body.error.code).toBe('ALERT_NOT_FOUND');
      const history = await t.http().get('/api/v1/alerts').set(otherDistrictOfficial.auth).expect(200);
      expect((history.body.data as AlertBody[]).map((entry) => entry.id)).not.toContain(alert.id);
    });
  });

  describe('GET /alerts', () => {
    it('lists the district history newest first', async () => {
      const older = (await issue({}).expect(201)).body.data as AlertBody;
      const newer = (await issue({}).expect(201)).body.data as AlertBody;

      const response = await t.http().get('/api/v1/alerts').set(official.auth).expect(200);

      const ids = (response.body.data as AlertBody[]).map((alert) => alert.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
      expect(ids.indexOf(newer.id)).toBe(0);
    });

    it('refuses citizens', async () => {
      await t.http().get('/api/v1/alerts').set(citizen.auth).expect(403);
    });
  });
});
