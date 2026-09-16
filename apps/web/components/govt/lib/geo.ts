import type { Bbox, LatLon } from '@/lib/api/types';

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bboxAround(point: LatLon, radiusDegrees: number): Bbox {
  return [
    Math.max(-180, point.lon - radiusDegrees),
    Math.max(-90, point.lat - radiusDegrees),
    Math.min(180, point.lon + radiusDegrees),
    Math.min(90, point.lat + radiusDegrees),
  ];
}

export function isInsideBbox(point: LatLon, [minLon, minLat, maxLon, maxLat]: Bbox): boolean {
  return point.lon >= minLon && point.lon <= maxLon && point.lat >= minLat && point.lat <= maxLat;
}

export function locationOf(item: { lat: number | null; lon: number | null }): LatLon | null {
  return item.lat === null || item.lon === null ? null : { lat: item.lat, lon: item.lon };
}
