import { Redis, type RedisOptions } from 'ioredis';

// BullMQ never disconnects a connection it was handed, and its own disconnects wait for Redis to
// answer, so shutdown drops every connection itself. BullMQ opens the worker's blocking connection
// by calling duplicate() on the connection it is given, so duplicates are tracked as well.
export class RedisConnections {
  private readonly connections: Redis[] = [];

  constructor(
    private readonly url: string,
    private readonly onError: (error: Error) => void,
  ) {}

  open(options: RedisOptions): Redis {
    return this.track(new Redis(this.url, options));
  }

  disconnectAll(): void {
    for (const connection of this.connections) {
      if (connection.status !== 'end') connection.disconnect();
    }
  }

  private track(connection: Redis): Redis {
    connection.on('error', this.onError);
    this.connections.push(connection);

    const duplicate = connection.duplicate.bind(connection);
    connection.duplicate = ((override?: Partial<RedisOptions>) => this.track(duplicate(override))) as Redis['duplicate'];
    return connection;
  }
}
