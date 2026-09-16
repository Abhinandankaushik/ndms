import type { SubmissionOutcome } from '@/components/citizen/common/submission';
import type { ReportReceipt, SyncItem } from '@/lib/api/types';
import { enqueue, removeEntries } from './outbox';
import { isWorthRetrying } from './retry-policy';
import { clearAttempting, markAttempting } from './store';

/**
 * The outbox pattern for the two writes a citizen makes: store first, then try the network. Whatever
 * happens next, the report is already on the device, so the only question left is whether the person
 * is told it went out now or that it will go out later.
 */
export async function sendThroughOutbox(item: SyncItem, send: () => Promise<ReportReceipt>): Promise<SubmissionOutcome> {
  const { clientUuid } = item.body;
  const queued = await enqueue(item);

  // A phone that already knows it is offline should not spend the retry budget rediscovering it; an
  // SOS has to say "saved" straight away.
  if (queued && isOffline()) return { kind: 'queued', clientUuid };

  markAttempting(clientUuid);
  try {
    const receipt = await send();
    await removeEntries([clientUuid]);
    return { kind: 'sent', receipt };
  } catch (error) {
    if (queued && isWorthRetrying(error)) return { kind: 'queued', clientUuid };
    await removeEntries([clientUuid]);
    throw error;
  } finally {
    clearAttempting(clientUuid);
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
