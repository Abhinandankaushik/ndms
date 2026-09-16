import { loadConfig } from './config';

describe('loadConfig', () => {
  it('reads the database and Redis URLs', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://ndms:secret@postgres:5432/ndms',
      REDIS_URL: 'redis://redis:6379',
    });

    expect(config).toEqual({ databaseUrl: 'postgresql://ndms:secret@postgres:5432/ndms', redisUrl: 'redis://redis:6379' });
  });

  it('names every missing or malformed variable in one error', () => {
    const load = () => loadConfig({ DATABASE_URL: 'mysql://ndms:secret@db/ndms', REDIS_URL: ' ' });

    expect(load).toThrow('DATABASE_URL must use postgres:// or postgresql://');
    expect(load).toThrow('REDIS_URL is required');
  });

  it('never echoes a URL, because URLs carry passwords', () => {
    const load = () => loadConfig({ DATABASE_URL: 'not a url with hunter2', REDIS_URL: 'http://:hunter2@redis' });

    expect(load).toThrow('DATABASE_URL is not a valid URL');
    expect(load).not.toThrow(/hunter2/);
  });
});
