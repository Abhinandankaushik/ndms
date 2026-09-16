import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

export interface AuditRecord {
  id: number;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  ipAddress: string | null;
  occurredAt: Date;
}

export interface AuditFilter {
  entityType?: string;
  entityId?: string;
  limit: number;
}

interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: unknown;
  ip_address: string | null;
  occurred_at: Date;
}

const toRecord = (row: AuditRow): AuditRecord => ({
  id: row.id,
  actorId: row.actor_id,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  metadata: row.metadata,
  ipAddress: row.ip_address,
  occurredAt: row.occurred_at,
});

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(filter: AuditFilter): Promise<AuditRecord[]> {
    const entityType = filter.entityType ?? null;
    const entityId = filter.entityId ?? null;
    const rows = await this.prisma.$queryRaw<AuditRow[]>`
      SELECT id::float8 AS id, actor_id, action, entity_type, entity_id, metadata,
             host(ip_address) AS ip_address, occurred_at
      FROM audit_log
      WHERE (${entityType}::text IS NULL OR entity_type = ${entityType}::text)
        AND (${entityId}::text IS NULL OR entity_id = ${entityId}::text)
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${filter.limit}::int`;
    return rows.map(toRecord);
  }
}
