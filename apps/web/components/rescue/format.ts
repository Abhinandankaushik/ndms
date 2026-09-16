const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const clockTime = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayAndTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function formatAgo(atMs: number, nowMs: number): string {
  const elapsedMs = Math.max(0, nowMs - atMs);
  if (elapsedMs < 5 * SECOND_MS) return 'just now';
  if (elapsedMs < MINUTE_MS) return `${Math.floor(elapsedMs / SECOND_MS)} s ago`;
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)} min ago`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)} h ago`;
  const days = Math.floor(elapsedMs / DAY_MS);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function formatClockTime(timestamp: string | number): string {
  return clockTime.format(new Date(timestamp));
}

export function formatDayAndTime(timestamp: string | number): string {
  return dayAndTime.format(new Date(timestamp));
}

export function formatPeople(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}
