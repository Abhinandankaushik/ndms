import { ApiError, isAbortError, NETWORK_ERROR } from './api-error';
import type { ApiEnvelope } from './types';

export const API_BASE_PATH = '/api/v1';

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type QueryParams = Record<string, QueryValue>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
}

export interface TransportOptions extends RequestOptions {
  accessToken?: string | null;
}

// Lists become comma-separated because the API parses CSV filters and bbox=minLon,minLat,maxLon,maxLat.
export function buildApiUrl(path: string, query?: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    if (isList(value)) {
      if (value.length > 0) search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const queryString = search.toString();
  return `${API_BASE_PATH}${path}${queryString ? `?${queryString}` : ''}`;
}

export interface EnvelopeResult<T> {
  data: T;
  meta: Record<string, unknown> | null;
}

export async function sendApiRequest<T>(path: string, options: TransportOptions = {}): Promise<T> {
  return (await sendApiRequestWithMeta<T>(path, options)).data;
}

export async function sendApiRequestWithMeta<T>(path: string, options: TransportOptions = {}): Promise<EnvelopeResult<T>> {
  const response = await fetchOrNetworkError(buildApiUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: requestHeaders(options),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: 'same-origin',
  });
  return unwrapEnvelope<T>(response);
}

function isList(value: QueryValue): value is readonly (string | number)[] {
  return Array.isArray(value);
}

function requestHeaders(options: TransportOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  return headers;
}

async function fetchOrNetworkError(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    // An abort with a custom reason rejects with that reason rather than an AbortError.
    if (isAbortError(error) || init.signal?.aborted) throw error;
    throw new ApiError(0, NETWORK_ERROR, 'Could not reach NDMS. Check your connection and try again.');
  }
}

async function unwrapEnvelope<T>(response: Response): Promise<EnvelopeResult<T>> {
  const envelope = await readEnvelope<T>(response);
  if (response.ok && envelope?.success) {
    return { data: envelope.data as T, meta: envelope.meta ?? null };
  }
  if (envelope?.error) {
    throw new ApiError(response.status, envelope.error.code, envelope.error.message, envelope.error.details);
  }
  // A body that is not our envelope means something in between answered, e.g. the web server's
  // proxy while the API is down.
  throw new ApiError(
    response.status,
    response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNEXPECTED_RESPONSE',
    response.status >= 500
      ? 'NDMS is temporarily unavailable. Try again shortly.'
      : `Unexpected response from the server (HTTP ${response.status}).`,
  );
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  try {
    const body: unknown = await response.json();
    return isEnvelope<T>(body) ? body : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

function isEnvelope<T>(body: unknown): body is ApiEnvelope<T> {
  return typeof body === 'object' && body !== null && 'success' in body && typeof body.success === 'boolean';
}
