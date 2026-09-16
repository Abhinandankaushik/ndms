const INDIAN_GROUPING = new Intl.NumberFormat('en-IN');
const ONE_DECIMAL = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const CLOCK_TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const DAY_AND_TIME = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;

export function formatCount(value: number): string {
  return INDIAN_GROUPING.format(value);
}

export function formatDistance(metres: number): string {
  if (metres < 10) return 'under 10 m';
  const roundedToTen = Math.round(metres / 10) * 10;
  if (roundedToTen < 1_000) return `${roundedToTen} m`;
  return `${ONE_DECIMAL.format(metres / 1_000)} km`;
}

export function formatAccuracy(accuracyM: number): string {
  if (accuracyM < 1_000) return `±${Math.max(1, Math.round(accuracyM))} m`;
  return `±${ONE_DECIMAL.format(accuracyM / 1_000)} km`;
}

export function formatClockTime(iso: string): string {
  return CLOCK_TIME.format(new Date(iso));
}

export function formatTimestamp(iso: string, now: number): string {
  const date = new Date(iso);
  return isSameDay(date, new Date(now)) ? CLOCK_TIME.format(date) : DAY_AND_TIME.format(date);
}

export function formatRelativeTime(iso: string, now: number): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1_000);
  const magnitude = Math.abs(seconds);
  if (magnitude < 45) return 'just now';
  if (magnitude < SECONDS_PER_HOUR) return RELATIVE_TIME.format(Math.round(seconds / SECONDS_PER_MINUTE), 'minute');
  if (magnitude < SECONDS_PER_DAY) return RELATIVE_TIME.format(Math.round(seconds / SECONDS_PER_HOUR), 'hour');
  return RELATIVE_TIME.format(Math.round(seconds / SECONDS_PER_DAY), 'day');
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
