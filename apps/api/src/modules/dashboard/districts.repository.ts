import { Injectable } from '@nestjs/common';
import type { LatLon } from '../../common/geo/geo-sql';
import { PrismaService } from '../../infra/database/prisma.service';

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export interface DistrictOverview {
  id: number;
  name: string;
  state: string;
  bbox: [number, number, number, number];
  centroid: LatLon;
  boundary: GeoJsonMultiPolygon;
}

interface DistrictRow {
  id: number;
  name: string;
  state: string;
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
  centroid_lat: number;
  centroid_lon: number;
  boundary: GeoJsonMultiPolygon;
}

@Injectable()
export class DistrictsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Falls back to the first district for accounts without one (citizens), and for a token
  // whose district no longer exists.
  async findPreferred(districtId: number | null): Promise<DistrictOverview | null> {
    const rows = await this.prisma.$queryRaw<DistrictRow[]>`
      SELECT d.id, d.name, d.state,
             ST_XMin(shape.geom)::float8 AS min_lon, ST_YMin(shape.geom)::float8 AS min_lat,
             ST_XMax(shape.geom)::float8 AS max_lon, ST_YMax(shape.geom)::float8 AS max_lat,
             ST_Y(ST_Centroid(shape.geom))::float8 AS centroid_lat, ST_X(ST_Centroid(shape.geom))::float8 AS centroid_lon,
             ST_AsGeoJSON(shape.geom, 6)::json AS boundary
      FROM districts d
      CROSS JOIN LATERAL (SELECT d.boundary::geometry AS geom) shape
      ORDER BY d.id = ${districtId}::int DESC NULLS LAST, d.id
      LIMIT 1`;

    const row = rows[0];
    return row
      ? {
          id: row.id,
          name: row.name,
          state: row.state,
          bbox: [row.min_lon, row.min_lat, row.max_lon, row.max_lat],
          centroid: { lat: row.centroid_lat, lon: row.centroid_lon },
          boundary: row.boundary,
        }
      : null;
  }
}
