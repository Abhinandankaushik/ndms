export const NETWORK_ERROR = 'NETWORK_ERROR';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetworkError(): boolean {
    return this.code === NETWORK_ERROR;
  }

  // Worth trying again later: no response at all, a timeout, rate limiting or a server-side failure.
  // Anything else is a definitive answer that retrying will not change.
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
