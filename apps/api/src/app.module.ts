import { Module } from '@nestjs/common';
import { AuditModule } from './common/audit/audit.module';
import { EventsModule } from './common/events/events.module';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { MediaModule } from './modules/media/media.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    EventsModule,
    AuditModule,
    AuthModule,
    HealthModule,
    IncidentsModule,
    MediaModule,
    RealtimeModule,
  ],
})
export class AppModule {}
