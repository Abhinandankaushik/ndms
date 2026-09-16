import { ApiError } from '@/lib/api/api-error';
import type { ReportReceipt } from '@/lib/api/types';

// 'queued' belongs to the offline outbox: the item is stored on the device and will be sent later. Every screen
// already renders that outcome, so the outbox can change submitSos and submitReport without touching the UI.
export type SubmissionOutcome = { kind: 'sent'; receipt: ReportReceipt } | { kind: 'queued'; clientUuid: string };

const RETRY_DELAYS_MS = [1_500, 4_000] as const;

// The clientUuid makes a repeat of a request that did reach the server harmless, so failures without an answer
// and server-side faults are retried a couple of times before the person has to press anything again.
export async function withTransientRetries<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      const delayMs = RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined || !isTransient(error)) throw error;
      await wait(delayMs);
    }
  }
}

function isTransient(error: unknown): boolean {
  return error instanceof ApiError && (error.isNetworkError || error.status >= 500);
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
