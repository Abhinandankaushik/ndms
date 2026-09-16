import { z } from 'zod';

const MAX_GEOFENCE_VERTICES = 1000;
// Far wider than any district, and well short of the 180-degree edges on which PostGIS
// geography predicates raise errors instead of answering.
const MAX_GEOFENCE_SPAN_DEGREES = 10;

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

const position = z.union([z.tuple([longitude, latitude]), z.tuple([longitude, latitude, z.number()])]);
type Position = z.infer<typeof position>;

const samePosition = (a: Position, b: Position) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const linearRing = z
  .array(position)
  .min(4, 'A ring needs at least 4 positions')
  .refine((ring) => ring.length < 4 || samePosition(ring[0]!, ring.at(-1)!), {
    message: 'A ring must end at its first position',
  });

const polygonRings = z.array(linearRing).min(1);

const polygon = z.object({ type: z.literal('Polygon'), coordinates: polygonRings });
const multiPolygon = z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygonRings).min(1) });

type Geofence = z.infer<typeof polygon> | z.infer<typeof multiPolygon>;

const positionsOf = (geofence: Geofence): Position[] =>
  (geofence.type === 'Polygon' ? [geofence.coordinates] : geofence.coordinates).flat(2);

const fitsSpanLimit = (positions: Position[]) => {
  let [minLon, maxLon, minLat, maxLat] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [lon, lat] of positions) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return maxLon - minLon <= MAX_GEOFENCE_SPAN_DEGREES && maxLat - minLat <= MAX_GEOFENCE_SPAN_DEGREES;
};

export const geofenceSchema = z
  .discriminatedUnion('type', [polygon, multiPolygon])
  .refine((geofence) => positionsOf(geofence).length <= MAX_GEOFENCE_VERTICES, {
    message: `A geofence may have at most ${MAX_GEOFENCE_VERTICES} vertices`,
    abort: true,
  })
  .refine((geofence) => fitsSpanLimit(positionsOf(geofence)), {
    message: `A geofence may span at most ${MAX_GEOFENCE_SPAN_DEGREES} degrees of latitude or longitude`,
  });

export interface StoredGeofence {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}
