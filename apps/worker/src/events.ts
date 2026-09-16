import type { Redis } from 'ioredis';
import { DOMAIN_EVENTS_CHANNEL } from './contract';

export interface DomainEvent {
  name: string;
  rooms: string[];
  payload: unknown;
}

export type PublishEvent = (event: DomainEvent) => Promise<void>;

// The API's RedisEventsBridge relays this channel into its Socket.IO rooms.
export function createEventPublisher(redis: Redis): PublishEvent {
  return async (event) => {
    await redis.publish(DOMAIN_EVENTS_CHANNEL, JSON.stringify(event));
  };
}
