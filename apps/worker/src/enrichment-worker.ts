import { Queue, UnrecoverableError, Worker } from 'bullmq';
import type { WorkerConfig } from './config';
import { INCIDENT_ENRICHMENT_QUEUE, type EnrichIncidentJob } from './contract';
import { createPool } from './db';
import { enrichIncident, type EnrichmentResult } from './enrich-incident';
import { createEventPublisher } from './events';
import { errorMessage, throttle, type Logger } from './logger';
import { RedisConnections } from './redis-connections';
import { startSweeper, SWEEP_INTERVAL_MS, sweepUnscoredIncidents, type SweepResult } from './sweeper';

export const WORKER_CONCURRENCY = 5;
const CLOSE_GRACE_MS = 2_000;
const CONNECTION_ERROR_LOG_INTERVAL_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EnrichmentWorkerOptions {
  logger: Logger;
  sweepIntervalMs?: number;
}

export interface EnrichmentWorker {
  sweep(): Promise<SweepResult>;
  stop(): Promise<void>;
}

export function startEnrichmentWorker(
  config: WorkerConfig,
  { logger, sweepIntervalMs = SWEEP_INTERVAL_MS }: EnrichmentWorkerOptions,
): EnrichmentWorker {
  const throttledWarning = () => throttle((message) => logger.warn(message), CONNECTION_ERROR_LOG_INTERVAL_MS);
  const warnDatabase = throttledWarning();
  const warnRedis = throttledWarning();
  const warnQueue = throttledWarning();

  const pool = createPool(config.databaseUrl, (error) => warnDatabase(`Database unavailable: ${error.message}`));
  const redis = new RedisConnections(config.redisUrl, (error) => warnRedis(`Redis unavailable: ${error.message}`));
  // BullMQ requires its worker connection to retry commands forever. Publishing and sweeping use a
  // connection that gives up quickly instead, so they fail and retry rather than pile up in an outage.
  const workerConnection = redis.open({ maxRetriesPerRequest: null });
  const commandConnection = redis.open({ maxRetriesPerRequest: 1 });

  const publish = createEventPublisher(commandConnection);
  const queue = new Queue<EnrichIncidentJob>(INCIDENT_ENRICHMENT_QUEUE, { connection: commandConnection });
  queue.on('error', (error) => warnQueue(`Enrichment queue unavailable: ${error.message}`));

  const worker = new Worker<EnrichIncidentJob, EnrichmentResult | null>(
    INCIDENT_ENRICHMENT_QUEUE,
    async (job) => {
      const { incidentId } = job.data;
      if (typeof incidentId !== 'string' || !UUID_PATTERN.test(incidentId)) {
        throw new UnrecoverableError(`Job ${job.id} carries no valid incidentId`);
      }
      const result = await enrichIncident({ pool, publish }, incidentId);
      if (!result) logger.warn(`Incident ${incidentId} does not exist; nothing to enrich`);
      return result;
    },
    { connection: workerConnection, concurrency: WORKER_CONCURRENCY },
  );
  worker.on('error', (error) => warnQueue(`Enrichment worker unavailable: ${error.message}`));
  worker.on('failed', (job, error) =>
    logger.warn(`Enrichment of incident ${job?.data.incidentId ?? '(unknown job)'} failed on attempt ${job?.attemptsMade ?? '?'}: ${error.message}`),
  );

  const sweep = () => sweepUnscoredIncidents(pool, queue);
  const sweeper = startSweeper(
    async () => {
      const { added, retried } = await sweep();
      if (added + retried > 0) logger.info(`Sweep queued ${added} unscored incidents and retried ${retried} finished jobs`);
    },
    sweepIntervalMs,
    (error) => logger.warn(`Sweep failed: ${errorMessage(error)}`),
  );

  // BullMQ's graceful close() waits for Redis to drop the blocking connection. During an outage that
  // never happens, and the close stalls before it stops the lock-renewal timer, which then keeps the
  // process alive. So the jobs in hand get the grace period through pause(), and the close is forced:
  // a job still running after the grace keeps its lock until it expires, then the stalled-job check
  // hands it back to the queue.
  const shutDown = async () => {
    await settleWithin(CLOSE_GRACE_MS, [sweeper.stop(), worker.pause()]);
    await settleWithin(CLOSE_GRACE_MS, [worker.close(true), queue.close()]);
    redis.disconnectAll();
    await settleWithin(CLOSE_GRACE_MS, [pool.end()]);
  };

  let stopping: Promise<void> | null = null;
  return {
    sweep,
    stop: () => (stopping ??= shutDown()),
  };
}

async function settleWithin(graceMs: number, work: Promise<unknown>[]): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const graceOver = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, graceMs);
  });
  try {
    await Promise.race([Promise.allSettled(work), graceOver]);
  } finally {
    clearTimeout(timer);
  }
}
