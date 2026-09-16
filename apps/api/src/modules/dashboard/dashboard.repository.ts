import { Injectable } from '@nestjs/common';
import {
  OPEN_INCIDENT_STATUSES,
  type FacilityKind,
  type InventoryItem,
  type MissionStatus,
} from '../../common/domain/enums';
import { envelopeSql } from '../../common/geo/geo-sql';
import { PrismaService } from '../../infra/database/prisma.service';
import type { HeatmapQuery } from './dashboard.schemas';

// A team is on a mission once it has accepted one; an ASSIGNED mission still awaits the
// team's answer and leaves it available.
const DEPLOYED_MISSION_STATUSES: readonly MissionStatus[] = ['ACCEPTED', 'EN_ROUTE', 'ON_SITE'];

// "Today" is the control room's calendar day, and every district is in India.
const CONTROL_ROOM_TIME_ZONE = 'Asia/Kolkata';

// Keeps a whole-district view at the finest grid renderable; the cap drops the quietest
// cells first, so the hotspots always survive.
const MAX_HEATMAP_CELLS = 5000;

export interface DashboardSummary {
  activeIncidents: number;
  openSos: number;
  peopleAffected: number;
  pendingReviews: number;
  teamsTotal: number;
  teamsAvailable: number;
  teamsOnMission: number;
  shelterCapacity: number;
  shelterOccupancy: number;
  shelterUtilisation: number;
  peopleRescuedToday: number;
  avgResponseMinutes24h: number | null;
  verifiedVolunteers: number;
  generatedAt: Date;
}

export interface HeatmapCell {
  lat: number;
  lon: number;
  count: number;
  avgPriority: number | null;
}

export interface InventoryLine {
  item: InventoryItem;
  quantity: number;
  lowStockThreshold: number | null;
  isLow: boolean;
  updatedAt: Date;
}

export interface ResourceOverview {
  facilityId: string;
  name: string;
  kind: FacilityKind;
  capacity: number;
  occupancy: number;
  utilisation: number;
  lowStock: InventoryLine[];
}

interface SummaryRow {
  active_incidents: number;
  open_sos: number;
  people_affected: number;
  pending_reviews: number;
  teams_total: number;
  teams_available: number;
  teams_on_mission: number;
  shelter_capacity: number;
  shelter_occupancy: number;
  shelter_utilisation: number;
  people_rescued_today: number;
  avg_response_minutes_24h: number | null;
  verified_volunteers: number;
  generated_at: Date;
}

interface ResourceRow {
  facility_id: string;
  name: string;
  kind: FacilityKind;
  capacity: number;
  occupancy: number;
  utilisation: number;
  item: InventoryItem | null;
  quantity: number | null;
  low_stock_threshold: number | null;
  updated_at: Date | null;
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Response time runs from reported_at, the device clock, to the first team on site: a
  // report held offline was already waiting for help (CLAUDE.md rule 3).
  async summary(districtId: number): Promise<DashboardSummary> {
    const rows = await this.prisma.$queryRaw<SummaryRow[]>`
      WITH open_incidents AS (
        SELECT count(*)::int AS active_incidents,
               (count(*) FILTER (WHERE i.is_sos))::int AS open_sos,
               COALESCE(sum(i.people_affected), 0)::int AS people_affected
        FROM incidents i
        WHERE i.district_id = ${districtId}::int
          AND i.status = ANY(${[...OPEN_INCIDENT_STATUSES]}::incident_status[])
      ),
      reviews AS (
        SELECT count(*)::int AS pending_reviews
        FROM incident_reviews r
        JOIN incidents i ON i.id = r.incident_id
        WHERE r.status = 'PENDING' AND i.district_id = ${districtId}::int
      ),
      teams AS (
        SELECT count(*)::int AS teams_total,
               (count(*) FILTER (WHERE t.is_available))::int AS teams_available,
               (count(*) FILTER (WHERE deployed.team_id IS NOT NULL))::int AS teams_on_mission
        FROM rescue_teams t
        LEFT JOIN (
          SELECT DISTINCT m.team_id
          FROM missions m
          WHERE m.status = ANY(${[...DEPLOYED_MISSION_STATUSES]}::mission_status[])
        ) deployed ON deployed.team_id = t.id
        WHERE t.district_id = ${districtId}::int
      ),
      shelters AS (
        SELECT COALESCE(sum(f.capacity), 0)::int AS shelter_capacity,
               COALESCE(sum(f.occupancy), 0)::int AS shelter_occupancy,
               COALESCE(sum(f.occupancy)::float8 / NULLIF(sum(f.capacity), 0), 0)::float8 AS shelter_utilisation
        FROM facilities f
        WHERE f.district_id = ${districtId}::int AND f.kind = 'SHELTER' AND f.is_operational
      ),
      rescued AS (
        SELECT COALESCE(sum(m.people_rescued), 0)::int AS people_rescued_today
        FROM missions m
        JOIN incidents i ON i.id = m.incident_id
        WHERE i.district_id = ${districtId}::int
          AND m.status = 'COMPLETED'
          AND m.completed_at >= date_trunc('day', now() AT TIME ZONE ${CONTROL_ROOM_TIME_ZONE}::text)
                                AT TIME ZONE ${CONTROL_ROOM_TIME_ZONE}::text
      ),
      first_arrivals AS (
        SELECT i.reported_at, min(m.reached_at) AS reached_at
        FROM missions m
        JOIN incidents i ON i.id = m.incident_id
        WHERE i.district_id = ${districtId}::int
        GROUP BY i.id, i.reported_at
        HAVING min(m.reached_at) >= now() - interval '24 hours'
      ),
      response AS (
        SELECT round(avg(extract(epoch FROM reached_at - reported_at) / 60), 1)::float8 AS avg_response_minutes_24h
        FROM first_arrivals
      ),
      volunteers AS (
        SELECT count(*)::int AS verified_volunteers
        FROM volunteer_profiles v
        JOIN users u ON u.id = v.user_id
        WHERE v.verification_status = 'VERIFIED' AND u.district_id = ${districtId}::int
      )
      SELECT open_incidents.*, reviews.*, teams.*, shelters.*, rescued.*, response.*, volunteers.*,
             now() AS generated_at
      FROM open_incidents, reviews, teams, shelters, rescued, response, volunteers`;

    const row = rows[0]!;
    return {
      activeIncidents: row.active_incidents,
      openSos: row.open_sos,
      peopleAffected: row.people_affected,
      pendingReviews: row.pending_reviews,
      teamsTotal: row.teams_total,
      teamsAvailable: row.teams_available,
      teamsOnMission: row.teams_on_mission,
      shelterCapacity: row.shelter_capacity,
      shelterOccupancy: row.shelter_occupancy,
      shelterUtilisation: row.shelter_utilisation,
      peopleRescuedToday: row.people_rescued_today,
      avgResponseMinutes24h: row.avg_response_minutes_24h,
      verifiedVolunteers: row.verified_volunteers,
      generatedAt: row.generated_at,
    };
  }

  // Cells are grid nodes rather than point centroids, so a cell stays put as reports arrive.
  async heatmap(districtId: number, query: HeatmapQuery): Promise<HeatmapCell[]> {
    const rows = await this.prisma.$queryRaw<
      { lat: number; lon: number; count: number; avg_priority: number | null }[]
    >`
      SELECT cell.lat, cell.lon, count(*)::int AS count,
             round(avg(i.priority_score), 2)::float8 AS avg_priority
      FROM incidents i
      CROSS JOIN LATERAL (
        SELECT round(ST_Y(snapped)::numeric, 6)::float8 AS lat, round(ST_X(snapped)::numeric, 6)::float8 AS lon
        FROM ST_SnapToGrid(i.location::geometry, ${query.cellDegrees}::float8) AS snapped
      ) cell
      WHERE i.location && ${envelopeSql(query.bbox)}
        AND i.district_id = ${districtId}::int
        AND i.status = ANY(${[...OPEN_INCIDENT_STATUSES]}::incident_status[])
        AND i.reported_at >= now() - make_interval(hours => ${query.hours}::int)
      GROUP BY cell.lat, cell.lon
      ORDER BY count(*) DESC, cell.lat, cell.lon
      LIMIT ${MAX_HEATMAP_CELLS}::int`;

    return rows.map((row) => ({ lat: row.lat, lon: row.lon, count: row.count, avgPriority: row.avg_priority }));
  }

  // Closed facilities are left out: their unused capacity would read as free space.
  async resources(districtId: number): Promise<ResourceOverview[]> {
    const rows = await this.prisma.$queryRaw<ResourceRow[]>`
      SELECT f.id AS facility_id, f.name, f.kind::text AS kind, f.capacity, f.occupancy,
             COALESCE(f.occupancy::float8 / NULLIF(f.capacity, 0), 0)::float8 AS utilisation,
             inv.item::text AS item, inv.quantity, inv.low_stock_threshold, inv.updated_at
      FROM facilities f
      LEFT JOIN facility_inventory inv
        ON inv.facility_id = f.id AND inv.quantity <= inv.low_stock_threshold
      WHERE f.district_id = ${districtId}::int AND f.is_operational
      ORDER BY utilisation DESC, f.name, f.id, inv.item`;

    const overview: ResourceOverview[] = [];
    for (const row of rows) {
      let facility = overview.at(-1);
      if (facility?.facilityId !== row.facility_id) {
        facility = {
          facilityId: row.facility_id,
          name: row.name,
          kind: row.kind,
          capacity: row.capacity,
          occupancy: row.occupancy,
          utilisation: row.utilisation,
          lowStock: [],
        };
        overview.push(facility);
      }
      if (row.item !== null) {
        facility.lowStock.push({
          item: row.item,
          quantity: row.quantity!,
          lowStockThreshold: row.low_stock_threshold,
          isLow: true,
          updatedAt: row.updated_at!,
        });
      }
    }
    return overview;
  }
}
