import { Module } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [EnvModule, DatabaseModule, RedisModule, StorageModule, HealthModule],
})
export class AppModule {}
