import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import { io, type Socket } from 'socket.io-client';
import type { LatLon } from '../src/common/geo/geo-sql';
import { TokenService } from '../src/modules/auth/token.service';
import { LIVE_POSITION_KEYS } from '../src/modules/missions/live-position.store';
import { MissionsModule } from '../src/modules/missions/missions.module';
import { TeamLocationFlusher } from '../src/modules/missions/team-location.flusher';
import { nearestAvailableTeamsSql, TeamsRepository } from '../src/modules/missions/teams.repository';
import { createUser, type TestUserOptions } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

interface Session {
  userId: string;
  phone: string;
  accessToken: string;
  auth: { Authorization: string };
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

const DARBHANGA_TOWN: LatLon = { lat: 26.1542, lon: 85.8918 };
const METRES_PER_DEGREE = 111_320;

const MISSION_KEYS = [
  'id', 'incidentId', 'teamId', 'assignedBy', 'status', 'etaMinutes', 'rejectionReason', 'peopleRescued',
  'injuredCount', 'hospitalRequired', 'outcomeNotes', 'assignedAt', 'acceptedAt', 'reachedAt', 'completedAt', 'updatedAt',
];
const TEAM_KEYS = [
  'id', 'name', 'agency', 'teamSize', 'capabilities', 'isAvailable', 'lat', 'lon', 'locationUpdatedAt', 'activeMissionId',
];

function offset(origin: LatLon, northM: number, eastM: number): LatLon {
  return {
    lat: origin.lat + northM / METRES_PER_DEGREE,
    lon: origin.lon + eastM / (METRES_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180)),
  };
}

// Every test works around its own site, 5 km from the others, so a nearest-team answer never
// picks up teams that another test left behind.
const site = (row: number, column: number) => offset(DARBHANGA_TOWN, row * 5_000, column * 5_000);

const percentile = (samples: number[], p: number) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

const flatten = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(flatten)];

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; ) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`condition not met within ${timeoutMs} ms`);
}

describe('missions and teams', () => {
  let stack: TestStack;
  let t: TestApp;
  let redis: Redis;
  let official: Session;
  let outsider: Session;
  let reporter: Session;
  let otherDistrictId: number;
  const sockets: Socket[] = [];

  // Tokens are issued directly rather than through the OTP flow: this spec signs in dozens of
  // users from one address, and POST /auth/otp/verify is rate limited per IP.
  async function signIn(options: TestUserOptions = {}): Promise<Session> {
    const role = options.role ?? 'CITIZEN';
    const districtId = options.districtId === undefined ? (role === 'CITIZEN' ? null : t.districtId) : options.districtId;
    const user = await createUser(t.db, { ...options, role, districtId });
    const accessToken = await t.app.get(TokenService).issueAccessToken({
      id: user.id,
      role,
      districtId,
      rescueTeamId: options.rescueTeamId ?? null,
      facilityId: null,
    });
    return { userId: user.id, phone: user.phone, accessToken, auth: { Authorization: `Bearer ${accessToken}` } };
  }

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack, { imports: [MissionsModule] });
    redis = new Redis(t.env.REDIS_URL);
    redis.on('error', () => undefined);

    const other = await t.db.query<{ id: number }>(
      `INSERT INTO districts (name, state, boundary)
       VALUES ('Scope check', 'Synthetic', ST_Multi(ST_MakeEnvelope(80, 20, 80.1, 20.1, 4326))::geography)
       RETURNING id`,
    );
    otherDistrictId = other.rows[0]!.id;

    official = await signIn({ role: 'GOVT_OFFICIAL' });
    outsider = await signIn({ role: 'GOVT_OFFICIAL', districtId: otherDistrictId });
    reporter = await signIn({ fullName: 'Sunita Kumari' });
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    if (redis?.status === 'ready') await redis.quit();
    await t?.close();
    await stopStack(stack);
  });

  async function seedTeam(
    at: LatLon,
    options: { capabilities?: string[]; isAvailable?: boolean; districtId?: number } = {},
  ): Promise<string> {
    const result = await t.db.query<{ id: string }>(
      `INSERT INTO rescue_teams (district_id, name, agency, team_size, capabilities, base_location, current_location, is_available)
       VALUES ($1, $2, 'SDRF', 6, $3::text[],
               ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326)::geography,
               ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326)::geography, $6)
       RETURNING id`,
      [
        options.districtId ?? t.districtId,
        `SDRF unit ${randomUUID().slice(0, 8)}`,
        options.capabilities ?? [],
        at.lon,
        at.lat,
        options.isAvailable ?? true,
      ],
    );
    return result.rows[0]!.id;
  }

  const teamMember = (teamId: string) => signIn({ role: 'RESCUE_TEAM', rescueTeamId: teamId });

  async function reportSos(at: LatLon | null, who: Session = reporter): Promise<string> {
    const response = await t
      .http()
      .post('/api/v1/incidents/sos')
      .set(who.auth)
      .send({
        clientUuid: randomUUID(),
        lat: at?.lat ?? null,
        lon: at?.lon ?? null,
        accuracyM: at ? 12 : null,
        reportedAt: new Date().toISOString(),
      })
      .expect(201);
    return response.body.data.id;
  }

  const assign = (incidentId: string, teamId: string) =>
    t.http().post('/api/v1/missions').set(official.auth).send({ incidentId, teamId, etaMinutes: 20 });

  async function dispatch(incidentId: string, teamId: string): Promise<string> {
    const response = await assign(incidentId, teamId).expect(201);
    return response.body.data.id;
  }

  const step = (missionId: string, who: Session, body: Record<string, unknown>) =>
    t.http().patch(`/api/v1/missions/${missionId}/status`).set(who.auth).send(body);

  const nearest = (incidentId: string, query: Record<string, string | number> = {}) =>
    t.http().get('/api/v1/teams/nearest').query({ incidentId, ...query }).set(official.auth);

  const ping = (who: Session, at: LatLon, recordedAt: Date) =>
    t.http().post('/api/v1/teams/me/location').set(who.auth).send({ ...at, accuracyM: 8, recordedAt: recordedAt.toISOString() });

  async function incidentStatus(incidentId: string): Promise<string> {
    const result = await t.db.query<{ status: string }>('SELECT status::text FROM incidents WHERE id = $1', [incidentId]);
    return result.rows[0]!.status;
  }

  async function teamIsAvailable(teamId: string): Promise<boolean> {
    const result = await t.db.query<{ is_available: boolean }>('SELECT is_available FROM rescue_teams WHERE id = $1', [teamId]);
    return result.rows[0]!.is_available;
  }

  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(t.baseUrl, { transports: ['websocket'], auth: { token }, reconnection: false });
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

  describe('GET /teams/nearest', () => {
    it('ranks available district teams by distance and leaves out unavailable ones', async () => {
      const origin = site(0, 0);
      const incidentId = await reportSos(origin);
      const closest = await seedTeam(offset(origin, 150, 0));
      const middle = await seedTeam(offset(origin, 0, 600));
      const farthest = await seedTeam(offset(origin, -1_200, 0));
      const unavailable = await seedTeam(offset(origin, 40, 0), { isAvailable: false });

      const response = await nearest(incidentId).expect(200);

      const teams = response.body.data as { id: string; distanceM: number }[];
      expect(teams.map((team) => team.id).slice(0, 3)).toEqual([closest, middle, farthest]);
      expect(teams.map((team) => team.id)).not.toContain(unavailable);
      expect(Object.keys(teams[0]!).sort()).toEqual([...TEAM_KEYS, 'distanceM'].sort());
      expect(teams[0]).toMatchObject({ isAvailable: true, activeMissionId: null, locationUpdatedAt: null });
      expect(teams[0]!.distanceM).toBeCloseTo(150, -1);
    });

    it('keeps only teams with the requested capability', async () => {
      const origin = site(0, 1);
      const incidentId = await reportSos(origin);
      const boatTeam = await seedTeam(offset(origin, 900, 0), { capabilities: ['WATER_RESCUE', 'FIRST_AID'] });
      await seedTeam(offset(origin, 100, 0), { capabilities: ['FIRST_AID'] });

      const response = await nearest(incidentId, { capability: 'WATER_RESCUE' }).expect(200);

      const teams = response.body.data as { id: string; capabilities: string[] }[];
      expect(teams[0]!.id).toBe(boatTeam);
      expect(teams.every((team) => team.capabilities.includes('WATER_RESCUE'))).toBe(true);
    });

    it('answers 422 for an incident that has no location', async () => {
      const incidentId = await reportSos(null);

      const response = await nearest(incidentId).expect(422);

      expect(response.body.error.code).toBe('INCIDENT_HAS_NO_LOCATION');
    });

    it("hides another district's incidents from an official, even one they reported themselves", async () => {
      const origin = site(0, 2);
      const teamId = await seedTeam(offset(origin, 300, 0));

      for (const incidentId of [await reportSos(origin), await reportSos(origin, outsider)]) {
        const found = await t.http().get('/api/v1/teams/nearest').query({ incidentId }).set(outsider.auth).expect(404);
        const assigned = await t.http().post('/api/v1/missions').set(outsider.auth).send({ incidentId, teamId }).expect(404);

        expect([found.body.error.code, assigned.body.error.code]).toEqual(['INCIDENT_NOT_FOUND', 'INCIDENT_NOT_FOUND']);
      }
    });
  });

  describe('POST /missions', () => {
    it('dispatches the team, moves the incident to ASSIGNED and marks the mission active on the team', async () => {
      const origin = site(1, 0);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 300, 0));

      const response = await assign(incidentId, teamId).expect(201);

      expect(Object.keys(response.body.data).sort()).toEqual([...MISSION_KEYS].sort());
      expect(response.body.data).toMatchObject({
        incidentId,
        teamId,
        assignedBy: official.userId,
        status: 'ASSIGNED',
        etaMinutes: 20,
        acceptedAt: null,
      });
      expect(await incidentStatus(incidentId)).toBe('ASSIGNED');
      const teams = await t.http().get('/api/v1/teams').set(official.auth).expect(200);
      expect((teams.body.data as { id: string }[]).find((team) => team.id === teamId)).toMatchObject({
        activeMissionId: response.body.data.id,
        isAvailable: true,
      });
    });

    it('refuses a second open mission for the same incident and team', async () => {
      const origin = site(1, 1);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 300, 0));
      await assign(incidentId, teamId).expect(201);

      const response = await assign(incidentId, teamId).expect(409);

      expect(response.body.error.code).toBe('MISSION_ALREADY_OPEN');
      const count = await t.db.query('SELECT count(*)::int AS n FROM missions WHERE incident_id = $1', [incidentId]);
      expect(count.rows[0].n).toBe(1);
    });

    it('refuses a team that has accepted another mission', async () => {
      const origin = site(1, 2);
      const teamId = await seedTeam(offset(origin, 300, 0));
      const member = await teamMember(teamId);
      const firstMission = await dispatch(await reportSos(origin), teamId);
      await step(firstMission, member, { status: 'ACCEPTED' }).expect(200);

      const response = await assign(await reportSos(offset(origin, 0, 800)), teamId).expect(409);

      expect(response.body.error.code).toBe('TEAM_UNAVAILABLE');
    });

    it('refuses a team from another district and an incident that is already closed', async () => {
      const origin = site(1, -1);
      const incidentId = await reportSos(origin);
      const foreignTeam = await seedTeam(offset(origin, 300, 0), { districtId: otherDistrictId });

      const foreign = await assign(incidentId, foreignTeam).expect(404);
      await t.http().patch(`/api/v1/incidents/${incidentId}/status`).set(official.auth).send({ status: 'REJECTED_FAKE' }).expect(200);
      const closed = await assign(incidentId, await seedTeam(offset(origin, 300, 0))).expect(409);

      expect(foreign.body.error.code).toBe('TEAM_NOT_FOUND');
      expect(closed.body.error.code).toBe('INCIDENT_NOT_OPEN');
    });
  });

  describe('mission lifecycle', () => {
    it('walks ASSIGNED to COMPLETED, resolving the incident and freeing the team', async () => {
      const origin = site(2, 0);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 400, 0));
      const member = await teamMember(teamId);
      const missionId = await dispatch(incidentId, teamId);

      const accepted = await step(missionId, member, { status: 'ACCEPTED' }).expect(200);
      expect(accepted.body.data.acceptedAt).not.toBeNull();
      expect(await teamIsAvailable(teamId)).toBe(false);

      await step(missionId, member, { status: 'EN_ROUTE' }).expect(200);
      expect(await incidentStatus(incidentId)).toBe('IN_PROGRESS');

      const onSite = await step(missionId, member, { status: 'ON_SITE' }).expect(200);
      expect(onSite.body.data.reachedAt).not.toBeNull();

      const withoutCount = await step(missionId, member, { status: 'COMPLETED' }).expect(400);
      expect(withoutCount.body.error.code).toBe('VALIDATION_FAILED');
      const completed = await step(missionId, member, {
        status: 'COMPLETED',
        peopleRescued: 4,
        injuredCount: 1,
        hospitalRequired: true,
        outcomeNotes: 'Family of four moved to the school shelter',
      }).expect(200);

      expect(completed.body.data).toMatchObject({ status: 'COMPLETED', peopleRescued: 4, injuredCount: 1, hospitalRequired: true });
      expect(completed.body.data.completedAt).not.toBeNull();
      expect(await teamIsAvailable(teamId)).toBe(true);
      const timeline = await t.db.query<{ to_status: string; changed_by: string }>(
        'SELECT to_status::text, changed_by FROM incident_status_log WHERE incident_id = $1 ORDER BY id',
        [incidentId],
      );
      expect(timeline.rows.map((row) => row.to_status)).toEqual(['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED']);
      expect(timeline.rows.slice(1).map((row) => row.changed_by)).toEqual([official.userId, member.userId, member.userId]);
    });

    it('needs a reason to reject, frees the team and returns the incident to VERIFIED', async () => {
      const origin = site(2, 1);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 400, 0));
      const member = await teamMember(teamId);
      const missionId = await dispatch(incidentId, teamId);

      const withoutReason = await step(missionId, member, { status: 'REJECTED' }).expect(400);
      const rejected = await step(missionId, member, { status: 'REJECTED', rejectionReason: 'Boat engine failed' }).expect(200);

      expect(withoutReason.body.error.code).toBe('VALIDATION_FAILED');
      expect(rejected.body.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Boat engine failed' });
      expect(await teamIsAvailable(teamId)).toBe(true);
      expect(await incidentStatus(incidentId)).toBe('VERIFIED');
    });

    it('keeps the incident dispatched while another mission is open, and a busy team busy', async () => {
      const origin = site(2, 2);
      const incidentId = await reportSos(origin);
      const busyTeam = await seedTeam(offset(origin, 400, 0));
      const busyMember = await teamMember(busyTeam);
      const backupTeam = await seedTeam(offset(origin, 800, 0));
      const backupMission = await dispatch(incidentId, backupTeam);
      const busyMission = await dispatch(incidentId, busyTeam);
      const otherIncidentMission = await dispatch(await reportSos(offset(origin, 0, 900)), busyTeam);
      await step(otherIncidentMission, busyMember, { status: 'ACCEPTED' }).expect(200);

      await step(busyMission, busyMember, { status: 'REJECTED', rejectionReason: 'Already on another rescue' }).expect(200);

      expect(await incidentStatus(incidentId)).toBe('ASSIGNED');
      expect(await teamIsAvailable(busyTeam)).toBe(false);
      await step(backupMission, official, { status: 'CANCELLED' }).expect(200);
      expect(await incidentStatus(incidentId)).toBe('VERIFIED');
    });

    it('returns the incident to VERIFIED when its last two teams decline at the same moment', async () => {
      const origin = site(3, 0);
      const incidentId = await reportSos(origin);
      const teamIds = [await seedTeam(offset(origin, 300, 0)), await seedTeam(offset(origin, 600, 0))];
      const declines = [];
      for (const teamId of teamIds) {
        const missionId = await dispatch(incidentId, teamId);
        declines.push(step(missionId, await teamMember(teamId), { status: 'REJECTED', rejectionReason: 'Boat engine failed' }));
      }
      const gate = new Client({ connectionString: stack.postgres.getConnectionUri() });
      await gate.connect();

      try {
        // Both declines queue behind this lock on their team rows, so once it is released their
        // transactions run side by side instead of one finishing before the other starts.
        await gate.query('BEGIN');
        await gate.query('SELECT 1 FROM rescue_teams WHERE id = ANY($1::uuid[]) FOR UPDATE', [teamIds]);
        const responses = Promise.all(declines);
        await waitUntil(async () => {
          const blocked = await t.db.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock'`);
          return blocked.rows[0].n === 2;
        });
        await gate.query('COMMIT');

        expect((await responses).map((response) => response.status)).toEqual([200, 200]);
      } finally {
        await gate.end();
      }
      expect(await incidentStatus(incidentId)).toBe('VERIFIED');
    });

    it('lets only an in-district official cancel, and frees the team', async () => {
      const origin = site(2, -1);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 400, 0));
      const member = await teamMember(teamId);
      const missionId = await dispatch(incidentId, teamId);
      await step(missionId, member, { status: 'ACCEPTED' }).expect(200);

      const byTeam = await step(missionId, member, { status: 'CANCELLED' }).expect(409);
      const byOutsider = await step(missionId, outsider, { status: 'CANCELLED' }).expect(404);
      const cancelled = await step(missionId, official, { status: 'CANCELLED', outcomeNotes: 'Duplicate of an earlier SOS' }).expect(200);

      expect(byTeam.body.error.code).toBe('INVALID_MISSION_TRANSITION');
      expect(byOutsider.body.error.code).toBe('MISSION_NOT_FOUND');
      expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', outcomeNotes: 'Duplicate of an earlier SOS' });
      expect(await teamIsAvailable(teamId)).toBe(true);
      expect(await incidentStatus(incidentId)).toBe('VERIFIED');
    });

    it('refuses to accept a second mission while the team works another, leaving that mission untouched', async () => {
      const origin = site(-2, -1);
      const teamId = await seedTeam(offset(origin, 400, 0));
      const member = await teamMember(teamId);
      const firstMission = await dispatch(await reportSos(origin), teamId);
      const secondMission = await dispatch(await reportSos(offset(origin, 0, 700)), teamId);
      await step(firstMission, member, { status: 'ACCEPTED' }).expect(200);

      const response = await step(secondMission, member, { status: 'ACCEPTED' }).expect(409);

      expect(response.body.error.code).toBe('TEAM_UNAVAILABLE');
      const second = await t.db.query('SELECT status::text, accepted_at FROM missions WHERE id = $1', [secondMission]);
      expect(second.rows[0]).toEqual({ status: 'ASSIGNED', accepted_at: null });
    });

    it('refuses skipped steps and official team steps, and answers a repeated step as a no-op', async () => {
      const origin = site(-2, 0);
      const teamId = await seedTeam(offset(origin, 400, 0));
      const member = await teamMember(teamId);
      const missionId = await dispatch(await reportSos(origin), teamId);

      const skipped = await step(missionId, member, { status: 'EN_ROUTE' }).expect(409);
      const byOfficial = await step(missionId, official, { status: 'ACCEPTED' }).expect(409);
      const first = await step(missionId, member, { status: 'ACCEPTED' }).expect(200);
      const repeated = await step(missionId, member, { status: 'ACCEPTED' }).expect(200);

      expect(skipped.body.error.code).toBe('INVALID_MISSION_TRANSITION');
      expect(byOfficial.body.error.code).toBe('INVALID_MISSION_TRANSITION');
      expect(repeated.body.data).toEqual(first.body.data);
    });

    it('lets a step finish while an assignment of the same team to the same incident is mid-transaction', async () => {
      const origin = site(-2, -2);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 400, 0));
      const member = await teamMember(teamId);
      const missionId = await dispatch(incidentId, teamId);
      const assignment = new Client({ connectionString: stack.postgres.getConnectionUri() });
      await assignment.connect();

      try {
        // Replays the lock sequence of POST /missions: team row share-locked, then the insert.
        await assignment.query('BEGIN');
        await assignment.query(`SET LOCAL statement_timeout = '5s'`);
        await assignment.query('SELECT 1 FROM rescue_teams WHERE id = $1 FOR SHARE', [teamId]);
        const rejection = step(missionId, member, { status: 'REJECTED', rejectionReason: 'Crew unwell' }).then((response) => response);
        await waitUntil(async () => {
          const blocked = await t.db.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock'`);
          return blocked.rows[0].n > 0;
        });
        const inserted = await assignment.query(
          `INSERT INTO missions (incident_id, team_id, assigned_by) VALUES ($1, $2, $3)
           ON CONFLICT (incident_id, team_id) WHERE status IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE') DO NOTHING
           RETURNING id`,
          [incidentId, teamId, official.userId],
        );
        await assignment.query('COMMIT');

        expect(inserted.rowCount).toBe(0);
        expect((await rejection).status).toBe(200);
      } finally {
        await assignment.end();
      }
    });

    it('hides a mission from every other team', async () => {
      const origin = site(-2, 1);
      const missionId = await dispatch(await reportSos(origin), await seedTeam(offset(origin, 400, 0)));
      const otherMember = await teamMember(await seedTeam(offset(origin, 600, 0)));

      await t.http().get(`/api/v1/missions/${missionId}`).set(otherMember.auth).expect(404);
      const response = await step(missionId, otherMember, { status: 'ACCEPTED' }).expect(404);

      expect(response.body.error.code).toBe('MISSION_NOT_FOUND');
    });
  });

  describe('mission views', () => {
    it("shows the reporter's contact to the assigned team while the mission is open, and audits each view", async () => {
      const origin = site(-2, 2);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 400, 0));
      const member = await teamMember(teamId);
      const missionId = await dispatch(incidentId, teamId);
      const auditRows = () =>
        t.db.query(
          `SELECT actor_id, entity_id, metadata FROM audit_log
           WHERE action = 'mission.reporter_contact.viewed' AND entity_type = 'incident' AND entity_id = $1`,
          [incidentId],
        );

      const asTeam = await t.http().get(`/api/v1/missions/${missionId}`).set(member.auth).expect(200);
      const asOfficial = await t.http().get(`/api/v1/missions/${missionId}`).set(official.auth).expect(200);

      expect(asTeam.body.data).toMatchObject({
        id: missionId,
        status: 'ASSIGNED',
        incident: { id: incidentId, status: 'ASSIGNED', lat: origin.lat, lon: origin.lon },
        reporter: { fullName: 'Sunita Kumari', phone: reporter.phone },
      });
      expect(asOfficial.body.data.reporter).toBeNull();
      expect((await auditRows()).rows).toEqual([{ actor_id: member.userId, entity_id: incidentId, metadata: { missionId } }]);

      await step(missionId, official, { status: 'CANCELLED' }).expect(200);
      const afterClosing = await t.http().get(`/api/v1/missions/${missionId}`).set(member.auth).expect(200);

      expect(afterClosing.body.data).toMatchObject({ status: 'CANCELLED', reporter: null });
      expect((await auditRows()).rows).toHaveLength(1);
    });

    it("lists a team's missions open first, by incident priority", async () => {
      const origin = site(-1, -1);
      const teamId = await seedTeam(origin);
      const member = await teamMember(teamId);
      const lowIncident = await reportSos(offset(origin, 100, 0));
      const highIncident = await reportSos(offset(origin, 200, 0));
      const finishedIncident = await reportSos(offset(origin, 300, 0));
      await t.db.query(
        `UPDATE incidents SET priority_score = CASE id WHEN $1::uuid THEN 20 WHEN $2::uuid THEN 80 ELSE 99 END
         WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
        [lowIncident, highIncident, finishedIncident],
      );
      const lowMission = await dispatch(lowIncident, teamId);
      const highMission = await dispatch(highIncident, teamId);
      const finishedMission = await dispatch(finishedIncident, teamId);
      for (const status of ['ACCEPTED', 'EN_ROUTE', 'ON_SITE']) {
        await step(finishedMission, member, { status }).expect(200);
      }
      await step(finishedMission, member, { status: 'COMPLETED', peopleRescued: 2 }).expect(200);

      const response = await t.http().get('/api/v1/missions/mine').set(member.auth).expect(200);

      const missions = response.body.data as { id: string; incident: { id: string } }[];
      expect(missions.map((mission) => mission.id)).toEqual([highMission, lowMission, finishedMission]);
      expect(missions.map((mission) => mission.incident.id)).toEqual([highIncident, lowIncident, finishedIncident]);
    });

    it('lists district missions for officials, filtered by status and incident', async () => {
      const origin = site(-1, -2);
      const incidentId = await reportSos(origin);
      const rejectingTeam = await seedTeam(offset(origin, 300, 0));
      const rejectedMission = await dispatch(incidentId, rejectingTeam);
      const openMission = await dispatch(incidentId, await seedTeam(offset(origin, 600, 0)));
      await step(rejectedMission, await teamMember(rejectingTeam), { status: 'REJECTED', rejectionReason: 'Road washed out' }).expect(200);
      const list = (who: Session, query: Record<string, string>) =>
        t.http().get('/api/v1/missions').query(query).set(who.auth).expect(200);

      const all = await list(official, { incidentId });
      const rejected = await list(official, { incidentId, status: 'REJECTED,CANCELLED' });
      const foreign = await list(outsider, { incidentId });

      expect((all.body.data as { id: string }[]).map((mission) => mission.id).sort()).toEqual([rejectedMission, openMission].sort());
      expect((rejected.body.data as { id: string }[]).map((mission) => mission.id)).toEqual([rejectedMission]);
      expect(foreign.body.data).toEqual([]);
    });
  });

  describe('live location', () => {
    it('drops pings that are too soon or too close, and flushes accepted ones to Postgres in a batch', async () => {
      const origin = site(-1, 0);
      const incidentId = await reportSos(offset(origin, 3_000, 0));
      const teamId = await seedTeam(origin);
      const member = await teamMember(teamId);
      const missionId = await dispatch(incidentId, teamId);
      await step(missionId, member, { status: 'ACCEPTED' }).expect(200);
      const startedAt = Date.now() - 10 * 60_000;
      const at = (elapsedMs: number) => new Date(startedAt + elapsedMs);
      const lastFix = offset(origin, 700, 0);

      const answers = [
        await ping(member, offset(origin, 100, 0), at(0)).expect(202),
        await ping(member, offset(origin, 400, 0), at(2_000)).expect(202),
        await ping(member, offset(origin, 110, 0), at(15_000)).expect(202),
        await ping(member, lastFix, at(30_000)).expect(202),
      ];

      expect(answers.map((answer) => answer.body.data)).toEqual([
        { accepted: true },
        { accepted: false },
        { accepted: false },
        { accepted: true },
      ]);
      const live = JSON.parse((await redis.get(LIVE_POSITION_KEYS.position(teamId)))!);
      expect(live).toEqual({ teamId, missionId, ...lastFix, accuracyM: 8, recordedAt: at(30_000).toISOString() });
      expect(await redis.ttl(LIVE_POSITION_KEYS.position(teamId))).toBeGreaterThan(590);
      const unflushed = await t.db.query('SELECT count(*)::int AS n FROM team_location_pings WHERE team_id = $1', [teamId]);
      expect(unflushed.rows[0].n).toBe(0);

      const flushed = await t.app.get(TeamLocationFlusher).flushNow();

      expect(flushed).toBeGreaterThanOrEqual(2);
      expect(await redis.llen(LIVE_POSITION_KEYS.buffer)).toBe(0);
      const trail = await t.db.query<{ mission_id: string; recorded_at: Date }>(
        'SELECT mission_id, recorded_at FROM team_location_pings WHERE team_id = $1 ORDER BY recorded_at',
        [teamId],
      );
      expect(trail.rows).toEqual([
        { mission_id: missionId, recorded_at: at(0) },
        { mission_id: missionId, recorded_at: at(30_000) },
      ]);
      const team = await t.db.query<{ lat: number; lon: number; location_updated_at: Date }>(
        `SELECT ST_Y(current_location::geometry) AS lat, ST_X(current_location::geometry) AS lon, location_updated_at
         FROM rescue_teams WHERE id = $1`,
        [teamId],
      );
      expect(team.rows[0]!.lat).toBeCloseTo(lastFix.lat, 9);
      expect(team.rows[0]!.lon).toBeCloseTo(lastFix.lon, 9);
      expect(team.rows[0]!.location_updated_at).toEqual(at(30_000));
    });

    it('lets only one of two simultaneous pings through the throttle', async () => {
      const origin = site(3, 1);
      const teamId = await seedTeam(origin);
      const member = await teamMember(teamId);
      const startedAt = Date.now() - 60_000;

      const answers = await Promise.all([
        ping(member, offset(origin, 300, 0), new Date(startedAt)),
        ping(member, offset(origin, 600, 0), new Date(startedAt + 1_000)),
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([202, 202]);
      expect(answers.filter((answer) => answer.body.data.accepted)).toHaveLength(1);
      const buffered = (await redis.lrange(LIVE_POSITION_KEYS.buffer, 0, -1)).filter((raw) => raw.includes(teamId));
      expect(buffered).toEqual([await redis.get(LIVE_POSITION_KEYS.position(teamId))]);
    });

    it('overlays a live position fresher than the database on GET /teams until the flush catches up', async () => {
      const origin = site(-1, 1);
      const teamId = await seedTeam(origin);
      const member = await teamMember(teamId);
      const moved = offset(origin, 0, 900);
      const recordedAt = new Date(Date.now() - 1_000);
      const storedPosition = async () =>
        (
          await t.db.query<{ lat: number; lon: number }>(
            'SELECT ST_Y(current_location::geometry) AS lat, ST_X(current_location::geometry) AS lon FROM rescue_teams WHERE id = $1',
            [teamId],
          )
        ).rows[0]!;

      await t
        .http()
        .post('/api/v1/teams/me/location')
        .set(member.auth)
        .send({ ...moved, recordedAt: recordedAt.toISOString() })
        .expect(202);
      const response = await t.http().get('/api/v1/teams').set(official.auth).expect(200);

      const team = (response.body.data as { id: string }[]).find((row) => row.id === teamId)!;
      expect(Object.keys(team).sort()).toEqual([...TEAM_KEYS].sort());
      expect(team).toMatchObject({ lat: moved.lat, lon: moved.lon, locationUpdatedAt: recordedAt.toISOString() });
      expect((await storedPosition()).lat).toBeCloseTo(origin.lat, 9);

      await t.app.get(TeamLocationFlusher).flushNow();

      expect((await storedPosition()).lat).toBeCloseTo(moved.lat, 9);
      const trail = await t.db.query('SELECT mission_id, accuracy_m FROM team_location_pings WHERE team_id = $1', [teamId]);
      expect(trail.rows).toEqual([{ mission_id: null, accuracy_m: null }]);
    });

    it("pushes team:location to district officials and to the active mission's incident room", async () => {
      const origin = site(-1, 2);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 2_000, 0));
      const member = await teamMember(teamId);
      const missionId = await dispatch(incidentId, teamId);
      await step(missionId, member, { status: 'ACCEPTED' }).expect(200);
      const officialSocket = await connect(official.accessToken);
      const reporterSocket = await connect(reporter.accessToken);
      expect(await reporterSocket.emitWithAck('incident:subscribe', { incidentId })).toEqual({ ok: true });
      const forTeam = (payload: { teamId: string }) => payload.teamId === teamId;
      const toOfficial = nextEvent(officialSocket, 'team:location', forTeam);
      const toReporter = nextEvent(reporterSocket, 'team:location', forTeam);
      const position = offset(origin, 1_500, 0);

      await ping(member, position, new Date()).expect(202);

      const expected = { teamId, missionId, lat: position.lat, lon: position.lon, accuracyM: 8, recordedAt: expect.any(String) };
      await expect(toOfficial).resolves.toEqual(expected);
      await expect(toReporter).resolves.toEqual(expected);
    });

    it('pushes mission:assigned to the team and mission:status_changed to district officials', async () => {
      const origin = site(0, -1);
      const incidentId = await reportSos(origin);
      const teamId = await seedTeam(offset(origin, 500, 0));
      const member = await teamMember(teamId);
      const teamSocket = await connect(member.accessToken);
      const officialSocket = await connect(official.accessToken);

      const assigned = nextEvent<{ incident: { id: string } }>(teamSocket, 'mission:assigned', (payload) => payload.incident.id === incidentId);
      const missionId = await dispatch(incidentId, teamId);
      await expect(assigned).resolves.toMatchObject({
        mission: { id: missionId, status: 'ASSIGNED' },
        incident: { id: incidentId, status: 'ASSIGNED' },
      });

      const changed = nextEvent<{ missionId: string }>(officialSocket, 'mission:status_changed', (payload) => payload.missionId === missionId);
      await step(missionId, member, { status: 'ACCEPTED' }).expect(200);
      await expect(changed).resolves.toEqual({
        missionId,
        incidentId,
        teamId,
        from: 'ASSIGNED',
        to: 'ACCEPTED',
        at: expect.any(String),
      });
    });
  });

  describe('O4: nearest-team query with 200 more teams', () => {
    beforeAll(async () => {
      await t.db.query('SELECT setseed(0.42)');
      await t.db.query(
        `WITH spots AS (
           SELECT n, ST_SetSRID(ST_MakePoint(85.70 + random() * 0.65, 25.95 + random() * 0.45), 4326)::geography AS location
           FROM generate_series(1, 200) AS n
         )
         INSERT INTO rescue_teams (district_id, name, agency, team_size, capabilities, base_location, current_location, is_available)
         SELECT $1, 'Load team ' || n, (ARRAY['NDRF', 'SDRF', 'FIRE', 'POLICE', 'HEALTH'])[1 + n % 5]::rescue_agency, 4 + n % 8,
                CASE WHEN n % 3 = 0 THEN ARRAY['WATER_RESCUE', 'FIRST_AID'] ELSE ARRAY['FIRST_AID'] END,
                location, location, n % 5 <> 0
         FROM spots`,
        [t.districtId],
      );
      await t.db.query('ANALYZE rescue_teams');
    });

    it.each([
      ['any capability', null],
      ['a capability filter', 'WATER_RESCUE'],
    ])('orders by the current_location GiST index with %s', async (_case, capability) => {
      const sql = nearestAvailableTeamsSql({ districtId: t.districtId, point: DARBHANGA_TOWN, capability, limit: 5 });

      const explained = await t.db.query<{ 'QUERY PLAN': [{ Plan: PlanNode; 'Execution Time': number }] }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${sql.text}`,
        sql.values,
      );

      const nodes = flatten(explained.rows[0]!['QUERY PLAN'][0].Plan);
      expect(nodes.map((node) => node['Index Name'])).toContain('rescue_teams_current_location_gist');
      expect(nodes.filter((node) => node['Relation Name'] === 'rescue_teams').map((node) => node['Node Type'])).not.toContain('Seq Scan');
    });

    it('answers in under 100 ms at p95', async () => {
      const incidentId = await reportSos(DARBHANGA_TOWN);
      const query = { districtId: t.districtId, point: DARBHANGA_TOWN, capability: null, limit: 5 };
      const repository = t.app.get(TeamsRepository);
      const measure = async (run: () => Promise<unknown>, samples: number) => {
        await run();
        const timings: number[] = [];
        for (let sample = 0; sample < samples; sample += 1) {
          const started = performance.now();
          await run();
          timings.push(performance.now() - started);
        }
        return timings;
      };

      const queryTimings = await measure(() => repository.findNearestAvailable(query), 50);
      const endpointTimings = await measure(() => nearest(incidentId).expect(200), 20);
      const teams = await t.db.query('SELECT count(*)::int AS n FROM rescue_teams');
      const sql = nearestAvailableTeamsSql(query);
      const explained = await t.db.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql.text}`, sql.values);

      console.log(
        `O4 nearest-team over ${teams.rows[0].n} teams: query p50 ${percentile(queryTimings, 50).toFixed(2)} ms, ` +
          `p95 ${percentile(queryTimings, 95).toFixed(2)} ms; endpoint p95 ${percentile(endpointTimings, 95).toFixed(2)} ms; ` +
          `EXPLAIN ANALYZE execution ${explained.rows[0]['QUERY PLAN'][0]['Execution Time']} ms`,
      );
      expect(percentile(queryTimings, 95)).toBeLessThan(100);
    });
  });

  describe('with Redis down', () => {
    it('keeps the flusher from throwing, serves GET /teams from Postgres and refuses live pings', async () => {
      const origin = site(2, -2);
      const teamId = await seedTeam(origin);
      const member = await teamMember(teamId);
      await redis.quit();
      await stack.redis.stop();

      const flushed = await t.app.get(TeamLocationFlusher).flushNow();
      const teams = await t.http().get('/api/v1/teams').set(official.auth).expect(200);
      const pinged = await ping(member, offset(origin, 500, 0), new Date()).expect(503);

      expect(flushed).toBe(0);
      expect((teams.body.data as { id: string }[]).map((team) => team.id)).toContain(teamId);
      expect(pinged.body.error.code).toBe('LIVE_LOCATION_UNAVAILABLE');
    });
  });
});
