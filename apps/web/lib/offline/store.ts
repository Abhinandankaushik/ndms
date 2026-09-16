import type { OutboxEntry } from './types';

export interface OutboxState {
  entries: readonly OutboxEntry[];
  /** Entries whose first attempt is still running on the screen that created them. */
  attempting: readonly string[];
  isSending: boolean;
}

export const EMPTY_OUTBOX_STATE: OutboxState = { entries: [], attempting: [], isSending: false };

let state: OutboxState = EMPTY_OUTBOX_STATE;
const listeners = new Set<() => void>();

export function getOutboxState(): OutboxState {
  return state;
}

export function subscribeToOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function patchOutboxState(patch: Partial<OutboxState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function markAttempting(clientUuid: string): void {
  if (state.attempting.includes(clientUuid)) return;
  patchOutboxState({ attempting: [...state.attempting, clientUuid] });
}

export function clearAttempting(clientUuid: string): void {
  if (!state.attempting.includes(clientUuid)) return;
  patchOutboxState({ attempting: state.attempting.filter((uuid) => uuid !== clientUuid) });
}
