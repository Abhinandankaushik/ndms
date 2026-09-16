import type { SyncItem } from '@/lib/api/types';

export type OutboxStatus = 'PENDING' | 'CONFLICT' | 'INVALID';

export interface OutboxMeta {
  clientUuid: string;
  /**
   * The account that wrote the report. A shared phone must never send one person's report under the
   * next person's token, so a drain only touches entries belonging to the signed-in user.
   */
  userId: string | null;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  status: OutboxStatus;
  /** Epoch ms before which the entry is not offered to the server again (exponential backoff). */
  nextAttemptAt: number;
}

export type OutboxEntry = SyncItem & OutboxMeta;

export function toSyncItem(entry: OutboxEntry): SyncItem {
  return entry.kind === 'SOS' ? { kind: 'SOS', body: entry.body } : { kind: 'REPORT', body: entry.body };
}

export function withMeta(item: SyncItem, meta: OutboxMeta): OutboxEntry {
  return item.kind === 'SOS' ? { ...meta, kind: 'SOS', body: item.body } : { ...meta, kind: 'REPORT', body: item.body };
}
