import type { Client } from 'pg';
import type {
  FacilityKind,
  IncidentStatus,
  InventoryItem,
  MissionStatus,
  ReviewStatus,
  VerificationStatus,
} from '../src/common/domain/enums';
import { DashboardModule } from '../src/modules/dashboard/dashboard.module';
import { createUser, loginAs, type LoggedIn } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

interface LatLon {
  lat: number;
  lon: number;
}

const MINUTE_MS = 60_000;
const IN_TOWN = { lat: 26.1512, lon: 85.8912 };
const IN_TOWN_SAME_CELL = { lat: 26.1488, lon: 85.8931 };
const SOUTH_EAST_OF_TOWN = { lat: 26.1203, lon: 85.9102 };
const NORTH_WEST_OF_TOWN = { lat: 26.2004, lon: 85.8499 };
const OUTSIDE_VIEWPORT = { lat: 26.0447, lon: 86.1017 };
const VIEWPORT = '85.80,26.10,85.95,26.25';
const SYNTHETIC_POINT = { lat: 20.5, lon: 80.5 };

class Fixture {
  private readonly now = Date.now();

  constructor(
    private readonly db: Client,
    private readonly reporterId: string,
    private readonly officialId: string,
  ) {}

  minutesAgo(minutes: number): Date {
    return new Date(this.now - minutes * MINUTE_MS);
  }

  async incident(
    districtId: number,
    spec: { status: IncidentStatus; sos?: boolean; people: number; at: LatLon | null; minutesAgo: number; priority?: number },
  ): Promise<string> {
    const reportedAt = this.minutesAgo(spec.minutesAgo);
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO incidents (client_uuid, district_id, reporter_id, status, is_sos, location, location_source,
                              people_affected, priority_score, reported_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3::incident_status, $4,
               ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography, $7::location_source,
               $8, $9, $10, $10)
       RETURNING id`,
      [
        districtId,
        this.reporterId,
        spec.status,
        spec.sos ?? false,
        spec.at?.lon ?? null,
        spec.at?.lat ?? null,
        spec.at ? 'GPS' : 'NONE',
        spec.people,
        spec.priority ?? null,
        reportedAt,
      ],
    );
    return result.rows[0]!.id;
  }

  async team(districtId: number, base: LatLon, isAvailable: boolean): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO rescue_teams (district_id, name, agency, team_size, base_location, current_location, is_available)
       VALUES ($1, 'Test team', 'NDRF', 6, ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography,
               ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography, $4)
       RETURNING id`,
      [districtId, base.lon, base.lat, isAvailable],
    );
    return result.rows[0]!.id;
  }

  async mission(spec: {
    incidentId: string;
    teamId: string;
    status: MissionStatus;
    rejectionReason?: string;
    reachedMinutesAgo?: number;
    completed?: 'NOW' | 'BEFORE_TODAY_IN_INDIA';
    peopleRescued?: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO missions (incident_id, team_id, assigned_by, status, rejection_reason, people_rescued, reached_at, completed_at)
       VALUES ($1, $2, $3, $4::mission_status, $5, $6, $7,
               CASE $8::text
                 WHEN 'NOW' THEN now()
                 WHEN 'BEFORE_TODAY_IN_INDIA'
                   THEN date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '1 minute'
               END)`,
      [
        spec.incidentId,
        spec.teamId,
        this.officialId,
        spec.status,
        spec.rejectionReason ?? null,
        spec.peopleRescued ?? null,
        spec.reachedMinutesAgo === undefined ? null : this.minutesAgo(spec.reachedMinutesAgo),
        spec.completed ?? null,
      ],
    );
  }

  async facility(
    districtId: number,
    spec: { kind: FacilityKind; name: string; capacity: number; occupancy: number; operational?: boolean; at: LatLon },
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO facilities (district_id, kind, name, location, capacity, occupancy, is_operational)
       VALUES ($1, $2::facility_kind, $3, ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326)::geography, $6, $7, $8)
       RETURNING id`,
      [districtId, spec.kind, spec.name, spec.at.lon, spec.at.lat, spec.capacity, spec.occupancy, spec.operational ?? true],
    );
    return result.rows[0]!.id;
  }

  async stock(facilityId: string, item: InventoryItem, quantity: number, lowStockThreshold: number | null): Promise<void> {
    await this.db.query(
      `INSERT INTO facility_inventory (facility_id, item, quantity, low_stock_threshold) VALUES ($1, $2::inventory_item, $3, $4)`,
      [facilityId, item, quantity, lowStockThreshold],
    );
  }

  async review(incidentId: string, status: ReviewStatus): Promise<void> {
    const resolved = status === 'RESOLVED';
    await this.db.query(
      `INSERT INTO incident_reviews (incident_id, reason, status, resolved_by, resolved_at)
       VALUES ($1, 'POSSIBLE_DUPLICATE', $2::review_status, $3, $4)`,
      [incidentId, status, resolved ? this.officialId : null, resolved ? new Date() : null],
    );
  }

  async volunteer(districtId: number, status: VerificationStatus): Promise<void> {
    const user = await createUser(this.db, { role: status === 'VERIFIED' ? 'VOLUNTEER' : 'CITIZEN', districtId });
    const reviewed = status !== 'PENDING';
    await this.db.query(
      `INSERT INTO volunteer_profiles (user_id, verification_status, reviewed_by, reviewed_at)
       VALUES ($1, $2::verification_status, $3, $4)`,
      [user.id, status, reviewed ? this.officialId : null, reviewed ? new Date() : null],
    );
  }
}

describe('dashboard', () => {
  let stack: TestStack;
  let t: TestApp;
  let official: LoggedIn;
  let citizen: LoggedIn;
  let otherDistrictOfficial: LoggedIn;
  let quietDistrictOfficial: LoggedIn;
  const facilityIds: Record<string, string> = {};

  const insertDistrict = async (name: string, [minLon, minLat, maxLon, maxLat]: number[]) => {
    const result = await t.db.query<{ id: number }>(
      `INSERT INTO districts (name, state, boundary)
       VALUES ($1, 'Synthetic', ST_Multi(ST_MakeEnvelope($2, $3, $4, $5, 4326))::geography)
       RETURNING id`,
      [name, minLon, minLat, maxLon, maxLat],
    );
    return result.rows[0]!.id;
  };

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack, { imports: [DashboardModule] });
    const otherDistrictId = await insertDistrict('Synthetic Other', [80, 20, 81, 21]);
    const quietDistrictId = await insertDistrict('Synthetic Quiet', [82, 22, 83, 23]);

    official = await loginAs(t, { role: 'GOVT_OFFICIAL' });
    citizen = await loginAs(t);
    otherDistrictOfficial = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: otherDistrictId });
    quietDistrictOfficial = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: quietDistrictId });

    const fixture = new Fixture(t.db, citizen.userId, official.userId);
    const d = t.districtId;

    const reportedSos = await fixture.incident(d, { status: 'REPORTED', sos: true, people: 3, at: IN_TOWN, minutesAgo: 10, priority: 80 });
    const verified = await fixture.incident(d, { status: 'VERIFIED', people: 5, at: IN_TOWN_SAME_CELL, minutesAgo: 120, priority: 60 });
    const assignedSos = await fixture.incident(d, { status: 'ASSIGNED', sos: true, people: 2, at: SOUTH_EAST_OF_TOWN, minutesAgo: 180 });
    const inProgress = await fixture.incident(d, { status: 'IN_PROGRESS', people: 4, at: NORTH_WEST_OF_TOWN, minutesAgo: 300, priority: 40 });
    const resolvedSos = await fixture.incident(d, { status: 'RESOLVED', sos: true, people: 7, at: IN_TOWN, minutesAgo: 90, priority: 90 });
    const rejected = await fixture.incident(d, { status: 'REJECTED_FAKE', people: 1, at: IN_TOWN_SAME_CELL, minutesAgo: 60 });
    await fixture.incident(d, { status: 'REPORTED', sos: true, people: 6, at: null, minutesAgo: 5 });
    await fixture.incident(d, { status: 'REPORTED', people: 1, at: OUTSIDE_VIEWPORT, minutesAgo: 60, priority: 20 });
    await fixture.incident(d, { status: 'VERIFIED', people: 2, at: IN_TOWN, minutesAgo: 30 * 60, priority: 10 });
    const resolvedYesterday = await fixture.incident(d, { status: 'RESOLVED', people: 3, at: SOUTH_EAST_OF_TOWN, minutesAgo: 26 * 60 });

    await fixture.review(reportedSos, 'PENDING');
    await fixture.review(verified, 'PENDING');
    await fixture.review(rejected, 'PENDING');
    await fixture.review(assignedSos, 'RESOLVED');

    const idleTeam = await fixture.team(d, IN_TOWN, true);
    const awaitingAnswerTeam = await fixture.team(d, IN_TOWN, true);
    const onSiteTeam = await fixture.team(d, IN_TOWN, false);
    const acceptedTeam = await fixture.team(d, IN_TOWN, false);
    const firstRescueTeam = await fixture.team(d, IN_TOWN, true);
    const secondRescueTeam = await fixture.team(d, IN_TOWN, true);
    await fixture.team(d, IN_TOWN, false);
    const yesterdayTeam = await fixture.team(d, IN_TOWN, true);

    await fixture.mission({ incidentId: verified, teamId: idleTeam, status: 'REJECTED', rejectionReason: 'Boat engine failed' });
    await fixture.mission({ incidentId: assignedSos, teamId: awaitingAnswerTeam, status: 'ASSIGNED' });
    await fixture.mission({ incidentId: inProgress, teamId: onSiteTeam, status: 'ON_SITE', reachedMinutesAgo: 240 });
    await fixture.mission({ incidentId: assignedSos, teamId: acceptedTeam, status: 'ACCEPTED' });
    await fixture.mission({
      incidentId: resolvedSos,
      teamId: firstRescueTeam,
      status: 'COMPLETED',
      reachedMinutesAgo: 60,
      completed: 'NOW',
      peopleRescued: 7,
    });
    await fixture.mission({
      incidentId: resolvedSos,
      teamId: secondRescueTeam,
      status: 'COMPLETED',
      reachedMinutesAgo: 45,
      completed: 'NOW',
      peopleRescued: 2,
    });
    await fixture.mission({
      incidentId: resolvedYesterday,
      teamId: yesterdayTeam,
      status: 'COMPLETED',
      reachedMinutesAgo: 25 * 60,
      completed: 'BEFORE_TODAY_IN_INDIA',
      peopleRescued: 4,
    });

    facilityIds.alpha = await fixture.facility(d, { kind: 'SHELTER', name: 'Alpha School', capacity: 100, occupancy: 90, at: IN_TOWN });
    facilityIds.beta = await fixture.facility(d, { kind: 'SHELTER', name: 'Beta Hall', capacity: 300, occupancy: 70, at: IN_TOWN });
    facilityIds.hospital = await fixture.facility(d, { kind: 'HOSPITAL', name: 'City Hospital', capacity: 50, occupancy: 40, at: IN_TOWN });
    facilityIds.closed = await fixture.facility(d, {
      kind: 'SHELTER',
      name: 'Closed School',
      capacity: 80,
      occupancy: 0,
      operational: false,
      at: IN_TOWN,
    });
    facilityIds.empty = await fixture.facility(d, { kind: 'SHELTER', name: 'Empty Hall', capacity: 0, occupancy: 0, at: IN_TOWN });
    await fixture.stock(facilityIds.alpha, 'FOOD_PACKET', 20, 50);
    await fixture.stock(facilityIds.alpha, 'WATER_LITRE', 500, 100);
    await fixture.stock(facilityIds.alpha, 'BLANKET', 10, 10);
    await fixture.stock(facilityIds.beta, 'MEDICAL_KIT', 5, null);
    await fixture.stock(facilityIds.hospital, 'MEDICAL_KIT', 3, 10);
    await fixture.stock(facilityIds.closed, 'FOOD_PACKET', 0, 5);

    await fixture.volunteer(d, 'VERIFIED');
    await fixture.volunteer(d, 'VERIFIED');
    await fixture.volunteer(d, 'PENDING');
    await fixture.volunteer(d, 'REJECTED');

    const elsewhere = await fixture.incident(otherDistrictId, {
      status: 'REPORTED',
      sos: true,
      people: 50,
      at: SYNTHETIC_POINT,
      minutesAgo: 120,
      priority: 55,
    });
    await fixture.review(elsewhere, 'PENDING');
    const elsewhereTeam = await fixture.team(otherDistrictId, SYNTHETIC_POINT, false);
    await fixture.mission({ incidentId: elsewhere, teamId: elsewhereTeam, status: 'ON_SITE', reachedMinutesAgo: 90 });
    const elsewhereShelter = await fixture.facility(otherDistrictId, {
      kind: 'SHELTER',
      name: 'Synthetic Shelter',
      capacity: 1000,
      occupancy: 999,
      at: SYNTHETIC_POINT,
    });
    await fixture.stock(elsewhereShelter, 'FOOD_PACKET', 1, 100);
    await fixture.volunteer(otherDistrictId, 'VERIFIED');
  });

  afterAll(async () => {
    await t?.close();
    await stopStack(stack);
  });

  describe('GET /districts/mine', () => {
    it("returns the official's district with its bounds, centre and boundary", async () => {
      const response = await t.http().get('/api/v1/districts/mine').set(official.auth).expect(200);

      const district = response.body.data;
      expect(district).toMatchObject({ id: t.districtId, name: 'Darbhanga', state: 'Bihar' });
      expect(district.bbox).toEqual([
        expect.closeTo(85.673142, 5),
        expect.closeTo(25.866815, 5),
        expect.closeTo(86.407072, 5),
        expect.closeTo(26.447959, 5),
      ]);
      expect(district.centroid.lat).toBeGreaterThan(district.bbox[1]);
      expect(district.centroid.lat).toBeLessThan(district.bbox[3]);
      expect(district.centroid.lon).toBeGreaterThan(district.bbox[0]);
      expect(district.centroid.lon).toBeLessThan(district.bbox[2]);
      expect(district.boundary.type).toBe('MultiPolygon');
      expect(district.boundary.coordinates[0][0]).toHaveLength(633);
    });

    it('falls back to the first district for an account without one', async () => {
      const response = await t.http().get('/api/v1/districts/mine').set(citizen.auth).expect(200);

      expect(response.body.data).toMatchObject({ id: t.districtId, name: 'Darbhanga' });
    });

    it('gives an official of another district that district', async () => {
      const response = await t.http().get('/api/v1/districts/mine').set(otherDistrictOfficial.auth).expect(200);

      expect(response.body.data).toMatchObject({
        name: 'Synthetic Other',
        bbox: [80, 20, 81, 21],
        centroid: { lat: expect.closeTo(20.5, 6), lon: expect.closeTo(80.5, 6) },
      });
    });
  });

  describe('GET /dashboard/summary', () => {
    it('computes every KPI for the district from the fixture', async () => {
      const response = await t.http().get('/api/v1/dashboard/summary').set(official.auth).expect(200);

      expect(response.body.data).toEqual({
        activeIncidents: 7,
        openSos: 3,
        peopleAffected: 23,
        pendingReviews: 3,
        teamsTotal: 8,
        teamsAvailable: 5,
        teamsOnMission: 2,
        shelterCapacity: 400,
        shelterOccupancy: 160,
        shelterUtilisation: 0.4,
        peopleRescuedToday: 9,
        avgResponseMinutes24h: 45,
        verifiedVolunteers: 2,
        generatedAt: expect.any(String),
      });
    });

    it("counts only the caller's district", async () => {
      const response = await t.http().get('/api/v1/dashboard/summary').set(otherDistrictOfficial.auth).expect(200);

      expect(response.body.data).toEqual({
        activeIncidents: 1,
        openSos: 1,
        peopleAffected: 50,
        pendingReviews: 1,
        teamsTotal: 1,
        teamsAvailable: 0,
        teamsOnMission: 1,
        shelterCapacity: 1000,
        shelterOccupancy: 999,
        shelterUtilisation: 0.999,
        peopleRescuedToday: 0,
        avgResponseMinutes24h: 30,
        verifiedVolunteers: 1,
        generatedAt: expect.any(String),
      });
    });

    it('reports zeros and no response time for a district without activity', async () => {
      const response = await t.http().get('/api/v1/dashboard/summary').set(quietDistrictOfficial.auth).expect(200);

      expect(response.body.data).toEqual({
        activeIncidents: 0,
        openSos: 0,
        peopleAffected: 0,
        pendingReviews: 0,
        teamsTotal: 0,
        teamsAvailable: 0,
        teamsOnMission: 0,
        shelterCapacity: 0,
        shelterOccupancy: 0,
        shelterUtilisation: 0,
        peopleRescuedToday: 0,
        avgResponseMinutes24h: null,
        verifiedVolunteers: 0,
        generatedAt: expect.any(String),
      });
    });

    it('refuses citizens', async () => {
      const response = await t.http().get('/api/v1/dashboard/summary').set(citizen.auth).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('refuses an official who has no district', async () => {
      const unassigned = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: null });

      const response = await t.http().get('/api/v1/dashboard/summary').set(unassigned.auth).expect(403);

      expect(response.body.error.code).toBe('NO_DISTRICT_SCOPE');
    });
  });

  describe('GET /dashboard/heatmap', () => {
    const heatmap = (query: Record<string, string | number>) =>
      t.http().get('/api/v1/dashboard/heatmap').query(query).set(official.auth);

    it('buckets open located incidents inside the viewport and the last 24 hours into grid cells', async () => {
      const response = await heatmap({ bbox: VIEWPORT }).expect(200);

      const cells = response.body.data as { count: number }[];
      expect(cells).toEqual([
        { lat: 26.15, lon: 85.89, count: 2, avgPriority: 70 },
        { lat: 26.12, lon: 85.91, count: 1, avgPriority: null },
        { lat: 26.2, lon: 85.85, count: 1, avgPriority: 40 },
      ]);
      expect(cells.reduce((total, cell) => total + cell.count, 0)).toBe(4);
    });

    it('includes older open incidents when the window is widened', async () => {
      const response = await heatmap({ bbox: VIEWPORT, hours: 48 }).expect(200);

      const cells = response.body.data as { count: number }[];
      expect(cells).toEqual([
        { lat: 26.15, lon: 85.89, count: 3, avgPriority: 50 },
        { lat: 26.12, lon: 85.91, count: 1, avgPriority: null },
        { lat: 26.2, lon: 85.85, count: 1, avgPriority: 40 },
      ]);
      expect(cells.reduce((total, cell) => total + cell.count, 0)).toBe(5);
    });

    it('splits a cell when the grid is finer', async () => {
      const response = await heatmap({ bbox: VIEWPORT, cellDegrees: 0.001 }).expect(200);

      expect(response.body.data).toEqual([
        { lat: 26.12, lon: 85.91, count: 1, avgPriority: null },
        { lat: 26.149, lon: 85.893, count: 1, avgPriority: 60 },
        { lat: 26.151, lon: 85.891, count: 1, avgPriority: 80 },
        { lat: 26.2, lon: 85.85, count: 1, avgPriority: 40 },
      ]);
    });

    it("never counts another district's incidents, even inside the viewport", async () => {
      const aroundSyntheticOther = { bbox: '79.9,19.9,81.1,21.1' };

      const own = await heatmap(aroundSyntheticOther).expect(200);
      const theirs = await t
        .http()
        .get('/api/v1/dashboard/heatmap')
        .query(aroundSyntheticOther)
        .set(otherDistrictOfficial.auth)
        .expect(200);

      expect(own.body.data).toEqual([]);
      expect(theirs.body.data).toEqual([{ lat: 20.5, lon: 80.5, count: 1, avgPriority: 55 }]);
    });

    it.each([
      ['a cell wider than 0.1 degrees', { bbox: VIEWPORT, cellDegrees: 0.5 }],
      ['a cell narrower than 0.001 degrees', { bbox: VIEWPORT, cellDegrees: 0.0005 }],
      ['a zero-hour window', { bbox: VIEWPORT, hours: 0 }],
      ['a missing viewport', { hours: 24 }],
    ])('rejects %s', async (_case, query) => {
      const response = await heatmap(query).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /dashboard/resources', () => {
    it('lists operational facilities most utilised first with only their low stock lines', async () => {
      const response = await t.http().get('/api/v1/dashboard/resources').set(official.auth).expect(200);

      const lowLine = (item: string, quantity: number, lowStockThreshold: number) => ({
        item,
        quantity,
        lowStockThreshold,
        isLow: true,
        updatedAt: expect.any(String),
      });
      expect(response.body.data).toEqual([
        {
          facilityId: facilityIds.alpha,
          name: 'Alpha School',
          kind: 'SHELTER',
          capacity: 100,
          occupancy: 90,
          utilisation: 0.9,
          lowStock: [lowLine('FOOD_PACKET', 20, 50), lowLine('BLANKET', 10, 10)],
        },
        {
          facilityId: facilityIds.hospital,
          name: 'City Hospital',
          kind: 'HOSPITAL',
          capacity: 50,
          occupancy: 40,
          utilisation: 0.8,
          lowStock: [lowLine('MEDICAL_KIT', 3, 10)],
        },
        {
          facilityId: facilityIds.beta,
          name: 'Beta Hall',
          kind: 'SHELTER',
          capacity: 300,
          occupancy: 70,
          utilisation: 70 / 300,
          lowStock: [],
        },
        {
          facilityId: facilityIds.empty,
          name: 'Empty Hall',
          kind: 'SHELTER',
          capacity: 0,
          occupancy: 0,
          utilisation: 0,
          lowStock: [],
        },
      ]);
    });
  });
});
