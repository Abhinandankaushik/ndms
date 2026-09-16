import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { zodQuery } from '../../common/validation/zod-validation.pipe';
import { Roles } from '../auth/auth.decorators';
import { AuditLogRepository } from './audit-log.repository';

const auditQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
type AuditQuery = z.infer<typeof auditQuerySchema>;

@Controller('audit')
@Roles('GOVT_OFFICIAL')
export class AuditController {
  constructor(private readonly auditLog: AuditLogRepository) {}

  @Get()
  list(@Query(zodQuery(auditQuerySchema)) query: AuditQuery) {
    return this.auditLog.find(query);
  }
}
