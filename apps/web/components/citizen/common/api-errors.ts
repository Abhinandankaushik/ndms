import { ApiError } from '@/lib/api/api-error';

export const OFFLINE_MESSAGE = 'No connection to NDMS. Check your mobile data or Wi-Fi and try again.';

export function describeApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.isNetworkError) return OFFLINE_MESSAGE;
  if (error.code === 'RATE_LIMITED') return `Too many requests. ${retryAfterSentence(error)}`;
  if (error.status >= 500) return 'NDMS is having trouble right now. Please try again shortly.';
  return error.message || fallback;
}

export function hasErrorCode(error: unknown, ...codes: string[]): boolean {
  return error instanceof ApiError && codes.includes(error.code);
}

export function isNotFoundError(error: unknown): boolean {
  // A malformed id in the address fails validation before the lookup, which for the reader is the same thing.
  return error instanceof ApiError && (error.status === 404 || error.code === 'VALIDATION_FAILED');
}

export function retryAfterSentence(error: ApiError): string {
  const minutes = retryAfterMinutes(error);
  if (minutes === null) return 'Try again later.';
  return `Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

function retryAfterMinutes(error: ApiError): number | null {
  const { details } = error;
  if (typeof details !== 'object' || details === null || !('retryAfterSeconds' in details)) return null;
  const seconds = details.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? Math.ceil(seconds / 60) : null;
}
