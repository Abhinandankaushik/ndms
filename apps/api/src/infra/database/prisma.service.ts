import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV, type Env } from '../../config/env';
import { PrismaClient } from '../../generated/prisma/client';

const logger = new Logger('PrismaService');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg(
        { connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5_000 },
        {
          // pg emits 'error' on pooled clients when Postgres restarts; without a listener
          // that event crashes the process instead of failing the next query.
          onPoolError: (error) => logger.error(`Idle database connection failed: ${error.message}`),
          onConnectionError: (error) => logger.error(`Database connection failed: ${error.message}`),
        },
      ),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
