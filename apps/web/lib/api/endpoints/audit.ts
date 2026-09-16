import { apiFetch, type CallOptions } from '../client';
import type { AuditEntry, AuditQuery } from '../types';

export function listAuditEntries(query: AuditQuery = {}, options?: CallOptions): Promise<AuditEntry[]> {
  return apiFetch<AuditEntry[]>('/audit', {
    ...options,
    query: { entityType: query.entityType, entityId: query.entityId, limit: query.limit },
  });
}
