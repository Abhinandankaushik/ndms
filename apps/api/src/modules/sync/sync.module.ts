import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [IncidentsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
