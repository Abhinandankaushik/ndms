import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { parseTeamPing, type TeamPing } from './live-location';
import { LivePositionStore } from './live-position.store';
import { TeamsRepository } from './teams.repository';
import { errorMessage, throttledWarning } from './throttled-warning';

const FLUSH_INTERVAL_MS = 30_000;
// Shorter than the interval so a flusher that died holding the lock blocks at most one round.
const FLUSH_LOCK_TTL_MS = 25_000;
const BATCH_SIZE = 5_000;

const isPing = (ping: TeamPing | null): ping is TeamPing => ping !== null;

@Injectable()
export class TeamLocationFlusher implements OnModuleInit, OnModuleDestroy {
  private readonly warn = throttledWarning(new Logger(TeamLocationFlusher.name));
  private timer?: NodeJS.Timeout;
  private inFlight: Promise<number> | null = null;

  constructor(
    private readonly positions: LivePositionStore,
    private readonly teams: TeamsRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.flushNow(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.inFlight;
  }

  // Never rejects: an outage costs one round of warnings, and the buffer waits in Redis.
  flushNow(): Promise<number> {
    this.inFlight ??= this.flush().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async flush(): Promise<number> {
    let lockToken: string | null;
    try {
      lockToken = await this.positions.acquireFlushLock(FLUSH_LOCK_TTL_MS);
    } catch (error) {
      this.warn(`Skipped team location flush, Redis unavailable: ${errorMessage(error)}`);
      return 0;
    }
    if (!lockToken) return 0;

    let persisted = 0;
    try {
      let batch: string[];
      do {
        batch = await this.positions.takeBuffered(BATCH_SIZE);
        persisted += await this.persist(batch);
      } while (batch.length === BATCH_SIZE);
    } catch (error) {
      this.warn(`Team location flush stopped after ${persisted} pings: ${errorMessage(error)}`);
    } finally {
      await this.positions.releaseFlushLock(lockToken).catch(() => undefined);
    }
    return persisted;
  }

  // A batch the database refused goes back to the head of the buffer for the next round;
  // unparseable entries are dropped so one bad value cannot block the trail forever.
  private async persist(raws: string[]): Promise<number> {
    try {
      return await this.teams.persistPings(raws.map(parseTeamPing).filter(isPing));
    } catch (error) {
      await this.positions.returnToBuffer(raws);
      throw error;
    }
  }
}
