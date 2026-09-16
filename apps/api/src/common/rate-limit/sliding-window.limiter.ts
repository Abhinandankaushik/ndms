import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export const RATE_LIMIT_REDIS = Symbol('RATE_LIMIT_REDIS');
export const DECISION_BUDGET_MS = 150;

export type RateLimitRedis = Pick<Redis, 'multi' | 'zrem'>;

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type TransactionReplies = [error: Error | null, reply: unknown][] | null;

const KEY_PREFIX = 'ratelimit';
const WARNING_INTERVAL_MS = 60_000;
const ALLOW: RateLimitDecision = { allowed: true };

@Injectable()
export class SlidingWindowLimiter {
  private readonly logger = new Logger(SlidingWindowLimiter.name);
  private lastWarnedAt = Number.NEGATIVE_INFINITY;

  constructor(@Inject(RATE_LIMIT_REDIS) private readonly redis: RateLimitRedis) {}

  // Fails open: the limiter only guards against abuse, so a slow or missing Redis must
  // never stop people from filing reports or signing in.
  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    try {
      return await withinBudget(this.slideWindow(`${KEY_PREFIX}:${key}`, limit, windowSeconds * 1000), DECISION_BUDGET_MS);
    } catch (error) {
      this.warnThrottled(`Rate limits not enforced: ${error instanceof Error ? error.message : String(error)}`);
      return ALLOW;
    }
  }

  private async slideWindow(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const member = `${now}:${randomUUID()}`;
    const replies = await this.redis
      .multi()
      .zremrangebyscore(key, '-inf', now - windowMs)
      .zadd(key, now, member)
      .zcard(key)
      .zrange(key, '0', '0', 'WITHSCORES')
      .pexpire(key, windowMs)
      .exec();

    const { count, oldestAt } = readWindow(replies);
    if (count <= limit) return ALLOW;

    // A refused request hands its slot back; otherwise a client retrying before
    // Retry-After would keep pushing its own window forward.
    this.redis.zrem(key, member).catch(() => undefined);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldestAt + windowMs - now) / 1000)) };
  }

  private warnThrottled(message: string): void {
    const now = Date.now();
    if (now - this.lastWarnedAt < WARNING_INTERVAL_MS) return;
    this.lastWarnedAt = now;
    this.logger.warn(message);
  }
}

function readWindow(replies: TransactionReplies): { count: number; oldestAt: number } {
  if (!replies) throw new Error('rate limit transaction was discarded');
  for (const [error] of replies) {
    if (error) throw error;
  }
  const count = replies[2]?.[1];
  const oldest = replies[3]?.[1];
  // RESP2 answers WITHSCORES as [member, score]; RESP3 nests the pair.
  const oldestAt = Array.isArray(oldest) ? Number(oldest.flat()[1]) : Number.NaN;
  if (typeof count !== 'number' || !Number.isFinite(oldestAt)) throw new Error('unexpected rate limit reply');
  return { count, oldestAt };
}

function withinBudget<T>(operation: Promise<T>, budgetMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis did not answer within ${budgetMs} ms`)), budgetMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
