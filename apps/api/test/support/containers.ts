import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

export const MINIO_CREDENTIALS = { user: 'ndms-test', password: 'ndms-test-password' } as const;

export function startPostgis(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer('postgis/postgis:16-3.4').start();
}

export function startRedis(): Promise<StartedTestContainer> {
  return new GenericContainer('redis:7.4-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
}

export function startMinio(): Promise<StartedTestContainer> {
  return new GenericContainer('pgsty/minio:RELEASE.2026-08-04T00-00-00Z')
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: MINIO_CREDENTIALS.user, MINIO_ROOT_PASSWORD: MINIO_CREDENTIALS.password })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
    .start();
}
