import { CreateBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { nearbyTasksQuery } from '../src/modules/volunteers/volunteer-tasks.repository';
import { VolunteersModule } from '../src/modules/volunteers/volunteers.module';
import { loginAs, type LoggedIn } from './support/auth';
import { MINIO_CREDENTIALS } from './support/containers';
import { createTestApp, startStack, stopStack, TEST_BUCKET, type TestApp, type TestStack } from './support/test-app';

interface Point {
  lat: number;
  lon: number;
}

interface TaskBody {
  id: string;
  title: string;
  status: string;
  assignedVolunteerId: string | null;
  distanceM?: number;
}

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  'Relation Name'?: string;
  Plans?: PlanNode[];
}

// Every point below lies inside the real Darbhanga boundary. Tests that match tasks by
// distance get their own neighbourhood so tasks left open by other tests stay out of range.
const DARBHANGA_TOWN: Point = { lat: 26.1542, lon: 85.8918 };
const MATCHING_BASE: Point = { lat: 26.23, lon: 85.98 };
const DISPATCH_BASE: Point = { lat: 26.0445, lon: 86.1856 };
const MUMBAI: Point = { lat: 19.076, lon: 72.8777 };

const kmNorthOf = (origin: Point, km: number): Point => ({ lat: origin.lat + km / 111.2, lon: origin.lon });

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n');
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const flattenPlan = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(flattenPlan)];

describe('volunteers', () => {
  let stack: TestStack;
  let t: TestApp;
  let s3: S3Client;
  let official: LoggedIn;
  let otherDistrictId: number;
  const sockets: Socket[] = [];

  const register = (who: LoggedIn, overrides: object = {}) =>
    t
      .http()
      .post('/api/v1/volunteers/register')
      .set(who.auth)
      .send({ skills: ['SWIMMER'], serviceRadiusKm: 10, ...DARBHANGA_TOWN, ...overrides });

  const review = (userId: string, body: object, by: LoggedIn = official) =>
    t.http().post(`/api/v1/volunteers/${userId}/review`).set(by.auth).send(body);

  const presignDocument = (who: LoggedIn, body: object) =>
    t.http().post('/api/v1/volunteers/me/documents/presign').set(who.auth).send(body);

  const confirmDocument = (who: LoggedIn, mediaId: string) =>
    t.http().post('/api/v1/volunteers/me/documents/confirm').set(who.auth).send({ mediaId });

  const createTask = (body: object, by: LoggedIn = official) =>
    t.http().post('/api/v1/volunteer-tasks').set(by.auth).send({ title: 'Carry drinking water to the relief camp', ...body });

  const nearbyTasks = (who: LoggedIn) => t.http().get('/api/v1/volunteer-tasks/nearby').set(who.auth);

  const taskAction = (who: LoggedIn, taskId: string, action: 'accept' | 'complete' | 'cancel') =>
    t.http().post(`/api/v1/volunteer-tasks/${taskId}/${action}`).set(who.auth);

  const refreshSession = async (who: LoggedIn) => {
    const response = await t.http().post('/api/v1/auth/refresh').set('Cookie', who.refreshCookie).expect(200);
    const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    const refreshCookie = cookies.find((cookie) => cookie.startsWith('ndms_refresh='))!.split(';')[0]!;
    const accessToken = response.body.data.accessToken as string;
    const session: LoggedIn = { ...who, accessToken, refreshCookie, auth: { Authorization: `Bearer ${accessToken}` } };
    return { session, user: response.body.data.user as { role: string; districtId: number | null } };
  };

  const verifiedVolunteer = async (registration: object = {}) => {
    const citizen = await loginAs(t);
    await register(citizen, registration).expect(201);
    await review(citizen.userId, { decision: 'VERIFIED' }).expect(201);
    return (await refreshSession(citizen)).session;
  };

  const createFacility = async (name: string, at: Point) => {
    const result = await t.db.query<{ id: string }>(
      `INSERT INTO facilities (district_id, kind, name, location, capacity)
       VALUES ($1, 'SHELTER', $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 150)
       RETURNING id`,
      [t.districtId, name, at.lon, at.lat],
    );
    return result.rows[0]!.id;
  };

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

  const waitForQueriesBlockedOnLocks = async (count: number) => {
    for (let waited = 0; waited < 5_000; waited += 25) {
      const result = await t.db.query<{ blocked: number }>(
        `SELECT count(*)::int AS blocked FROM pg_stat_activity WHERE wait_event_type = 'Lock'`,
      );
      if (result.rows[0]!.blocked >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`fewer than ${count} queries were waiting on a lock`);
  };

  // Holding the task row makes every accept queue on its lock, so they genuinely race
  // instead of happening to run one after another.
  const acceptAtOnce = async (taskId: string, volunteers: LoggedIn[]) => {
    const lockHolder = new Client({ connectionString: stack.postgres.getConnectionUri() });
    await lockHolder.connect();
    try {
      await lockHolder.query('BEGIN');
      await lockHolder.query('SELECT id FROM volunteer_tasks WHERE id = $1 FOR UPDATE', [taskId]);
      const attempts = Promise.all(volunteers.map((volunteer) => taskAction(volunteer, taskId, 'accept')));
      await waitForQueriesBlockedOnLocks(volunteers.length);
      await lockHolder.query('COMMIT');
      return await attempts;
    } finally {
      await lockHolder.end();
    }
  };

  beforeAll(async () => {
    stack = await startStack({ minio: true });
    t = await createTestApp(stack, { imports: [VolunteersModule] });
    s3 = new S3Client({
      endpoint: t.env.S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: MINIO_CREDENTIALS.user, secretAccessKey: MINIO_CREDENTIALS.password },
    });
    await s3.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));

    const otherDistrict = await t.db.query<{ id: number }>(
      `INSERT INTO districts (name, state, boundary)
       VALUES ('Synthetic', 'Test', ST_Multi(ST_MakeEnvelope(80, 20, 81, 21, 4326))::geography)
       RETURNING id`,
    );
    otherDistrictId = otherDistrict.rows[0]!.id;
    official = await loginAs(t, { role: 'GOVT_OFFICIAL' });
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    s3?.destroy();
    await t?.close();
    await stopStack(stack);
  });

  describe('registration', () => {
    it('registers a citizen as a pending volunteer with normalised skills and their location', async () => {
      const citizen = await loginAs(t);

      const response = await register(citizen, { skills: ['swimmer', ' first aid ', 'SWIMMER'], serviceRadiusKm: 15 }).expect(201);

      expect(response.body.data).toMatchObject({
        userId: citizen.userId,
        verificationStatus: 'PENDING',
        skills: ['SWIMMER', 'FIRST_AID'],
        serviceRadiusKm: 15,
        isAvailable: true,
        lat: DARBHANGA_TOWN.lat,
        lon: DARBHANGA_TOWN.lon,
        reviewedBy: null,
        reviewedAt: null,
      });
      const me = await t.http().get('/api/v1/volunteers/me').set(citizen.auth).expect(200);
      expect(me.body.data).toEqual(response.body.data);
      const account = await t.db.query('SELECT last_location_at IS NOT NULL AS located FROM users WHERE id = $1', [citizen.userId]);
      expect(account.rows[0]).toEqual({ located: true });
    });

    it('answers 404 to a citizen who has not registered', async () => {
      const citizen = await loginAs(t);

      const profile = await t.http().get('/api/v1/volunteers/me').set(citizen.auth).expect(404);
      await t.http().patch('/api/v1/volunteers/me').set(citizen.auth).send({ isAvailable: false }).expect(404);

      expect(profile.body.error.code).toBe('VOLUNTEER_NOT_FOUND');
    });

    it('refuses a location outside every district NDMS serves', async () => {
      const citizen = await loginAs(t);

      const response = await register(citizen, MUMBAI).expect(422);

      expect(response.body.error.code).toBe('LOCATION_OUTSIDE_DISTRICT');
      await t.http().get('/api/v1/volunteers/me').set(citizen.auth).expect(404);
    });

    it('refuses registration to staff accounts', async () => {
      const rescuer = await loginAs(t, { role: 'RESCUE_TEAM' });

      const response = await register(rescuer).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('updates availability, radius and location', async () => {
      const citizen = await loginAs(t);
      await register(citizen).expect(201);
      const moved = kmNorthOf(DARBHANGA_TOWN, 1);

      const response = await t
        .http()
        .patch('/api/v1/volunteers/me')
        .set(citizen.auth)
        .send({ isAvailable: false, serviceRadiusKm: 3, ...moved })
        .expect(200);

      expect(response.body.data).toMatchObject({
        isAvailable: false,
        serviceRadiusKm: 3,
        skills: ['SWIMMER'],
        lat: moved.lat,
        lon: moved.lon,
        verificationStatus: 'PENDING',
      });
    });
  });

  describe('review', () => {
    it('verifies an application, notifies the volunteer, and a refreshed session carries the VOLUNTEER role', async () => {
      const citizen = await loginAs(t);
      await register(citizen).expect(201);
      const socket = await connect(citizen.accessToken);
      const notified = nextEvent<{ userId: string }>(socket, 'volunteer:reviewed', (payload) => payload.userId === citizen.userId);

      const response = await review(citizen.userId, { decision: 'VERIFIED' }).expect(201);

      expect(response.body.data).toMatchObject({
        userId: citizen.userId,
        verificationStatus: 'VERIFIED',
        reviewedBy: official.userId,
        reviewedAt: expect.any(String),
        rejectionReason: null,
      });
      await expect(notified).resolves.toEqual({ userId: citizen.userId, verificationStatus: 'VERIFIED', rejectionReason: null });
      const { user } = await refreshSession(citizen);
      expect(user).toMatchObject({ role: 'VOLUNTEER', districtId: t.districtId });
    });

    it('rejects with a reason, and registering again reopens the application as PENDING', async () => {
      const citizen = await loginAs(t);
      await register(citizen).expect(201);
      const socket = await connect(citizen.accessToken);
      const notified = nextEvent<{ userId: string }>(socket, 'volunteer:reviewed', (payload) => payload.userId === citizen.userId);

      const rejected = await review(citizen.userId, { decision: 'REJECTED', rejectionReason: 'ID photo is unreadable' }).expect(201);
      const reapplied = await register(citizen, { skills: ['DRIVER'] }).expect(201);

      expect(rejected.body.data).toMatchObject({ verificationStatus: 'REJECTED', rejectionReason: 'ID photo is unreadable' });
      await expect(notified).resolves.toEqual({
        userId: citizen.userId,
        verificationStatus: 'REJECTED',
        rejectionReason: 'ID photo is unreadable',
      });
      expect(reapplied.body.data).toMatchObject({
        verificationStatus: 'PENDING',
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        skills: ['DRIVER'],
      });
      const account = await t.db.query('SELECT role::text, district_id FROM users WHERE id = $1', [citizen.userId]);
      expect(account.rows[0]).toEqual({ role: 'CITIZEN', district_id: null });
    });

    it('keeps a verified volunteer verified when they submit the registration form again', async () => {
      const volunteer = await verifiedVolunteer();

      const resubmitted = await register(volunteer, { skills: ['BOATMAN'], serviceRadiusKm: 20 }).expect(201);

      expect(resubmitted.body.data).toMatchObject({
        verificationStatus: 'VERIFIED',
        reviewedBy: official.userId,
        skills: ['BOATMAN'],
        serviceRadiusKm: 20,
      });
    });

    it('replays a repeated decision but refuses a conflicting one', async () => {
      const citizen = await loginAs(t);
      await register(citizen).expect(201);
      const first = await review(citizen.userId, { decision: 'VERIFIED' }).expect(201);

      const repeated = await review(citizen.userId, { decision: 'VERIFIED' }).expect(201);
      const conflicting = await review(citizen.userId, { decision: 'REJECTED', rejectionReason: 'Changed my mind' }).expect(409);

      expect(repeated.body.data).toEqual(first.body.data);
      expect(conflicting.body.error.code).toBe('VOLUNTEER_ALREADY_REVIEWED');
    });

    it('keeps applications out of reach of officials from another district', async () => {
      const citizen = await loginAs(t);
      await register(citizen).expect(201);
      const outsider = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: otherDistrictId });

      const listed = await t.http().get('/api/v1/volunteers').set(outsider.auth).expect(200);
      const refused = await review(citizen.userId, { decision: 'VERIFIED' }, outsider).expect(404);

      expect((listed.body.data as { userId: string }[]).map((applicant) => applicant.userId)).not.toContain(citizen.userId);
      expect(refused.body.error.code).toBe('VOLUNTEER_NOT_FOUND');
    });
  });

  describe('documents', () => {
    it('uploads a document straight to storage and shows it to the district official with an audit row', async () => {
      const citizen = await loginAs(t, { fullName: 'Ravi Kumar' });
      await register(citizen).expect(201);

      const grant = await presignDocument(citizen, { contentType: 'application/pdf', sizeBytes: PDF_BYTES.length }).expect(201);
      const upload = await fetch(grant.body.data.uploadUrl, { method: 'PUT', headers: grant.body.data.headers, body: PDF_BYTES });
      expect(upload.status).toBe(200);
      const confirmed = await confirmDocument(citizen, grant.body.data.mediaId).expect(201);
      expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', incidentId: null, sizeBytes: PDF_BYTES.length });
      const stored = await t.db.query('SELECT purpose::text, incident_id FROM media WHERE id = $1', [grant.body.data.mediaId]);
      expect(stored.rows[0]).toEqual({ purpose: 'VOLUNTEER_DOCUMENT', incident_id: null });

      const listed = await t.http().get('/api/v1/volunteers').query({ status: 'PENDING' }).set(official.auth).expect(200);

      const applicant = (listed.body.data as { userId: string; documents: { id: string; url: string }[] }[]).find(
        (entry) => entry.userId === citizen.userId,
      );
      expect(applicant).toMatchObject({
        phone: citizen.phone,
        fullName: 'Ravi Kumar',
        documents: [expect.objectContaining({ id: grant.body.data.mediaId, contentType: 'application/pdf' })],
      });
      const download = await fetch(applicant!.documents[0]!.url);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(PDF_BYTES);
      const audit = await t.db.query(
        `SELECT actor_id, metadata FROM audit_log
         WHERE action = 'volunteer.documents.viewed' AND entity_type = 'volunteer' AND entity_id = $1`,
        [citizen.userId],
      );
      expect(audit.rows).toEqual([{ actor_id: official.userId, metadata: { documentIds: [grant.body.data.mediaId] } }]);
    });

    it('keeps a document pending until it is uploaded, and private to its uploader', async () => {
      const citizen = await loginAs(t);
      const stranger = await loginAs(t);
      await register(citizen).expect(201);
      const grant = await presignDocument(citizen, { contentType: 'image/png', sizeBytes: 2048 }).expect(201);

      const early = await confirmDocument(citizen, grant.body.data.mediaId).expect(409);
      const foreign = await confirmDocument(stranger, grant.body.data.mediaId).expect(404);

      expect(early.body.error.code).toBe('MEDIA_NOT_UPLOADED');
      expect(foreign.body.error.code).toBe('MEDIA_NOT_FOUND');
    });

    it('deletes an upload larger than the limit instead of confirming it', async () => {
      const citizen = await loginAs(t);
      await register(citizen).expect(201);
      const grant = await presignDocument(citizen, { contentType: 'application/pdf', sizeBytes: 1024 }).expect(201);
      await fetch(grant.body.data.uploadUrl, {
        method: 'PUT',
        headers: grant.body.data.headers,
        body: Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 1),
      });

      const response = await confirmDocument(citizen, grant.body.data.mediaId).expect(422);

      expect(response.body.error.code).toBe('MEDIA_REJECTED');
      await expect(s3.send(new HeadObjectCommand({ Bucket: TEST_BUCKET, Key: grant.body.data.objectKey }))).rejects.toMatchObject({
        name: 'NotFound',
      });
    });

    it('refuses a document upload from someone who has not registered', async () => {
      const citizen = await loginAs(t);

      const response = await presignDocument(citizen, { contentType: 'image/png', sizeBytes: 2048 }).expect(404);

      expect(response.body.error.code).toBe('VOLUNTEER_NOT_FOUND');
    });
  });

  describe('tasks', () => {
    it('announces a new task to volunteers and to the district as it is created', async () => {
      const volunteer = await verifiedVolunteer();
      const [volunteerSocket, officialSocket] = await Promise.all([connect(volunteer.accessToken), connect(official.accessToken)]);
      const title = `Sandbag the school wall ${randomUUID()}`;
      const withTitle = (payload: TaskBody) => payload.title === title;
      const toVolunteers = nextEvent<TaskBody>(volunteerSocket, 'volunteer_task:created', withTitle);
      const toDistrict = nextEvent<TaskBody>(officialSocket, 'volunteer_task:created', withTitle);

      const task = await createTask({ title, ...DARBHANGA_TOWN, requiredSkills: ['first aid'] }).expect(201);

      expect(task.body.data).toMatchObject({
        status: 'OPEN',
        districtId: t.districtId,
        createdBy: official.userId,
        requiredSkills: ['FIRST_AID'],
        facilityId: null,
        incidentId: null,
        assignedVolunteerId: null,
        lat: DARBHANGA_TOWN.lat,
        lon: DARBHANGA_TOWN.lon,
      });
      await expect(toVolunteers).resolves.toMatchObject({ id: task.body.data.id });
      await expect(toDistrict).resolves.toMatchObject({ id: task.body.data.id });
    });

    it("refuses a task located outside the official's district", async () => {
      const response = await createTask(MUMBAI).expect(422);

      expect(response.body.error.code).toBe('LOCATION_OUTSIDE_DISTRICT');
    });

    it('links a task to an incident in the district and refuses an unknown incident', async () => {
      const reporter = await loginAs(t);
      const incident = await t
        .http()
        .post('/api/v1/incidents/sos')
        .set(reporter.auth)
        .send({ clientUuid: randomUUID(), ...DARBHANGA_TOWN, reportedAt: new Date().toISOString() })
        .expect(201);

      const linked = await createTask({ ...DARBHANGA_TOWN, incidentId: incident.body.data.id }).expect(201);
      const unknown = await createTask({ ...DARBHANGA_TOWN, incidentId: randomUUID() }).expect(404);

      expect(linked.body.data.incidentId).toBe(incident.body.data.id);
      expect(unknown.body.error.code).toBe('INCIDENT_NOT_FOUND');
    });

    it('offers open tasks within the service radius that need no skills or share one, nearest first', async () => {
      const [swimmer, generalist] = await Promise.all([
        verifiedVolunteer({ skills: ['SWIMMER'], serviceRadiusKm: 5, ...MATCHING_BASE }),
        verifiedVolunteer({ skills: [], serviceRadiusKm: 5, ...MATCHING_BASE }),
      ]);
      const anyone = await createTask(kmNorthOf(MATCHING_BASE, 1)).expect(201);
      const needsSwimmer = await createTask({ ...kmNorthOf(MATCHING_BASE, 2), requiredSkills: ['DRIVER', 'SWIMMER'] }).expect(201);
      const needsDoctor = await createTask({ ...kmNorthOf(MATCHING_BASE, 2), requiredSkills: ['DOCTOR'] }).expect(201);
      const beyondRadius = await createTask(kmNorthOf(MATCHING_BASE, 8)).expect(201);
      const createdIds = [anyone, needsSwimmer, needsDoctor, beyondRadius].map((task) => task.body.data.id as string);
      const offeredTo = async (volunteer: LoggedIn) => {
        const response = await nearbyTasks(volunteer).expect(200);
        return (response.body.data as TaskBody[]).filter((task) => createdIds.includes(task.id));
      };

      const toSwimmer = await offeredTo(swimmer);
      const toGeneralist = await offeredTo(generalist);

      expect(toSwimmer.map((task) => task.id)).toEqual([anyone.body.data.id, needsSwimmer.body.data.id]);
      expect(toSwimmer[0]!.distanceM).toBeCloseTo(1000, -2);
      expect(toGeneralist.map((task) => task.id)).toEqual([anyone.body.data.id]);
      const unmatched = await taskAction(swimmer, needsDoctor.body.data.id, 'accept').expect(404);
      expect(unmatched.body.error.code).toBe('TASK_NOT_FOUND');
    });

    it('refuses tasks to a volunteer who is not verified yet', async () => {
      const applicant = await loginAs(t);
      await register(applicant, MATCHING_BASE).expect(201);
      const task = await createTask(kmNorthOf(MATCHING_BASE, 1)).expect(201);

      const nearby = await nearbyTasks(applicant).expect(403);
      const accepted = await taskAction(applicant, task.body.data.id, 'accept').expect(403);

      expect([nearby.body.error.code, accepted.body.error.code]).toEqual(['VOLUNTEER_NOT_VERIFIED', 'VOLUNTEER_NOT_VERIFIED']);
    });

    it('offers nothing to a verified volunteer who is marked unavailable', async () => {
      const volunteer = await verifiedVolunteer({ ...MATCHING_BASE, serviceRadiusKm: 5 });
      const task = await createTask(kmNorthOf(MATCHING_BASE, 1)).expect(201);
      await t.http().patch('/api/v1/volunteers/me').set(volunteer.auth).send({ isAvailable: false }).expect(200);

      const nearby = await nearbyTasks(volunteer).expect(200);
      const accepted = await taskAction(volunteer, task.body.data.id, 'accept').expect(409);

      expect(nearby.body.data).toEqual([]);
      expect(accepted.body.error.code).toBe('VOLUNTEER_UNAVAILABLE');
    });

    it('lets exactly one of two simultaneous accepts win', async () => {
      const contenders = await Promise.all([verifiedVolunteer(DISPATCH_BASE), verifiedVolunteer(DISPATCH_BASE)]);
      const task = await createTask(kmNorthOf(DISPATCH_BASE, 1)).expect(201);
      const taskId = task.body.data.id as string;

      const responses = await acceptAtOnce(taskId, contenders);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const winner = responses.find((response) => response.status === 201)!;
      const loser = responses.find((response) => response.status === 409)!;
      expect(loser.body.error.code).toBe('TASK_TAKEN');
      const row = await t.db.query('SELECT status::text, assigned_volunteer_id FROM volunteer_tasks WHERE id = $1', [taskId]);
      expect(row.rows[0]).toEqual({ status: 'ACCEPTED', assigned_volunteer_id: winner.body.data.assignedVolunteerId });
      const winningVolunteer = contenders.find((volunteer) => volunteer.userId === winner.body.data.assignedVolunteerId)!;
      const replay = await taskAction(winningVolunteer, taskId, 'accept').expect(201);
      expect(replay.body.data).toMatchObject({ id: taskId, status: 'ACCEPTED' });
    });

    it('lets only the assigned volunteer complete a task and tells the district', async () => {
      const assignee = await verifiedVolunteer(DISPATCH_BASE);
      const bystander = await verifiedVolunteer(DISPATCH_BASE);
      const task = await createTask(kmNorthOf(DISPATCH_BASE, 2)).expect(201);
      const taskId = task.body.data.id as string;
      await taskAction(assignee, taskId, 'accept').expect(201);
      const officialSocket = await connect(official.accessToken);
      const announced = nextEvent<TaskBody>(
        officialSocket,
        'volunteer_task:updated',
        (payload) => payload.id === taskId && payload.status === 'COMPLETED',
      );

      const mine = await t.http().get('/api/v1/volunteer-tasks/mine').set(assignee.auth).expect(200);
      const refused = await taskAction(bystander, taskId, 'complete').expect(404);
      const completed = await taskAction(assignee, taskId, 'complete').expect(201);

      expect((mine.body.data as TaskBody[]).map((entry) => entry.id)).toContain(taskId);
      expect(refused.body.error.code).toBe('TASK_NOT_FOUND');
      expect(completed.body.data).toMatchObject({
        status: 'COMPLETED',
        assignedVolunteerId: assignee.userId,
        completedAt: expect.any(String),
      });
      await expect(announced).resolves.toMatchObject({ assignedVolunteerId: assignee.userId });
    });

    it("lets the creating facility manager cancel a task, but not another facility's manager", async () => {
      const managerFacilityId = await createFacility('Relief camp at the high school', DISPATCH_BASE);
      const otherFacilityId = await createFacility('Community hall shelter', DISPATCH_BASE);
      const manager = await loginAs(t, { role: 'FACILITY_MANAGER', facilityId: managerFacilityId });
      const otherManager = await loginAs(t, { role: 'FACILITY_MANAGER', facilityId: otherFacilityId });
      const volunteer = await verifiedVolunteer(DISPATCH_BASE);
      const task = await createTask(kmNorthOf(DISPATCH_BASE, 0.5), manager).expect(201);
      const taskId = task.body.data.id as string;

      const refused = await taskAction(otherManager, taskId, 'cancel').expect(404);
      const cancelled = await taskAction(manager, taskId, 'cancel').expect(201);
      const lateAccept = await taskAction(volunteer, taskId, 'accept').expect(409);
      const listed = await t.http().get('/api/v1/volunteer-tasks').query({ status: 'CANCELLED' }).set(official.auth).expect(200);

      expect(task.body.data).toMatchObject({ facilityId: managerFacilityId, createdBy: manager.userId });
      expect(refused.body.error.code).toBe('TASK_NOT_FOUND');
      expect(cancelled.body.data.status).toBe('CANCELLED');
      expect(lateAccept.body.error.code).toBe('TASK_TAKEN');
      expect((listed.body.data as TaskBody[]).map((entry) => entry.id)).toContain(taskId);
    });

    it('lets an official of the district cancel an accepted task and tells the assigned volunteer', async () => {
      const creator = await loginAs(t, { role: 'GOVT_OFFICIAL' });
      const outsider = await loginAs(t, { role: 'GOVT_OFFICIAL', districtId: otherDistrictId });
      const volunteer = await verifiedVolunteer(DISPATCH_BASE);
      const task = await createTask(kmNorthOf(DISPATCH_BASE, 1.5), creator).expect(201);
      const taskId = task.body.data.id as string;
      await taskAction(volunteer, taskId, 'accept').expect(201);
      const socket = await connect(volunteer.accessToken);
      const notified = nextEvent<TaskBody>(socket, 'volunteer_task:updated', (payload) => payload.id === taskId);

      const refused = await taskAction(outsider, taskId, 'cancel').expect(404);
      const cancelled = await taskAction(official, taskId, 'cancel').expect(201);
      const lateCompletion = await taskAction(volunteer, taskId, 'complete').expect(409);

      expect(refused.body.error.code).toBe('TASK_NOT_FOUND');
      expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', assignedVolunteerId: volunteer.userId });
      await expect(notified).resolves.toMatchObject({ id: taskId, status: 'CANCELLED' });
      expect(lateCompletion.body.error.code).toBe('INVALID_TRANSITION');
    });
  });

  // Runs last: the bulk tasks would otherwise crowd the fixtures above out of nearby results.
  describe('with 20,000 open tasks', () => {
    it('serves nearby matching from the GiST index on task locations and returns the nearest 20', async () => {
      const volunteer = await verifiedVolunteer({ skills: [], serviceRadiusKm: 2, ...MATCHING_BASE });
      await t.db.query('SELECT setseed(0.42)');
      await t.db.query(
        `INSERT INTO volunteer_tasks (district_id, created_by, title, location)
         SELECT d.id, $2, 'Synthetic load task ' || n,
                ST_SetSRID(ST_MakePoint(ST_XMin(extent.box) + random() * (ST_XMax(extent.box) - ST_XMin(extent.box)),
                                        ST_YMin(extent.box) + random() * (ST_YMax(extent.box) - ST_YMin(extent.box))), 4326)::geography
         FROM districts d
         CROSS JOIN LATERAL (SELECT ST_Envelope(d.boundary::geometry) AS box) extent
         CROSS JOIN generate_series(1, 20000) AS n
         WHERE d.id = $1`,
        [t.districtId, official.userId],
      );
      await t.db.query('ANALYZE volunteer_tasks');
      const statement = nearbyTasksQuery(volunteer.userId, 20);

      const explained = await t.db.query<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${statement.text}`,
        statement.values,
      );
      const response = await nearbyTasks(volunteer).expect(200);

      const plan = flattenPlan(explained.rows[0]!['QUERY PLAN'][0].Plan);
      expect(plan.map((node) => node['Index Name'])).toContain('volunteer_tasks_location_gist');
      expect(plan.filter((node) => node['Node Type'] === 'Seq Scan').map((node) => node['Relation Name'])).not.toContain(
        'volunteer_tasks',
      );
      const distances = (response.body.data as TaskBody[]).map((task) => task.distanceM!);
      expect(distances).toHaveLength(20);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      expect(Math.max(...distances)).toBeLessThanOrEqual(2_000);
    });
  });
});
