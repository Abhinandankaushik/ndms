export type ProbeResult =
  | ({ status: 'up'; latencyMs: number } & Record<string, unknown>)
  | { status: 'down'; latencyMs: number; error: string };

type Check = (signal: AbortSignal) => Promise<Record<string, unknown> | void>;

export async function probe(check: Check, timeoutMs: number): Promise<ProbeResult> {
  const controller = new AbortController();
  const startedAt = performance.now();
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });

  try {
    const details = await Promise.race([check(controller.signal), timeout]);
    return { ...details, status: 'up', latencyMs: elapsedSince(startedAt) };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: elapsedSince(startedAt),
      error: error instanceof Error ? error.message || error.name : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
