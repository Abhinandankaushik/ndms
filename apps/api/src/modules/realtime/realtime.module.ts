import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { RealtimeGateway } from './realtime.gateway';
import { RedisEventsBridge } from './redis-events.bridge';

@Module({
  imports: [AuthModule, IncidentsModule],
  providers: [RealtimeGateway, RedisEventsBridge],
})
export class RealtimeModule {}
