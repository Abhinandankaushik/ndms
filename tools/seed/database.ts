import type { ClientBase } from 'pg';
import type { SeedDataset } from './dataset.ts';
import type { LonLat } from './geo.ts';

type Db = Pick<ClientBase, 'query'>;

const KEPT_TABLES = ['schema_migrations', 'spatial_ref_sys'];

const iso = (ms: number): string => new Date(ms).toISOString();
const isoOrNull = (ms: number | null): string | null => (ms === null ? null : iso(ms));
const lonOf = (point: LonLat | null): number | null => point?.lon ?? null;
const latOf = (point: LonLat | null): number | null => point?.lat ?? null;
const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

// Every public table migrations created, so a table added by a later migration is reset too.
export async function domainTables(db: Db): Promise<string[]> {
  const result = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT (tablename = ANY($1::text[])) ORDER BY tablename`,
    [KEPT_TABLES],
  );
  return result.rows.map((row) => row.tablename);
}

export async function populatedTables(db: Db, tables: readonly string[]): Promise<string[]> {
  const populated: string[] = [];
  for (const table of tables) {
    const result = await db.query<{ populated: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${quoteIdentifier(table)}) AS populated`);
    if (result.rows[0]?.populated) populated.push(table);
  }
  return populated;
}

// RESTART IDENTITY keeps the serial ids (district, villages) the same on every run.
export async function truncateTables(db: Db, tables: readonly string[]): Promise<void> {
  if (tables.length === 0) return;
  await db.query(`TRUNCATE ${tables.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);
}

export async function rowCounts(db: Db, tables: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const table of tables) {
    const result = await db.query<{ rows: number }>(`SELECT count(*)::int AS rows FROM ${quoteIdentifier(table)}`);
    counts.set(table, result.rows[0]?.rows ?? 0);
  }
  return counts;
}

export async function writeDataset(db: Db, dataset: SeedDataset): Promise<void> {
  const districtId = await insertDistrict(db, dataset);
  await insertVillages(db, dataset, districtId);
  await insertFacilities(db, dataset, districtId);
  await insertInventory(db, dataset);
  await insertTeams(db, dataset, districtId);
  await insertUsers(db, dataset, districtId);
  await insertVolunteerProfiles(db, dataset);
  await insertIncidents(db, dataset, districtId);
  await insertStatusLog(db, dataset);
  await insertReviews(db, dataset);
  await insertMissions(db, dataset);
}

async function insertDistrict(db: Db, dataset: SeedDataset): Promise<number> {
  const { district } = dataset;
  const result = await db.query<{ id: number }>(
    `INSERT INTO districts (name, state, boundary, population, created_at)
     VALUES ($1::text, $2::text, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3::text), 4326))::geography, $4::int, $5::timestamptz)
     RETURNING id`,
    [district.name, district.state, district.boundaryGeoJson, district.population, iso(dataset.anchorMs)],
  );
  return result.rows[0]!.id;
}

async function insertVillages(db: Db, dataset: SeedDataset, districtId: number): Promise<void> {
  const villages = dataset.settlements;
  await db.query(
    `INSERT INTO villages (district_id, name, location, population)
     SELECT $1::int, v.name, ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)::geography, v.population
     FROM unnest($2::text[], $3::float8[], $4::float8[], $5::int[]) WITH ORDINALITY AS v(name, lon, lat, population, position)
     ORDER BY v.position`,
    [
      districtId,
      villages.map((village) => village.name),
      villages.map((village) => village.location.lon),
      villages.map((village) => village.location.lat),
      villages.map((village) => village.population),
    ],
  );
}

async function insertFacilities(db: Db, dataset: SeedDataset, districtId: number): Promise<void> {
  const { facilities } = dataset;
  await db.query(
    `INSERT INTO facilities (id, district_id, kind, name, location, capacity, occupancy, attributes, created_at, updated_at)
     SELECT f.id, $1::int, f.kind, f.name, ST_SetSRID(ST_MakePoint(f.lon, f.lat), 4326)::geography,
            f.capacity, f.occupancy, f.attributes, $10::timestamptz, $10::timestamptz
     FROM unnest($2::uuid[], $3::facility_kind[], $4::text[], $5::float8[], $6::float8[], $7::int[], $8::int[], $9::jsonb[])
       AS f(id, kind, name, lon, lat, capacity, occupancy, attributes)`,
    [
      districtId,
      facilities.map((facility) => facility.id),
      facilities.map((facility) => facility.kind),
      facilities.map((facility) => facility.name),
      facilities.map((facility) => facility.location.lon),
      facilities.map((facility) => facility.location.lat),
      facilities.map((facility) => facility.capacity),
      facilities.map((facility) => facility.occupancy),
      facilities.map((facility) => JSON.stringify(facility.attributes)),
      iso(dataset.anchorMs),
    ],
  );
}

async function insertInventory(db: Db, dataset: SeedDataset): Promise<void> {
  const { inventory } = dataset;
  await db.query(
    `INSERT INTO facility_inventory (facility_id, item, quantity, low_stock_threshold, updated_at)
     SELECT line.facility_id, line.item, line.quantity, line.low_stock_threshold, $5::timestamptz
     FROM unnest($1::uuid[], $2::inventory_item[], $3::int[], $4::int[]) AS line(facility_id, item, quantity, low_stock_threshold)`,
    [
      inventory.map((line) => line.facilityId),
      inventory.map((line) => line.item),
      inventory.map((line) => line.quantity),
      inventory.map((line) => line.lowStockThreshold),
      iso(dataset.anchorMs),
    ],
  );
}

// current_location starts at the base: no team has reported a live position yet.
async function insertTeams(db: Db, dataset: SeedDataset, districtId: number): Promise<void> {
  const { teams } = dataset;
  await db.query(
    `INSERT INTO rescue_teams (id, district_id, name, agency, team_size, capabilities, base_location, current_location,
                               is_available, created_at, updated_at)
     SELECT t.id, $1::int, t.name, t.agency, t.team_size, ARRAY(SELECT jsonb_array_elements_text(t.capabilities)),
            base.location, base.location, t.is_available, $10::timestamptz, $10::timestamptz
     FROM unnest($2::uuid[], $3::text[], $4::rescue_agency[], $5::int[], $6::jsonb[], $7::float8[], $8::float8[], $9::boolean[])
       AS t(id, name, agency, team_size, capabilities, lon, lat, is_available)
     CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography AS location) base`,
    [
      districtId,
      teams.map((team) => team.id),
      teams.map((team) => team.name),
      teams.map((team) => team.agency),
      teams.map((team) => team.teamSize),
      teams.map((team) => JSON.stringify(team.capabilities)),
      teams.map((team) => team.base.lon),
      teams.map((team) => team.base.lat),
      teams.map((team) => team.isAvailable),
      iso(dataset.anchorMs),
    ],
  );
}

async function insertUsers(db: Db, dataset: SeedDataset, districtId: number): Promise<void> {
  const { users } = dataset;
  await db.query(
    `INSERT INTO users (id, phone, full_name, role, district_id, rescue_team_id, facility_id, phone_verified_at,
                        last_location, last_location_at, created_at, updated_at)
     SELECT u.id, u.phone, u.full_name, u.role, CASE WHEN u.in_district THEN $1::int END, u.rescue_team_id, u.facility_id,
            u.created_at,
            CASE WHEN u.lon IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(u.lon, u.lat), 4326)::geography END,
            u.last_location_at, u.created_at, u.created_at
     FROM unnest($2::uuid[], $3::text[], $4::text[], $5::user_role[], $6::boolean[], $7::uuid[], $8::uuid[],
                 $9::float8[], $10::float8[], $11::timestamptz[], $12::timestamptz[])
       AS u(id, phone, full_name, role, in_district, rescue_team_id, facility_id, lon, lat, last_location_at, created_at)`,
    [
      districtId,
      users.map((user) => user.id),
      users.map((user) => user.phone),
      users.map((user) => user.fullName),
      users.map((user) => user.role),
      users.map((user) => user.inDistrict),
      users.map((user) => user.rescueTeamId),
      users.map((user) => user.facilityId),
      users.map((user) => lonOf(user.lastLocation)),
      users.map((user) => latOf(user.lastLocation)),
      users.map((user) => isoOrNull(user.lastLocationMs)),
      users.map((user) => iso(user.createdMs)),
    ],
  );
}

async function insertVolunteerProfiles(db: Db, dataset: SeedDataset): Promise<void> {
  const profiles = dataset.volunteerProfiles;
  await db.query(
    `INSERT INTO volunteer_profiles (user_id, skills, service_radius_km, verification_status, reviewed_by, reviewed_at,
                                     created_at, updated_at)
     SELECT v.user_id, ARRAY(SELECT jsonb_array_elements_text(v.skills)), v.service_radius_km, 'VERIFIED',
            v.reviewed_by, v.reviewed_at, v.created_at, v.reviewed_at
     FROM unnest($1::uuid[], $2::jsonb[], $3::smallint[], $4::uuid[], $5::timestamptz[], $6::timestamptz[])
       AS v(user_id, skills, service_radius_km, reviewed_by, reviewed_at, created_at)`,
    [
      profiles.map((profile) => profile.userId),
      profiles.map((profile) => JSON.stringify(profile.skills)),
      profiles.map((profile) => profile.serviceRadiusKm),
      profiles.map((profile) => profile.reviewedBy),
      profiles.map((profile) => iso(profile.reviewedMs)),
      profiles.map((profile) => iso(profile.createdMs)),
    ],
  );
}

// created_at is written explicitly, reported_at plus a few seconds, which satisfies
// incidents_reported_at_clamped (reported_at within the 24 hours before created_at).
async function insertIncidents(db: Db, dataset: SeedDataset, districtId: number): Promise<void> {
  const { incidents } = dataset;
  await db.query(
    `INSERT INTO incidents (id, client_uuid, district_id, reporter_id, type, status, is_sos, location, location_source,
                            location_accuracy_m, address_text, description, people_affected, has_elderly, has_children,
                            has_injured, duplicate_of, reported_at, created_at, updated_at, resolved_at)
     SELECT i.id, i.client_uuid, $1::int, i.reporter_id, i.type, i.status, i.is_sos,
            CASE WHEN i.lon IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(i.lon, i.lat), 4326)::geography END,
            i.location_source, i.accuracy_m, i.address_text, i.description, i.people_affected, i.has_elderly,
            i.has_children, i.has_injured, i.duplicate_of, i.reported_at, i.created_at, i.updated_at, i.resolved_at
     FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::disaster_type[], $6::incident_status[], $7::boolean[],
                 $8::float8[], $9::float8[], $10::location_source[], $11::real[], $12::text[], $13::text[], $14::int[],
                 $15::boolean[], $16::boolean[], $17::boolean[], $18::uuid[], $19::timestamptz[], $20::timestamptz[],
                 $21::timestamptz[], $22::timestamptz[])
       AS i(id, client_uuid, reporter_id, type, status, is_sos, lon, lat, location_source, accuracy_m, address_text,
            description, people_affected, has_elderly, has_children, has_injured, duplicate_of, reported_at, created_at,
            updated_at, resolved_at)`,
    [
      districtId,
      incidents.map((incident) => incident.id),
      incidents.map((incident) => incident.clientUuid),
      incidents.map((incident) => incident.reporterId),
      incidents.map((incident) => incident.type),
      incidents.map((incident) => incident.status),
      incidents.map((incident) => incident.isSos),
      incidents.map((incident) => lonOf(incident.location)),
      incidents.map((incident) => latOf(incident.location)),
      incidents.map((incident) => incident.locationSource),
      incidents.map((incident) => incident.accuracyM),
      incidents.map((incident) => incident.addressText),
      incidents.map((incident) => incident.description),
      incidents.map((incident) => incident.peopleAffected),
      incidents.map((incident) => incident.hasElderly),
      incidents.map((incident) => incident.hasChildren),
      incidents.map((incident) => incident.hasInjured),
      incidents.map((incident) => incident.duplicateOf),
      incidents.map((incident) => iso(incident.reportedMs)),
      incidents.map((incident) => iso(incident.createdMs)),
      incidents.map((incident) => iso(incident.updatedMs)),
      incidents.map((incident) => isoOrNull(incident.resolvedMs)),
    ],
  );
}

async function insertStatusLog(db: Db, dataset: SeedDataset): Promise<void> {
  const log = dataset.statusLog;
  await db.query(
    `INSERT INTO incident_status_log (incident_id, from_status, to_status, changed_by, note, changed_at)
     SELECT l.incident_id, l.from_status, l.to_status, l.changed_by, l.note, l.changed_at
     FROM unnest($1::uuid[], $2::incident_status[], $3::incident_status[], $4::uuid[], $5::text[], $6::timestamptz[])
       WITH ORDINALITY AS l(incident_id, from_status, to_status, changed_by, note, changed_at, position)
     ORDER BY l.position`,
    [
      log.map((entry) => entry.incidentId),
      log.map((entry) => entry.fromStatus),
      log.map((entry) => entry.toStatus),
      log.map((entry) => entry.changedBy),
      log.map((entry) => entry.note),
      log.map((entry) => iso(entry.changedMs)),
    ],
  );
}

async function insertReviews(db: Db, dataset: SeedDataset): Promise<void> {
  const { reviews } = dataset;
  await db.query(
    `INSERT INTO incident_reviews (id, incident_id, reason, related_incident_id, details, flagged_by, status, resolved_by,
                                   resolution_note, created_at, resolved_at)
     SELECT r.id, r.incident_id, r.reason, r.related_incident_id, r.details, r.flagged_by, r.status, r.resolved_by,
            r.resolution_note, r.created_at, r.resolved_at
     FROM unnest($1::uuid[], $2::uuid[], $3::review_reason[], $4::uuid[], $5::jsonb[], $6::uuid[], $7::review_status[],
                 $8::uuid[], $9::text[], $10::timestamptz[], $11::timestamptz[])
       AS r(id, incident_id, reason, related_incident_id, details, flagged_by, status, resolved_by, resolution_note,
            created_at, resolved_at)`,
    [
      reviews.map((review) => review.id),
      reviews.map((review) => review.incidentId),
      reviews.map((review) => review.reason),
      reviews.map((review) => review.relatedIncidentId),
      reviews.map((review) => JSON.stringify(review.details)),
      reviews.map((review) => review.flaggedBy),
      reviews.map((review) => review.status),
      reviews.map((review) => review.resolvedBy),
      reviews.map((review) => review.resolutionNote),
      reviews.map((review) => iso(review.createdMs)),
      reviews.map((review) => isoOrNull(review.resolvedMs)),
    ],
  );
}

async function insertMissions(db: Db, dataset: SeedDataset): Promise<void> {
  const { missions } = dataset;
  await db.query(
    `INSERT INTO missions (id, incident_id, team_id, assigned_by, status, eta_minutes, people_rescued, injured_count,
                           hospital_required, outcome_notes, assigned_at, accepted_at, reached_at, completed_at, updated_at)
     SELECT m.id, m.incident_id, m.team_id, m.assigned_by, m.status, m.eta_minutes, m.people_rescued, m.injured_count,
            m.hospital_required, m.outcome_notes, m.assigned_at, m.accepted_at, m.reached_at, m.completed_at, m.updated_at
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::mission_status[], $6::int[], $7::int[], $8::int[],
                 $9::boolean[], $10::text[], $11::timestamptz[], $12::timestamptz[], $13::timestamptz[],
                 $14::timestamptz[], $15::timestamptz[])
       AS m(id, incident_id, team_id, assigned_by, status, eta_minutes, people_rescued, injured_count, hospital_required,
            outcome_notes, assigned_at, accepted_at, reached_at, completed_at, updated_at)`,
    [
      missions.map((mission) => mission.id),
      missions.map((mission) => mission.incidentId),
      missions.map((mission) => mission.teamId),
      missions.map((mission) => mission.assignedBy),
      missions.map((mission) => mission.status),
      missions.map((mission) => mission.etaMinutes),
      missions.map((mission) => mission.peopleRescued),
      missions.map((mission) => mission.injuredCount),
      missions.map((mission) => mission.hospitalRequired),
      missions.map((mission) => mission.outcomeNotes),
      missions.map((mission) => iso(mission.assignedMs)),
      missions.map((mission) => isoOrNull(mission.acceptedMs)),
      missions.map((mission) => isoOrNull(mission.reachedMs)),
      missions.map((mission) => isoOrNull(mission.completedMs)),
      missions.map((mission) => iso(mission.updatedMs)),
    ],
  );
}

// Offsets are measured from the newest report, not from the clock, so two seeds run at
// different times fingerprint identically when they generated the same data.
const INCIDENT_FINGERPRINT_SQL = `
  WITH newest AS (SELECT max(reported_at) AS reported_at FROM incidents),
  rows AS (
    SELECT i.type::text AS type,
           COALESCE(round(ST_X(i.location::geometry)::numeric, 7)::text, '-') AS lon,
           COALESCE(round(ST_Y(i.location::geometry)::numeric, 7)::text, '-') AS lat,
           round(extract(epoch FROM newest.reported_at - i.reported_at) * 1000)::bigint AS offset_ms
    FROM incidents i CROSS JOIN newest
  )
  SELECT count(*)::int AS incidents,
         md5(string_agg(concat_ws('|', offset_ms, type, lon, lat), E'\\n' ORDER BY offset_ms, type, lon, lat)) AS fingerprint
  FROM rows`;

export interface IncidentFingerprint {
  incidents: number;
  fingerprint: string | null;
}

export async function incidentFingerprint(db: Db): Promise<IncidentFingerprint> {
  const result = await db.query<IncidentFingerprint>(INCIDENT_FINGERPRINT_SQL);
  return result.rows[0]!;
}
