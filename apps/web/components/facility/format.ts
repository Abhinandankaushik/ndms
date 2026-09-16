import type { LatLon } from '@/lib/api/types';

const countFormat = new Intl.NumberFormat('en-IN');
const relativeTimeFormat = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const EARTH_RADIUS_M = 6_371_008.8;

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function formatCount(value: number): string {
  return countFormat.format(value);
}

export function pluralize(count: number, [singular, plural]: readonly [string, string]): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

export function formatSignedStep(step: number): string {
  return step > 0 ? `+${formatCount(step)}` : `−${formatCount(Math.abs(step))}`;
}

// Server timestamps can be slightly ahead of the device clock; they read as "just now" rather than in the future.
export function formatRelativeTime(iso: string, nowMs: number): string {
  const seconds = Math.min(0, Math.round((new Date(iso).getTime() - nowMs) / 1000));
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= unitSeconds) return relativeTimeFormat.format(Math.trunc(seconds / unitSeconds), unit);
  }
  return 'just now';
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

export function formatCoordinates({ lat, lon }: LatLon): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function distanceMetres(from: LatLon, to: LatLon): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function humanizeCode(code: string): string {
  const words = code.toLowerCase().replace(/_+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
