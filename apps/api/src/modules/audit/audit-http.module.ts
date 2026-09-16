import { Module } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';
import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [AuditLogRepository],
})
export class AuditHttpModule {}
