import type { Logger } from '@nestjs/common';

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// One warning per interval: a Redis or database outage would otherwise log on every ping and
// every flush.
export function throttledWarning(logger: Logger, intervalMs = 60_000): (message: string) => void {
  let lastLoggedAt = 0;
  return (message) => {
    const now = Date.now();
    if (now - lastLoggedAt < intervalMs) return;
    lastLoggedAt = now;
    logger.warn(message);
  };
}
