import { useSyncExternalStore } from 'react';
import { useSessionUser } from '@/lib/auth/session';
import { EMPTY_OUTBOX_STATE, getOutboxState, subscribeToOutbox, type OutboxState } from './store';
import type { OutboxEntry } from './types';

export interface OutboxView {
  /** Queued and waiting for a connection. */
  waiting: OutboxEntry[];
  /** Refused by the server for a reason a retry alone will not change. */
  blocked: OutboxEntry[];
  isSending: boolean;
}

export function useOutbox(): OutboxView {
  const state = useOutboxState();
  const user = useSessionUser();
  // Entries belonging to whoever used this phone before are neither shown nor sent.
  const mine = user ? state.entries.filter((entry) => entry.userId === user.id) : [];

  return {
    waiting: mine.filter((entry) => entry.status === 'PENDING' && !state.attempting.includes(entry.clientUuid)),
    blocked: mine.filter((entry) => entry.status !== 'PENDING'),
    isSending: state.isSending,
  };
}

function useOutboxState(): OutboxState {
  return useSyncExternalStore(subscribeToOutbox, getOutboxState, serverState);
}

function serverState(): OutboxState {
  return EMPTY_OUTBOX_STATE;
}
