import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

// Data directories live in tmpfs: these images declare VOLUMEs, and every test run would
// otherwise leave an anonymous volume on disk.

export function startPostgis(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer('postgis/postgis:16-3.4').withTmpFs({ '/var/lib/postgresql/data': 'rw' }).start();
}

export function startRedis(): Promise<StartedTestContainer> {
  return new GenericContainer('redis:7.4-alpine')
    .withTmpFs({ '/data': 'rw' })
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
}
