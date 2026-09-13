import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env';

export const REDIS = Symbol('REDIS');

const logger = new Logger('Redis');

function createRedisClient(env: Env): Redis {
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  let connected = true;
  client.on('ready', () => {
    if (!connected) logger.log('Connection restored');
    connected = true;
  });
  client.on('error', (error: Error) => {
    if (connected) logger.error(`Connection lost: ${error.message}`);
    connected = false;
  });
  return client;
}

@Global()
@Module({
  providers: [{ provide: REDIS, inject: [ENV], useFactory: createRedisClient }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
