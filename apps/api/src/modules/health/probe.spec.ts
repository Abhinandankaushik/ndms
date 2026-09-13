import { probe } from './probe';

describe('probe', () => {
  it('reports up with the latency and whatever details the check returns', async () => {
    const result = await probe(async () => ({ postgis: '3.4' }), 100);

    expect(result).toEqual({ status: 'up', latencyMs: expect.any(Number), postgis: '3.4' });
  });

  it('does not let a check overwrite its own status', async () => {
    const result = await probe(async () => ({ status: 'down' }), 100);

    expect(result.status).toBe('up');
  });

  it('reports down with the error message when the check throws', async () => {
    const result = await probe(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
    }, 100);

    expect(result).toEqual({
      status: 'down',
      latencyMs: expect.any(Number),
      error: 'connect ECONNREFUSED 127.0.0.1:6379',
    });
  });

  it('gives up on a hung check at the timeout and aborts its signal', async () => {
    let received: AbortSignal | undefined;

    const result = await probe((signal) => {
      received = signal;
      return new Promise<never>(() => {});
    }, 20);

    expect(result).toMatchObject({ status: 'down', error: 'timed out after 20 ms' });
    expect(received?.aborted).toBe(true);
  });
});
