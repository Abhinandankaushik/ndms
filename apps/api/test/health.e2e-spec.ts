import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ENV, parseEnv } from '../src/config/env';
import { MINIO_CREDENTIALS, startMinio, startPostgis, startRedis } from './support/containers';

describe('GET /api/v1/health', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let minio: StartedTestContainer;
  let app: INestApplication;

  beforeAll(async () => {
    [postgres, redis, minio] = await Promise.all([startPostgis(), startRedis(), startMinio()]);

    const env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      S3_ENDPOINT: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      S3_ACCESS_KEY_ID: MINIO_CREDENTIALS.user,
      S3_SECRET_ACCESS_KEY: MINIO_CREDENTIALS.password,
      S3_BUCKET: 'ndms-test',
    });
    await createBucket(env.S3_ENDPOINT, env.S3_BUCKET);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(env)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await Promise.allSettled([postgres?.stop(), redis?.stop(), minio?.stop()]);
  });

  it('reports ok, with the PostGIS version, when every dependency is up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      success: true,
      error: null,
      meta: null,
      data: {
        status: 'ok',
        checks: {
          database: { status: 'up', postgis: expect.stringMatching(/^3\.4 /) },
          redis: { status: 'up' },
          objectStorage: { status: 'up' },
        },
      },
    });
  });

  it('stays in service, degraded, when Redis goes down', async () => {
    await redis.stop();

    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body.data).toMatchObject({
      status: 'degraded',
      checks: { database: { status: 'up' }, redis: { status: 'down' }, objectStorage: { status: 'up' } },
    });
  });

  it('answers 503 in the error envelope when the database goes down', async () => {
    await postgres.stop();

    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);

    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        details: { status: 'down', checks: { database: { status: 'down' } } },
      },
    });
  });

  it('wraps unknown routes in the error envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

    expect(response.body).toEqual({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Cannot GET /api/v1/nope' },
      meta: null,
    });
  });
});

async function createBucket(endpoint: string, bucket: string): Promise<void> {
  const s3 = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: MINIO_CREDENTIALS.user, secretAccessKey: MINIO_CREDENTIALS.password },
  });
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } finally {
    s3.destroy();
  }
}
