import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import type { StartedTestContainer } from 'testcontainers';
import type { WorkerConfig } from '../../src/config';
import type { DisasterType, IncidentStatus } from '../../src/contract';
import { startPostgis, startRedis } from './containers';
import { applyMigrations } from './migrations';

const DARBHANGA_BOUNDARY = path.resolve(__dirname, '../../../../data/seed/darbhanga/district.geojson');

export interface TestStack {
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  config: WorkerConfig;
  db: Client;
  districtId: number;
  reporterId: string;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export async function startStack(): Promise<TestStack> {
  const [postgres, redis] = await Promise.all([startPostgis(), startRedis()]);
  const db = new Client({ connectionString: postgres.getConnectionUri() });
  await db.connect();
  await applyMigrations(db);

  return {
    postgres,
    redis,
    db,
    config: {
      databaseUrl: postgres.getConnectionUri(),
      redisUrl: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    },
    districtId: await seedDarbhanga(db),
    reporterId: await createReporter(db),
  };
}

export async function stopStack(stack: TestStack | undefined): Promise<void> {
  if (!stack) return;
  await stack.db.end().catch(() => undefined);
  await Promise.allSettled([stack.postgres.stop(), stack.redis.stop()]);
}

// Loads the real Darbhanga boundary so spatial tests run against production geometry.
async function seedDarbhanga(db: Client): Promise<number> {
  const geojson = JSON.parse(await readFile(DARBHANGA_BOUNDARY, 'utf8')) as { features: { geometry: unknown }[] };
  const result = await db.query<{ id: number }>(
    `INSERT INTO districts (name, state, boundary)
     VALUES ('Darbhanga', 'Bihar', ST_Multi(ST_GeomFromGeoJSON($1::text))::geography)
     RETURNING id`,
    [JSON.stringify(geojson.features[0]!.geometry)],
  );
  return result.rows[0]!.id;
}

async function createReporter(db: Client): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO users (phone, full_name, phone_verified_at) VALUES ('+919000000001', 'Test reporter', now()) RETURNING id`,
  );
  return result.rows[0]!.id;
}

export interface IncidentFixture {
  type?: DisasterType;
  status?: IncidentStatus;
  isSos?: boolean;
  location: LatLon | null;
  peopleAffected?: number;
  hasElderly?: boolean;
  hasChildren?: boolean;
  hasInjured?: boolean;
  reportedMinutesAgo?: number;
  createdMinutesAgo?: number;
}

// Inserts the row the API would have written, bypassing the API: the worker only ever reads it.
export async function insertIncident(stack: TestStack, fixture: IncidentFixture): Promise<string> {
  const createdMinutesAgo = fixture.createdMinutesAgo ?? 0;
  const result = await stack.db.query<{ id: string }>(
    `INSERT INTO incidents (client_uuid, district_id, reporter_id, type, status, is_sos, location, location_source,
                            people_affected, has_elderly, has_children, has_injured, reported_at, created_at)
     VALUES (gen_random_uuid(), $1::int, $2::uuid, $3::disaster_type, $4::incident_status, $5::boolean,
             CASE WHEN $6::float8 IS NULL THEN NULL
                  ELSE ST_SetSRID(ST_MakePoint($6::float8, $7::float8), 4326)::geography END,
             $8::location_source, $9::int, $10::boolean, $11::boolean, $12::boolean,
             now() - make_interval(secs => $13::float8 * 60), now() - make_interval(secs => $14::float8 * 60))
     RETURNING id`,
    [
      stack.districtId,
      stack.reporterId,
      fixture.type ?? 'FLOOD',
      fixture.status ?? 'REPORTED',
      fixture.isSos ?? false,
      fixture.location?.lon ?? null,
      fixture.location?.lat ?? null,
      fixture.location ? 'GPS' : 'NONE',
      fixture.peopleAffected ?? 1,
      fixture.hasElderly ?? false,
      fixture.hasChildren ?? false,
      fixture.hasInjured ?? false,
      fixture.reportedMinutesAgo ?? createdMinutesAgo,
      createdMinutesAgo,
    ],
  );
  return result.rows[0]!.id;
}
