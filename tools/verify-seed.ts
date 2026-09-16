// Read-only checks that the seeded database holds the dataset data/SOURCES.md describes, measured
// with PostGIS rather than trusted from the generator. Usage, from the repo root with Node 24:
//   node tools/verify-seed.ts
import pg from 'pg';
import { incidentFingerprint } from './seed/database.ts';
import { databaseUrl, UsageError } from './seed/env.ts';

interface Check {
  name: string;
  sql: string;
}

const OPEN = `('REPORTED', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS')`;

const CHECKS: readonly Check[] = [
  {
    name: 'district boundary',
    sql: `
      SELECT count(*) = 1 AND bool_and(ST_IsValid(boundary::geometry)) AS ok,
             format('%s district, %s km², population %s', count(*), round((sum(ST_Area(boundary)) / 1e6)::numeric, 1), max(population)) AS detail
      FROM districts`,
  },
  {
    name: 'every point inside the district',
    sql: `
      WITH points AS (
        SELECT location FROM villages
        UNION ALL SELECT location FROM facilities
        UNION ALL SELECT base_location FROM rescue_teams
        UNION ALL SELECT location FROM incidents WHERE location IS NOT NULL
        UNION ALL SELECT last_location FROM users WHERE last_location IS NOT NULL
      )
      SELECT count(*) FILTER (WHERE NOT ST_Covers(d.boundary, p.location)) = 0 AS ok,
             format('%s villages, facilities, team bases, incidents and volunteers checked; %s outside',
                    count(*), count(*) FILTER (WHERE NOT ST_Covers(d.boundary, p.location))) AS detail
      FROM points p CROSS JOIN districts d`,
  },
  {
    name: 'shelter and hospital capacities follow the heuristic',
    sql: `
      WITH rules (rule, capacity) AS (
        VALUES ('primary school', 150), ('secondary school', 400), ('college', 400), ('community centre', 200),
               ('school of unknown level', 150), ('hospital', 60), ('clinic', 10),
               ('hospital (OSM college named as a hospital)', 60)
      )
      SELECT count(*) FILTER (WHERE r.capacity IS DISTINCT FROM f.capacity) = 0 AND bool_and(f.occupancy <= f.capacity) AS ok,
             format('%s shelters (%s places), %s hospitals (%s beds); %s full shelters',
                    count(*) FILTER (WHERE f.kind = 'SHELTER'), sum(f.capacity) FILTER (WHERE f.kind = 'SHELTER'),
                    count(*) FILTER (WHERE f.kind = 'HOSPITAL'), sum(f.capacity) FILTER (WHERE f.kind = 'HOSPITAL'),
                    count(*) FILTER (WHERE f.kind = 'SHELTER' AND f.occupancy = f.capacity)) AS detail
      FROM facilities f LEFT JOIN rules r ON r.rule = f.attributes->>'capacityRule'`,
  },
  {
    name: 'rescue teams',
    sql: `
      SELECT count(*) BETWEEN 8 AND 12
             AND bool_and(EXISTS (SELECT 1 FROM users u WHERE u.rescue_team_id = t.id AND u.role = 'RESCUE_TEAM'))
             AND bool_and(ST_Equals(t.base_location::geometry, t.current_location::geometry)) AS ok,
             format('%s teams (%s), %s available', count(*),
                    (SELECT string_agg(format('%s %s', n, agency), ', ' ORDER BY agency)
                     FROM (SELECT agency, count(*) AS n FROM rescue_teams GROUP BY agency) a),
                    count(*) FILTER (WHERE t.is_available)) AS detail
      FROM rescue_teams t`,
  },
  {
    name: 'demo accounts',
    sql: `
      WITH expected AS (
        SELECT format('+9190000000%s', lpad(n::text, 2, '0')) AS phone,
               (ARRAY['CITIZEN', 'VOLUNTEER', 'RESCUE_TEAM', 'FACILITY_MANAGER', 'GOVT_OFFICIAL'])[(n - 1) / 3 + 1] AS role
        FROM generate_series(1, 15) n
      )
      SELECT count(u.id) = 15 AND bool_and(
               u.role::text = e.role
               AND (u.role <> 'RESCUE_TEAM' OR u.rescue_team_id IS NOT NULL)
               AND (u.role <> 'FACILITY_MANAGER' OR u.facility_id IS NOT NULL)
               AND ((u.role = 'CITIZEN') = (u.district_id IS NULL))
               AND (u.role <> 'VOLUNTEER' OR EXISTS (
                 SELECT 1 FROM volunteer_profiles v WHERE v.user_id = u.id AND v.verification_status = 'VERIFIED'))) AS ok,
             format('%s of 15 demo phones present with the expected role and assignment', count(u.id)) AS detail
      FROM expected e LEFT JOIN users u ON u.phone = e.phone`,
  },
  {
    name: 'incident timing',
    sql: `
      SELECT bool_and(created_at - reported_at BETWEEN interval '2 seconds' AND interval '1 minute')
             AND max(reported_at) - min(reported_at) <= interval '48 hours' AS ok,
             format('reported over %s; created_at - reported_at from %s to %s',
                    max(reported_at) - min(reported_at), min(created_at - reported_at), max(created_at - reported_at)) AS detail
      FROM incidents`,
  },
  {
    name: 'mostly open, mostly floods',
    sql: `
      SELECT avg((status IN ${OPEN})::int) > 0.5 AND mode() WITHIN GROUP (ORDER BY type) = 'FLOOD' AS ok,
             format('%s incidents, %s%% open, %s%% FLOOD, %s SOS, %s without a location', count(*),
                    round(100 * avg((status IN ${OPEN})::int), 1), round(100 * avg((type = 'FLOOD')::int), 1),
                    count(*) FILTER (WHERE is_sos), count(*) FILTER (WHERE location IS NULL)) AS detail
      FROM incidents`,
  },
  {
    name: 'duplicate cluster: 8 FIRE reports within 150 m and 12 minutes',
    sql: `
      WITH pending_duplicates AS (
        SELECT incident_id, related_incident_id FROM incident_reviews WHERE reason = 'POSSIBLE_DUPLICATE' AND status = 'PENDING'
      ),
      originals AS (
        SELECT related_incident_id AS original_id FROM pending_duplicates GROUP BY related_incident_id HAVING count(*) = 7
      ),
      members AS (
        SELECT o.original_id, i.*
        FROM originals o
        JOIN incidents i ON i.id = o.original_id
          OR i.id IN (SELECT incident_id FROM pending_duplicates WHERE related_incident_id = o.original_id)
      ),
      stats AS (
        SELECT original_id, count(*) AS reports, bool_and(type = 'FIRE') AS all_fire, bool_and(status IN ${OPEN}) AS all_open,
               max(reported_at) - min(reported_at) AS span,
               (SELECT max(ST_Distance(a.location, b.location)) FROM members a JOIN members b USING (original_id)
                WHERE a.original_id = m.original_id) AS max_distance_m
        FROM members m GROUP BY original_id
      )
      SELECT count(*) = 1 AND bool_and(reports = 8 AND all_fire AND all_open AND span <= interval '12 minutes' AND max_distance_m <= 150) AS ok,
             COALESCE(string_agg(format('%s FIRE reports, %s apart at most in time, %s m apart at most (PostGIS geography distance)',
                                        reports, span, round(max_distance_m::numeric, 1)), '; '), 'no cluster found') AS detail
      FROM stats`,
  },
  {
    name: 'status log consistent with each status',
    sql: `
      WITH steps AS (
        SELECT incident_id, from_status, to_status, changed_by,
               lag(to_status) OVER (PARTITION BY incident_id ORDER BY changed_at, id) AS previous_to,
               row_number() OVER (PARTITION BY incident_id ORDER BY changed_at, id) AS step,
               row_number() OVER (PARTITION BY incident_id ORDER BY changed_at DESC, id DESC) AS from_end
        FROM incident_status_log
      ),
      problems AS (
        SELECT incident_id AS id FROM steps
        WHERE (step = 1 AND (from_status IS NOT NULL OR to_status <> 'REPORTED'))
           OR (step > 1 AND from_status IS DISTINCT FROM previous_to)
        UNION
        SELECT i.id FROM incidents i LEFT JOIN steps s ON s.incident_id = i.id AND s.from_end = 1
        WHERE s.to_status IS DISTINCT FROM i.status
        UNION
        SELECT id FROM incidents
        WHERE (status = 'RESOLVED') <> (resolved_at IS NOT NULL)
           OR (status = 'REJECTED_DUPLICATE') <> (duplicate_of IS NOT NULL)
      )
      SELECT count(*) = 0 AS ok,
             format('%s log rows; %s incidents inconsistent', (SELECT count(*) FROM incident_status_log), count(*)) AS detail
      FROM problems`,
  },
  {
    name: 'missions match incident statuses and team availability',
    sql: `
      WITH open_missions AS (
        SELECT incident_id, array_agg(status::text) AS statuses FROM missions
        WHERE status IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE') GROUP BY incident_id
      ),
      incident_problems AS (
        SELECT i.id FROM incidents i LEFT JOIN open_missions om ON om.incident_id = i.id
        WHERE (i.status IN ('ASSIGNED', 'IN_PROGRESS')) <> (om.incident_id IS NOT NULL)
           OR (i.status = 'ASSIGNED' AND NOT om.statuses <@ ARRAY['ASSIGNED', 'ACCEPTED'])
           OR (i.status = 'IN_PROGRESS' AND NOT om.statuses && ARRAY['EN_ROUTE', 'ON_SITE'])
        UNION
        SELECT m.incident_id FROM missions m JOIN incidents i ON i.id = m.incident_id
        WHERE m.status = 'COMPLETED'
          AND (i.status <> 'RESOLVED' OR m.completed_at IS NULL OR m.reached_at IS NULL OR m.people_rescued IS NULL)
      ),
      team_problems AS (
        SELECT t.id FROM rescue_teams t
        WHERE t.is_available = EXISTS (
          SELECT 1 FROM missions m WHERE m.team_id = t.id AND m.status IN ('ACCEPTED', 'EN_ROUTE', 'ON_SITE'))
      )
      SELECT (SELECT count(*) FROM incident_problems) = 0 AND (SELECT count(*) FROM team_problems) = 0 AS ok,
             format('%s missions (%s); %s incident and %s team mismatches',
                    (SELECT count(*) FROM missions),
                    (SELECT string_agg(format('%s %s', n, status), ', ' ORDER BY status)
                     FROM (SELECT status, count(*) AS n FROM missions GROUP BY status) s),
                    (SELECT count(*) FROM incident_problems), (SELECT count(*) FROM team_problems)) AS detail`,
  },
  {
    name: 'review queue',
    sql: `
      WITH problems AS (
        SELECT r.id FROM incident_reviews r JOIN incidents i ON i.id = r.incident_id
        WHERE r.status = 'PENDING' AND i.status NOT IN ${OPEN}
        UNION ALL
        SELECT i.id FROM incidents i
        WHERE i.status = 'REJECTED_DUPLICATE' AND NOT EXISTS (
          SELECT 1 FROM incident_reviews r
          WHERE r.incident_id = i.id AND r.reason = 'POSSIBLE_DUPLICATE' AND r.status = 'RESOLVED' AND r.related_incident_id = i.duplicate_of)
        UNION ALL
        SELECT i.id FROM incidents i
        WHERE i.status IN ${OPEN} AND i.location IS NULL AND NOT EXISTS (
          SELECT 1 FROM incident_reviews r WHERE r.incident_id = i.id AND r.reason = 'LOCATION_UNCERTAIN' AND r.status = 'PENDING')
      )
      SELECT (SELECT count(*) FROM problems) = 0 AS ok,
             format('%s pending (%s); %s resolved; %s inconsistencies',
                    count(*) FILTER (WHERE status = 'PENDING'),
                    (SELECT string_agg(format('%s %s', n, reason), ', ' ORDER BY reason)
                     FROM (SELECT reason, count(*) AS n FROM incident_reviews WHERE status = 'PENDING' GROUP BY reason) p),
                    count(*) FILTER (WHERE status = 'RESOLVED'), (SELECT count(*) FROM problems)) AS detail
      FROM incident_reviews`,
  },
  {
    // The candidate rule of apps/worker/src/incidents.repository.ts. Every seeded flag must be
    // one the worker could raise, and the worker's sweep must never flag an original against
    // its own duplicates. In a dense dataset an unrelated nearby report can be the worker's
    // first choice instead of the seeded original; both are valid flags for a human to judge.
    name: 'seeded duplicate flags are valid under the worker rule',
    sql: `
      WITH seeded AS (
        SELECT incident_id, related_incident_id FROM incident_reviews WHERE reason = 'POSSIBLE_DUPLICATE' AND status = 'PENDING'
      ),
      evaluated AS (
        SELECT incident.id, s.related_incident_id,
               related.type = incident.type
                 AND related.status IN ${OPEN}
                 AND ST_DWithin(related.location, incident.location, 150)
                 AND abs(extract(epoch FROM related.reported_at - incident.reported_at)) <= 15 * 60
                 AND (related.created_at, related.reported_at, related.id) < (incident.created_at, incident.reported_at, incident.id) AS valid,
               candidate.id AS candidate_id
        FROM incidents incident
        LEFT JOIN seeded s ON s.incident_id = incident.id
        LEFT JOIN incidents related ON related.id = s.related_incident_id
        LEFT JOIN LATERAL (
          SELECT other.id FROM incidents other
          WHERE other.type = incident.type
            AND other.status IN ${OPEN}
            AND ST_DWithin(other.location, incident.location, 150)
            AND other.reported_at BETWEEN incident.reported_at - interval '15 minutes' AND incident.reported_at + interval '15 minutes'
            AND (other.created_at, other.reported_at, other.id) < (incident.created_at, incident.reported_at, incident.id)
          ORDER BY other.created_at, other.reported_at, other.id
          LIMIT 1
        ) candidate ON true
        WHERE incident.status IN ${OPEN} AND incident.location IS NOT NULL
      ),
      reversed AS (
        SELECT e.id FROM evaluated e
        WHERE e.candidate_id IN (SELECT incident_id FROM seeded WHERE related_incident_id = e.id)
      )
      SELECT count(*) FILTER (WHERE related_incident_id IS NOT NULL AND valid IS NOT TRUE) = 0
             AND (SELECT count(*) FROM reversed) = 0 AS ok,
             format('%s seeded flags, %s invalid, %s originals the worker would flag against their own duplicates; %s are the worker''s first choice; its sweep would add %s more flags',
                    count(*) FILTER (WHERE related_incident_id IS NOT NULL),
                    count(*) FILTER (WHERE related_incident_id IS NOT NULL AND valid IS NOT TRUE),
                    (SELECT count(*) FROM reversed),
                    count(*) FILTER (WHERE candidate_id = related_incident_id),
                    count(*) FILTER (WHERE related_incident_id IS NULL AND candidate_id IS NOT NULL)) AS detail
      FROM evaluated`,
  },
];

async function verify(): Promise<boolean> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    let allPassed = true;
    for (const check of CHECKS) {
      const { rows } = await client.query<{ ok: boolean | null; detail: string | null }>(check.sql);
      const passed = rows[0]?.ok === true;
      allPassed &&= passed;
      console.log(`${passed ? 'PASS' : 'FAIL'}  ${check.name}: ${rows[0]?.detail ?? 'no result'}`);
    }
    const { fingerprint, incidents } = await incidentFingerprint(client);
    console.log(`incident fingerprint (types, coordinates, reported_at offsets): ${fingerprint} over ${incidents} incidents`);
    return allPassed;
  } finally {
    await client.end();
  }
}

try {
  if (!(await verify())) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof UsageError ? error.message : error);
  process.exitCode = 1;
}
