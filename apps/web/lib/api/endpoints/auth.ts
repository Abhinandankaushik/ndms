import { apiFetch, type CallOptions } from '../client';
import type { AuthSession, OtpSent, ProfileUpdate, SessionUser } from '../types';

// POST /auth/refresh and POST /auth/logout change the shared session, so they live in
// lib/auth/session (single-flighted refresh, offline-safe sign-out) and are re-exported here.
export { logout, refreshAccessToken } from '@/lib/auth/session';

export function sendOtp(phone: string): Promise<OtpSent> {
  return apiFetch<OtpSent>('/auth/otp/send', { method: 'POST', body: { phone }, auth: false });
}

export function verifyOtp(phone: string, code: string): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/otp/verify', { method: 'POST', body: { phone, code }, auth: false });
}

export function getMe(options?: CallOptions): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/me', options);
}

export function updateMe(update: ProfileUpdate): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/me', { method: 'PATCH', body: update });
}
