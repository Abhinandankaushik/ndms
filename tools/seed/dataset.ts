import type { MissionStatus } from './domain.ts';
import { planFacilities, planInventory, type FacilitySeed, type InventorySeed } from './facilities.ts';
import { totalPopulation } from './geotiff.ts';
import { planIncidents, type IncidentPlan } from './incidents.ts';
import type { OsmPlace, SeedInputs } from './inputs.ts';
import { randomStream } from './random.ts';
import { describeSettlements, rankSettlements, withoutDoubleMappedPlaces, type Settlement } from './settlements.ts';
import { planMissionSlots, planTeams, type TeamSeed } from './teams.ts';
import { planDemoAccounts, planReporters, planTeamLeads, type UserSeed, type VolunteerProfileSeed } from './users.ts';

// The first facility manager's shelter starts at 80 % so that admitting a few people during
// the demo crosses the 85 % capacity alert; the second one starts short of food packets.
const DEMO_SHELTER_UTILISATION = 0.8;
const DEMO_LOW_STOCK_SHARE = 0.6;

const REPORTERS_PER_INCIDENT = 0.6;
const MIN_REPORTERS = 25;
const DEPLOYED_MISSION_STATUSES: readonly MissionStatus[] = ['ACCEPTED', 'EN_ROUTE', 'ON_SITE'];

export interface TeamRow extends TeamSeed {
  isAvailable: boolean;
}

export interface SeedDataset extends IncidentPlan {
  anchorMs: number;
  district: SeedInputs['district'] & { population: number | null };
  mergedPlaces: OsmPlace[];
  settlements: Settlement[];
  facilities: FacilitySeed[];
  inventory: InventorySeed[];
  teams: TeamRow[];
  users: UserSeed[];
  demoAccounts: UserSeed[];
  volunteerProfiles: VolunteerProfileSeed[];
}

export function buildSeedDataset(inputs: SeedInputs, options: { incidentCount: number; anchorMs: number }): SeedDataset {
  const { anchorMs } = options;
  const places = withoutDoubleMappedPlaces(inputs.places);
  const settlements = describeSettlements(places, inputs.waterways, inputs.raster);
  const rankedSettlements = rankSettlements(settlements);

  const plannedFacilities = planFacilities(randomStream('facilities'), inputs.facilities);
  const plannedInventory = planInventory(randomStream('inventory'), plannedFacilities);
  const teams = planTeams(rankedSettlements, inputs.facilities);
  const missionSlots = planMissionSlots(teams);
  const demo = planDemoAccounts({
    anchorMs,
    districtName: inputs.district.name,
    rankedSettlements,
    facilities: plannedFacilities,
    teams,
    missionSlots,
  });
  const { facilities, inventory } = withDemoFacilityStates(plannedFacilities, plannedInventory, demo.managedShelters);

  const teamLeads = planTeamLeads(teams, anchorMs);
  const reporters = planReporters(
    randomStream('reporters'),
    Math.max(MIN_REPORTERS, Math.ceil(options.incidentCount * REPORTERS_PER_INCIDENT)),
    anchorMs,
  );
  const byRole = (role: UserSeed['role']) => demo.users.filter((user) => user.role === role);
  const plan = planIncidents({
    random: randomStream('incidents'),
    anchorMs,
    count: options.incidentCount,
    boundary: inputs.district.boundary,
    settlements,
    clusterSettlement: rankedSettlements[0]!,
    reporters,
    demoCitizens: byRole('CITIZEN'),
    officials: byRole('GOVT_OFFICIAL'),
    teams,
    missionSlots,
    teamMembers: teamMembers([...byRole('RESCUE_TEAM'), ...teamLeads]),
  });

  return {
    anchorMs,
    district: {
      ...inputs.district,
      population: inputs.raster ? Math.round(totalPopulation(inputs.raster).people) : null,
    },
    mergedPlaces: inputs.places.filter((place) => !places.includes(place)),
    settlements,
    facilities,
    inventory,
    teams: teams.map((team) => ({
      ...team,
      isAvailable: !plan.missions.some((mission) => mission.teamId === team.id && DEPLOYED_MISSION_STATUSES.includes(mission.status)),
    })),
    users: [...demo.users, ...teamLeads, ...reporters],
    demoAccounts: demo.users,
    volunteerProfiles: demo.volunteerProfiles,
    ...plan,
  };
}

// A team's steps are attributed to its demo rescuer where it has one, otherwise to its lead.
function teamMembers(rescuers: readonly UserSeed[]): Map<string, string> {
  const members = new Map<string, string>();
  for (const rescuer of rescuers) {
    if (rescuer.rescueTeamId && !members.has(rescuer.rescueTeamId)) members.set(rescuer.rescueTeamId, rescuer.id);
  }
  return members;
}

function withDemoFacilityStates(
  facilities: readonly FacilitySeed[],
  inventory: readonly InventorySeed[],
  managedShelters: readonly FacilitySeed[],
): { facilities: FacilitySeed[]; inventory: InventorySeed[] } {
  const [nearlyFull, shortOfFood] = managedShelters;
  return {
    facilities: facilities.map((facility) =>
      facility.id === nearlyFull?.id ? { ...facility, occupancy: Math.floor(facility.capacity * DEMO_SHELTER_UTILISATION) } : facility,
    ),
    inventory: inventory.map((line) =>
      line.facilityId === shortOfFood?.id && line.item === 'FOOD_PACKET'
        ? { ...line, quantity: Math.floor(line.lowStockThreshold * DEMO_LOW_STOCK_SHARE) }
        : line,
    ),
  };
}
