import { apiFetch } from '../client';
import type { SyncItem, SyncResult } from '../types';

export const MAX_SYNC_BATCH = 50;

export function syncIncidents(items: readonly SyncItem[]): Promise<SyncResult> {
  return apiFetch<SyncResult>('/incidents/sync', { method: 'POST', body: { items } });
}
