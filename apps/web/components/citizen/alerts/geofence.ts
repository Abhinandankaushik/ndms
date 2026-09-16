import type { AlertBroadcastEvent, GeoJsonArea, LatLon } from '@/lib/api/types';

type Position = readonly number[];
type Ring = readonly Position[];

export type FeedAlert = Pick<AlertBroadcastEvent, 'id' | 'severity' | 'title' | 'message' | 'geofence' | 'issuedAt' | 'expiresAt'>;

// Mirrors GET /alerts/active: an alert without a geofence covers the whole district, and a geofenced alert can
// only apply to someone whose position is known.
export function alertCoversPosition(alert: Pick<FeedAlert, 'geofence'>, position: LatLon | null): boolean {
  if (!alert.geofence) return true;
  return position !== null && geofenceContains(alert.geofence, position);
}

export function isAlertExpired(alert: Pick<FeedAlert, 'expiresAt'>, now: number): boolean {
  return alert.expiresAt !== null && Date.parse(alert.expiresAt) <= now;
}

export function geofenceContains(area: GeoJsonArea, point: LatLon): boolean {
  const polygons: readonly (readonly Ring[])[] = area.type === 'Polygon' ? [area.coordinates] : area.coordinates;
  return polygons.some((rings) => polygonContains(rings, point));
}

function polygonContains(rings: readonly Ring[], point: LatLon): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !ringContains(outer, point)) return false;
  return !holes.some((hole) => ringContains(hole, point));
}

// Even-odd ray casting over [lon, lat] positions: a ray from the point towards increasing longitude crosses the
// ring's edges an odd number of times exactly when the point is inside. Planar maths is accurate at district
// scale, well away from the poles and the antimeridian.
function ringContains(ring: Ring, { lat, lon }: LatLon): boolean {
  let isInside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLon = Number.NaN, currentLat = Number.NaN] = ring[current] ?? [];
    const [previousLon = Number.NaN, previousLat = Number.NaN] = ring[previous] ?? [];
    const straddlesRay = currentLat > lat !== previousLat > lat;
    if (
      straddlesRay &&
      lon < ((previousLon - currentLon) * (lat - currentLat)) / (previousLat - currentLat) + currentLon
    ) {
      isInside = !isInside;
    }
  }
  return isInside;
}
