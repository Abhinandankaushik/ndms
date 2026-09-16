// Every account is synthetic: names, phone numbers and assignments (data/SOURCES.md).
import type { UserRole } from './domain.ts';
import type { FacilitySeed } from './facilities.ts';
import { distanceM, type LonLat } from './geo.ts';
import { REPORTER_NAMES } from './narratives.ts';
import { pickOne, pickWeighted, seedUuid, type Random } from './random.ts';
import type { Settlement } from './settlements.ts';
import type { MissionSlot, TeamSeed } from './teams.ts';
import { compareText } from './text.ts';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const DEMO_PHONE_FIRST = 919_000_000_001;
const DEMO_ACCOUNTS_PER_ROLE = 3;
const REPORTER_PHONE_FIRST = 919_100_000_001;
const TEAM_LEAD_PHONE_FIRST = 919_200_000_001;
const VOLUNTEER_SERVICE_RADIUS_KM = 15;

const VOLUNTEER_SKILLS: readonly string[][] = [['SWIMMER', 'FIRST_AID'], ['BOATMAN'], ['DRIVER', 'FIRST_AID']];

// Key order is the phone order: CITIZEN takes the first three numbers.
const DEMO_LABELS: Record<UserRole, string> = {
  CITIZEN: 'Demo Citizen',
  VOLUNTEER: 'Demo Volunteer',
  RESCUE_TEAM: 'Demo Rescuer',
  FACILITY_MANAGER: 'Demo Facility Manager',
  GOVT_OFFICIAL: 'Demo Officer',
};
const DEMO_ROLES = Object.keys(DEMO_LABELS) as UserRole[];

export interface UserSeed {
  id: string;
  phone: string;
  fullName: string;
  role: UserRole;
  inDistrict: boolean;
  rescueTeamId: string | null;
  facilityId: string | null;
  lastLocation: LonLat | null;
  lastLocationMs: number | null;
  createdMs: number;
  assignment: string;
}

export interface VolunteerProfileSeed {
  userId: string;
  skills: string[];
  serviceRadiusKm: number;
  reviewedBy: string;
  reviewedMs: number;
  createdMs: number;
}

export interface DemoAccounts {
  users: UserSeed[];
  volunteerProfiles: VolunteerProfileSeed[];
  managedShelters: FacilitySeed[];
}

const phoneNumber = (digits: number): string => `+${digits}`;

export function planDemoAccounts(options: {
  anchorMs: number;
  districtName: string;
  rankedSettlements: readonly Settlement[];
  facilities: readonly FacilitySeed[];
  teams: readonly TeamSeed[];
  missionSlots: readonly MissionSlot[];
}): DemoAccounts {
  const createdMs = options.anchorMs - 30 * DAY_MS;
  const demoTeams = demoRescueTeams(options.teams, options.missionSlots);
  const hub = options.rankedSettlements[0]?.location;
  if (!hub) throw new Error('No settlements to anchor the demo accounts on');
  const shelters = nearestFacilities(options.facilities, 'SHELTER', hub);
  const hospitals = nearestFacilities(options.facilities, 'HOSPITAL', hub);
  const managedFacilities = [shelters[0], shelters[1], hospitals[0]];

  const users = DEMO_ROLES.flatMap((role, roleIndex) =>
    Array.from({ length: DEMO_ACCOUNTS_PER_ROLE }, (_, index): UserSeed => {
      const phone = phoneNumber(DEMO_PHONE_FIRST + roleIndex * DEMO_ACCOUNTS_PER_ROLE + index);
      // Citizens register themselves and carry no district, exactly like an OTP sign-up.
      const base: UserSeed = {
        id: seedUuid(`user:${phone}`),
        phone,
        fullName: `${DEMO_LABELS[role]} ${index + 1}`,
        role,
        inDistrict: role !== 'CITIZEN',
        rescueTeamId: null,
        facilityId: null,
        lastLocation: null,
        lastLocationMs: null,
        createdMs,
        assignment: role === 'CITIZEN' ? 'no district, like a self-registered citizen' : `${options.districtName} district`,
      };
      return assignRole(base, index, {
        demoTeams,
        managedFacilities,
        settlements: options.rankedSettlements,
        anchorMs: options.anchorMs,
      });
    }),
  );

  const firstOfficial = users.find((user) => user.role === 'GOVT_OFFICIAL')!;
  const volunteerProfiles = users
    .filter((user) => user.role === 'VOLUNTEER')
    .map((user, index) => ({
      userId: user.id,
      skills: VOLUNTEER_SKILLS[index % VOLUNTEER_SKILLS.length]!,
      serviceRadiusKm: VOLUNTEER_SERVICE_RADIUS_KM,
      reviewedBy: firstOfficial.id,
      reviewedMs: options.anchorMs - 20 * DAY_MS,
      createdMs: options.anchorMs - 21 * DAY_MS,
    }));

  return {
    users,
    volunteerProfiles,
    managedShelters: managedFacilities.filter((facility): facility is FacilitySeed => facility?.kind === 'SHELTER'),
  };
}

function assignRole(
  user: UserSeed,
  index: number,
  context: {
    demoTeams: readonly (TeamSeed | undefined)[];
    managedFacilities: readonly (FacilitySeed | undefined)[];
    settlements: readonly Settlement[];
    anchorMs: number;
  },
): UserSeed {
  switch (user.role) {
    case 'VOLUNTEER': {
      const home = context.settlements[index % context.settlements.length]!;
      return {
        ...user,
        lastLocation: home.location,
        lastLocationMs: context.anchorMs - HOUR_MS,
        assignment: `${user.assignment}; verified volunteer at ${home.name}, ${VOLUNTEER_SERVICE_RADIUS_KM} km radius`,
      };
    }
    case 'RESCUE_TEAM': {
      const demoTeam = context.demoTeams[index];
      return demoTeam ? { ...user, rescueTeamId: demoTeam.id, assignment: `${user.assignment}; ${demoTeam.name}` } : user;
    }
    case 'FACILITY_MANAGER': {
      const facility = context.managedFacilities[index];
      return facility
        ? { ...user, facilityId: facility.id, assignment: `${user.assignment}; ${facility.kind.toLowerCase()} ${facility.name}` }
        : user;
    }
    default:
      return user;
  }
}

// Rescuers 1 and 2 hold the first two dispatch slots (a mission to accept, a mission en
// route); rescuer 3 is a free fire team, ready for the duplicate-cluster fire.
function demoRescueTeams(teams: readonly TeamSeed[], slots: readonly MissionSlot[]): (TeamSeed | undefined)[] {
  const slotted = new Set(slots.map((slot) => slot.team.id));
  const free = teams.filter((team) => !slotted.has(team.id));
  return [slots[0]?.team, slots[1]?.team, free.find((team) => team.agency === 'FIRE') ?? free[0]];
}

// Named facilities only: a demo account managing "Unnamed college (OSM way/…)" helps nobody.
function nearestFacilities(facilities: readonly FacilitySeed[], kind: FacilitySeed['kind'], point: LonLat): FacilitySeed[] {
  return facilities
    .filter((facility) => facility.kind === kind && facility.osmName !== null)
    .sort((a, b) => distanceM(point, a.location) - distanceM(point, b.location) || compareText(a.osmId, b.osmId));
}

// Every team gets a lead account, so steps a team takes on a mission have an actor, as they
// do when the API records them.
export function planTeamLeads(teams: readonly TeamSeed[], anchorMs: number): UserSeed[] {
  return teams.map((team, index) => {
    const phone = phoneNumber(TEAM_LEAD_PHONE_FIRST + index);
    return {
      id: seedUuid(`user:${phone}`),
      phone,
      fullName: `Team Lead, ${team.name}`,
      role: 'RESCUE_TEAM',
      inDistrict: true,
      rescueTeamId: team.id,
      facilityId: null,
      lastLocation: null,
      lastLocationMs: null,
      createdMs: anchorMs - 30 * DAY_MS,
      assignment: `lead of ${team.name}`,
    };
  });
}

export function planReporters(random: Random, count: number, anchorMs: number): UserSeed[] {
  return Array.from({ length: count }, (_, index) => {
    const phone = phoneNumber(REPORTER_PHONE_FIRST + index);
    const group = pickWeighted(
      random,
      REPORTER_NAMES.groups.map((candidate) => [candidate, candidate.share] as const),
    );
    return {
      id: seedUuid(`user:${phone}`),
      phone,
      fullName: `${pickOne(random, group.given)} ${pickOne(random, group.family)}`,
      role: 'CITIZEN',
      inDistrict: false,
      rescueTeamId: null,
      facilityId: null,
      lastLocation: null,
      lastLocationMs: null,
      createdMs: anchorMs - 7 * DAY_MS,
      assignment: 'synthetic reporter',
    };
  });
}
