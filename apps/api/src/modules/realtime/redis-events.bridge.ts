import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { DomainEventBus } from '../../common/events/domain-event-bus';
import { REDIS } from '../../infra/redis/redis.module';

export const DOMAIN_EVENTS_CHANNEL = 'ndms:events';

const eventSchema = z.object({
  name: z.string().min(1),
  rooms: z.array(z.string().min(1)),
  payload: z.unknown(),
});

// Relays events published by other processes (the BullMQ worker) onto the in-process bus.
// With several API instances each would relay and, through the Redis adapter, emit the same
// event once per instance; the Minor deployment runs a single API container.
@Injectable()
export class RedisEventsBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisEventsBridge.name);
  private subscriber?: Redis;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly events: DomainEventBus,
  ) {}

  onModuleInit(): void {
    const subscriber = this.redis.duplicate({ autoResubscribe: false });
    this.subscriber = subscriber;

    subscriber.on('error', () => undefined);
    subscriber.on('ready', () => {
      subscriber.subscribe(DOMAIN_EVENTS_CHANNEL).catch((error: Error) => {
        this.logger.warn(`Could not subscribe to ${DOMAIN_EVENTS_CHANNEL}: ${error.message}`);
      });
    });
    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== DOMAIN_EVENTS_CHANNEL) return;
      try {
        const event = eventSchema.parse(JSON.parse(message));
        this.events.publish(event);
      } catch (error) {
        this.logger.warn(`Dropped malformed event: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  onModuleDestroy(): void {
    this.subscriber?.disconnect();
  }
}
