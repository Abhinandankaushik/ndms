import { Injectable } from '@nestjs/common';
import type { FacilityKind, InventoryItem } from '../../common/domain/enums';
import { envelopeSql, latSql, lonSql, pointSql, type LatLon } from '../../common/geo/geo-sql';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/database/prisma.service';
import { capacityFigures, type CapacityFigures, type Headcount } from './facility-capacity';

const VIEWPORT_LIMIT = 2_000;

const FACILITY_COLUMNS = Prisma.sql`
  f.id, f.district_id, f.kind::text AS kind, f.name,
  ${latSql('f.location')} AS lat, ${lonSql('f.location')} AS lon,
  f.address, f.contact_phone, f.capacity, f.occupancy, f.is_operational,
  f.amenities, f.attributes, f.updated_at`;

export interface Facility extends CapacityFigures {
  id: string;
  districtId: number;
  kind: FacilityKind;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  contactPhone: string | null;
  isOperational: boolean;
  amenities: string[];
  attributes: Record<string, unknown>;
  updatedAt: Date;
}

export interface NearbyFacility extends Facility {
  distanceM: number;
}

export interface InventoryLine {
  item: InventoryItem;
  quantity: number;
  lowStockThreshold: number | null;
  isLow: boolean;
  updatedAt: Date;
}

export interface NewFacility extends LatLon {
  districtId: number;
  kind: FacilityKind;
  name: string;
  address: string | null;
  contactPhone: string | null;
  capacity: number;
  amenities: string[];
  attributes: Record<string, unknown>;
}

export interface FacilityChanges {
  name?: string;
  capacity?: number;
  isOperational?: boolean;
  address?: string | null;
  contactPhone?: string | null;
  amenities?: string[];
  attributes?: Record<string, unknown>;
}

export interface FacilityRef {
  id: string;
  districtId: number;
  name: string;
}

export interface OccupancyChange {
  facility: FacilityRef;
  before: Headcount;
  after: Headcount;
}

export type DetailsUpdate =
  | { outcome: 'UPDATED'; before: Headcount; facility: Facility }
  | { outcome: 'CAPACITY_BELOW_OCCUPANCY'; occupancy: number }
  | { outcome: 'NOT_FOUND' };

interface FacilityRow {
  id: string;
  district_id: number;
  kind: FacilityKind;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  contact_phone: string | null;
  capacity: number;
  occupancy: number;
  is_operational: boolean;
  amenities: string[];
  attributes: Record<string, unknown>;
  updated_at: Date;
}

type DetailsUpdateRow = { previous_occupancy: number; previous_capacity: number } & (
  | FacilityRow
  | { [Column in keyof FacilityRow]: null }
);

interface InventoryRow {
  item: InventoryItem;
  quantity: number;
  low_stock_threshold: number | null;
  updated_at: Date;
}

const toFacility = (row: FacilityRow): Facility => ({
  id: row.id,
  districtId: row.district_id,
  kind: row.kind,
  name: row.name,
  lat: row.lat,
  lon: row.lon,
  address: row.address,
  contactPhone: row.contact_phone,
  ...capacityFigures({ occupancy: row.occupancy, capacity: row.capacity }),
  isOperational: row.is_operational,
  amenities: row.amenities,
  attributes: row.attributes,
  updatedAt: row.updated_at,
});

const toInventoryLine = (row: InventoryRow): InventoryLine => ({
  item: row.item,
  quantity: row.quantity,
  lowStockThreshold: row.low_stock_threshold,
  isLow: row.low_stock_threshold !== null && row.quantity <= row.low_stock_threshold,
  updatedAt: row.updated_at,
});

@Injectable()
export class FacilitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Facility | null> {
    const rows = await this.prisma.$queryRaw<FacilityRow[]>`
      SELECT ${FACILITY_COLUMNS}
      FROM facilities f
      WHERE f.id = ${id}::uuid`;
    return rows[0] ? toFacility(rows[0]) : null;
  }

  async inventory(facilityId: string): Promise<InventoryLine[]> {
    const rows = await this.prisma.$queryRaw<InventoryRow[]>`
      SELECT item::text AS item, quantity, low_stock_threshold, updated_at
      FROM facility_inventory
      WHERE facility_id = ${facilityId}::uuid
      ORDER BY item`;
    return rows.map(toInventoryLine);
  }

  // The index-served KNN ranks candidates by sphere distance; re-sorting that handful by the
  // spheroid distance we report keeps distanceM increasing down the list.
  async findNearest(
    origin: LatLon,
    kind: FacilityKind,
    withSpaceOnly: boolean,
    limit: number,
  ): Promise<NearbyFacility[]> {
    const rows = await this.prisma.$queryRaw<(FacilityRow & { distance_m: number })[]>`
      SELECT nearest.*
      FROM (
        SELECT ${FACILITY_COLUMNS}, ST_Distance(f.location, ${pointSql(origin)}) AS distance_m
        FROM facilities f
        WHERE f.kind = ${kind}::facility_kind
          AND (NOT ${withSpaceOnly}::boolean OR (f.is_operational AND f.occupancy < f.capacity))
        ORDER BY f.location <-> ${pointSql(origin)}
        LIMIT ${limit}::int
      ) nearest
      ORDER BY nearest.distance_m`;
    return rows.map((row) => ({ ...toFacility(row), distanceM: row.distance_m }));
  }

  async findInViewport(
    districtId: number,
    bbox: [number, number, number, number],
    kind: FacilityKind | null,
  ): Promise<Facility[]> {
    const rows = await this.prisma.$queryRaw<FacilityRow[]>`
      SELECT ${FACILITY_COLUMNS}
      FROM facilities f
      WHERE f.location && ${envelopeSql(bbox)}
        AND f.district_id = ${districtId}::int
        AND (${kind}::facility_kind IS NULL OR f.kind = ${kind}::facility_kind)
      ORDER BY f.kind, f.name
      LIMIT ${VIEWPORT_LIMIT}::int`;
    return rows.map(toFacility);
  }

  // Inserts nothing unless the given district's boundary covers the point, so a facility can
  // never be filed under a district it is not in.
  async create(facility: NewFacility): Promise<Facility | null> {
    const rows = await this.prisma.$queryRaw<FacilityRow[]>`
      INSERT INTO facilities AS f (district_id, kind, name, location, address, contact_phone, capacity, amenities, attributes)
      SELECT d.id, ${facility.kind}::facility_kind, ${facility.name}::text, ${pointSql(facility)},
             ${facility.address}::text, ${facility.contactPhone}::text, ${facility.capacity}::int,
             ${facility.amenities}::text[], ${JSON.stringify(facility.attributes)}::jsonb
      FROM districts d
      WHERE d.id = ${facility.districtId}::int AND ST_Covers(d.boundary, ${pointSql(facility)})
      RETURNING ${FACILITY_COLUMNS}`;
    return rows[0] ? toFacility(rows[0]) : null;
  }

  // Same row-locked "before" as changeOccupancy, so a capacity cut racing an occupancy delta
  // judges both the capacity rule and the 85 % crossing against the committed headcount.
  async updateDetails(id: string, changes: FacilityChanges): Promise<DetailsUpdate> {
    const rows = await this.prisma.$queryRaw<DetailsUpdateRow[]>`
      WITH previous AS (
        SELECT id, occupancy, capacity FROM facilities WHERE id = ${id}::uuid FOR UPDATE
      ),
      updated AS (
        UPDATE facilities AS f SET
          name = COALESCE(${changes.name ?? null}::text, f.name),
          capacity = COALESCE(${changes.capacity ?? null}::int, f.capacity),
          is_operational = COALESCE(${changes.isOperational ?? null}::boolean, f.is_operational),
          address = CASE WHEN ${changes.address !== undefined}::boolean
                         THEN ${changes.address ?? null}::text ELSE f.address END,
          contact_phone = CASE WHEN ${changes.contactPhone !== undefined}::boolean
                               THEN ${changes.contactPhone ?? null}::text ELSE f.contact_phone END,
          amenities = COALESCE(${changes.amenities ?? null}::text[], f.amenities),
          attributes = COALESCE(${changes.attributes ? JSON.stringify(changes.attributes) : null}::jsonb, f.attributes)
        FROM previous
        WHERE f.id = previous.id AND f.occupancy <= COALESCE(${changes.capacity ?? null}::int, f.capacity)
        RETURNING ${FACILITY_COLUMNS}
      )
      SELECT previous.occupancy AS previous_occupancy, previous.capacity AS previous_capacity, updated.*
      FROM previous
      LEFT JOIN updated ON true`;

    const row = rows[0];
    if (!row) return { outcome: 'NOT_FOUND' };
    if (row.id === null) return { outcome: 'CAPACITY_BELOW_OCCUPANCY', occupancy: row.previous_occupancy };
    return {
      outcome: 'UPDATED',
      before: { occupancy: row.previous_occupancy, capacity: row.previous_capacity },
      facility: toFacility(row),
    };
  }

  // Clamped inside one UPDATE, never read-modify-write, so concurrent deltas are never lost
  // (CLAUDE.md rule 4). Without the row lock in the CTE, a writer queued behind another would
  // report its stale snapshot as "before" and raise a second 85 % alert.
  async changeOccupancy(id: string, delta: number): Promise<OccupancyChange | null> {
    const rows = await this.prisma.$queryRaw<
      { id: string; district_id: number; name: string; capacity: number; occupancy: number; previous_occupancy: number }[]
    >`
      WITH previous AS (
        SELECT id, occupancy FROM facilities WHERE id = ${id}::uuid FOR UPDATE
      )
      UPDATE facilities AS f
      SET occupancy = GREATEST(0, LEAST(f.occupancy + ${delta}::int, f.capacity))
      FROM previous
      WHERE f.id = previous.id
      RETURNING f.id, f.district_id, f.name, f.capacity, f.occupancy, previous.occupancy AS previous_occupancy`;

    const row = rows[0];
    return row
      ? {
          facility: { id: row.id, districtId: row.district_id, name: row.name },
          before: { occupancy: row.previous_occupancy, capacity: row.capacity },
          after: { occupancy: row.occupancy, capacity: row.capacity },
        }
      : null;
  }

  async adjustInventory(
    facilityId: string,
    item: InventoryItem,
    change: { delta: number; lowStockThreshold?: number | null },
  ): Promise<InventoryLine> {
    const rows = await this.prisma.$queryRaw<InventoryRow[]>`
      INSERT INTO facility_inventory AS inv (facility_id, item, quantity, low_stock_threshold)
      VALUES (${facilityId}::uuid, ${item}::inventory_item, GREATEST(${change.delta}::int, 0),
              ${change.lowStockThreshold ?? null}::int)
      ON CONFLICT (facility_id, item) DO UPDATE SET
        quantity = GREATEST(inv.quantity + ${change.delta}::int, 0),
        low_stock_threshold = CASE WHEN ${change.lowStockThreshold !== undefined}::boolean
                                   THEN EXCLUDED.low_stock_threshold ELSE inv.low_stock_threshold END
      RETURNING inv.item::text AS item, inv.quantity, inv.low_stock_threshold, inv.updated_at`;
    return toInventoryLine(rows[0]!);
  }
}
