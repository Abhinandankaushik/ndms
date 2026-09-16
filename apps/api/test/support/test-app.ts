import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { AppModule } from '../../src/app.module';
import { RateLimitGuard } from '../../src/common/rate-limit/rate-limit.guard';
import { configureApp } from '../../src/app.setup';
import { ENV, parseEnv, type Env } from '../../src/config/env';
import { MINIO_CREDENTIALS, startMinio, startPostgis, startRedis } from './containers';
import { applyMigrations } from './migrations';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const DEV_OTP = '123456';
export const TEST_BUCKET = 'ndms-test';

const DARBHANGA_BOUNDARY = path.resolve(__dirname, '../../../../data/seed/darbhanga/district.geojson');

export interface TestStack {
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  minio: StartedTestContainer | null;
}

export interface TestApp {
  app: INestApplication;
  env: Env;
  db: Client;
  districtId: number;
  baseUrl: string;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function startStack(options: { minio?: boolean } = {}): Promise<TestStack> {
  const [postgres, redis, minio] = await Promise.all([
    startPostgis(),
    startRedis(),
    options.minio ? startMinio() : Promise.resolve(null),
  ]);
  return { postgres, redis, minio };
}

export async function stopStack(stack: TestStack | undefined): Promise<void> {
  if (!stack) return;
  await Promise.allSettled([stack.postgres.stop(), stack.redis.stop(), stack.minio?.stop()]);
}

// Loads the real Darbhanga boundary so spatial tests run against production geometry.
export async function seedDarbhanga(db: Client): Promise<number> {
  const geojson = JSON.parse(await readFile(DARBHANGA_BOUNDARY, 'utf8')) as {
    features: { geometry: unknown }[];
  };
  const result = await db.query<{ id: number }>(
    `INSERT INTO districts (name, state, boundary)
     VALUES ('Darbhanga', 'Bihar', ST_Multi(ST_GeomFromGeoJSON($1))::geography)
     RETURNING id`,
    [JSON.stringify(geojson.features[0]!.geometry)],
  );
  return result.rows[0]!.id;
}

export async function createTestApp(
  stack: TestStack,
  options: { imports?: ModuleMetadata['imports']; env?: Record<string, string>; rateLimit?: boolean } = {},
): Promise<TestApp> {
  const db = new Client({ connectionString: stack.postgres.getConnectionUri() });
  await db.connect();
  await applyMigrations(db);
  const districtId = await seedDarbhanga(db);

  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: stack.postgres.getConnectionUri(),
    REDIS_URL: `redis://${stack.redis.getHost()}:${stack.redis.getMappedPort(6379)}`,
    S3_ENDPOINT: stack.minio
      ? `http://${stack.minio.getHost()}:${stack.minio.getMappedPort(9000)}`
      : 'http://127.0.0.1:1',
    S3_ACCESS_KEY_ID: MINIO_CREDENTIALS.user,
    S3_SECRET_ACCESS_KEY: MINIO_CREDENTIALS.password,
    S3_BUCKET: TEST_BUCKET,
    JWT_ACCESS_SECRET: TEST_JWT_SECRET,
    OTP_DEV_CODE: DEV_OTP,
    ...options.env,
  });

  const builder = Test.createTestingModule({ imports: [AppModule, ...(options.imports ?? [])] })
    .overrideProvider(ENV)
    .useValue(env);
  // Specs sign in many users from 127.0.0.1, which the per-IP OTP limit would reject;
  // only the spec that tests limiting asks for the real guard.
  if (!options.rateLimit) {
    builder.overrideProvider(RateLimitGuard).useValue({ canActivate: () => true });
  }
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };

  return {
    app,
    env,
    db,
    districtId,
    baseUrl: `http://127.0.0.1:${address.port}`,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}
