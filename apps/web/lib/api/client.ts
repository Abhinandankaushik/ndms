import { refreshAccessToken, useSessionStore, type SessionStatus } from '@/lib/auth/session';
import { ApiError } from './api-error';
import { sendApiRequest, type RequestOptions } from './request';

export { ApiError, isAbortError, isApiError, NETWORK_ERROR } from './api-error';
export { API_BASE_PATH, buildApiUrl, type HttpMethod, type QueryParams, type QueryValue } from './request';

export interface ApiFetchOptions extends RequestOptions {
  /** Attach the bearer token and recover from an expired one. Defaults to true. */
  auth?: boolean;
}

export type CallOptions = Pick<RequestOptions, 'signal'>;

const REFRESHABLE_CODES = new Set(['TOKEN_INVALID', 'AUTH_REQUIRED']);

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, ...request } = options;
  if (!auth) return sendApiRequest<T>(path, request);

  const { accessToken: tokenUsed, status: statusWhenSent } = useSessionStore.getState();
  try {
    return await sendApiRequest<T>(path, { ...request, accessToken: tokenUsed });
  } catch (error) {
    if (!isRecoverableAuthError(error, tokenUsed, statusWhenSent)) throw error;
    const freshToken = await tokenNewerThan(tokenUsed);
    if (!freshToken) throw error;
    return sendApiRequest<T>(path, { ...request, accessToken: freshToken });
  }
}

// A request sent without a token deserves a second attempt only if it left while the session was still being
// established. Judging that when the 401 arrives is too late: the bootstrap may have signed in meanwhile.
function isRecoverableAuthError(error: unknown, tokenUsed: string | null, statusWhenSent: SessionStatus): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    REFRESHABLE_CODES.has(error.code) &&
    (tokenUsed !== null || statusWhenSent === 'unknown')
  );
}

// Another request or the bootstrap may already hold a newer token; reuse it instead of rotating the refresh
// cookie again. A session that has since ended has nothing left to refresh.
async function tokenNewerThan(tokenUsed: string | null): Promise<string | null> {
  const { accessToken, status } = useSessionStore.getState();
  if (accessToken && accessToken !== tokenUsed) return accessToken;
  if (status === 'anonymous') return null;
  return refreshAccessToken();
}
