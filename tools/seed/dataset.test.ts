import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildSeedDataset, type SeedDataset } from './dataset.ts';
import { OPEN_INCIDENT_STATUSES, OPEN_MISSION_STATUSES, type MissionStatus } from './domain.ts';
import { REPO_ROOT } from './env.ts';
import { distanceM, isInsideMultiPolygon, type LonLat } from './geo.ts';
import { CLUSTER, HISTORY_MS, JITTER_RADIUS_M, NEWEST_REPORT_AGE_MS } from './incidents.ts';
import { loadSeedInputs } from './inputs.ts';

const INPUTS = loadSeedInputs(REPO_ROOT);
const ANCHOR_MS = Date.UTC(2026, 8, 15, 6, 30);
const INCIDENTS = 1000;
const DATASET = buildSeedDataset(INPUTS, { incidentCount: INCIDENTS, anchorMs: ANCHOR_MS });

const MINUTE_MS = 60_000;
const DEPLOYED: readonly MissionStatus[] = ['ACCEPTED', 'EN_ROUTE', 'ON_SITE'];
const INCIDENT_STATUS_FOR_MISSION: Partial<Record<MissionStatus, string>> = {
  ASSIGNED: 'ASSIGNED',
  ACCEPTED: 'ASSIGNED',
  EN_ROUTE: 'IN_PROGRESS',
  ON_SITE: 'IN_PROGRESS',
  COMPLETED: 'RESOLVED',
};

const samePoint = (a: LonLat, b: LonLat) => a.lon === b.lon && a.lat === b.lat;
const byId = <T extends { id: string }>(rows: readonly T[]) => new Map(rows.map((row) => [row.id, row]));

// Every timestamp (a field ending in Ms) rewritten as an age, so datasets built at different
// moments compare equal when they hold the same data.
function asAges(value: unknown, anchorMs: number): unknown {
  if (Array.isArray(value)) return value.map((item) => asAges(item, anchorMs));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [key, key.endsWith('Ms') && typeof field === 'number' ? anchorMs - field : asAges(field, anchorMs)]),
  );
}

const withoutAnchor = ({ anchorMs, ...dataset }: SeedDataset) => asAges(dataset, anchorMs) as Record<string, unknown>;

// Digests per section rather than deepEqual: a diff of two different 1,000-incident datasets
// takes assert tens of seconds and runs out of memory before it names the difference.
function assertSameSections(actual: Record<string, unknown>, expected: Record<string, unknown>): void {
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const [section, value] of Object.entries(expected)) assert.equal(digest(actual[section]), digest(value), `${section} differs`);
}

test('the same inputs build the same dataset, whenever it is built', () => {
  const again = buildSeedDataset(INPUTS, { incidentCount: INCIDENTS, anchorMs: ANCHOR_MS });
  assertSameSections(again as unknown as Record<string, unknown>, DATASET as unknown as Record<string, unknown>);
  const hoursLater = buildSeedDataset(INPUTS, { incidentCount: INCIDENTS, anchorMs: ANCHOR_MS + 7 * 3_600_000 + 12_345 });
  assertSameSections(withoutAnchor(hoursLater), withoutAnchor(DATASET));
});

test('villages, facilities and team bases sit on real OSM points', () => {
  const osmPoints = new Map<string, LonLat>([
    ...INPUTS.places.map((place) => [place.osmId, place.location] as const),
    ...INPUTS.facilities.map((facility) => [facility.osmId, facility.location] as const),
  ]);
  for (const settlement of DATASET.settlements) assert.ok(samePoint(settlement.location, osmPoints.get(settlement.osmId)!), settlement.osmId);
  for (const facility of DATASET.facilities) assert.ok(samePoint(facility.location, osmPoints.get(facility.osmId)!), facility.osmId);
  for (const team of DATASET.teams) assert.ok(samePoint(team.base, osmPoints.get(team.baseOsmId)!), team.name);

  assert.deepEqual(
    DATASET.mergedPlaces.map((place) => place.name),
    ['Bhagwanpur', 'Kharua'],
  );
  assert.equal(DATASET.settlements.length, INPUTS.places.length - 2);
});

test('8 to 12 rescue teams, POLICE at the OSM police station and each with a member to act for it', () => {
  assert.ok(DATASET.teams.length >= 8 && DATASET.teams.length <= 12);
  const policeStation = INPUTS.facilities.find((facility) => facility.amenity === 'police')!;
  assert.ok(DATASET.teams.some((team) => team.agency === 'POLICE' && team.baseOsmId === policeStation.osmId));
  for (const agency of ['FIRE', 'NDRF', 'SDRF'] as const) assert.ok(DATASET.teams.some((team) => team.agency === agency), agency);
  for (const team of DATASET.teams) {
    assert.ok(DATASET.users.some((user) => user.role === 'RESCUE_TEAM' && user.rescueTeamId === team.id), team.name);
  }
});

test('demo accounts: three per role from +919000000001, assigned as each role needs', () => {
  const roles = ['CITIZEN', 'VOLUNTEER', 'RESCUE_TEAM', 'FACILITY_MANAGER', 'GOVT_OFFICIAL'];
  assert.deepEqual(
    DATASET.demoAccounts.map((user) => [user.phone, user.role]),
    Array.from({ length: 15 }, (_, index) => [`+91${9_000_000_001 + index}`, roles[Math.floor(index / 3)]]),
  );
  for (const user of DATASET.demoAccounts) {
    assert.equal(user.inDistrict, user.role !== 'CITIZEN', user.phone);
    assert.equal(user.rescueTeamId !== null, user.role === 'RESCUE_TEAM', user.phone);
    assert.equal(user.facilityId !== null, user.role === 'FACILITY_MANAGER', user.phone);
    assert.equal(user.lastLocation !== null, user.role === 'VOLUNTEER', user.phone);
  }
  assert.equal(DATASET.volunteerProfiles.length, 3);
  assert.equal(new Set(DATASET.users.map((user) => user.phone)).size, DATASET.users.length);
});

test('incidents are placed near settlements inside the district and timed within the last 48 hours', () => {
  assert.equal(DATASET.incidents.length, INCIDENTS);
  for (const incident of DATASET.incidents) {
    assert.equal(incident.location === null, incident.locationSource === 'NONE', incident.id);
    assert.ok(incident.reportedMs <= ANCHOR_MS - NEWEST_REPORT_AGE_MS && incident.reportedMs >= ANCHOR_MS - HISTORY_MS, incident.id);
    const delayMs = incident.createdMs - incident.reportedMs;
    assert.ok(delayMs >= 2_000 && delayMs <= 60_000, `${incident.id} created ${delayMs} ms after it was reported`);
    if (incident.location === null) continue;
    assert.ok(isInsideMultiPolygon(incident.location, INPUTS.district.boundary), incident.id);
    if (incident.kind === 'FRESH') {
      const nearest = Math.min(...DATASET.settlements.map((settlement) => distanceM(settlement.location, incident.location!)));
      assert.ok(nearest <= JITTER_RADIUS_M + 0.5, `${incident.id} is ${nearest} m from the nearest settlement`);
    }
  }
  assert.equal(new Set(DATASET.incidents.map((incident) => incident.clientUuid)).size, INCIDENTS);
});

test('mostly open statuses, and FLOOD is the most common type', () => {
  const open = DATASET.incidents.filter((incident) => OPEN_INCIDENT_STATUSES.includes(incident.status)).length;
  assert.ok(open / INCIDENTS > 0.5, `${open} open`);
  const counts = new Map<string, number>();
  for (const incident of DATASET.incidents) counts.set(incident.type, (counts.get(incident.type) ?? 0) + 1);
  const [mostCommon] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  assert.equal(mostCommon, 'FLOOD');
});

test('the duplicate cluster: 8 FIRE reports within 150 m and 12 minutes, 7 flagged against the first', () => {
  const cluster = DATASET.incidents.filter((incident) => incident.kind === 'CLUSTER');
  assert.equal(cluster.length, CLUSTER.size);
  assert.ok(cluster.every((incident) => incident.type === 'FIRE' && incident.status === 'REPORTED'));
  for (const a of cluster) for (const b of cluster) assert.ok(distanceM(a.location!, b.location!) <= 150);
  const reported = cluster.map((incident) => incident.reportedMs);
  assert.ok(Math.max(...reported) - Math.min(...reported) <= 12 * MINUTE_MS);
  assert.ok(cluster.every((incident, index) => index === 0 || incident.createdMs > cluster[index - 1]!.createdMs));

  const flags = DATASET.reviews.filter((review) => cluster.some((incident) => incident.id === review.incidentId));
  assert.equal(flags.length, CLUSTER.size - 1);
  assert.ok(flags.every((flag) => flag.reason === 'POSSIBLE_DUPLICATE' && flag.status === 'PENDING' && flag.relatedIncidentId === cluster[0]!.id));
});

test('every status log starts at REPORTED, chains, and ends at the incident status', () => {
  const logs = new Map<string, typeof DATASET.statusLog>();
  for (const entry of DATASET.statusLog) logs.set(entry.incidentId, [...(logs.get(entry.incidentId) ?? []), entry]);
  for (const incident of DATASET.incidents) {
    const log = logs.get(incident.id)!;
    assert.deepEqual([log[0]!.fromStatus, log[0]!.toStatus, log[0]!.changedBy], [null, 'REPORTED', incident.reporterId]);
    log.forEach((entry, index) => {
      if (index > 0) assert.equal(entry.fromStatus, log[index - 1]!.toStatus);
      if (index > 0) assert.ok(entry.changedMs >= log[index - 1]!.changedMs);
      if (entry.toStatus.startsWith('REJECTED')) assert.ok(entry.changedBy, 'a rejection is attributed to a person');
    });
    assert.equal(log.at(-1)!.toStatus, incident.status);
    assert.equal(incident.resolvedMs !== null, incident.status === 'RESOLVED');
    assert.equal(incident.duplicateOf !== null, incident.status === 'REJECTED_DUPLICATE');
    assert.ok(log.at(-1)!.changedMs < ANCHOR_MS);
  }
});

test('missions match their incidents, and teams on a mission are unavailable', () => {
  const incidents = byId(DATASET.incidents);
  const missionsByIncident = new Map<string, MissionStatus[]>();
  for (const mission of DATASET.missions) {
    const incident = incidents.get(mission.incidentId)!;
    missionsByIncident.set(incident.id, [...(missionsByIncident.get(incident.id) ?? []), mission.status]);
    assert.equal(incident.status, INCIDENT_STATUS_FOR_MISSION[mission.status], `${mission.status} mission on a ${incident.status} incident`);
    assert.equal(mission.completedMs !== null, mission.status === 'COMPLETED');
    assert.equal(mission.reachedMs !== null, mission.status === 'ON_SITE' || mission.status === 'COMPLETED');
    assert.equal(mission.acceptedMs !== null, mission.status !== 'ASSIGNED');
  }
  for (const incident of DATASET.incidents) {
    if (incident.status !== 'ASSIGNED' && incident.status !== 'IN_PROGRESS') continue;
    assert.ok(missionsByIncident.get(incident.id)?.some((status) => OPEN_MISSION_STATUSES.includes(status)), incident.id);
  }
  for (const team of DATASET.teams) {
    const deployed = DATASET.missions.some((mission) => mission.teamId === team.id && DEPLOYED.includes(mission.status));
    assert.equal(team.isAvailable, !deployed, team.name);
  }
  assert.ok(DATASET.missions.some((mission) => mission.status === 'ASSIGNED'));
  assert.ok(DATASET.missions.some((mission) => mission.status === 'EN_ROUTE' || mission.status === 'ON_SITE'));
});

test('the review queue holds a few pending reviews, each reason at most once per incident', () => {
  const pending = DATASET.reviews.filter((review) => review.status === 'PENDING');
  assert.ok(pending.length >= 3 && pending.length <= 50, `${pending.length} pending`);
  const keys = pending.map((review) => `${review.incidentId}:${review.reason}`);
  assert.equal(new Set(keys).size, keys.length);
  const incidents = byId(DATASET.incidents);
  for (const review of DATASET.reviews) {
    assert.notEqual(review.relatedIncidentId, review.incidentId);
    assert.equal(review.resolvedBy !== null && review.resolvedMs !== null, review.status === 'RESOLVED');
    if (review.status === 'PENDING') assert.ok(OPEN_INCIDENT_STATUSES.includes(incidents.get(review.incidentId)!.status));
  }
});

test('without the WorldPop raster every place weighs one person and populations stay unknown', () => {
  const dataset = buildSeedDataset({ ...INPUTS, raster: null }, { incidentCount: 100, anchorMs: ANCHOR_MS });
  assert.equal(dataset.district.population, null);
  assert.ok(dataset.settlements.every((settlement) => settlement.population === null && settlement.incidentWeight > 0 && settlement.incidentWeight <= 1));
  assert.equal(dataset.incidents.length, 100);
});
