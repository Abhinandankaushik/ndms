import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env';

export const INCIDENT_ENRICHMENT_QUEUE = 'incident-enrichment';

export interface EnrichIncidentJob {
  incidentId: string;
}

const ERROR_LOG_INTERVAL_MS = 60_000;
const CLOSE_GRACE_MS = 2_000;

@Injectable()
export class EnrichmentQueue implements OnModuleDestroy {
  private readonly logger = new Logger(EnrichmentQueue.name);
  // Owning the connection lets shutdown drop it directly: BullMQ's own close() and
  // disconnect() both wait for Redis to answer, which never happens during an outage.
  private readonly connection: Redis;
  private readonly queue: Queue<EnrichIncidentJob>;
  private lastErrorLoggedAt = 0;

  constructor(@Inject(ENV) env: Env) {
    this.connection = new Redis(env.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.connection.on('error', (error: Error) => this.logThrottled(`Enrichment queue unavailable: ${error.message}`));
    this.queue = new Queue<EnrichIncidentJob>(INCIDENT_ENRICHMENT_QUEUE, { connection: this.connection });
    this.queue.on('error', (error: Error) => this.logThrottled(`Enrichment queue unavailable: ${error.message}`));
  }

  // Fire-and-forget by design: the SOS response never waits on Redis (CLAUDE.md rule 1).
  // Anything that fails to enqueue stays unscored until the worker's sweep finds it.
  enqueue(incidentId: string): void {
    this.queue
      .add(
        'enrich',
        { incidentId },
        {
          jobId: incidentId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      )
      .catch((error: unknown) =>
        this.logThrottled(
          `Could not enqueue enrichment for ${incidentId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection.status === 'ready') {
      await Promise.race([
        this.queue.close().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, CLOSE_GRACE_MS).unref()),
      ]);
    }
    this.connection.disconnect();
  }

  private logThrottled(message: string): void {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLoggedAt = now;
    this.logger.warn(message);
  }
}
