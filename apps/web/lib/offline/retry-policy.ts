import { ApiError } from '@/lib/api/api-error';

const BACKOFF_MS = [10_000, 30_000, 60_000, 120_000, 300_000] as const;
const MAX_BACKOFF_MS = 300_000;

/**
 * Only a failure that says nothing about the report itself is worth queueing. A rejection or a rate
 * limit must reach the screen instead: queueing those would hide the refusal, and rate-limited
 * reports would slip past the per-user limit on `POST /incidents`, which `POST /incidents/sync`
 * does not apply.
 */
export function isWorthRetrying(error: unknown): boolean {
  return error instanceof ApiError && (error.isNetworkError || error.status === 408 || error.status >= 500);
}

export function backoffMs(attempts: number): number {
  return BACKOFF_MS[attempts - 1] ?? MAX_BACKOFF_MS;
}
