import { isApiError, NETWORK_ERROR } from '@/lib/api/client';

export type ErrorMessages = Partial<Record<string, string>>;

export function describeApiError(error: unknown, messages: ErrorMessages = {}): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  const specific = messages[error.code];
  if (specific) return specific;
  switch (error.code) {
    case NETWORK_ERROR:
      return 'NDMS could not be reached. Check your connection and try again.';
    case 'RATE_LIMITED':
      return 'Too many requests in a short time. Wait a moment and try again.';
    case 'FACILITY_NOT_FOUND':
      return 'Your facility could not be found. Reload the page, or ask the control room to check your account.';
    default:
      return error.message;
  }
}

export function isApiStatus(error: unknown, status: number): boolean {
  return isApiError(error) && error.status === status;
}
