import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OutboxEntry } from './types';

const DATABASE_NAME = 'ndms-offline';
const DATABASE_VERSION = 1;

export interface OfflineSchema extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { 'by-created-at': number };
  };
}

export type OfflineDb = IDBPDatabase<OfflineSchema>;

let connection: Promise<OfflineDb | null> | null = null;

export function openOutboxDb(): Promise<OfflineDb | null> {
  connection ??= connect();
  return connection;
}

async function connect(): Promise<OfflineDb | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return await openDB<OfflineSchema>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        const outbox = db.createObjectStore('outbox', { keyPath: 'clientUuid' });
        outbox.createIndex('by-created-at', 'createdAt');
      },
    });
  } catch {
    // Private windows and blocked site data both fail here. Without durable storage a report can
    // still be sent, it just cannot survive a reload, so the app carries on without the outbox.
    return null;
  }
}
