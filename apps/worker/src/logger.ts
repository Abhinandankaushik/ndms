export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const line = (level: string, message: string) => `${new Date().toISOString()} ${level} [worker] ${message}`;

export const consoleLogger: Logger = {
  info: (message) => console.log(line('INFO', message)),
  warn: (message) => console.warn(line('WARN', message)),
  error: (message) => console.error(line('ERROR', message)),
};

// Connection errors repeat on every reconnect attempt; one line per interval still shows the outage.
export function throttle(write: (message: string) => void, intervalMs: number): (message: string) => void {
  let lastWrittenAt = Number.NEGATIVE_INFINITY;
  return (message) => {
    const now = Date.now();
    if (now - lastWrittenAt < intervalMs) return;
    lastWrittenAt = now;
    write(message);
  };
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
