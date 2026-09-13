export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: Record<string, unknown> | null;
}

export function success<T>(data: T): ApiEnvelope<T> {
  return { success: true, data, error: null, meta: null };
}

export function failure(error: ApiError): ApiEnvelope<never> {
  return { success: false, data: null, error, meta: null };
}
