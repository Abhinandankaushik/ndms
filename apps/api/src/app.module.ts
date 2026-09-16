import { Module } from '@nestjs/common';
import { AuditModule } from './common/audit/audit.module';
import { EventsModule } from './common/events/events.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuditHttpModule } from './modules/audit/audit-http.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FacilitiesModule } from './modules/facilities/facilities.module';
import { HealthModule } from './modules/health/health.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { MediaModule } from './modules/media/media.module';
import { MissionsModule } from './modules/missions/missions.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SyncModule } from './modules/sync/sync.module';
import { VolunteersModule } from './modules/volunteers/volunteers.module';

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    EventsModule,
    AuditModule,
    RateLimitModule,
    AuthModule,
    HealthModule,
    IncidentsModule,
    MediaModule,
    RealtimeModule,
    MissionsModule,
    FacilitiesModule,
    VolunteersModule,
    AlertsModule,
    DashboardModule,
    SyncModule,
    AuditHttpModule,
  ],
})
export class AppModule {}
