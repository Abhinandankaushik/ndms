import type { LatLon } from '@/lib/api/types';

const EARTH_MEAN_RADIUS_M = 6_371_008.8;

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

export const COMPASS_POINT_NAMES: Record<CompassPoint, string> = {
  N: 'north',
  NE: 'north-east',
  E: 'east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  W: 'west',
  NW: 'north-west',
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function haversineMetres(from: LatLon, to: LatLon): number {
  const halfChord =
    Math.sin(toRadians(to.lat - from.lat) / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(toRadians(to.lon - from.lon) / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(halfChord)));
}

/** Initial great-circle bearing in degrees clockwise from true north, in [0, 360). */
export function bearingDegrees(from: LatLon, to: LatLon): number {
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const east = Math.sin(deltaLon) * Math.cos(toLat);
  const north = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return (toDegrees(Math.atan2(east, north)) + 360) % 360;
}

export function compassPoint(bearing: number): CompassPoint {
  const normalised = ((bearing % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalised / 45) % COMPASS_POINTS.length] ?? 'N';
}

export function formatDistance(metres: number): string {
  if (metres < 10) return 'Under 10 m';
  const roundedMetres = Math.round(metres / 10) * 10;
  if (roundedMetres < 1_000) return `${roundedMetres} m`;
  if (metres < 10_000) return `${(metres / 1_000).toFixed(1)} km`;
  return `${Math.round(metres / 1_000)} km`;
}
