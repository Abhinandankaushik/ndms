import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Awaited by callers on purpose: returning personal data without its audit row would be
  // an unattributable disclosure, so a failed write should fail the request.
  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, metadata, ip_address)
      VALUES (${entry.actorId}::uuid, ${entry.action}, ${entry.entityType}, ${entry.entityId},
              ${JSON.stringify(entry.metadata ?? {})}::jsonb, ${entry.ipAddress ?? null}::inet)`;
  }
}
