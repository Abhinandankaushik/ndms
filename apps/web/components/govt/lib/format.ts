// The API reports "today" in the control room's calendar day, so every clock shown here uses the same zone.
const CONTROL_ROOM_TIME_ZONE = 'Asia/Kolkata';

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: CONTROL_ROOM_TIME_ZONE,
});

const clockFormat = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: CONTROL_ROOM_TIME_ZONE,
});

const countFormat = new Intl.NumberFormat('en-IN');
const compactFormat = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

const MINUTE_MS = 60_000;

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatClockTime(iso: string | number): string {
  return clockFormat.format(new Date(iso));
}

export function formatCount(value: number): string {
  return countFormat.format(value);
}

export function formatCompactCount(value: number): string {
  return Math.abs(value) < 100_000 ? countFormat.format(value) : compactFormat.format(value);
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatAge(iso: string, now: number): string {
  const elapsedMs = Math.max(0, now - Date.parse(iso));
  if (elapsedMs < 45_000) return 'just now';
  return `${formatSpan(elapsedMs)} ago`;
}

export function formatTimeLeft(iso: string, now: number): string {
  const remainingMs = Date.parse(iso) - now;
  if (remainingMs <= 0) return 'expired';
  return `in ${formatSpan(Math.max(remainingMs, MINUTE_MS))}`;
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function formatSpan(spanMs: number): string {
  const minutes = Math.round(spanMs / MINUTE_MS);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function formatDistance(meters: number): string {
  if (meters < 1_000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10_000) return `${(meters / 1_000).toFixed(1)} km`;
  return `${Math.round(meters / 1_000)} km`;
}

export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function formatPeople(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'person' : 'people'}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** "FIRST_AID" becomes "First aid". */
export function humanizeCode(code: string): string {
  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
