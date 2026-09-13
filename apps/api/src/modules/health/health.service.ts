import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../infra/database/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';
import { S3 } from '../../infra/storage/storage.module';
import { probe, type ProbeResult } from './probe';

const CHECK_TIMEOUT_MS = 2_000;

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  checks: {
    database: ProbeResult;
    redis: ProbeResult;
    objectStorage: ProbeResult;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis, objectStorage] = await Promise.all([
      probe(async () => {
        const rows = await this.prisma.$queryRaw<{ version: string }[]>`SELECT postgis_version() AS version`;
        return { postgis: rows[0]?.version };
      }, CHECK_TIMEOUT_MS),
      probe(async () => {
        await this.redis.ping();
      }, CHECK_TIMEOUT_MS),
      probe(async (signal) => {
        await this.s3.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }), { abortSignal: signal });
        return { bucket: this.env.S3_BUCKET };
      }, CHECK_TIMEOUT_MS),
    ]);

    return { status: overallStatus(database, redis, objectStorage), checks: { database, redis, objectStorage } };
  }
}

// Only Postgres sits on the SOS write path. Losing Redis or object storage degrades the
// service (no queue, no media) but must not take incident intake offline.
function overallStatus(database: ProbeResult, ...supporting: ProbeResult[]): HealthReport['status'] {
  if (database.status === 'down') return 'down';
  return supporting.every((check) => check.status === 'up') ? 'ok' : 'degraded';
}
