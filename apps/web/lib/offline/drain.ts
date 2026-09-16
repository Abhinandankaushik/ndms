import { describeApiError } from '@/components/citizen/common/api-errors';
import { toast } from '@/components/ui/toaster';
import { syncIncidents } from '@/lib/api/endpoints/sync';
import { queryKeys } from '@/lib/api/query-keys';
import type { SyncItemResult } from '@/lib/api/types';
import { useSessionStore } from '@/lib/auth/session';
import { getQueryClient } from '@/lib/query/query-client';
import { clearBackoff, deferEntries, loadSendableEntries, markBlocked, refreshOutbox, removeEntries } from './outbox';
import { backoffMs } from './retry-policy';
import { patchOutboxState } from './store';
import { toSyncItem, type OutboxEntry } from './types';

/** The contract allows 50 per request; 20 keeps a single failed batch small on a weak connection. */
export const SYNC_BATCH_SIZE = 20;

export type DrainOutcome = 'IDLE' | 'DELIVERED' | 'RETRY_LATER';

let inFlight: Promise<DrainOutcome> | null = null;

export function drainOutbox(): Promise<DrainOutcome> {
  inFlight ??= runDrain().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Used by the "Send now" button and by a reconnection, both of which should not wait out a backoff. */
export async function flushOutboxNow(): Promise<DrainOutcome> {
  const { user } = useSessionStore.getState();
  if (user) await clearBackoff(user.id);
  return drainOutbox();
}

async function runDrain(): Promise<DrainOutcome> {
  const { user, status } = useSessionStore.getState();
  // POST /incidents/sync needs a bearer token, so nothing can be delivered while signed out.
  if (status !== 'authenticated' || !user) return 'IDLE';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'RETRY_LATER';

  const due = await loadSendableEntries(user.id, Date.now());
  if (due.length === 0) return 'IDLE';

  patchOutboxState({ isSending: true });
  try {
    return await sendBatches(due);
  } finally {
    patchOutboxState({ isSending: false });
    await refreshOutbox();
  }
}

async function sendBatches(due: readonly OutboxEntry[]): Promise<DrainOutcome> {
  const delivered: OutboxEntry[] = [];

  for (let start = 0; start < due.length; start += SYNC_BATCH_SIZE) {
    const batch = due.slice(start, start + SYNC_BATCH_SIZE);
    let results: SyncItemResult[];
    try {
      ({ results } = await syncIncidents(batch.map(toSyncItem)));
    } catch (error) {
      // Rule 8: nothing is ever dropped on the device's own judgement. Even a refusal of the whole
      // request keeps the reports queued, with the reason shown, so a person decides what happens.
      return stopAfter(due.slice(start), delivered, describeApiError(error, 'Sending failed.'));
    }

    if (results.length !== batch.length) {
      return stopAfter(due.slice(start), delivered, 'NDMS answered with an unexpected result.');
    }
    delivered.push(...(await applyResults(batch, results)));
  }

  return finish(delivered);
}

async function stopAfter(remaining: readonly OutboxEntry[], delivered: readonly OutboxEntry[], message: string): Promise<DrainOutcome> {
  await deferEntries(remaining, message, backoffMs);
  return delivered.length > 0 ? finish(delivered) : 'RETRY_LATER';
}

function finish(delivered: readonly OutboxEntry[]): DrainOutcome {
  if (delivered.length === 0) return 'IDLE';
  announce(delivered);
  return 'DELIVERED';
}

// Results come back in request order, which is the only reliable pairing: an item rejected before it
// was understood has no clientUuid to match on.
async function applyResults(batch: readonly OutboxEntry[], results: readonly SyncItemResult[]): Promise<OutboxEntry[]> {
  const settled: OutboxEntry[] = [];
  const blocked: Promise<void>[] = [];

  for (const [index, entry] of batch.entries()) {
    const result = results[index];
    if (!result) continue;
    if (result.outcome === 'CREATED' || result.outcome === 'DUPLICATE') {
      settled.push(entry);
      continue;
    }
    blocked.push(markBlocked(entry.clientUuid, result.outcome, describeSyncError(result)));
  }

  await Promise.all(blocked);
  await removeEntries(settled.map((entry) => entry.clientUuid));
  return settled;
}

function describeSyncError(result: SyncItemResult): string {
  if (result.outcome === 'CONFLICT') {
    return 'This report was already recorded under a different account on this phone.';
  }
  return result.error?.message ?? 'NDMS could not accept this report.';
}

function announce(delivered: readonly OutboxEntry[]): void {
  void getQueryClient().invalidateQueries({ queryKey: queryKeys.incidents.mine });
  const sosCount = delivered.filter((entry) => entry.kind === 'SOS').length;
  toast({
    title: sosCount > 0 ? 'Saved SOS sent' : delivered.length === 1 ? 'Saved report sent' : `${delivered.length} saved reports sent`,
    description: 'NDMS has received everything that was waiting on this phone.',
    variant: 'success',
  });
}
