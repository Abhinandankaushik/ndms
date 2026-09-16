import { Logger } from '@nestjs/common';
import { DECISION_BUDGET_MS, SlidingWindowLimiter, type RateLimitRedis } from './sliding-window.limiter';

type Replies = [Error | null, unknown][] | null;

const NOW = 1_800_000_000_000;
const HOUR_SECONDS = 3_600;

function fakeRedis(exec: () => Promise<Replies>) {
  const commands: unknown[][] = [];
  const chain: Record<string, unknown> = { exec };
  for (const command of ['zremrangebyscore', 'zadd', 'zcard', 'zrange', 'pexpire']) {
    chain[command] = (...args: unknown[]) => {
      commands.push([command, ...args]);
      return chain;
    };
  }
  const zrem = jest.fn(() => Promise.resolve(1));
  return { redis: { multi: () => chain, zrem } as unknown as RateLimitRedis, zrem, commands };
}

const windowReplies = (count: number, oldest: unknown): Replies => [[null, 0], [null, 1], [null, count], [null, oldest], [null, 1]];

describe('SlidingWindowLimiter', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('slides the window in one transaction: trim, add, count, read the oldest, refresh the expiry', async () => {
    const { redis, commands } = fakeRedis(async () => windowReplies(1, ['a', String(NOW)]));

    await new SlidingWindowLimiter(redis).consume('reports:user:1', 10, HOUR_SECONDS);

    const key = 'ratelimit:reports:user:1';
    expect(commands).toEqual([
      ['zremrangebyscore', key, '-inf', NOW - HOUR_SECONDS * 1000],
      ['zadd', key, NOW, expect.stringMatching(new RegExp(`^${NOW}:`))],
      ['zcard', key],
      ['zrange', key, '0', '0', 'WITHSCORES'],
      ['pexpire', key, HOUR_SECONDS * 1000],
    ]);
  });

  it('allows a request that keeps the window at the limit', async () => {
    const { redis, zrem } = fakeRedis(async () => windowReplies(10, ['a', String(NOW - 5_000)]));

    await expect(new SlidingWindowLimiter(redis).consume('reports:user:1', 10, HOUR_SECONDS)).resolves.toEqual({ allowed: true });
    expect(zrem).not.toHaveBeenCalled();
  });

  it('refuses past the limit, gives the slot back and waits for the oldest request to leave the window', async () => {
    const { redis, zrem } = fakeRedis(async () => windowReplies(11, ['a', String(NOW - 600_000)]));

    const decision = await new SlidingWindowLimiter(redis).consume('reports:user:1', 10, HOUR_SECONDS);

    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 3_000 });
    expect(zrem).toHaveBeenCalledWith('ratelimit:reports:user:1', expect.stringMatching(new RegExp(`^${NOW}:`)));
  });

  it('reads the oldest score from a RESP3 nested pair', async () => {
    const { redis } = fakeRedis(async () => windowReplies(11, [['a', NOW - 600_000]]));

    await expect(new SlidingWindowLimiter(redis).consume('reports:user:1', 10, HOUR_SECONDS)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 3_000,
    });
  });

  it.each([
    ['Redis is unreachable', () => Promise.reject(new Error("Stream isn't writeable"))],
    ['a command in the transaction fails', async (): Promise<Replies> => [[null, 0], [new Error('WRONGTYPE'), null], [null, 1], [null, []], [null, 1]]],
    ['the transaction is discarded', async (): Promise<Replies> => null],
  ])('fails open when %s', async (_case, exec) => {
    const { redis } = fakeRedis(exec);

    await expect(new SlidingWindowLimiter(redis).consume('reports:user:1', 10, HOUR_SECONDS)).resolves.toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('fails open when Redis does not answer within the budget', async () => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
    const { redis } = fakeRedis(() => new Promise<never>(() => {}));
    let settled = false;

    const decision = new SlidingWindowLimiter(redis).consume('reports:user:1', 10, HOUR_SECONDS).finally(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(DECISION_BUDGET_MS - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    await expect(decision).resolves.toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${DECISION_BUDGET_MS} ms`));
  });

  it('warns at most once a minute while failing open', async () => {
    const { redis } = fakeRedis(() => Promise.reject(new Error('ECONNREFUSED')));
    const limiter = new SlidingWindowLimiter(redis);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await limiter.consume('reports:user:1', 10, HOUR_SECONDS);
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
