import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import type { Env } from '../../config/env';

const CONNECT_TIMEOUT_MS = 3_000;

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterFactory: ReturnType<typeof createAdapter> | null = null;

  constructor(
    app: INestApplicationContext,
    private readonly env: Env,
  ) {
    super(app);
  }

  // Without Redis the API still starts: rooms fall back to this process's memory, which is
  // correct for one API instance and only loses cross-instance fan-out.
  async connectToRedis(): Promise<void> {
    const pub = new Redis(this.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    pub.on('error', () => undefined);
    sub.on('error', () => undefined);

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.all([pub.connect(), sub.connect()]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`no connection within ${CONNECT_TIMEOUT_MS} ms`)), CONNECT_TIMEOUT_MS);
        }),
      ]);
      this.adapterFactory = createAdapter(pub, sub);
    } catch (error) {
      pub.disconnect();
      sub.disconnect();
      this.logger.warn(
        `Redis adapter disabled (${error instanceof Error ? error.message : String(error)}); Socket.IO rooms are in-memory`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.env.WEB_ORIGIN, credentials: true },
    } as ServerOptions);
    if (this.adapterFactory) {
      server.adapter(this.adapterFactory);
    }
    return server;
  }
}
