import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  DISASTER_TYPES,
  DOMAIN_EVENTS_CHANNEL,
  ENRICH_JOB_NAME,
  INCIDENT_ENRICHMENT_QUEUE,
  OPEN_INCIDENT_STATUSES,
  type EnrichIncidentJob,
} from '../src/contract';
import { startEnrichmentWorker, type EnrichmentWorker } from '../src/enrichment-worker';
import { DUPLICATE_CANDIDATE_SQL } from '../src/incidents.repository';
import type { Logger } from '../src/logger';
import { scoreIncident } from '../src/priority';
import { ENRICH_JOB_OPTIONS, enqueueEnrichment } from '../src/sweeper';
import { insertIncident, startStack, stopStack, type IncidentFixture, type LatLon, type TestStack } from './support/stack';

interface PublishedEvent {
  name: string;
  rooms: string[];
  payload: Record<string, unknown>;
}

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

const HOUR_MS = 3_600_000;
const METRES_PER_DEGREE_OF_LATITUDE = 111_000;

// Every test reports around its own point, kilometres from the others, so no test's reports
// fall inside another test's duplicate radius.
const spot = (index: number): LatLon => ({ lat: 26.02 + index * 0.03, lon: 85.95 });
const northOf = (point: LatLon, metres: number): LatLon => ({
  lat: point.lat + metres / METRES_PER_DEGREE_OF_LATITUDE,
  lon: point.lon,
});

const collectingLogger = (lines: string[]): Logger => ({
  info: () => undefined,
  warn: (message) => lines.push(message),
  error: (message) => lines.push(message),
});

describe('enrichment worker', () => {
  let stack: TestStack;
  let producerConnection: Redis;
  let queue: Queue<EnrichIncidentJob>;
  let subscriber: Redis;
  const runtimes: EnrichmentWorker[] = [];
  const published: PublishedEvent[] = [];
  const warnings: string[] = [];

  const startRuntime = (lines = warnings) => {
    const runtime = startEnrichmentWorker(stack.config, { logger: collectingLogger(lines), sweepIntervalMs: HOUR_MS });
    runtimes.push(runtime);
    return runtime;
  };

  // Adds the job exactly as the API's SOS path does.
  const enqueue = (incidentId: string) =>
    queue.add(ENRICH_JOB_NAME, { incidentId }, { ...ENRICH_JOB_OPTIONS, jobId: incidentId });

  const eventually = async <T>(probe: () => T | undefined | Promise<T | undefined>, description: string): Promise<T> => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const found = await probe();
      if (found !== undefined) return found;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  const eventsAbout = (name: string, incidentId: string) =>
    published.filter(
      (event) =>
        event.name === name && (name === 'review:created' ? event.payload.incidentId : event.payload.id) === incidentId,
    );

  const nextEvent = (name: string, incidentId: string) =>
    eventually(() => eventsAbout(name, incidentId)[0], `${name} for ${incidentId}`);

  const jobReaches = (source: Queue<EnrichIncidentJob>, incidentId: string, state: string) =>
    eventually(async () => ((await source.getJobState(incidentId)) === state ? true : undefined), `job ${incidentId} ${state}`);

  const reviewsOf = async (incidentIds: string[]) =>
    (
      await stack.db.query(
        `SELECT incident_id, reason::text AS reason, related_incident_id, flagged_by, status::text AS status
         FROM incident_reviews WHERE incident_id = ANY($1::uuid[]) ORDER BY created_at`,
        [incidentIds],
      )
    ).rows;

  const statusesOf = async (incidentIds: string[]) =>
    (
      await stack.db.query<{ status: string }>(
        'SELECT status::text AS status FROM incidents WHERE id = ANY($1::uuid[]) ORDER BY created_at',
        [incidentIds],
      )
    ).rows.map((row) => row.status);

  const scoreOf = async (incidentId: string) =>
    (
      await stack.db.query<{ priority_score: number | null }>(
        'SELECT priority_score::float8 AS priority_score FROM incidents WHERE id = $1::uuid',
        [incidentId],
      )
    ).rows[0]!.priority_score;

  // ioredis leaves a 2-second timer behind for a connection dropped while it retries, so the test's
  // own clients are dropped before Redis goes away.
  const disconnectTestClients = () => {
    for (const connection of [subscriber, producerConnection]) {
      if (connection && connection.status !== 'end') connection.disconnect();
    }
  };

  beforeAll(async () => {
    stack = await startStack();
    startRuntime();

    producerConnection = new Redis(stack.config.redisUrl).on('error', () => undefined);
    queue = new Queue<EnrichIncidentJob>(INCIDENT_ENRICHMENT_QUEUE, { connection: producerConnection });
    queue.on('error', () => undefined);
    subscriber = new Redis(stack.config.redisUrl).on('error', () => undefined);
    subscriber.on('message', (_channel: string, message: string) => published.push(JSON.parse(message) as PublishedEvent));
    await subscriber.subscribe(DOMAIN_EVENTS_CHANNEL);
  });

  afterAll(async () => {
    disconnectTestClients();
    await Promise.all(runtimes.map((runtime) => runtime.stop()));
    await stopStack(stack);
  });

  it('scores a report, leaves its status alone and tells its district and incident rooms', async () => {
    const id = await insertIncident(stack, { type: 'FLOOD', location: spot(0), peopleAffected: 4, hasChildren: true });

    await enqueue(id);
    const enriched = await nextEvent('incident:enriched', id);

    const row = (
      await stack.db.query<{ priority_score: number; severity_level: number; status: string }>(
        'SELECT priority_score::float8 AS priority_score, severity_level, status::text AS status FROM incidents WHERE id = $1',
        [id],
      )
    ).rows[0]!;
    const expected = scoreIncident({
      type: 'FLOOD',
      peopleAffected: 4,
      hasElderly: false,
      hasChildren: true,
      hasInjured: false,
      isSos: false,
      minutesWaiting: 0,
    });
    expect(enriched.rooms).toEqual([`district:${stack.districtId}`, `incident:${id}`]);
    expect(enriched.payload).toEqual({ id, priorityScore: row.priority_score, severityLevel: row.severity_level, flags: [] });
    expect(row.priority_score).toBeCloseTo(expected.priorityScore, 1);
    expect(row.severity_level).toBe(expected.severityLevel);
    expect(row.status).toBe('REPORTED');
    expect(await reviewsOf([id])).toEqual([]);
  });

  it('flags a flood report 60 m from an earlier one, 8 minutes later, as its possible duplicate', async () => {
    const first = await insertIncident(stack, { type: 'FLOOD', location: spot(1), reportedMinutesAgo: 8 });
    const second = await insertIncident(stack, { type: 'FLOOD', location: northOf(spot(1), 60) });

    await Promise.all([enqueue(first), enqueue(second)]);
    const [firstEnriched, secondEnriched, created] = await Promise.all([
      nextEvent('incident:enriched', first),
      nextEvent('incident:enriched', second),
      nextEvent('review:created', second),
    ]);

    expect(firstEnriched.payload.flags).toEqual([]);
    expect(secondEnriched.payload.flags).toEqual(['POSSIBLE_DUPLICATE']);
    expect(created.rooms).toEqual([`district:${stack.districtId}`]);
    expect(created.payload).toMatchObject({
      incidentId: second,
      reason: 'POSSIBLE_DUPLICATE',
      relatedIncidentId: first,
      flaggedBy: null,
      status: 'PENDING',
      details: { distanceM: expect.closeTo(60, 0), minutesApart: expect.closeTo(8, 0) },
    });
    expect(await reviewsOf([first, second])).toEqual([
      { incident_id: second, reason: 'POSSIBLE_DUPLICATE', related_incident_id: first, flagged_by: null, status: 'PENDING' },
    ]);
    expect(await statusesOf([first, second])).toEqual(['REPORTED', 'REPORTED']);
  });

  it.each<{ scenario: string; at: LatLon; first: Partial<IncidentFixture>; second: Partial<IncidentFixture> }>([
    { scenario: '400 m away', at: spot(2), first: {}, second: { location: northOf(spot(2), 400) } },
    { scenario: 'of another type', at: spot(3), first: {}, second: { type: 'FIRE' } },
    { scenario: 'reported 20 minutes later', at: spot(4), first: { reportedMinutesAgo: 20 }, second: {} },
    { scenario: 'next to a report already resolved', at: spot(5), first: { status: 'RESOLVED' }, second: {} },
  ])('does not flag a second report $scenario', async ({ at, first, second }) => {
    const firstId = await insertIncident(stack, { type: 'FLOOD', location: at, ...first });
    const secondId = await insertIncident(stack, { type: 'FLOOD', location: northOf(at, 30), ...second });

    await enqueue(secondId);
    const enriched = await nextEvent('incident:enriched', secondId);

    expect(enriched.payload.flags).toEqual([]);
    expect(await reviewsOf([firstId, secondId])).toEqual([]);
  });

  it('flags a location-less SOS as LOCATION_UNCERTAIN, once however often it is enriched', async () => {
    const id = await insertIncident(stack, { type: 'OTHER', isSos: true, location: null });

    await enqueue(id);
    const [enriched, created] = await Promise.all([nextEvent('incident:enriched', id), nextEvent('review:created', id)]);
    expect(enriched.payload.flags).toEqual(['LOCATION_UNCERTAIN']);
    expect(created.payload).toMatchObject({ reason: 'LOCATION_UNCERTAIN', relatedIncidentId: null, flaggedBy: null });

    await jobReaches(queue, id, 'completed');
    await expect(enqueueEnrichment(queue, id)).resolves.toBe('retried');
    await eventually(() => (eventsAbout('incident:enriched', id).length === 2 ? true : undefined), 'the second enrichment');
    await jobReaches(queue, id, 'completed');
    // A PING round trip delivers anything Redis published to the subscriber before it.
    await subscriber.ping();

    expect(eventsAbout('incident:enriched', id).map((event) => event.payload.flags)).toEqual([
      ['LOCATION_UNCERTAIN'],
      ['LOCATION_UNCERTAIN'],
    ]);
    expect(eventsAbout('review:created', id)).toHaveLength(1);
    expect(await reviewsOf([id])).toEqual([
      { incident_id: id, reason: 'LOCATION_UNCERTAIN', related_incident_id: null, flagged_by: null, status: 'PENDING' },
    ]);
    expect(await statusesOf([id])).toEqual(['REPORTED']);
  });

  it('scores a report closed before enrichment ran, but sends it to no review and keeps it closed', async () => {
    const id = await insertIncident(stack, { type: 'OTHER', isSos: true, location: null, status: 'RESOLVED' });

    await enqueue(id);
    const enriched = await nextEvent('incident:enriched', id);

    expect(enriched.payload).toMatchObject({ flags: [], priorityScore: expect.any(Number) });
    expect(await reviewsOf([id])).toEqual([]);
    expect(await statusesOf([id])).toEqual(['RESOLVED']);
  });

  it('sweeps open incidents left unscored for over a minute into the queue, and nothing else', async () => {
    const lost = await insertIncident(stack, { location: spot(6), createdMinutesAgo: 5 });
    const justArrived = await insertIncident(stack, { location: spot(7) });
    const resolved = await insertIncident(stack, { location: spot(8), createdMinutesAgo: 5, status: 'RESOLVED' });

    const result = await runtimes[0]!.sweep();
    const enriched = await nextEvent('incident:enriched', lost);

    expect(result.added).toBeGreaterThanOrEqual(1);
    expect(enriched.payload.priorityScore).toEqual(expect.any(Number));
    expect(await queue.getJobState(justArrived)).toBe('unknown');
    expect(await queue.getJobState(resolved)).toBe('unknown');
  });

  it('retries a job that ran out of attempts, where a plain add with the same id is ignored', async () => {
    const queueName = `${INCIDENT_ENRICHMENT_QUEUE}-exhausted-test`;
    const connection = new Redis(stack.config.redisUrl, { maxRetriesPerRequest: null }).on('error', () => undefined);
    const exhaustedQueue = new Queue<EnrichIncidentJob>(queueName, { connection }).on('error', () => undefined);
    const failingWorker = new Worker<EnrichIncidentJob>(
      queueName,
      async () => {
        throw new Error('database unavailable');
      },
      { connection },
    ).on('error', () => undefined);
    const incidentId = randomUUID();

    try {
      await exhaustedQueue.add(ENRICH_JOB_NAME, { incidentId }, { jobId: incidentId, attempts: 1 });
      await jobReaches(exhaustedQueue, incidentId, 'failed');
      await failingWorker.close();

      await exhaustedQueue.add(ENRICH_JOB_NAME, { incidentId }, { jobId: incidentId });
      expect(await exhaustedQueue.getJobState(incidentId)).toBe('failed');

      await expect(enqueueEnrichment(exhaustedQueue, incidentId)).resolves.toBe('retried');
      expect(await exhaustedQueue.getJobState(incidentId)).toBe('waiting');
    } finally {
      await failingWorker.close();
      await exhaustedQueue.obliterate({ force: true });
      await exhaustedQueue.close();
      connection.disconnect();
    }
  });

  it('finds duplicate candidates through the GiST index at district scale', async () => {
    await stack.db.query('BEGIN');
    try {
      await stack.db.query('SELECT setseed(0.42)');
      await stack.db.query(
        `INSERT INTO incidents (client_uuid, district_id, reporter_id, type, location, location_source, reported_at)
         SELECT gen_random_uuid(), $1::int, $2::uuid, (enum_range(NULL::disaster_type))[1 + floor(random() * 7)::int],
                ST_SetSRID(ST_MakePoint(85.68 + random() * 0.72, 25.87 + random() * 0.57), 4326)::geography,
                'GPS', now() - random() * interval '6 hours'
         FROM generate_series(1, 50000)`,
        [stack.districtId, stack.reporterId],
      );
      await stack.db.query('ANALYZE incidents');
      const id = await insertIncident(stack, { location: spot(9) });

      const explained = await stack.db.query<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${DUPLICATE_CANDIDATE_SQL}`,
        [id, [...OPEN_INCIDENT_STATUSES], 150, 15],
      );
      const nodes = flatten(explained.rows[0]!['QUERY PLAN'][0].Plan);

      expect(nodes.map((node) => node['Index Name'])).toContain('incidents_location_gist');
      expect(nodes.map((node) => node['Node Type'])).not.toContain('Seq Scan');
    } finally {
      await stack.db.query('ROLLBACK');
    }
  });

  it('has hazard weights for every disaster type the schema defines', async () => {
    const result = await stack.db.query<{ values: string[] }>('SELECT enum_range(NULL::disaster_type)::text[] AS values');

    expect(result.rows[0]!.values).toEqual([...DISASTER_TYPES]);
  });

  it('logged no failed jobs or connection errors while its dependencies were up', () => {
    expect(warnings).toEqual([]);
  });

  it('lets the job in hand finish before it stops', async () => {
    await runtimes[0]!.stop();
    const draining = startRuntime();
    const id = await insertIncident(stack, { location: spot(10) });

    // Holding the row lock parks the job at its UPDATE, so it is still running when stop() begins.
    let stopping: Promise<void> | undefined;
    await stack.db.query('BEGIN');
    try {
      await stack.db.query('SELECT id FROM incidents WHERE id = $1::uuid FOR UPDATE', [id]);
      await enqueue(id);
      await jobReaches(queue, id, 'active');

      stopping = draining.stop();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await queue.getJobState(id)).toBe('active');
    } finally {
      await stack.db.query('ROLLBACK');
    }
    await stopping;

    expect(await queue.getJobState(id)).toBe('completed');
    expect(await scoreOf(id)).toEqual(expect.any(Number));
    expect(warnings).toEqual([]);
  });

  it('stops within a few seconds while Redis is down', async () => {
    const runtime = startRuntime([]);
    const id = await insertIncident(stack, { location: spot(11) });
    await enqueue(id);
    await nextEvent('incident:enriched', id);
    disconnectTestClients();

    await stack.redis.stop();
    const started = Date.now();
    await runtime.stop();

    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}
