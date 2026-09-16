import type { MissionStatus, RescueAgency } from './domain.ts';
import { distanceM, type LonLat } from './geo.ts';
import type { Amenity, OsmFacility } from './inputs.ts';
import { seedUuid } from './random.ts';
import type { Settlement } from './settlements.ts';
import { compareText } from './text.ts';

export type SeededAgency = Exclude<RescueAgency, 'OTHER'>;

export interface TeamSeed {
  id: string;
  name: string;
  agency: SeededAgency;
  teamSize: number;
  capabilities: string[];
  base: LonLat;
  baseOsmId: string;
  baseName: string;
  baseRule: string;
}

export interface MissionSlot {
  team: TeamSeed;
  status: Extract<MissionStatus, 'ASSIGNED' | 'ACCEPTED' | 'EN_ROUTE' | 'ON_SITE'>;
}

const TEAM_TARGET = 10;
const MAX_TEAMS_PER_STATION_KIND = 2;
const SDRF_TEAMS = 3;

// Synthetic team sizes and capability tags (SCREAMING_SNAKE, like volunteer skills).
const AGENCY_PROFILES: Record<SeededAgency, { teamSize: number; capabilities: string[]; label: string }> = {
  NDRF: { teamSize: 35, capabilities: ['WATER_RESCUE', 'BOAT', 'COLLAPSED_STRUCTURE_SEARCH', 'FIRST_AID'], label: 'NDRF Team' },
  SDRF: { teamSize: 20, capabilities: ['WATER_RESCUE', 'BOAT', 'FIRST_AID'], label: 'SDRF Team' },
  FIRE: { teamSize: 8, capabilities: ['FIREFIGHTING', 'RESCUE_TOOLS', 'FIRST_AID'], label: 'Fire and Emergency Services' },
  POLICE: { teamSize: 10, capabilities: ['EVACUATION', 'CROWD_CONTROL', 'FIRST_AID'], label: 'Police Quick Response Team' },
  HEALTH: { teamSize: 5, capabilities: ['MEDICAL', 'AMBULANCE', 'FIRST_AID'], label: 'Medical Response Team' },
};

const GOVERNMENT_HOSPITAL_NAME = /\b(gov(ern|er)?ment|govt|referr?al|sub ?divisional)\b/i;

// The dispatch states the demo needs on the rescue dashboard, filled by the first free team
// of each agency: one awaiting acceptance, one travelling, one on site, and so on.
const ACTIVE_MISSION_PLAN: readonly { agency: SeededAgency; status: MissionSlot['status'] }[] = [
  { agency: 'NDRF', status: 'ASSIGNED' },
  { agency: 'SDRF', status: 'EN_ROUTE' },
  { agency: 'SDRF', status: 'ON_SITE' },
  { agency: 'HEALTH', status: 'ACCEPTED' },
  { agency: 'POLICE', status: 'ASSIGNED' },
];

// Every base is a real OSM point. POLICE and FIRE teams sit at OSM police and fire stations.
// When OSM maps no fire station in the district, the fire team sits at the largest
// settlement, the district headquarters. NDRF and SDRF take the next largest settlements, and
// medical teams fill the roster at government hospitals, each as far as possible from the
// bases already chosen.
export function planTeams(rankedSettlements: readonly Settlement[], osmFacilities: readonly OsmFacility[]): TeamSeed[] {
  const stations = (amenity: Amenity) =>
    osmFacilities.filter((facility) => facility.amenity === amenity).slice(0, MAX_TEAMS_PER_STATION_KIND);
  const teams: TeamSeed[] = [
    ...stations('police').map((station) => teamAtFacility('POLICE', station, 'OSM police station')),
    ...stations('fire_station').map((station) => teamAtFacility('FIRE', station, 'OSM fire station')),
  ];

  const settlements = [...rankedSettlements];
  const takeSettlement = (agency: SeededAgency, rule: string) => {
    const settlement = settlements.shift();
    if (settlement) teams.push(team(agency, settlement.osmId, settlement.name, settlement.location, rule));
  };
  if (!teams.some((candidate) => candidate.agency === 'FIRE')) {
    takeSettlement('FIRE', 'largest OSM settlement, because OSM maps no fire station in the district');
  }
  takeSettlement('NDRF', 'largest OSM settlement not yet a base');
  for (let count = 0; count < SDRF_TEAMS; count++) takeSettlement('SDRF', 'largest OSM settlement not yet a base');

  const hospitals = osmFacilities.filter(
    (facility) => facility.amenity === 'hospital' && facility.name !== null && GOVERNMENT_HOSPITAL_NAME.test(facility.name),
  );
  while (teams.length < TEAM_TARGET) {
    const hospital = farthestFromBases(hospitals, teams);
    if (!hospital) break;
    hospitals.splice(hospitals.indexOf(hospital), 1);
    teams.push(teamAtFacility('HEALTH', hospital, 'OSM government hospital farthest from the other bases'));
  }
  return teams;
}

function farthestFromBases(candidates: readonly OsmFacility[], teams: readonly TeamSeed[]): OsmFacility | undefined {
  const clearance = (candidate: OsmFacility) => Math.min(...teams.map((existing) => distanceM(existing.base, candidate.location)));
  return [...candidates].sort((a, b) => clearance(b) - clearance(a) || compareText(a.osmId, b.osmId))[0];
}

const teamAtFacility = (agency: SeededAgency, facility: OsmFacility, rule: string): TeamSeed =>
  team(agency, facility.osmId, facility.name ?? `OSM ${facility.osmId}`, facility.location, rule);

function team(agency: SeededAgency, baseOsmId: string, baseName: string, base: LonLat, baseRule: string): TeamSeed {
  const profile = AGENCY_PROFILES[agency];
  return {
    id: seedUuid(`team:${agency}:${baseOsmId}`),
    name: `${profile.label}, ${baseName}`,
    agency,
    teamSize: profile.teamSize,
    capabilities: [...profile.capabilities],
    base,
    baseOsmId,
    baseName,
    baseRule,
  };
}

export function planMissionSlots(teams: readonly TeamSeed[]): MissionSlot[] {
  const used = new Set<string>();
  return ACTIVE_MISSION_PLAN.flatMap(({ agency, status }) => {
    const slotTeam = teams.find((candidate) => candidate.agency === agency && !used.has(candidate.id));
    if (!slotTeam) return [];
    used.add(slotTeam.id);
    return [{ team: slotTeam, status }];
  });
}
