// Every incident, flag, decision and mission here is synthetic; only the OSM places they are
// placed near and the district boundary are real (data/SOURCES.md).
import type {
  DisasterType,
  IncidentStatus,
  LocationSource,
  MissionStatus,
  ReviewReason,
  ReviewStatus,
} from './domain.ts';
import { distanceM, isInsideMultiPolygon, randomPointWithin, roundLonLat, type LonLat, type MultiPolygonCoordinates } from './geo.ts';
import {
  CLUSTER_DESCRIPTIONS,
  DUPLICATE_RESOLUTION_NOTE,
  FAKE_FLAG_NOTE,
  FAKE_REJECTION_NOTES,
  MISSION_OUTCOMES,
  REPORT_DESCRIPTIONS,
  RESOLUTION_NOTES,
  VERIFICATION_NOTE,
} from './narratives.ts';
import {
  between,
  chance,
  createWeightedSampler,
  integerBetween,
  pickDistinct,
  pickOne,
  pickWeighted,
  seedUuid,
  type Random,
} from './random.ts';
import type { Settlement } from './settlements.ts';
import type { MissionSlot, SeededAgency, TeamSeed } from './teams.ts';
import { compareText } from './text.ts';
import type { UserSeed } from './users.ts';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const MIN_INCIDENTS = 50;
export const HISTORY_MS = 48 * HOUR_MS;
export const NEWEST_REPORT_AGE_MS = 2 * MINUTE_MS;
const CREATED_DELAY_SECONDS = [2, 25] as const;
export const JITTER_RADIUS_M = 500;
const SOS_SHARE = 0.3;
// The SOS button sends no type unless the citizen picks one, and the API stores OTHER.
const SOS_UNTYPED_SHARE = 0.4;
const LOCATIONLESS_SOS_SHARE = 0.01;
const MANUAL_PIN_SHARE = 0.25;
const DEMO_CITIZEN_REPORT_EVERY = 150;

// A later report of an event already reported nearby: same type, within 120 m, 2–14 minutes
// after it, so inside the worker's 150 m / 15 minute duplicate rule. Recent ones still wait in
// the review queue; older ones were rejected as duplicates by an official.
const ECHO_SHARE = 0.04;
const ECHO_RADIUS_M = 120;
const ECHO_DELAY_SECONDS = [2 * 60, 14 * 60] as const;
const PENDING_ECHO_AGE_MS = 45 * MINUTE_MS;

// The deliberate duplicate cluster (CLAUDE.md §9): 8 reports of one fire, all within 70 m of a
// centre (so within 140 m of each other) and within 11.5 minutes.
export const CLUSTER = { size: 8, type: 'FIRE', radiusM: 70, spanMs: 11.5 * MINUTE_MS, newestAgeMs: 30 * MINUTE_MS } as const;
const CLUSTER_CENTRE_RADIUS_M = 300;

// No LANDSLIDE: Darbhanga is flat alluvial plain.
const TYPE_WEIGHTS: readonly (readonly [DisasterType, number])[] = [
  ['FLOOD', 0.58],
  ['FIRE', 0.12],
  ['OTHER', 0.12],
  ['BUILDING_COLLAPSE', 0.1],
  ['EARTHQUAKE', 0.04],
  ['CYCLONE', 0.04],
];
const MAX_PEOPLE_AFFECTED: Record<DisasterType, number> = {
  FLOOD: 80,
  FIRE: 25,
  BUILDING_COLLAPSE: 30,
  EARTHQUAKE: 40,
  CYCLONE: 40,
  LANDSLIDE: 20,
  OTHER: 8,
};
const INJURY_PRONE_TYPES: readonly DisasterType[] = ['FIRE', 'BUILDING_COLLAPSE', 'EARTHQUAKE'];

type Outcome = 'REPORTED' | 'VERIFIED' | 'RESOLVED' | 'REJECTED_FAKE' | 'REJECTED_DUPLICATE';

// Older reports are more likely to have been handled, but a control room in a flood keeps a
// backlog: about two thirds of all reports stay open.
const OUTCOME_WEIGHTS_BY_AGE: readonly { maxAgeMs: number; weights: readonly (readonly [Outcome, number])[] }[] = [
  { maxAgeMs: HOUR_MS, weights: [['REPORTED', 0.8], ['VERIFIED', 0.17], ['REJECTED_FAKE', 0.03]] },
  { maxAgeMs: 12 * HOUR_MS, weights: [['REPORTED', 0.45], ['VERIFIED', 0.35], ['RESOLVED', 0.14], ['REJECTED_FAKE', 0.06]] },
  { maxAgeMs: Infinity, weights: [['REPORTED', 0.25], ['VERIFIED', 0.35], ['RESOLVED', 0.33], ['REJECTED_FAKE', 0.07]] },
];

const AGENCY_INCIDENT_TYPES: Record<SeededAgency, readonly DisasterType[]> = {
  NDRF: ['FLOOD', 'BUILDING_COLLAPSE', 'EARTHQUAKE', 'CYCLONE'],
  SDRF: ['FLOOD', 'CYCLONE', 'BUILDING_COLLAPSE'],
  FIRE: ['FIRE'],
  POLICE: ['FLOOD', 'OTHER'],
  HEALTH: ['OTHER', 'BUILDING_COLLAPSE', 'EARTHQUAKE'],
};
const ACTIVE_MISSION_AGE_MS = [45 * MINUTE_MS, 8 * HOUR_MS] as const;
const COMPLETED_MISSION_MIN_AGE_MS = 90 * MINUTE_MS;
const COMPLETED_MISSIONS = 12;
const ETA_MINUTES = [10, 60] as const;

// Minutes between the steps of a dispatch, in order: verify, assign, accept, set off, arrive,
// finish. Compressed proportionally when a report is too recent for them to fit.
const MISSION_STEP_MINUTES: readonly (readonly [number, number])[] = [
  [3, 20],
  [5, 25],
  [2, 8],
  [1, 5],
  [10, 45],
  [20, 90],
];
const MISSION_STEP_COUNT: Record<PlannedMissionStatus, number> = {
  ASSIGNED: 2,
  ACCEPTED: 3,
  EN_ROUTE: 4,
  ON_SITE: 5,
  COMPLETED: 6,
};

const FAKE_FLAGS = 2;
const FAKE_FLAG_AGE_MS = [HOUR_MS, 6 * HOUR_MS] as const;

type PlannedMissionStatus = MissionSlot['status'] | Extract<MissionStatus, 'COMPLETED'>;
export type ReportKind = 'FRESH' | 'ECHO' | 'CLUSTER';

export interface IncidentSeed {
  id: string;
  clientUuid: string;
  kind: ReportKind;
  reporterId: string;
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
  location: LonLat | null;
  locationSource: LocationSource;
  accuracyM: number | null;
  addressText: string | null;
  description: string | null;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  duplicateOf: string | null;
  reportedMs: number;
  createdMs: number;
  updatedMs: number;
  resolvedMs: number | null;
}

export interface StatusLogSeed {
  incidentId: string;
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus;
  changedBy: string | null;
  note: string | null;
  changedMs: number;
}

export interface ReviewSeed {
  id: string;
  incidentId: string;
  reason: ReviewReason;
  relatedIncidentId: string | null;
  details: Record<string, unknown>;
  flaggedBy: string | null;
  status: ReviewStatus;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdMs: number;
  resolvedMs: number | null;
}

export interface MissionSeed {
  id: string;
  incidentId: string;
  teamId: string;
  assignedBy: string;
  status: PlannedMissionStatus;
  etaMinutes: number;
  peopleRescued: number | null;
  injuredCount: number | null;
  hospitalRequired: boolean | null;
  outcomeNotes: string | null;
  assignedMs: number;
  acceptedMs: number | null;
  reachedMs: number | null;
  completedMs: number | null;
  updatedMs: number;
}

export interface IncidentPlan {
  incidents: IncidentSeed[];
  statusLog: StatusLogSeed[];
  reviews: ReviewSeed[];
  missions: MissionSeed[];
}

export interface IncidentPlanOptions {
  random: Random;
  anchorMs: number;
  count: number;
  boundary: MultiPolygonCoordinates;
  settlements: readonly Settlement[];
  clusterSettlement: Settlement;
  reporters: readonly UserSeed[];
  demoCitizens: readonly UserSeed[];
  officials: readonly UserSeed[];
  teams: readonly TeamSeed[];
  missionSlots: readonly MissionSlot[];
  teamMembers: ReadonlyMap<string, string>;
}

interface Report {
  index: number;
  id: string;
  clientUuid: string;
  kind: ReportKind;
  reporterId: string;
  type: DisasterType;
  isSos: boolean;
  location: LonLat | null;
  locationSource: LocationSource;
  accuracyM: number | null;
  addressText: string | null;
  description: string | null;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  reportedMs: number;
  createdMs: number;
  duplicateOf: Report | null;
  hasEchoes: boolean;
}

interface PlannedMission {
  team: TeamSeed;
  status: PlannedMissionStatus;
}

interface Transition {
  to: IncidentStatus;
  atMs: number;
  by: string | null;
  note: string | null;
}

interface Lifecycle {
  transitions: Transition[];
  reviews: ReviewSeed[];
  mission: MissionSeed | null;
}

export function planIncidents(options: IncidentPlanOptions): IncidentPlan {
  if (options.count < MIN_INCIDENTS) throw new Error(`Seed at least ${MIN_INCIDENTS} incidents so the demo scenario fits`);

  const reports = drawReports(options);
  const outcomes = new Map(reports.map((report) => [report, rollOutcome(options, report)]));
  const missions = planMissions(options, reports, outcomes);
  const fakeFlagged = pickFakeFlagTargets(options, reports, outcomes, missions);

  const plan: IncidentPlan = { incidents: [], statusLog: [], reviews: [], missions: [] };
  for (const report of reports) {
    const planned = missions.get(report);
    const lifecycle = planned
      ? missionLifecycle(options, report, planned)
      : outcomeLifecycle(options, report, outcomes.get(report)!, fakeFlagged.has(report));
    plan.incidents.push(toIncidentSeed(report, lifecycle.transitions));
    plan.statusLog.push(...toStatusLog(report, lifecycle.transitions));
    plan.reviews.push(...lifecycle.reviews);
    if (lifecycle.mission) plan.missions.push(lifecycle.mission);
  }
  return plan;
}

function drawReports(options: IncidentPlanOptions): Report[] {
  const sampleSettlement = createWeightedSampler(options.settlements.map((settlement) => settlement.incidentWeight));
  const reports: Report[] = [];
  const echoCandidates: Report[] = [];
  const clusterStart = options.count - CLUSTER.size;

  for (let index = 0; index < clusterStart; index++) {
    const original = chance(options.random, ECHO_SHARE) && echoCandidates.length > 0 ? pickOne(options.random, echoCandidates) : null;
    const echo = original ? drawEcho(options, index, original) : null;
    const report = echo ?? drawFreshReport(options, index, options.settlements[sampleSettlement(options.random)]!);
    reports.push(report);
    if (report.kind === 'FRESH' && report.location) echoCandidates.push(report);
  }
  reports.push(...drawCluster(options, clusterStart));
  return reports;
}

// Density rises linearly towards the present, like a flood that is still getting worse.
const drawReportedMs = (options: IncidentPlanOptions): number =>
  options.anchorMs - Math.max(NEWEST_REPORT_AGE_MS, Math.round(HISTORY_MS * (1 - Math.sqrt(options.random()))));

function drawFreshReport(options: IncidentPlanOptions, index: number, settlement: Settlement): Report {
  const { random } = options;
  const isSos = chance(random, SOS_SHARE);
  const type = isSos && chance(random, SOS_UNTYPED_SHARE) ? 'OTHER' : pickWeighted(random, TYPE_WEIGHTS);
  const locationSource: LocationSource = isSos
    ? chance(random, LOCATIONLESS_SOS_SHARE) ? 'NONE' : 'GPS'
    : chance(random, MANUAL_PIN_SHARE) ? 'MANUAL_PIN' : 'GPS';
  const location = locationSource === 'NONE' ? null : pointNear(options, settlement.location, JITTER_RADIUS_M);
  return newReport(options, index, {
    kind: 'FRESH',
    reporterId: reporterFor(options, index).id,
    type,
    isSos,
    location,
    locationSource,
    reportedMs: drawReportedMs(options),
    duplicateOf: null,
    ...reportDetails(random, type, isSos, locationSource, settlement.osmName),
  });
}

function drawEcho(options: IncidentPlanOptions, index: number, original: Report): Report | null {
  const { random } = options;
  const reportedMs = original.reportedMs + integerBetween(random, ...ECHO_DELAY_SECONDS) * SECOND_MS;
  if (reportedMs > options.anchorMs - NEWEST_REPORT_AGE_MS) return null;

  const isSos = chance(random, 0.5);
  const locationSource: LocationSource = !isSos && chance(random, MANUAL_PIN_SHARE) ? 'MANUAL_PIN' : 'GPS';
  const echo = newReport(options, index, {
    kind: 'ECHO',
    reporterId: reporterFor(options, index).id,
    type: original.type,
    isSos,
    location: pointNear(options, original.location!, ECHO_RADIUS_M),
    locationSource,
    reportedMs,
    duplicateOf: original,
    ...reportDetails(random, original.type, isSos, locationSource, null),
    addressText: original.addressText,
  });
  original.hasEchoes = true;
  return echo;
}

function drawCluster(options: IncidentPlanOptions, firstIndex: number): Report[] {
  const { random } = options;
  const centre = pointNear(options, options.clusterSettlement.location, CLUSTER_CENTRE_RADIUS_M);
  const firstReportedMs = options.anchorMs - CLUSTER.newestAgeMs - CLUSTER.spanMs;
  const offsets = [
    0,
    ...Array.from({ length: CLUSTER.size - 2 }, () => Math.round(between(random, 0, CLUSTER.spanMs))).sort((a, b) => a - b),
    CLUSTER.spanMs,
  ];
  const reporters = pickDistinct(random, options.reporters, CLUSTER.size);

  const cluster: Report[] = [];
  offsets.forEach((offset, position) => {
    const isSos = position % 3 === 0;
    const report = newReport(options, firstIndex + position, {
      kind: 'CLUSTER',
      reporterId: reporters[position % reporters.length]!.id,
      type: CLUSTER.type,
      isSos,
      location: pointNear(options, centre, CLUSTER.radiusM),
      locationSource: 'GPS',
      reportedMs: firstReportedMs + offset,
      duplicateOf: cluster[0] ?? null,
      ...reportDetails(random, CLUSTER.type, isSos, 'GPS', options.clusterSettlement.osmName),
      ...(isSos ? {} : { description: pickOne(random, CLUSTER_DESCRIPTIONS) }),
    });
    // The worker treats the earliest-created report as the original, so the reports must
    // reach the server in the order they were made or the first one gets flagged too.
    const previous = cluster.at(-1);
    if (previous) report.createdMs = Math.max(report.createdMs, previous.createdMs + SECOND_MS);
    cluster.push(report);
  });
  return cluster;
}

type ReportFields = Omit<Report, 'index' | 'id' | 'clientUuid' | 'createdMs' | 'hasEchoes'>;

function newReport(options: IncidentPlanOptions, index: number, fields: ReportFields): Report {
  return {
    ...fields,
    index,
    id: seedUuid(`incident:${index}`),
    clientUuid: seedUuid(`incident-client:${index}`),
    createdMs: fields.reportedMs + integerBetween(options.random, ...CREATED_DELAY_SECONDS) * SECOND_MS,
    hasEchoes: false,
  };
}

function reporterFor(options: IncidentPlanOptions, index: number): UserSeed {
  if (index % DEMO_CITIZEN_REPORT_EVERY === DEMO_CITIZEN_REPORT_EVERY / 2 && options.demoCitizens.length > 0) {
    return options.demoCitizens[Math.floor(index / DEMO_CITIZEN_REPORT_EVERY) % options.demoCitizens.length]!;
  }
  return pickOne(options.random, options.reporters);
}

type ReportDetails = Pick<
  Report,
  'accuracyM' | 'addressText' | 'description' | 'peopleAffected' | 'hasElderly' | 'hasChildren' | 'hasInjured'
>;

// An SOS is one tap: no text, no vulnerability flags, a small head count (as the API stores it).
function reportDetails(
  random: Random,
  type: DisasterType,
  isSos: boolean,
  locationSource: LocationSource,
  placeName: string | null,
): ReportDetails {
  const accuracyM = locationSource === 'GPS' ? Math.round(isSos ? between(random, 5, 60) : between(random, 4, 30)) : null;
  if (isSos) {
    return {
      accuracyM,
      addressText: null,
      description: null,
      peopleAffected: integerBetween(random, 1, 6),
      hasElderly: false,
      hasChildren: false,
      hasInjured: false,
    };
  }
  return {
    accuracyM,
    addressText: placeName ? `Near ${placeName}` : null,
    description: pickOne(random, REPORT_DESCRIPTIONS[type]),
    peopleAffected: logUniformInteger(random, 1, MAX_PEOPLE_AFFECTED[type]),
    hasElderly: chance(random, 0.25),
    hasChildren: chance(random, 0.35),
    hasInjured: chance(random, INJURY_PRONE_TYPES.includes(type) ? 0.35 : 0.12),
  };
}

const logUniformInteger = (random: Random, min: number, max: number): number =>
  Math.min(max, Math.floor(Math.exp(between(random, Math.log(min), Math.log(max + 1)))));

const JITTER_ATTEMPTS = 25;

// Jittered points that fall outside the district are redrawn: the API files a report under
// the district whose boundary covers it.
function pointNear(options: IncidentPlanOptions, centre: LonLat, radiusM: number): LonLat {
  for (let attempt = 0; attempt < JITTER_ATTEMPTS; attempt++) {
    const candidate = roundLonLat(randomPointWithin(options.random, centre, radiusM));
    if (isInsideMultiPolygon(candidate, options.boundary)) return candidate;
  }
  return centre;
}

function rollOutcome(options: IncidentPlanOptions, report: Report): Outcome {
  const ageMs = options.anchorMs - report.createdMs;
  if (report.kind === 'CLUSTER') return 'REPORTED';
  if (report.kind === 'ECHO') return ageMs < PENDING_ECHO_AGE_MS ? 'REPORTED' : 'REJECTED_DUPLICATE';
  // Without a location nobody can verify or dispatch; the report waits for a call-back.
  if (report.location === null) return 'REPORTED';

  const outcome = pickWeighted(options.random, OUTCOME_WEIGHTS_BY_AGE.find((band) => ageMs < band.maxAgeMs)!.weights);
  return outcome === 'REJECTED_FAKE' && report.hasEchoes ? 'VERIFIED' : outcome;
}

function planMissions(
  options: IncidentPlanOptions,
  reports: readonly Report[],
  outcomes: ReadonlyMap<Report, Outcome>,
): Map<Report, PlannedMission> {
  const planned = new Map<Report, PlannedMission>();
  const ageOf = (report: Report) => options.anchorMs - report.createdMs;
  const eligible = (report: Report, allowed: readonly Outcome[]) =>
    report.kind === 'FRESH' && report.location !== null && allowed.includes(outcomes.get(report)!) && !planned.has(report);

  for (const slot of options.missionSlots) {
    const candidates = reports.filter(
      (report) =>
        eligible(report, ['REPORTED', 'VERIFIED']) &&
        ageOf(report) >= ACTIVE_MISSION_AGE_MS[0] &&
        ageOf(report) <= ACTIVE_MISSION_AGE_MS[1] &&
        AGENCY_INCIDENT_TYPES[slot.team.agency].includes(report.type),
    );
    const nearest = nearestReport(slot.team.base, candidates);
    if (nearest) planned.set(nearest, { team: slot.team, status: slot.status });
  }

  // The most recently resolved reports get the completed dispatches, so the dashboard's
  // rescued-today and 24-hour response figures have data.
  const resolved = reports
    .filter((report) => eligible(report, ['RESOLVED']) && ageOf(report) >= COMPLETED_MISSION_MIN_AGE_MS)
    .sort((a, b) => ageOf(a) - ageOf(b) || a.index - b.index);
  let completed = 0;
  for (const report of resolved) {
    if (completed === COMPLETED_MISSIONS) break;
    const team = nearestTeamFor(options.teams, report);
    if (!team) continue;
    planned.set(report, { team, status: 'COMPLETED' });
    completed++;
  }
  return planned;
}

function nearestReport(point: LonLat, reports: readonly Report[]): Report | undefined {
  let nearest: Report | undefined;
  let nearestDistance = Infinity;
  for (const report of reports) {
    const distance = distanceM(point, report.location!);
    if (distance < nearestDistance) {
      nearest = report;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function nearestTeamFor(teams: readonly TeamSeed[], report: Report): TeamSeed | undefined {
  return teams
    .filter((team) => AGENCY_INCIDENT_TYPES[team.agency].includes(report.type))
    .map((team) => ({ team, distance: distanceM(team.base, report.location!) }))
    .sort((a, b) => a.distance - b.distance || compareText(a.team.id, b.team.id))[0]?.team;
}

function pickFakeFlagTargets(
  options: IncidentPlanOptions,
  reports: readonly Report[],
  outcomes: ReadonlyMap<Report, Outcome>,
  missions: ReadonlyMap<Report, PlannedMission>,
): Set<Report> {
  const candidates = reports.filter((report) => {
    const ageMs = options.anchorMs - report.createdMs;
    return (
      report.kind === 'FRESH' &&
      report.location !== null &&
      !report.isSos &&
      !report.hasEchoes &&
      outcomes.get(report) === 'REPORTED' &&
      !missions.has(report) &&
      ageMs >= FAKE_FLAG_AGE_MS[0] &&
      ageMs <= FAKE_FLAG_AGE_MS[1]
    );
  });
  return new Set(pickDistinct(options.random, candidates, FAKE_FLAGS));
}

// Draws each step's duration, then shrinks all of them proportionally if they would not fit
// between the report and the end of the window.
function scheduleSteps(random: Random, startMs: number, endMs: number, minuteRanges: readonly (readonly [number, number])[]): number[] {
  const durations = minuteRanges.map(([min, max]) => between(random, min, max) * MINUTE_MS);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const scale = Math.min(1, ((endMs - startMs) * 0.95) / total);
  let atMs = startMs;
  return durations.map((duration) => (atMs += Math.max(SECOND_MS, Math.round(duration * scale))));
}

const windowEndMs = (options: IncidentPlanOptions): number => options.anchorMs - 30 * SECOND_MS;

function outcomeLifecycle(options: IncidentPlanOptions, report: Report, outcome: Outcome, fakeFlagged: boolean): Lifecycle {
  const { random } = options;
  const endMs = windowEndMs(options);
  const official = () => pickOne(random, options.officials).id;
  const transitions: Transition[] = [];
  const reviews: ReviewSeed[] = [];

  switch (outcome) {
    case 'VERIFIED': {
      const [verifiedMs] = scheduleSteps(random, report.createdMs, endMs, [[3, 40]]);
      transitions.push({ to: 'VERIFIED', atMs: verifiedMs!, by: official(), note: VERIFICATION_NOTE });
      break;
    }
    case 'RESOLVED': {
      const [verifiedMs, resolvedMs] = scheduleSteps(random, report.createdMs, endMs, [[3, 40], [30, 540]]);
      transitions.push(
        { to: 'VERIFIED', atMs: verifiedMs!, by: official(), note: VERIFICATION_NOTE },
        { to: 'RESOLVED', atMs: resolvedMs!, by: official(), note: pickOne(random, RESOLUTION_NOTES) },
      );
      break;
    }
    case 'REJECTED_FAKE': {
      const [rejectedMs] = scheduleSteps(random, report.createdMs, endMs, [[5, 90]]);
      transitions.push({ to: 'REJECTED_FAKE', atMs: rejectedMs!, by: official(), note: pickOne(random, FAKE_REJECTION_NOTES) });
      break;
    }
    case 'REJECTED_DUPLICATE': {
      const [flaggedMs, rejectedMs] = scheduleSteps(random, report.createdMs, endMs, [[0.5, 2], [5, 60]]);
      const decidedBy = official();
      transitions.push({ to: 'REJECTED_DUPLICATE', atMs: rejectedMs!, by: decidedBy, note: DUPLICATE_RESOLUTION_NOTE });
      reviews.push(duplicateReview(report, flaggedMs!, { by: decidedBy, atMs: rejectedMs! }));
      break;
    }
    case 'REPORTED': {
      const [flaggedMs] = scheduleSteps(random, report.createdMs, endMs, fakeFlagged ? [[10, 40]] : [[0.5, 2]]);
      if (report.duplicateOf) reviews.push(duplicateReview(report, flaggedMs!, null));
      if (report.location === null) reviews.push(locationReview(report, flaggedMs!));
      if (fakeFlagged) reviews.push(fakeReview(report, flaggedMs!, official()));
      break;
    }
  }
  return { transitions, reviews, mission: null };
}

function missionLifecycle(options: IncidentPlanOptions, report: Report, planned: PlannedMission): Lifecycle {
  const { random } = options;
  const { team, status } = planned;
  const steps = scheduleSteps(random, report.createdMs, windowEndMs(options), MISSION_STEP_MINUTES.slice(0, MISSION_STEP_COUNT[status]));
  const [verifiedMs, assignedMs, acceptedMs, enRouteMs, reachedMs, completedMs] = steps as [
    number,
    number,
    number | undefined,
    number | undefined,
    number | undefined,
    number | undefined,
  ];
  const official = pickOne(random, options.officials).id;
  const teamMember = options.teamMembers.get(team.id);
  if (!teamMember) throw new Error(`Team ${team.name} has no member account to act on its missions`);

  const transitions: Transition[] = [
    { to: 'VERIFIED', atMs: verifiedMs, by: official, note: VERIFICATION_NOTE },
    { to: 'ASSIGNED', atMs: assignedMs, by: official, note: `Team ${team.name} assigned` },
  ];
  if (enRouteMs !== undefined) transitions.push({ to: 'IN_PROGRESS', atMs: enRouteMs, by: teamMember, note: `Team ${team.name} is en route` });
  if (completedMs !== undefined) {
    transitions.push({ to: 'RESOLVED', atMs: completedMs, by: teamMember, note: `Team ${team.name} completed the rescue` });
  }

  const isCompleted = status === 'COMPLETED';
  const etaMinutes = integerBetween(random, ...ETA_MINUTES);
  const injuredCount = isCompleted && report.hasInjured ? integerBetween(random, 1, Math.min(3, report.peopleAffected)) : 0;
  const mission: MissionSeed = {
    id: seedUuid(`mission:${report.index}:${team.id}`),
    incidentId: report.id,
    teamId: team.id,
    assignedBy: official,
    status,
    etaMinutes,
    peopleRescued: isCompleted ? report.peopleAffected : null,
    injuredCount: isCompleted ? injuredCount : null,
    hospitalRequired: isCompleted ? injuredCount > 0 : null,
    outcomeNotes: isCompleted ? MISSION_OUTCOMES[team.agency] : null,
    assignedMs,
    acceptedMs: acceptedMs ?? null,
    reachedMs: reachedMs ?? null,
    completedMs: completedMs ?? null,
    updatedMs: steps.at(-1)!,
  };
  return { transitions, reviews: [], mission };
}

// Rounded like the worker's own duplicate flags: one decimal of metres and minutes.
function duplicateReview(report: Report, flaggedMs: number, decision: { by: string; atMs: number } | null): ReviewSeed {
  const original = report.duplicateOf!;
  return {
    ...review(report, 'POSSIBLE_DUPLICATE', flaggedMs, null, decision),
    relatedIncidentId: original.id,
    details: {
      distanceM: Math.round(distanceM(report.location!, original.location!) * 10) / 10,
      minutesApart: Math.round(Math.abs(report.reportedMs - original.reportedMs) / 6_000) / 10,
    },
  };
}

const locationReview = (report: Report, flaggedMs: number): ReviewSeed => ({
  ...review(report, 'LOCATION_UNCERTAIN', flaggedMs, null, null),
  details: { locationSource: report.locationSource },
});

const fakeReview = (report: Report, flaggedMs: number, officialId: string): ReviewSeed => ({
  ...review(report, 'POSSIBLE_FAKE', flaggedMs, officialId, null),
  details: { note: FAKE_FLAG_NOTE },
});

function review(
  report: Report,
  reason: ReviewReason,
  createdMs: number,
  flaggedBy: string | null,
  decision: { by: string; atMs: number } | null,
): ReviewSeed {
  return {
    id: seedUuid(`review:${report.index}:${reason}`),
    incidentId: report.id,
    reason,
    relatedIncidentId: null,
    details: {},
    flaggedBy,
    status: decision ? 'RESOLVED' : 'PENDING',
    resolvedBy: decision?.by ?? null,
    resolutionNote: decision ? DUPLICATE_RESOLUTION_NOTE : null,
    createdMs,
    resolvedMs: decision?.atMs ?? null,
  };
}

function toIncidentSeed(report: Report, transitions: readonly Transition[]): IncidentSeed {
  const last = transitions.at(-1);
  const status = last?.to ?? 'REPORTED';
  return {
    id: report.id,
    clientUuid: report.clientUuid,
    kind: report.kind,
    reporterId: report.reporterId,
    type: report.type,
    status,
    isSos: report.isSos,
    location: report.location,
    locationSource: report.locationSource,
    accuracyM: report.accuracyM,
    addressText: report.addressText,
    description: report.description,
    peopleAffected: report.peopleAffected,
    hasElderly: report.hasElderly,
    hasChildren: report.hasChildren,
    hasInjured: report.hasInjured,
    duplicateOf: status === 'REJECTED_DUPLICATE' ? report.duplicateOf!.id : null,
    reportedMs: report.reportedMs,
    createdMs: report.createdMs,
    updatedMs: last?.atMs ?? report.createdMs,
    resolvedMs: status === 'RESOLVED' ? last!.atMs : null,
  };
}

function toStatusLog(report: Report, transitions: readonly Transition[]): StatusLogSeed[] {
  const log: StatusLogSeed[] = [
    { incidentId: report.id, fromStatus: null, toStatus: 'REPORTED', changedBy: report.reporterId, note: null, changedMs: report.createdMs },
  ];
  for (const transition of transitions) {
    log.push({
      incidentId: report.id,
      fromStatus: log.at(-1)!.toStatus,
      toStatus: transition.to,
      changedBy: transition.by,
      note: transition.note,
      changedMs: transition.atMs,
    });
  }
  return log;
}
