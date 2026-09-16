import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env';
import { AuthModule } from '../../modules/auth/auth.module';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMIT_REDIS, SlidingWindowLimiter } from './sliding-window.limiter';

// A dedicated connection without an offline queue: during an outage commands fail at once
// instead of waiting for a reconnect, and shutdown can drop the socket without Redis
// having to answer.
function connectLimiterRedis(env: Env): Redis {
  const redis = new Redis(env.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
  redis.on('error', () => undefined);
  return redis;
}

@Module({
  imports: [AuthModule],
  providers: [
    { provide: RATE_LIMIT_REDIS, inject: [ENV], useFactory: connectLimiterRedis },
    SlidingWindowLimiter,
    RateLimitGuard,
    // An alias rather than useClass, so a test suite that signs in many users from one IP
    // can switch limiting off with overrideProvider(RateLimitGuard).
    { provide: APP_GUARD, useExisting: RateLimitGuard },
  ],
})
export class RateLimitModule implements OnModuleDestroy {
  constructor(@Inject(RATE_LIMIT_REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
