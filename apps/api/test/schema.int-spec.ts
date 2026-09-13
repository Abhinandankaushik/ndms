import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { Client, type DatabaseError } from 'pg';
import { DB_ENUMS } from '../src/common/domain/enums';
import { startPostgis } from './support/containers';
import { applyMigrations } from './support/migrations';

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

const UNINDEXED_SPATIAL_COLUMNS = `
  SELECT c.relname AS table_name, a.attname AS column_name
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND t.typname IN ('geography', 'geometry')
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_am am ON am.oid = ic.relam
      WHERE i.indrelid = c.oid AND am.amname = 'gist' AND i.indkey[0] = a.attnum
    )`;

const SPATIAL_COLUMN_COUNT = `
  SELECT count(*)::int AS count
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND t.typname IN ('geography', 'geometry') AND NOT a.attisdropped`;

const QUERY_POINT = `ST_SetSRID(ST_MakePoint(80.5, 20.5), 4326)::geography`;

describe('schema v1 on real PostGIS', () => {
  let container: StartedPostgreSqlContainer;
  let db: Client;
  let districtId: number;
  let reporterId: string;

  beforeAll(async () => {
    container = await startPostgis();
    db = new Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    await applyMigrations(db);

    const district = await db.query<{ id: number }>(
      `INSERT INTO districts (name, state, boundary)
       VALUES ('Schema test', 'Synthetic', ST_Multi(ST_MakeEnvelope(80, 20, 81, 21, 4326))::geography)
       RETURNING id`,
    );
    const reporter = await db.query<{ id: string }>(`INSERT INTO users (phone) VALUES ('+910000000001') RETURNING id`);
    districtId = district.rows[0]!.id;
    reporterId = reporter.rows[0]!.id;
  });

  afterAll(async () => {
    await db?.end();
    await container?.stop();
  });

  it.each(Object.entries(DB_ENUMS))('keeps the %s enum in sync with src/common/domain/enums.ts', async (name, values) => {
    const result = await db.query<{ values: string[] }>(`SELECT enum_range(NULL::${name})::text[] AS values`);

    expect(result.rows[0]!.values).toEqual([...values]);
  });

  it('gives every spatial column a GiST index led by that column', async () => {
    const spatial = await db.query<{ count: number }>(SPATIAL_COLUMN_COUNT);
    const unindexed = await db.query(UNINDEXED_SPATIAL_COLUMNS);

    expect(spatial.rows[0]!.count).toBeGreaterThan(0);
    expect(unindexed.rows).toEqual([]);
  });

  describe('with 50,000 incidents', () => {
    beforeAll(async () => {
      await db.query('SELECT setseed(0.42)');
      await db.query(
        `INSERT INTO incidents (client_uuid, district_id, reporter_id, location, location_source, reported_at)
         SELECT gen_random_uuid(), $1, $2,
                ST_SetSRID(ST_MakePoint(80 + random(), 20 + random()), 4326)::geography, 'GPS', now()
         FROM generate_series(1, 50000)`,
        [districtId, reporterId],
      );
      await db.query('ANALYZE incidents');
    });

    it.each([
      ['an ST_DWithin radius', `SELECT id FROM incidents WHERE ST_DWithin(location, ${QUERY_POINT}, 1000)`],
      [
        'a viewport bounding box',
        `SELECT id FROM incidents WHERE location && ST_MakeEnvelope(80.40, 20.40, 80.45, 20.45, 4326)::geography`,
      ],
      ['nearest-neighbour ordering', `SELECT id FROM incidents ORDER BY location <-> ${QUERY_POINT} LIMIT 5`],
    ])('serves %s from the GiST index, not a sequential scan', async (_shape, sql) => {
      const nodes = await explain(db, sql);

      expect(nodes.map((node) => node['Index Name'])).toContain('incidents_location_gist');
      expect(nodes.map((node) => node['Node Type'])).not.toContain('Seq Scan');
    });
  });

  it('turns a replayed client_uuid into an update of the same row', async () => {
    const clientUuid = randomUUID();
    const upsert = `
      INSERT INTO incidents (client_uuid, district_id, reporter_id, location_source, reported_at)
      VALUES ($1, $2, $3, 'NONE', now())
      ON CONFLICT (client_uuid) DO UPDATE SET updated_at = now()
      RETURNING id, (xmax = 0) AS was_inserted`;

    const first = await db.query(upsert, [clientUuid, districtId, reporterId]);
    const replay = await db.query(upsert, [clientUuid, districtId, reporterId]);

    expect(first.rows[0]).toEqual({ id: expect.any(String), was_inserted: true });
    expect(replay.rows[0]).toEqual({ id: first.rows[0].id, was_inserted: false });
  });

  describe('reported_at from the device clock', () => {
    const insert = (reportedAt: string) => `
      INSERT INTO incidents (client_uuid, district_id, reporter_id, location_source, reported_at)
      VALUES ($1, $2, $3, 'NONE', ${reportedAt})
      RETURNING reported_at, created_at`;
    const clamped = `LEAST(GREATEST($4::timestamptz, now() - interval '24 hours'), now())`;
    const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);

    it.each([
      ['ahead of the server', 5],
      ['more than 24 hours old', -72],
    ])('rejects an unclamped value %s', async (_case, hours) => {
      const attempt = db.query(insert('$4'), [randomUUID(), districtId, reporterId, hoursFromNow(hours)]);

      await expect(attempt).rejects.toMatchObject({ constraint: 'incidents_reported_at_clamped' });
    });

    it('stores a clamped value at the edges of the window', async () => {
      const future = await db.query(insert(clamped), [randomUUID(), districtId, reporterId, hoursFromNow(5)]);
      const stale = await db.query(insert(clamped), [randomUUID(), districtId, reporterId, hoursFromNow(-72)]);

      expect(future.rows[0].reported_at).toEqual(future.rows[0].created_at);
      expect(stale.rows[0].created_at.getTime() - stale.rows[0].reported_at.getTime()).toBe(24 * 3_600_000);
    });
  });

  describe('incident_status_log', () => {
    let incidentId: string;

    beforeAll(async () => {
      const incident = await db.query<{ id: string }>(
        `INSERT INTO incidents (client_uuid, district_id, reporter_id, location_source, reported_at)
         VALUES ($1, $2, $3, 'NONE', now()) RETURNING id`,
        [randomUUID(), districtId, reporterId],
      );
      incidentId = incident.rows[0]!.id;
      await db.query(
        `INSERT INTO incident_status_log (incident_id, to_status, changed_by) VALUES ($1, 'REPORTED', $2)`,
        [incidentId, reporterId],
      );
    });

    it('refuses a rejection that no person made', async () => {
      const attempt = db.query(
        `INSERT INTO incident_status_log (incident_id, from_status, to_status) VALUES ($1, 'REPORTED', 'REJECTED_FAKE')`,
        [incidentId],
      );

      await expect(attempt).rejects.toMatchObject({ constraint: 'incident_status_log_rejection_has_actor' });
    });

    it.each([
      ['UPDATE', `UPDATE incident_status_log SET note = 'rewritten' WHERE incident_id = $1`],
      ['DELETE', `DELETE FROM incident_status_log WHERE incident_id = $1`],
    ])('refuses %s', async (_statement, sql) => {
      const attempt = db.query(sql, [incidentId]);

      await expect(attempt).rejects.toMatchObject<Partial<DatabaseError>>({
        message: 'incident_status_log is append-only',
      });
    });
  });
});

async function explain(db: Client, sql: string): Promise<PlanNode[]> {
  const result = await db.query<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`);
  return flatten(result.rows[0]!['QUERY PLAN'][0].Plan);
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}
