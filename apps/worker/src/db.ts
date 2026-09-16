import { Pool, type PoolClient } from 'pg';

export function createPool(databaseUrl: string, onError: (error: Error) => void): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    application_name: 'ndms-worker',
    // A job keeps its BullMQ lock while it waits, so an unbounded wait on a dead database
    // would stall the queue instead of failing the job and letting it retry.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  // An idle client that loses its connection emits 'error' on the pool; unhandled, it would
  // crash the process.
  pool.on('error', onError);
  return pool;
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let connectionLost = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    connectionLost = await client.query('ROLLBACK').then(
      () => false,
      () => true,
    );
    throw error;
  } finally {
    client.release(connectionLost);
  }
}
