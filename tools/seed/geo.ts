import type { Random } from './random.ts';

export interface LonLat {
  lon: number;
  lat: number;
}

export type MultiPolygonCoordinates = number[][][][];

const EARTH_RADIUS_M = 6_371_008.8;
const RADIANS = Math.PI / 180;
const METRES_PER_DEGREE = EARTH_RADIUS_M * RADIANS;

export function distanceM(a: LonLat, b: LonLat): number {
  const dLat = (b.lat - a.lat) * RADIANS;
  const dLon = (b.lon - a.lon) * RADIANS;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RADIANS) * Math.cos(b.lat * RADIANS) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function offsetBy(origin: LonLat, bearingRadians: number, distance: number): LonLat {
  const northM = distance * Math.cos(bearingRadians);
  const eastM = distance * Math.sin(bearingRadians);
  return {
    lon: origin.lon + eastM / (METRES_PER_DEGREE * Math.cos(origin.lat * RADIANS)),
    lat: origin.lat + northM / METRES_PER_DEGREE,
  };
}

// An equirectangular projection centred on the point is accurate to well under 1 % over the
// few tens of kilometres that separate anything inside one district.
export function distanceToLinesM(point: LonLat, lines: readonly (readonly LonLat[])[]): number {
  const metresPerDegreeLon = METRES_PER_DEGREE * Math.cos(point.lat * RADIANS);
  const project = (vertex: LonLat): [number, number] => [
    (vertex.lon - point.lon) * metresPerDegreeLon,
    (vertex.lat - point.lat) * METRES_PER_DEGREE,
  ];

  let nearest = Infinity;
  for (const line of lines) {
    for (let index = 1; index < line.length; index++) {
      nearest = Math.min(nearest, distanceFromOriginToSegment(project(line[index - 1]!), project(line[index]!)));
    }
  }
  return nearest;
}

function distanceFromOriginToSegment([ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

// Even-odd ray casting over every ring, which treats holes correctly without knowing
// which ring is which.
export function isInsideMultiPolygon(point: LonLat, polygons: MultiPolygonCoordinates): boolean {
  let inside = false;
  for (const ring of polygons.flat()) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

export function randomPointWithin(random: Random, centre: LonLat, radiusM: number): LonLat {
  const bearing = random() * 2 * Math.PI;
  const distance = radiusM * Math.sqrt(random());
  return offsetBy(centre, bearing, distance);
}

const roundCoordinate = (value: number): number => Math.round(value * 1e7) / 1e7;

export const roundLonLat = (point: LonLat): LonLat => ({ lon: roundCoordinate(point.lon), lat: roundCoordinate(point.lat) });
