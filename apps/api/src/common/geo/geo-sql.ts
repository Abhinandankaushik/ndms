import { Prisma } from '../../generated/prisma/client';

export interface LatLon {
  lat: number;
  lon: number;
}

export const pointSql = (point: LatLon) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${point.lon}::float8, ${point.lat}::float8), 4326)::geography`;

export const envelopeSql = ([minLon, minLat, maxLon, maxLat]: [number, number, number, number]) =>
  Prisma.sql`ST_MakeEnvelope(${minLon}::float8, ${minLat}::float8, ${maxLon}::float8, ${maxLat}::float8, 4326)::geography`;

export const latSql = (column: string) => Prisma.raw(`ST_Y(${column}::geometry)`);
export const lonSql = (column: string) => Prisma.raw(`ST_X(${column}::geometry)`);
