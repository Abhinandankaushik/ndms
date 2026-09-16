import { create } from 'zustand';
import { ApiError } from '@/lib/api/api-error';
import { sendApiRequest } from '@/lib/api/request';
import type { AuthSession, SessionUser, UserRole } from '@/lib/api/types';

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface SessionState {
  accessToken: string | null;
  user: SessionUser | null;
  status: SessionStatus;
}

export const useSessionStore = create<SessionState>()(() => ({
  accessToken: null,
  user: null,
  status: 'unknown',
}));

export const useSessionUser = () => useSessionStore((state) => state.user);
export const useSessionStatus = () => useSessionStore((state) => state.status);

export type PortalHomePath = '/citizen' | '/govt' | '/rescue' | '/facility';

const HOME_PATH_BY_ROLE: Record<UserRole, PortalHomePath> = {
  CITIZEN: '/citizen',
  VOLUNTEER: '/citizen',
  GOVT_OFFICIAL: '/govt',
  RESCUE_TEAM: '/rescue',
  FACILITY_MANAGER: '/facility',
};

export function homePathForRole(role: UserRole): PortalHomePath {
  return HOME_PATH_BY_ROLE[role];
}

// Only paths inside the user's own portal are honoured, so a crafted ?next= can neither leave the
// site nor open a portal the role cannot use.
export function landingPathFor(role: UserRole, requestedPath: string | null): string {
  const home = homePathForRole(role);
  if (!requestedPath) return home;
  const insidePortal =
    requestedPath === home || requestedPath.startsWith(`${home}/`) || requestedPath.startsWith(`${home}?`);
  return insidePortal ? requestedPath : home;
}

export function getAccessToken(): string | null {
  return useSessionStore.getState().accessToken;
}

const REFRESH_LOCK_NAME = 'ndms-refresh';
const PENDING_SIGN_OUT_KEY = 'ndms:pending-sign-out';
const BOOTSTRAP_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

// Bumped whenever the signed-in identity changes, so a refresh already in flight cannot resurrect
// a session the user just left.
let sessionEpoch = 0;
let refreshInFlight: Promise<string | null> | null = null;
let bootstrapInFlight: Promise<void> | null = null;

export function startSession(session: AuthSession): void {
  sessionEpoch += 1;
  markPendingSignOut(false);
  applySession(session);
}

export function updateSessionUser(user: SessionUser): void {
  useSessionStore.setState({ user });
}

export function bootstrapSession(): Promise<void> {
  bootstrapInFlight ??= bootstrapUntilSettled();
  return bootstrapInFlight;
}

// The refresh cookie rotates on every use and replaying an old one revokes the whole session, so
// refreshes must never overlap: one promise per tab (parallel 401s, StrictMode double effects)
// and a Web Lock across tabs.
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= runExclusively(refreshOnce).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function logout(): Promise<void> {
  sessionEpoch += 1;
  markPendingSignOut(true);
  clearSession();
  await revokeServerSession();
}

function applySession(session: AuthSession): void {
  useSessionStore.setState({ accessToken: session.accessToken, user: session.user, status: 'authenticated' });
}

function clearSession(): void {
  useSessionStore.setState({ accessToken: null, user: null, status: 'anonymous' });
}

async function bootstrapUntilSettled(): Promise<void> {
  if (hasPendingSignOut()) {
    clearSession();
    await revokeServerSession();
    return;
  }

  // Offline or API down: stay 'unknown' and keep trying, because answering 'anonymous' would push
  // a signed-in user to the login screen exactly when connectivity is worst.
  for (let attempt = 0; useSessionStore.getState().status === 'unknown'; attempt += 1) {
    try {
      await refreshAccessToken();
      return;
    } catch {
      await waitBeforeRetry(BOOTSTRAP_RETRY_DELAYS_MS[Math.min(attempt, BOOTSTRAP_RETRY_DELAYS_MS.length - 1)] ?? 30_000);
    }
  }
}

async function refreshOnce(): Promise<string | null> {
  const epoch = sessionEpoch;
  try {
    const session = await sendApiRequest<AuthSession>('/auth/refresh', { method: 'POST' });
    if (epoch !== sessionEpoch) return getAccessToken();
    applySession(session);
    return session.accessToken;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    if (epoch === sessionEpoch) clearSession();
    return null;
  }
}

function runExclusively(task: () => Promise<string | null>): Promise<string | null> {
  // navigator.locks exists only in secure contexts; plain-http LAN testing falls back to the tab-local promise.
  const locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(REFRESH_LOCK_NAME, task) : task();
}

// The refresh cookie is httpOnly, so only the API can invalidate it. Until that call succeeds the
// sign-out stays pending, otherwise the next app start would silently sign a shared phone back in.
async function revokeServerSession(): Promise<void> {
  try {
    await sendApiRequest('/auth/logout', { method: 'POST' });
    markPendingSignOut(false);
  } catch {
    // Retried on the next app start.
  }
}

function markPendingSignOut(pending: boolean): void {
  try {
    if (pending) window.localStorage.setItem(PENDING_SIGN_OUT_KEY, '1');
    else window.localStorage.removeItem(PENDING_SIGN_OUT_KEY);
  } catch {
    // Storage can be unavailable (private browsing); sign-out then relies on the API call alone.
  }
}

function hasPendingSignOut(): boolean {
  try {
    return window.localStorage.getItem(PENDING_SIGN_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function waitBeforeRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      window.removeEventListener('online', settle);
      resolve();
    };
    const timer = setTimeout(settle, delayMs);
    window.addEventListener('online', settle);
  });
}
