import type { Alert, GeoJsonArea, GeoJsonPolygon, LatLon } from '@/lib/api/types';

export const MIN_GEOFENCE_VERTICES = 3;

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LON_AT_EQUATOR = 111.32;
// Rings with less area than this (roughly 10 m²) are degenerate, e.g. three clicks along one line.
const MIN_RING_AREA_KM2 = 0.00001;

export type GeofenceProblem = 'TOO_FEW_VERTICES' | 'SELF_INTERSECTING' | 'NO_AREA';

// Shoelace sum in degrees; positive when the vertices run counter-clockwise (east is +x, north is +y).
function signedDegreeArea(vertices: readonly LatLon[]): number {
  let sum = 0;
  vertices.forEach((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length] ?? vertex;
    sum += vertex.lon * next.lat - next.lon * vertex.lat;
  });
  return sum / 2;
}

export function approximateAreaKm2(vertices: readonly LatLon[]): number {
  if (vertices.length < MIN_GEOFENCE_VERTICES) return 0;
  const meanLat = vertices.reduce((total, vertex) => total + vertex.lat, 0) / vertices.length;
  const kmPerDegreeLon = KM_PER_DEGREE_LON_AT_EQUATOR * Math.cos((meanLat * Math.PI) / 180);
  return Math.abs(signedDegreeArea(vertices)) * kmPerDegreeLon * KM_PER_DEGREE_LAT;
}

function orientation(p: LatLon, q: LatLon, r: LatLon): number {
  return Math.sign((q.lon - p.lon) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lon - p.lon));
}

function liesOnSegment(start: LatLon, point: LatLon, end: LatLon): boolean {
  return (
    point.lon <= Math.max(start.lon, end.lon) &&
    point.lon >= Math.min(start.lon, end.lon) &&
    point.lat <= Math.max(start.lat, end.lat) &&
    point.lat >= Math.min(start.lat, end.lat)
  );
}

function segmentsIntersect(a1: LatLon, a2: LatLon, b1: LatLon, b2: LatLon): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && liesOnSegment(a1, b1, a2)) ||
    (o2 === 0 && liesOnSegment(a1, b2, a2)) ||
    (o3 === 0 && liesOnSegment(b1, a1, b2)) ||
    (o4 === 0 && liesOnSegment(b1, a2, b2))
  );
}

// PostGIS refuses self-intersecting rings (422 GEOFENCE_INVALID), so the composer checks before sending.
export function selfIntersects(vertices: readonly LatLon[]): boolean {
  const count = vertices.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === count - 1);
      if (adjacent) continue;
      const a1 = vertices[i];
      const a2 = vertices[(i + 1) % count];
      const b1 = vertices[j];
      const b2 = vertices[(j + 1) % count];
      if (a1 && a2 && b1 && b2 && segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export function geofenceProblem(vertices: readonly LatLon[]): GeofenceProblem | null {
  if (vertices.length < MIN_GEOFENCE_VERTICES) return 'TOO_FEW_VERTICES';
  if (selfIntersects(vertices)) return 'SELF_INTERSECTING';
  if (approximateAreaKm2(vertices) < MIN_RING_AREA_KM2) return 'NO_AREA';
  return null;
}

/** A closed GeoJSON ring, counter-clockwise as RFC 7946 asks for exterior rings. */
export function toGeofencePolygon(vertices: readonly LatLon[]): GeoJsonPolygon {
  const ordered = signedDegreeArea(vertices) >= 0 ? vertices : [...vertices].reverse();
  const ring = ordered.map((vertex) => [vertex.lon, vertex.lat]);
  const first = ring[0];
  return { type: 'Polygon', coordinates: [first ? [...ring, [...first]] : ring] };
}

export type LatLngBoundsTuple = [[number, number], [number, number]];

export function geofenceBounds(area: GeoJsonArea): LatLngBoundsTuple | null {
  const positions = area.type === 'Polygon' ? area.coordinates.flat() : area.coordinates.flat(2);
  let [minLat, minLon, maxLat, maxLon] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of positions) {
    if (lon === undefined || lat === undefined) continue;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  return Number.isFinite(minLat)
    ? [
        [minLat, minLon],
        [maxLat, maxLon],
      ]
    : null;
}

export type AlertState = 'active' | 'expired' | 'cancelled';

export function alertState(alert: Pick<Alert, 'cancelledAt' | 'expiresAt'>, now: number): AlertState {
  if (alert.cancelledAt) return 'cancelled';
  if (alert.expiresAt && Date.parse(alert.expiresAt) <= now) return 'expired';
  return 'active';
}
