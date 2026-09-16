import { useEffect, useEffectEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  ClientToServerEvents,
  IncidentSubscriptionAck,
  ServerToClientEvents,
  SessionUser,
  SocketEventName,
  SocketEventPayloads,
} from '@/lib/api/types';
import { refreshAccessToken, useSessionStore, type SessionState } from '@/lib/auth/session';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
const HANDSHAKE_AUTH_ERRORS = new Set(['AUTH_REQUIRED', 'TOKEN_INVALID']);
const SUBSCRIBE_ACK_TIMEOUT_MS = 10_000;

const useSocketStatusStore = create<{ status: SocketStatus }>()(() => ({ status: 'idle' }));

let socket: RealtimeSocket | null = null;
let lastHandshakeToken: string | null = null;
let rejectedHandshakeToken: string | null = null;
let handshakeRecoveryAttempted = false;
const incidentSubscriptions = new Map<string, number>();

export function getSocket(): RealtimeSocket {
  socket ??= createSocket();
  return socket;
}

export function useSocketStatus(): SocketStatus {
  return useSocketStatusStore((state) => state.status);
}

export function useSocketEvent<E extends SocketEventName>(
  event: E,
  handler: (payload: SocketEventPayloads[E]) => void,
): void {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    const listener = (payload: SocketEventPayloads[E]) => onEvent(payload);
    const emitter = asUntypedEmitter(getSocket());
    emitter.on(event, listener);
    return () => {
      emitter.off(event, listener);
    };
  }, [event]);
}

// Rooms belong to one server connection, so every subscription is replayed after a reconnect.
export async function subscribeToIncident(incidentId: string): Promise<IncidentSubscriptionAck> {
  incidentSubscriptions.set(incidentId, (incidentSubscriptions.get(incidentId) ?? 0) + 1);
  const target = getSocket();
  if (!target.connected) return { ok: false, error: 'NOT_CONNECTED' };
  return requestIncidentRoom(target, incidentId);
}

export function unsubscribeFromIncident(incidentId: string): void {
  const count = incidentSubscriptions.get(incidentId) ?? 0;
  if (count <= 1) incidentSubscriptions.delete(incidentId);
  else incidentSubscriptions.set(incidentId, count - 1);
}

export function useIncidentSubscription(incidentId: string | null | undefined): void {
  useEffect(() => {
    if (!incidentId) return;
    void subscribeToIncident(incidentId);
    return () => unsubscribeFromIncident(incidentId);
  }, [incidentId]);
}

// The server authenticates only the handshake and derives rooms from the token's identity, so a
// routine token refresh keeps the live connection (reconnecting would drop events). The socket
// reconnects when the identity changes, and a dropped connection retries with each new token.
export function bindRealtimeToSession(): () => void {
  syncSocketWithSession(useSessionStore.getState(), null);
  return useSessionStore.subscribe(syncSocketWithSession);
}

function syncSocketWithSession(state: SessionState, previous: SessionState | null): void {
  if (state.status !== 'authenticated') {
    disconnectForSignOut(previous);
    return;
  }

  const target = getSocket();
  const identityIsNew = previous?.status !== 'authenticated' || identityChanged(previous.user, state.user);
  if (identityIsNew) {
    handshakeRecoveryAttempted = false;
    rejectedHandshakeToken = null;
    if (target.connected || target.active) target.disconnect();
  }
  if (!target.connected && !target.active && state.accessToken !== rejectedHandshakeToken) {
    setStatus('connecting');
    target.connect();
  }
}

function disconnectForSignOut(previous: SessionState | null): void {
  if (previous?.status !== 'authenticated') return;
  incidentSubscriptions.clear();
  socket?.disconnect();
  setStatus('idle');
}

function createSocket(): RealtimeSocket {
  const created: RealtimeSocket = io(API_ORIGIN, {
    autoConnect: false,
    auth: (send) => {
      lastHandshakeToken = useSessionStore.getState().accessToken;
      send({ token: lastHandshakeToken });
    },
  });

  created.on('connect', () => {
    handshakeRecoveryAttempted = false;
    rejectedHandshakeToken = null;
    setStatus('connected');
    for (const incidentId of incidentSubscriptions.keys()) {
      void requestIncidentRoom(created, incidentId);
    }
  });
  created.on('disconnect', () => setStatus(created.active ? 'connecting' : 'disconnected'));
  created.io.on('reconnect_attempt', () => setStatus('connecting'));
  created.on('connect_error', (error) => {
    if (created.active) {
      setStatus('connecting');
      return;
    }
    setStatus('disconnected');
    if (HANDSHAKE_AUTH_ERRORS.has(error.message)) {
      rejectedHandshakeToken = lastHandshakeToken;
      void recoverFromRejectedHandshake();
    }
  });

  return created;
}

// socket.io does not retry a handshake the server rejected. One refresh gets a new token (the
// session subscription then reconnects); a rejection of that token too is not an expiry problem,
// so it waits for the next token instead of rotating refresh cookies in a loop.
async function recoverFromRejectedHandshake(): Promise<void> {
  if (handshakeRecoveryAttempted) return;
  handshakeRecoveryAttempted = true;
  try {
    await refreshAccessToken();
  } catch {
    // Offline: the next token or page load reconnects.
  }
}

async function requestIncidentRoom(target: RealtimeSocket, incidentId: string): Promise<IncidentSubscriptionAck> {
  try {
    const ack: IncidentSubscriptionAck = await target
      .timeout(SUBSCRIBE_ACK_TIMEOUT_MS)
      .emitWithAck('incident:subscribe', { incidentId });
    return ack;
  } catch {
    return { ok: false, error: 'TIMEOUT' };
  }
}

function identityChanged(before: SessionUser | null, after: SessionUser | null): boolean {
  return (
    before?.id !== after?.id ||
    before?.role !== after?.role ||
    before?.districtId !== after?.districtId ||
    before?.rescueTeamId !== after?.rescueTeamId ||
    before?.facilityId !== after?.facilityId
  );
}

function setStatus(status: SocketStatus): void {
  useSocketStatusStore.setState({ status });
}

interface UntypedEmitter {
  on(event: string, listener: (payload: never) => void): unknown;
  off(event: string, listener: (payload: never) => void): unknown;
}

// socket.io's listener types do not resolve for a generic event name; SocketEventPayloads is what
// keeps useSocketEvent callers type-safe.
function asUntypedEmitter(target: RealtimeSocket): UntypedEmitter {
  return target as unknown as UntypedEmitter;
}
