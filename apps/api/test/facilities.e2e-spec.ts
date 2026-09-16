import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { io, type Socket } from 'socket.io-client';
import type { Response } from 'supertest';
import { Prisma } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/infra/database/prisma.service';
import { FacilitiesModule } from '../src/modules/facilities/facilities.module';
import { FacilitiesRepository } from '../src/modules/facilities/facilities.repository';
import { loginAs, type LoggedIn } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

interface FacilityBody {
  id: string;
  districtId: number;
  kind: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
  occupancy: number;
  isOperational: boolean;
  distanceM?: number;
}

interface FacilityEvent {
  facilityId: string;
  occupancy?: number;
  capacity?: number;
}

const DARBHANGA_TOWN = { lat: 26.1542, lon: 85.8918 };
const PATNA = { lat: 25.5941, lon: 85.1376 };
const SYNTHETIC_DISTRICT_POINT = { lat: 20.5, lon: 80.5 };

// More than 15 km from every other facility this suite creates, so the nearest results around
// it are only the locator fixtures.
const LOCATOR_ORIGIN = { lat: 26.1, lon: 86.1 };
const METRES_PER_DEGREE_LAT = 110_790;
const METRES_PER_DEGREE_LON_AT_ORIGIN = 100_033;

const fromOrigin = (metresNorth: number, metresEast: number) => ({
  lat: LOCATOR_ORIGIN.lat + metresNorth / METRES_PER_DEGREE_LAT,
  lon: LOCATOR_ORIGIN.lon + metresEast / METRES_PER_DEGREE_LON_AT_ORIGIN,
});

const idsOf = (response: Response) => (response.body.data as FacilityBody[]).map((facility) => facility.id);

const flattenPlan = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(flattenPlan)];

// Runs a repository method against a stand-in client to capture the exact statement it would
// issue, so the plan assertions cover the real SQL rather than a hand-copied shape.
async function statementIssuedBy(query: (repository: FacilitiesRepository) => Promise<unknown>): Promise<Prisma.Sql> {
  let issued: Prisma.Sql | undefined;
  const capturingClient = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      issued = Prisma.sql(strings, ...values);
      return Promise.resolve([]);
    },
  };
  await query(new FacilitiesRepository(capturingClient as unknown as PrismaService));
  if (!issued) throw new Error('The repository issued no statement');
  return issued;
}

describe('facilities', () => {
  let stack: TestStack;
  let t: TestApp;
  let official: LoggedIn;
  let otherDistrictOfficial: LoggedIn;
  let rescuer: LoggedIn;
  let citizen: LoggedIn;
  const sockets: Socket[] = [];

  const createFacility = async (overrides: Record<string, unknown> = {}, by?: LoggedIn): Promise<FacilityBody> => {
    const response = await t
      .http()
      .post('/api/v1/facilities')
      .set((by ?? official).auth)
      .send({ kind: 'SHELTER', name: `Test shelter ${randomUUID().slice(0, 8)}`, ...DARBHANGA_TOWN, capacity: 100, ...overrides })
      .expect(201);
    return response.body.data as FacilityBody;
  };

  const managerOf = (facilityId: string) => loginAs(t, { role: 'FACILITY_MANAGER', facilityId });

  const changeOccupancy = (who: LoggedIn, facilityId: string, delta: unknown) =>
    t.http().patch(`/api/v1/facilities/${facilityId}/occupancy`).set(who.auth).send({ delta });

  const updateFacility = (who: LoggedIn, facilityId: string, body: Record<string, unknown>) =>
    t.http().patch(`/api/v1/facilities/${facilityId}`).set(who.auth).send(body);

  const adjustStock = (who: LoggedIn, facilityId: string, item: string, body: Record<string, unknown>) =>
    t.http().patch(`/api/v1/facilities/${facilityId}/inventory/${item}`).set(who.auth).send(body);

  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(t.baseUrl, { transports: ['websocket'], auth: { token }, reconnection: false });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  const nextEvent = <T extends FacilityEvent>(socket: Socket, name: string, match: (payload: T) => boolean, timeoutMs = 3_000) =>
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

  const waitForRowLockWaiter = async () => {
    for (let waited = 0; waited < 5_000; waited += 20) {
      const result = await t.db.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
      );
      if (result.rows[0]!.waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('No statement queued behind the row lock within 5 s');
  };

  const collectEvents = (socket: Socket, name: string, facilityId: string) => {
    const received: FacilityEvent[] = [];
    socket.on(name, (payload: FacilityEvent) => {
      if (payload.facilityId === facilityId) received.push(payload);
    });
    return received;
  };

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack, { imports: [FacilitiesModule] });
    official = await loginAs(t, { role: 'GOVT_OFFICIAL' });
    rescuer = await loginAs(t, { role: 'RESCUE_TEAM' });
    citizen = await loginAs(t);

    const synthetic = await t.db.query<{ id: number }>(
      `INSERT INTO districts (name, state, boundary)
       VALUES ('Synthetic test district', 'Test', ST_Multi(ST_MakeEnvelope(80, 20, 81, 21, 4326))::geography)
       RETURNING id`,
    );
    otherDistrictOfficial = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: synthetic.rows[0]!.id });
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await t?.close();
    await stopStack(stack);
  });

  describe('POST /facilities', () => {
    it('files the facility under the district whose boundary covers it', async () => {
      const response = await t
        .http()
        .post('/api/v1/facilities')
        .set(official.auth)
        .send({
          kind: 'SHELTER',
          name: 'Test shelter with details',
          ...DARBHANGA_TOWN,
          address: 'Ward 12',
          contactPhone: '+91 6272 222-222',
          capacity: 120,
          amenities: ['drinking water', 'toilets', 'drinking water'],
          attributes: { floors: 2, capacitySource: 'synthetic' },
        })
        .expect(201);

      expect(response.body.data).toEqual({
        id: expect.any(String),
        districtId: t.districtId,
        kind: 'SHELTER',
        name: 'Test shelter with details',
        ...DARBHANGA_TOWN,
        address: 'Ward 12',
        contactPhone: '+916272222222',
        capacity: 120,
        occupancy: 0,
        freeCapacity: 120,
        utilisation: 0,
        isOperational: true,
        amenities: ['drinking water', 'toilets'],
        attributes: { floors: 2, capacitySource: 'synthetic' },
        updatedAt: expect.any(String),
      });
    });

    it('refuses a location outside every district', async () => {
      const response = await t
        .http()
        .post('/api/v1/facilities')
        .set(official.auth)
        .send({ kind: 'SHELTER', name: 'Test shelter in Patna', ...PATNA, capacity: 10 })
        .expect(422);

      expect(response.body.error.code).toBe('OUTSIDE_DISTRICT');
    });

    it("refuses a location outside the official's own district", async () => {
      const response = await t
        .http()
        .post('/api/v1/facilities')
        .set(otherDistrictOfficial.auth)
        .send({ kind: 'SHELTER', name: 'Test shelter across the border', ...DARBHANGA_TOWN, capacity: 10 })
        .expect(422);

      expect(response.body.error.code).toBe('OUTSIDE_DISTRICT');
    });

    it('is for officials only', async () => {
      const shelter = await createFacility();
      const manager = await managerOf(shelter.id);
      const body = { kind: 'SHELTER', name: 'Test shelter', ...DARBHANGA_TOWN, capacity: 10 };

      await t.http().post('/api/v1/facilities').set(manager.auth).send(body).expect(403);
      await t.http().post('/api/v1/facilities').set(rescuer.auth).send(body).expect(403);
    });
  });

  describe('PATCH /facilities/:id/occupancy', () => {
    it('loses no update when 100 arrivals are registered at the same moment (O5)', async () => {
      const shelter = await createFacility({ capacity: 500 });
      const manager = await managerOf(shelter.id);

      const responses = await Promise.all(Array.from({ length: 100 }, () => changeOccupancy(manager, shelter.id, 1)));

      expect(responses.map((response) => response.status)).toEqual(Array.from({ length: 100 }, () => 200));
      const reported = responses.map((response) => response.body.data.occupancy as number).sort((a, b) => a - b);
      expect(reported).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
      const row = await t.db.query('SELECT occupancy FROM facilities WHERE id = $1', [shelter.id]);
      expect(row.rows[0].occupancy).toBe(100);
    });

    it('clamps at capacity and at zero', async () => {
      const shelter = await createFacility({ capacity: 10 });

      const full = await changeOccupancy(official, shelter.id, 25).expect(200);
      const empty = await changeOccupancy(official, shelter.id, -40).expect(200);

      expect(full.body.data).toEqual({ occupancy: 10, capacity: 10, freeCapacity: 0, utilisation: 1 });
      expect(empty.body.data).toEqual({ occupancy: 0, capacity: 10, freeCapacity: 10, utilisation: 0 });
    });

    it('alerts the district and the facility once, when utilisation first reaches 85 %', async () => {
      const shelter = await createFacility({ capacity: 100 });
      const manager = await managerOf(shelter.id);
      const [officialSocket, managerSocket] = await Promise.all([connect(official.accessToken), connect(manager.accessToken)]);
      const officialAlerts = collectEvents(officialSocket, 'facility:capacity_alert', shelter.id);
      const managerAlerts = collectEvents(managerSocket, 'facility:capacity_alert', shelter.id);

      for (const delta of [80, 5, 5, 10]) {
        await changeOccupancy(manager, shelter.id, delta).expect(200);
      }
      // Socket.IO delivers in order, so once the final change arrives every earlier alert has too.
      const finalChange = [officialSocket, managerSocket].map((socket) =>
        nextEvent(socket, 'facility:capacity_changed', (event) => event.facilityId === shelter.id && event.occupancy === 99),
      );
      await changeOccupancy(manager, shelter.id, -1).expect(200);
      await Promise.all(finalChange);

      const alert = { facilityId: shelter.id, name: shelter.name, occupancy: 85, capacity: 100, utilisation: 0.85 };
      expect(officialAlerts).toEqual([alert]);
      expect(managerAlerts).toEqual([alert]);
    });

    it('judges the crossing from the headcount a concurrent writer committed, not a stale snapshot', async () => {
      const shelter = await createFacility({ capacity: 100 });
      await changeOccupancy(official, shelter.id, 84).expect(200);
      const socket = await connect(official.accessToken);
      const alerts = collectEvents(socket, 'facility:capacity_alert', shelter.id);
      const concurrentWriter = new Client({ connectionString: stack.postgres.getConnectionUri() });
      await concurrentWriter.connect();

      // The writer takes the shelter from 84 to 85 inside an open transaction, so the arrival queued
      // behind it must count 85 as its "before" and stay silent on the way to 86.
      try {
        await concurrentWriter.query('BEGIN');
        await concurrentWriter.query('UPDATE facilities SET occupancy = occupancy + 1 WHERE id = $1', [shelter.id]);
        const blockedArrival = changeOccupancy(official, shelter.id, 1).then((response) => response);
        await waitForRowLockWaiter();
        await concurrentWriter.query('COMMIT');

        const response = await blockedArrival;
        expect(response.status).toBe(200);
        expect(response.body.data.occupancy).toBe(86);
      } finally {
        await concurrentWriter.end();
      }

      const finalChange = nextEvent(socket, 'facility:capacity_changed', (event) => event.facilityId === shelter.id && event.capacity === 101);
      await updateFacility(official, shelter.id, { capacity: 101 }).expect(200);
      await finalChange;
      expect(alerts).toEqual([]);
    });

    it('broadcasts every change to the district', async () => {
      const shelter = await createFacility({ capacity: 40 });
      const socket = await connect(official.accessToken);
      const changed = nextEvent(socket, 'facility:capacity_changed', (event) => event.facilityId === shelter.id);

      await changeOccupancy(official, shelter.id, 10).expect(200);

      await expect(changed).resolves.toEqual({ facilityId: shelter.id, occupancy: 10, capacity: 40, utilisation: 0.25 });
    });

    it.each([0, 1.5, 10_001, -10_001, '5'])('refuses a delta of %p', async (delta) => {
      const shelter = await createFacility();

      const response = await changeOccupancy(official, shelter.id, delta).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('is closed to citizens and rescue teams', async () => {
      const shelter = await createFacility();

      await changeOccupancy(citizen, shelter.id, 1).expect(403);
      await changeOccupancy(rescuer, shelter.id, 1).expect(403);
    });
  });

  describe('write scope', () => {
    it("answers 404 to another facility's manager and to an official of another district", async () => {
      const own = await createFacility();
      const other = await createFacility();
      const manager = await managerOf(own.id);

      const hidden = await changeOccupancy(manager, other.id, 5).expect(404);
      await updateFacility(manager, other.id, { name: 'Taken over' }).expect(404);
      await adjustStock(manager, other.id, 'BLANKET', { delta: 5 }).expect(404);
      await changeOccupancy(otherDistrictOfficial, own.id, 5).expect(404);
      await updateFacility(otherDistrictOfficial, own.id, { capacity: 1 }).expect(404);

      expect(hidden.body.error.code).toBe('FACILITY_NOT_FOUND');
      const rows = await t.db.query('SELECT id, occupancy, capacity, name FROM facilities WHERE id = ANY($1::uuid[])', [
        [own.id, other.id],
      ]);
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows).toEqual(
        expect.arrayContaining([own, other].map(({ id, name }) => ({ id, occupancy: 0, capacity: 100, name }))),
      );
      await changeOccupancy(manager, own.id, 5).expect(200);
    });
  });

  describe('PATCH /facilities/:id', () => {
    it('refuses a capacity below the current occupancy and changes nothing', async () => {
      const shelter = await createFacility({ capacity: 50 });
      const manager = await managerOf(shelter.id);
      await changeOccupancy(manager, shelter.id, 40).expect(200);

      const refused = await updateFacility(manager, shelter.id, { capacity: 39, name: 'Renamed' }).expect(409);

      expect(refused.body.error).toMatchObject({ code: 'CAPACITY_BELOW_OCCUPANCY', details: { occupancy: 40 } });
      const row = await t.db.query('SELECT capacity, name FROM facilities WHERE id = $1', [shelter.id]);
      expect(row.rows[0]).toEqual({ capacity: 50, name: shelter.name });
    });

    it('lets its manager cut capacity down to exactly the occupancy and edit details', async () => {
      const shelter = await createFacility({ capacity: 50, address: 'Old address', contactPhone: '+916272000000' });
      const manager = await managerOf(shelter.id);
      await changeOccupancy(manager, shelter.id, 40).expect(200);

      const response = await updateFacility(manager, shelter.id, {
        capacity: 40,
        isOperational: false,
        address: null,
        amenities: ['generator'],
      }).expect(200);

      expect(response.body.data).toMatchObject({
        name: shelter.name,
        capacity: 40,
        occupancy: 40,
        freeCapacity: 0,
        utilisation: 1,
        isOperational: false,
        address: null,
        contactPhone: '+916272000000',
        amenities: ['generator'],
      });
    });

    it('stores a blank address or phone from a form as no value', async () => {
      const shelter = await createFacility({ address: 'Ward 3', contactPhone: '' });

      const response = await updateFacility(official, shelter.id, { address: '  ' }).expect(200);

      expect(shelter).toMatchObject({ address: 'Ward 3', contactPhone: null });
      expect(response.body.data).toMatchObject({ address: null, contactPhone: null });
    });

    it('refuses to set occupancy as an absolute value', async () => {
      const shelter = await createFacility();

      const response = await updateFacility(official, shelter.id, { occupancy: 50 }).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('raises the alert when a capacity cut pushes utilisation past 85 %', async () => {
      const shelter = await createFacility({ capacity: 200 });
      await changeOccupancy(official, shelter.id, 90).expect(200);
      const socket = await connect(official.accessToken);
      const alert = nextEvent(socket, 'facility:capacity_alert', (event) => event.facilityId === shelter.id);

      await updateFacility(official, shelter.id, { capacity: 100 }).expect(200);

      await expect(alert).resolves.toEqual({
        facilityId: shelter.id,
        name: shelter.name,
        occupancy: 90,
        capacity: 100,
        utilisation: 0.9,
      });
    });
  });

  describe('PATCH /facilities/:id/inventory/:item', () => {
    it('moves stock by delta, clamps at zero and flags low stock against the threshold', async () => {
      const shelter = await createFacility();
      const manager = await managerOf(shelter.id);
      const adjust = async (body: Record<string, unknown>) =>
        (await adjustStock(manager, shelter.id, 'FOOD_PACKET', body).expect(200)).body.data;

      expect(await adjust({ delta: 30, lowStockThreshold: 10 })).toMatchObject({
        item: 'FOOD_PACKET',
        quantity: 30,
        lowStockThreshold: 10,
        isLow: false,
      });
      expect(await adjust({ delta: -25 })).toMatchObject({ quantity: 5, lowStockThreshold: 10, isLow: true });
      expect(await adjust({ delta: -100 })).toMatchObject({ quantity: 0, lowStockThreshold: 10, isLow: true });
      expect(await adjust({ lowStockThreshold: null })).toMatchObject({ quantity: 0, lowStockThreshold: null, isLow: false });
    });

    it('starts a new line at zero when the first change is a withdrawal', async () => {
      const shelter = await createFacility();

      const response = await adjustStock(official, shelter.id, 'WATER_LITRE', { delta: -5 }).expect(200);

      expect(response.body.data).toEqual({
        item: 'WATER_LITRE',
        quantity: 0,
        lowStockThreshold: null,
        isLow: false,
        updatedAt: expect.any(String),
      });
    });

    it('loses no stock when deliveries are recorded concurrently', async () => {
      const shelter = await createFacility();

      const responses = await Promise.all(
        Array.from({ length: 50 }, () => adjustStock(official, shelter.id, 'MEDICAL_KIT', { delta: 2 })),
      );

      expect(responses.map((response) => response.status)).toEqual(Array.from({ length: 50 }, () => 200));
      const row = await t.db.query(`SELECT quantity FROM facility_inventory WHERE facility_id = $1 AND item = 'MEDICAL_KIT'`, [
        shelter.id,
      ]);
      expect(row.rows[0].quantity).toBe(100);
    });

    it('broadcasts the change to the district and the facility and shows the line on the manager portal', async () => {
      const shelter = await createFacility();
      const manager = await managerOf(shelter.id);
      const listeners = await Promise.all([connect(official.accessToken), connect(manager.accessToken)]);
      const changed = listeners.map((socket) =>
        nextEvent(socket, 'facility:inventory_changed', (event) => event.facilityId === shelter.id),
      );

      await adjustStock(manager, shelter.id, 'BLANKET', { delta: 12, lowStockThreshold: 20 }).expect(200);

      const line = { facilityId: shelter.id, item: 'BLANKET', quantity: 12, lowStockThreshold: 20, isLow: true };
      await expect(Promise.all(changed)).resolves.toEqual([line, line]);
      const mine = await t.http().get('/api/v1/facilities/mine').set(manager.auth).expect(200);
      expect(mine.body.data).toMatchObject({
        id: shelter.id,
        inventory: [{ item: 'BLANKET', quantity: 12, lowStockThreshold: 20, isLow: true, updatedAt: expect.any(String) }],
      });
    });

    it('refuses an unknown item and an empty change', async () => {
      const shelter = await createFacility();

      await adjustStock(official, shelter.id, 'SANDBAG', { delta: 1 }).expect(400);
      await adjustStock(official, shelter.id, 'BLANKET', {}).expect(400);
    });
  });

  describe('GET /facilities/nearby', () => {
    let fullShelter: FacilityBody;
    let shelterWithSpace: FacilityBody;
    let closedShelter: FacilityBody;
    let distantShelter: FacilityBody;
    let hospital: FacilityBody;

    const nearby = (query: Record<string, string | number | boolean>) =>
      t.http().get('/api/v1/facilities/nearby').query({ ...LOCATOR_ORIGIN, ...query }).set(citizen.auth).expect(200);

    beforeAll(async () => {
      [fullShelter, shelterWithSpace, closedShelter, distantShelter, hospital] = await Promise.all([
        createFacility({ ...fromOrigin(300, 0), capacity: 10 }),
        createFacility({ ...fromOrigin(0, 1_500), capacity: 50 }),
        createFacility({ ...fromOrigin(-4_000, 0), capacity: 50 }),
        createFacility({ ...fromOrigin(0, -8_000), capacity: 50 }),
        createFacility({ ...fromOrigin(100, 50), kind: 'HOSPITAL', capacity: 20 }),
      ]);
      await changeOccupancy(official, fullShelter.id, 10).expect(200);
      await updateFacility(official, closedShelter.id, { isOperational: false }).expect(200);
    });

    it('lists shelters nearest first with their distance in metres', async () => {
      const response = await nearby({ withSpaceOnly: false });

      expect(idsOf(response).slice(0, 4)).toEqual([fullShelter.id, shelterWithSpace.id, closedShelter.id, distantShelter.id]);
      const distances = (response.body.data as FacilityBody[]).slice(0, 4).map((facility) => facility.distanceM!);
      [300, 1_500, 4_000, 8_000].forEach((expected, index) => {
        expect(Math.abs(distances[index]! - expected) / expected).toBeLessThan(0.01);
      });
    });

    it('skips full and closed shelters unless asked not to', async () => {
      const response = await nearby({});

      expect(idsOf(response).slice(0, 2)).toEqual([shelterWithSpace.id, distantShelter.id]);
      expect(idsOf(response)).not.toContain(fullShelter.id);
      expect(idsOf(response)).not.toContain(closedShelter.id);
    });

    it('looks for shelters by default and hospitals when asked', async () => {
      const shelters = await nearby({ withSpaceOnly: false });
      const hospitals = await nearby({ kind: 'HOSPITAL' });

      expect(idsOf(shelters)).not.toContain(hospital.id);
      expect(idsOf(hospitals)[0]).toBe(hospital.id);
    });

    it('honours the limit and refuses a blank coordinate', async () => {
      const limited = await nearby({ withSpaceOnly: false, limit: 2 });
      const blank = await t.http().get('/api/v1/facilities/nearby').query({ lat: '', lon: 86.1 }).set(citizen.auth).expect(400);

      expect(idsOf(limited)).toEqual([fullShelter.id, shelterWithSpace.id]);
      expect(blank.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('serves every signed-in role and refuses anonymous callers', async () => {
      const callers = [official, rescuer, await managerOf(hospital.id), await loginAs(t, { role: 'VOLUNTEER' })];

      for (const caller of callers) {
        const response = await t.http().get('/api/v1/facilities/nearby').query(LOCATOR_ORIGIN).set(caller.auth).expect(200);
        expect(idsOf(response)[0]).toBe(shelterWithSpace.id);
      }
      await t.http().get('/api/v1/facilities/nearby').query(LOCATOR_ORIGIN).expect(401);
    });
  });

  describe('GET /facilities', () => {
    const viewport = '85.95,26.25,86.05,26.35';

    it("lists only facilities inside the viewport and the caller's district", async () => {
      const inside = await createFacility({ lat: 26.27, lon: 85.97 });
      const outsideViewport = await createFacility({ lat: 25.95, lon: 86.3 });
      const otherDistrict = await createFacility(SYNTHETIC_DISTRICT_POINT, otherDistrictOfficial);

      const narrow = await t.http().get('/api/v1/facilities').query({ bbox: viewport }).set(official.auth).expect(200);
      const wide = await t.http().get('/api/v1/facilities').query({ bbox: '79,19,87,27' }).set(rescuer.auth).expect(200);

      expect(idsOf(narrow)).toContain(inside.id);
      expect(idsOf(narrow)).not.toContain(outsideViewport.id);
      expect(idsOf(wide)).toEqual(expect.arrayContaining([inside.id, outsideViewport.id]));
      expect(idsOf(wide)).not.toContain(otherDistrict.id);
    });

    it('filters by kind', async () => {
      const shelter = await createFacility({ lat: 26.28, lon: 85.98 });
      const hospital = await createFacility({ lat: 26.28, lon: 85.99, kind: 'HOSPITAL' });

      const response = await t.http().get('/api/v1/facilities').query({ bbox: viewport, kind: 'HOSPITAL' }).set(official.auth).expect(200);

      expect(idsOf(response)).toContain(hospital.id);
      expect(idsOf(response)).not.toContain(shelter.id);
    });

    it('requires a viewport and is closed to citizens', async () => {
      await t.http().get('/api/v1/facilities').set(official.auth).expect(400);
      await t.http().get('/api/v1/facilities').query({ bbox: viewport }).set(citizen.auth).expect(403);
    });
  });

  describe('GET /facilities/:id and /facilities/mine', () => {
    it('shows any signed-in user the facility with its stock', async () => {
      const shelter = await createFacility();
      await adjustStock(official, shelter.id, 'WATER_LITRE', { delta: 500 }).expect(200);

      const response = await t.http().get(`/api/v1/facilities/${shelter.id}`).set(citizen.auth).expect(200);

      expect(response.body.data).toMatchObject({
        id: shelter.id,
        name: shelter.name,
        inventory: [{ item: 'WATER_LITRE', quantity: 500, lowStockThreshold: null, isLow: false }],
      });
    });

    it('answers 404 for an unknown facility and for a manager without one', async () => {
      const unassigned = await loginAs(t, { role: 'FACILITY_MANAGER' });

      await t.http().get(`/api/v1/facilities/${randomUUID()}`).set(citizen.auth).expect(404);
      const response = await t.http().get('/api/v1/facilities/mine').set(unassigned.auth).expect(404);

      expect(response.body.error.code).toBe('FACILITY_NOT_FOUND');
    });
  });

  // Runs last: the bulk rows would otherwise crowd the locator fixtures out of nearest results.
  describe('with 20,000 facilities', () => {
    const planOf = async (statement: Prisma.Sql) => {
      const result = await t.db.query<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
        `EXPLAIN (FORMAT JSON) ${statement.text}`,
        statement.values,
      );
      return flattenPlan(result.rows[0]!['QUERY PLAN'][0].Plan);
    };

    beforeAll(async () => {
      await t.db.query('SELECT setseed(0.42)');
      await t.db.query(
        `INSERT INTO facilities (district_id, kind, name, location, capacity)
         SELECT $1, 'SHELTER', 'Plan fixture ' || n,
                ST_SetSRID(ST_MakePoint(86.2 + random() * 0.2, 25.87 + random() * 0.1), 4326)::geography, 100
         FROM generate_series(1, 20000) AS n`,
        [t.districtId],
      );
      await t.db.query('ANALYZE facilities');
    });

    it.each([
      ['the nearest-shelter search', (repository: FacilitiesRepository) => repository.findNearest(LOCATOR_ORIGIN, 'SHELTER', true, 10)],
      [
        'the viewport list',
        (repository: FacilitiesRepository) => repository.findInViewport(t.districtId, [86.25, 25.9, 86.26, 25.91], null),
      ],
    ])('serves %s from the GiST index, not a sequential scan', async (_query, run) => {
      const nodes = await planOf(await statementIssuedBy(run));

      expect(nodes.map((node) => node['Index Name'])).toContain('facilities_location_gist');
      expect(nodes.map((node) => node['Node Type'])).not.toContain('Seq Scan');
    });
  });
});
