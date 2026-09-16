import type { SyncItem } from '@/lib/api/types';
import { useSessionStore } from '@/lib/auth/session';
import { requestBackgroundFlush } from './background-sync';
import { openOutboxDb } from './db';
import { patchOutboxState } from './store';
import { withMeta, type OutboxEntry, type OutboxStatus } from './types';

/**
 * Stores the report before anything is sent. Everything the person can lose lives in IndexedDB first,
 * so a phone that dies, reloads or goes into a tunnel between the tap and the response keeps the report.
 */
export async function enqueue(item: SyncItem): Promise<boolean> {
  const db = await openOutboxDb();
  if (!db) return false;

  const { clientUuid } = item.body;
  const existing = await db.get('outbox', clientUuid);
  await db.put(
    'outbox',
    withMeta(item, {
      clientUuid,
      userId: useSessionStore.getState().user?.id ?? null,
      createdAt: existing?.createdAt ?? Date.now(),
      attempts: existing?.attempts ?? 0,
      lastError: null,
      status: 'PENDING',
      nextAttemptAt: 0,
    }),
  );

  await refreshOutbox();
  void requestBackgroundFlush();
  return true;
}

export async function refreshOutbox(): Promise<void> {
  patchOutboxState({ entries: await readAll() });
}

/** Oldest first: a report queued two hours ago is more urgent than one written a minute ago (rule 3). */
export async function loadSendableEntries(userId: string, now: number): Promise<OutboxEntry[]> {
  const entries = await readAll();
  return entries.filter(
    (entry) => entry.status === 'PENDING' && entry.userId === userId && entry.nextAttemptAt <= now,
  );
}

export async function removeEntries(clientUuids: readonly string[]): Promise<void> {
  if (clientUuids.length === 0) return;
  const db = await openOutboxDb();
  if (!db) return;

  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all([...clientUuids.map((clientUuid) => tx.store.delete(clientUuid)), tx.done]);
  await refreshOutbox();
}

export async function markBlocked(clientUuid: string, status: OutboxStatus, message: string): Promise<void> {
  await update(clientUuid, (entry) => ({ ...entry, status, lastError: message, attempts: entry.attempts + 1 }));
}

/** Counts the attempt against every entry that was offered, so the backoff widens as failures repeat. */
export async function deferEntries(entries: readonly OutboxEntry[], message: string, delayFor: (attempts: number) => number): Promise<void> {
  const db = await openOutboxDb();
  if (!db) return;

  const now = Date.now();
  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all([
    ...entries.map(async (entry) => {
      const stored = await tx.store.get(entry.clientUuid);
      if (!stored || stored.status !== 'PENDING') return;
      const attempts = stored.attempts + 1;
      await tx.store.put({ ...stored, attempts, lastError: message, nextAttemptAt: now + delayFor(attempts) });
    }),
    tx.done,
  ]);
  await refreshOutbox();
}

/** Clears the wait so a reconnection or an explicit "Send now" is acted on immediately. */
export async function clearBackoff(userId: string): Promise<void> {
  const db = await openOutboxDb();
  if (!db) return;

  const tx = db.transaction('outbox', 'readwrite');
  const stored = await tx.store.getAll();
  await Promise.all([
    ...stored
      .filter((entry) => entry.userId === userId && entry.status === 'PENDING' && entry.nextAttemptAt > 0)
      .map((entry) => tx.store.put({ ...entry, nextAttemptAt: 0 })),
    tx.done,
  ]);
  await refreshOutbox();
}

/** Puts a refused entry back in the queue after the person asks for another try. */
export async function retryEntry(clientUuid: string): Promise<void> {
  await update(clientUuid, (entry) => ({ ...entry, status: 'PENDING', lastError: null, nextAttemptAt: 0 }));
}

async function update(clientUuid: string, change: (entry: OutboxEntry) => OutboxEntry): Promise<void> {
  const db = await openOutboxDb();
  if (!db) return;

  const stored = await db.get('outbox', clientUuid);
  if (!stored) return;
  await db.put('outbox', change(stored));
  await refreshOutbox();
}

async function readAll(): Promise<OutboxEntry[]> {
  const db = await openOutboxDb();
  if (!db) return [];
  return db.getAllFromIndex('outbox', 'by-created-at');
}
