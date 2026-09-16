import type { JobsOptions, Queue } from 'bullmq';
import type { Pool } from 'pg';
import { ENRICH_JOB_NAME, type EnrichIncidentJob } from './contract';
import { findUnscoredIncidentIds } from './incidents.repository';

export const SWEEP_INTERVAL_MS = 60_000;
// The API enqueues every new report itself; the sweep only picks up what that fire-and-forget
// enqueue lost, so it leaves reports younger than a minute alone.
const UNSCORED_GRACE_SECONDS = 60;
const SWEEP_BATCH_SIZE = 5_000;

// The same retry policy as the API's producer (apps/api/src/modules/incidents/enrichment.queue.ts).
export const ENRICH_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
} satisfies JobsOptions;

export type EnrichmentQueue = Queue<EnrichIncidentJob>;
export type EnqueueOutcome = 'added' | 'retried' | 'pending';
export type SweepResult = Record<EnqueueOutcome, number>;

export async function sweepUnscoredIncidents(pool: Pool, queue: EnrichmentQueue): Promise<SweepResult> {
  const result: SweepResult = { added: 0, retried: 0, pending: 0 };
  const incidentIds = await findUnscoredIncidentIds(pool, {
    createdMoreThanSecondsAgo: UNSCORED_GRACE_SECONDS,
    limit: SWEEP_BATCH_SIZE,
  });
  for (const incidentId of incidentIds) {
    result[await enqueueEnrichment(queue, incidentId)] += 1;
  }
  return result;
}

export async function enqueueEnrichment(queue: EnrichmentQueue, incidentId: string): Promise<EnqueueOutcome> {
  const state = await queue.getJobState(incidentId);
  if (state === 'unknown') {
    await queue.add(ENRICH_JOB_NAME, { incidentId }, { ...ENRICH_JOB_OPTIONS, jobId: incidentId });
    return 'added';
  }

  // Job ids are incident ids, so a finished job silently swallows a fresh add with the same id.
  // A job that ran out of attempts during an outage has to be retried in place instead.
  if (state === 'failed' || state === 'completed') {
    const job = await queue.getJob(incidentId);
    await job?.retry(state, { resetAttemptsMade: true, resetAttemptsStarted: true });
    return 'retried';
  }
  return 'pending';
}

export interface Sweeper {
  stop(): Promise<void>;
}

export function startSweeper(sweep: () => Promise<void>, intervalMs: number, onError: (error: unknown) => void): Sweeper {
  let running: Promise<void> | null = null;
  const timer = setInterval(() => {
    running ??= sweep()
      .catch(onError)
      .finally(() => {
        running = null;
      });
  }, intervalMs);

  return {
    stop: async () => {
      clearInterval(timer);
      await running;
    },
  };
}
