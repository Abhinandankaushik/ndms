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

const META = Symbol('api.meta');

export interface WithMeta<T> {
  [META]: Record<string, unknown>;
  data: T;
}

/** Lets a handler fill the envelope's `meta` without the payload itself carrying the field. */
export function withMeta<T>(data: T, meta: Record<string, unknown>): WithMeta<T> {
  return { [META]: meta, data };
}

export function isWithMeta(value: unknown): value is WithMeta<unknown> {
  return typeof value === 'object' && value !== null && META in value;
}

export function envelopeOf(value: unknown): ApiEnvelope<unknown> {
  return isWithMeta(value)
    ? { success: true, data: value.data, error: null, meta: value[META] }
    : success(value ?? null);
}

export function failure(error: ApiError): ApiEnvelope<never> {
  return { success: false, data: null, error, meta: null };
}
