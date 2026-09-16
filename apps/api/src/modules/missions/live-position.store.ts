import { Inject, Injectable } from '@nestjs/common';
import type { ChainableCommander, Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS } from '../../infra/redis/redis.module';
import { LIVE_POSITION_TTL_SECONDS, parseTeamPing, type TeamPing } from './live-location';

export const LIVE_POSITION_KEYS = {
  position: (teamId: string) => `team:loc:${teamId}`,
  buffer: 'team:pings:buffer',
  flushLock: 'team:pings:flush-lock',
};

// Deletes the lock only while it still holds our token, so a flush that overran its lock
// cannot release the lock of the flusher that took over.
const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0`;

// Compare-and-set: the throttle decides against the position it read, so the write only lands
// while that position is still the stored one. Two pings racing for one team can then neither
// both slip through the throttle nor roll the live position back.
const REPLACE_POSITION_SCRIPT = `
  if (redis.call('get', KEYS[1]) or '') ~= ARGV[1] then
    return 0
  end
  redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3])
  redis.call('rpush', KEYS[2], ARGV[2])
  return 1`;

export interface StoredPosition {
  raw: string | null;
  ping: TeamPing | null;
}

async function execOrThrow(transaction: ChainableCommander): Promise<unknown[]> {
  const results = await transaction.exec();
  if (!results) throw new Error('Redis transaction was discarded');
  return results.map(([error, value]) => {
    if (error) throw error;
    return value;
  });
}

@Injectable()
export class LivePositionStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async read(teamId: string): Promise<StoredPosition> {
    const raw = await this.redis.get(LIVE_POSITION_KEYS.position(teamId));
    return { raw, ping: parseTeamPing(raw) };
  }

  async readMany(teamIds: readonly string[]): Promise<Map<string, TeamPing>> {
    if (teamIds.length === 0) return new Map();
    const raws = await this.redis.mget(teamIds.map(LIVE_POSITION_KEYS.position));
    const positions = new Map<string, TeamPing>();
    raws.forEach((raw, index) => {
      const ping = parseTeamPing(raw);
      if (ping) positions.set(teamIds[index]!, ping);
    });
    return positions;
  }

  async replace(expected: StoredPosition, ping: TeamPing): Promise<boolean> {
    const replaced = await this.redis.eval(
      REPLACE_POSITION_SCRIPT,
      2,
      LIVE_POSITION_KEYS.position(ping.teamId),
      LIVE_POSITION_KEYS.buffer,
      expected.raw ?? '',
      JSON.stringify(ping),
      LIVE_POSITION_TTL_SECONDS,
    );
    return replaced === 1;
  }

  async acquireFlushLock(ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const reply = await this.redis.set(LIVE_POSITION_KEYS.flushLock, token, 'PX', ttlMs, 'NX');
    return reply === 'OK' ? token : null;
  }

  async releaseFlushLock(token: string): Promise<void> {
    await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, LIVE_POSITION_KEYS.flushLock, token);
  }

  // Read and trim in one MULTI: pings pushed meanwhile land behind the taken slice and stay buffered.
  async takeBuffered(max: number): Promise<string[]> {
    const [taken] = await execOrThrow(
      this.redis.multi().lrange(LIVE_POSITION_KEYS.buffer, 0, max - 1).ltrim(LIVE_POSITION_KEYS.buffer, max, -1),
    );
    return taken as string[];
  }

  async returnToBuffer(raws: readonly string[]): Promise<void> {
    if (raws.length === 0) return;
    await this.redis.lpush(LIVE_POSITION_KEYS.buffer, ...[...raws].reverse());
  }
}
