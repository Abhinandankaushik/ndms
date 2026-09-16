import type { FacilityKind, InventoryItem } from './domain.ts';
import { distanceM, type LonLat } from './geo.ts';
import type { Amenity, OsmFacility } from './inputs.ts';
import { between, chance, seedUuid, type Random } from './random.ts';
import { normaliseName } from './text.ts';

export type SchoolLevel = 'PRIMARY' | 'SECONDARY' | 'UNKNOWN';

export interface CapacityRule {
  rule: string;
  capacity: number;
}

export interface FacilitySeed {
  id: string;
  osmId: string;
  osmName: string | null;
  amenity: Amenity;
  kind: FacilityKind;
  name: string;
  location: LonLat;
  capacity: number;
  occupancy: number;
  attributes: Record<string, unknown>;
}

export interface InventorySeed {
  facilityId: string;
  item: InventoryItem;
  quantity: number;
  lowStockThreshold: number;
}

const SHELTER_AMENITIES: readonly Amenity[] = ['school', 'college', 'community_centre'];
const HOSPITAL_AMENITIES: readonly Amenity[] = ['hospital', 'clinic'];

// Plan §B5. Schools whose level cannot be told are sized as primary schools, the smaller
// and far more common kind.
const SHELTER_CAPACITY = {
  primarySchool: 150,
  secondarySchoolOrCollege: 400,
  communityCentre: 200,
  schoolOfUnknownLevel: 150,
} as const;

export const HOSPITAL_BEDS: Record<'hospital' | 'clinic', number> = { hospital: 60, clinic: 10 };

// OSM tags some teaching hospitals only as colleges (Darbhanga Medical College and Hospital).
// A working hospital cannot take in flood evacuees, so these become hospitals, not shelters.
const TEACHING_HOSPITAL_NAME = /\bhospital\b/i;

// Two OSM features with the same amenity and name this close are one facility mapped twice.
const DOUBLE_MAPPING_DISTANCE_M = 50;

// Share of shelters already hosting evacuees, how full they are, and how many of those are
// full, so the shelter finder has to skip some.
const SHELTER_IN_USE_SHARE = 0.4;
const SHELTER_FULL_SHARE = 0.15;
const SHELTER_UTILISATION = [0.15, 0.97] as const;
const HOSPITAL_UTILISATION = [0.35, 0.9] as const;

// Stock is U(0.25, 1.5) × (per-person quantity × capacity); the low-stock threshold is half
// of (per-person quantity × capacity). Keys are in the database enum's order.
export const PER_PERSON_STOCK: Record<InventoryItem, number> = {
  FOOD_PACKET: 2,
  WATER_LITRE: 3,
  MEDICAL_KIT: 0.05,
  BLANKET: 1,
};
const STOCK_COVER = [0.25, 1.5] as const;
const LOW_STOCK_COVER = 0.5;

const SECONDARY_NAME_PATTERNS = [
  /\b(high|secondary|senior|intermediate|inter college|madhyamik|uchh|uchch|uchcha)\b/i,
  /\+\s?2/,
  /माध्यमिक|उच्च/,
];
const PRIMARY_NAME_PATTERNS = [/\b(primary|prathmik|prathamik|middle|madhya|nursery|kindergarten)\b/i, /प्राथमिक|मध्य/];

// India maps ISCED 1 and 2 to classes 1–8 (primary and upper primary) and ISCED 3 to
// classes 9–12, so only level 3 counts as secondary. Without the tag, the name decides.
function schoolLevel(iscedLevel: string | null, name: string | null): SchoolLevel {
  const levels = (iscedLevel ?? '')
    .split(/[;,]/)
    .map((level) => Number.parseInt(level, 10))
    .filter(Number.isFinite);
  if (levels.length > 0) return Math.max(...levels) >= 3 ? 'SECONDARY' : 'PRIMARY';
  if (name && SECONDARY_NAME_PATTERNS.some((pattern) => pattern.test(name))) return 'SECONDARY';
  if (name && PRIMARY_NAME_PATTERNS.some((pattern) => pattern.test(name))) return 'PRIMARY';
  return 'UNKNOWN';
}

export function shelterCapacity(facility: Pick<OsmFacility, 'amenity' | 'iscedLevel' | 'name'>): CapacityRule {
  switch (facility.amenity) {
    case 'college':
      return { rule: 'college', capacity: SHELTER_CAPACITY.secondarySchoolOrCollege };
    case 'community_centre':
      return { rule: 'community centre', capacity: SHELTER_CAPACITY.communityCentre };
    case 'school': {
      const level = schoolLevel(facility.iscedLevel, facility.name);
      if (level === 'SECONDARY') return { rule: 'secondary school', capacity: SHELTER_CAPACITY.secondarySchoolOrCollege };
      if (level === 'PRIMARY') return { rule: 'primary school', capacity: SHELTER_CAPACITY.primarySchool };
      return { rule: 'school of unknown level', capacity: SHELTER_CAPACITY.schoolOfUnknownLevel };
    }
    default:
      throw new Error(`${facility.amenity} is not a shelter amenity`);
  }
}

function facilityKind(facility: Pick<OsmFacility, 'amenity' | 'name'>): FacilityKind | null {
  if (facility.amenity === 'college' && facility.name !== null && TEACHING_HOSPITAL_NAME.test(facility.name)) return 'HOSPITAL';
  if (SHELTER_AMENITIES.includes(facility.amenity)) return 'SHELTER';
  if (HOSPITAL_AMENITIES.includes(facility.amenity)) return 'HOSPITAL';
  return null;
}

export function withoutDoubleMapping<T extends Pick<OsmFacility, 'amenity' | 'name' | 'location'>>(facilities: readonly T[]): T[] {
  const kept: T[] = [];
  for (const facility of facilities) {
    const mappedTwice = kept.some(
      (other) =>
        other.amenity === facility.amenity &&
        other.name !== null &&
        facility.name !== null &&
        normaliseName(other.name) === normaliseName(facility.name) &&
        distanceM(other.location, facility.location) <= DOUBLE_MAPPING_DISTANCE_M,
    );
    if (!mappedTwice) kept.push(facility);
  }
  return kept;
}

const facilityName = (facility: OsmFacility): string =>
  facility.name ?? `Unnamed ${facility.amenity.replace('_', ' ')} (OSM ${facility.osmId})`;

export function planFacilities(random: Random, osmFacilities: readonly OsmFacility[]): FacilitySeed[] {
  return withoutDoubleMapping(osmFacilities).flatMap((facility): FacilitySeed[] => {
    switch (facilityKind(facility)) {
      case 'SHELTER':
        return [planShelter(random, facility)];
      case 'HOSPITAL':
        return [planHospital(random, facility)];
      default:
        return [];
    }
  });
}

function planShelter(random: Random, facility: OsmFacility): FacilitySeed {
  const { rule, capacity } = shelterCapacity(facility);
  const inUse = chance(random, SHELTER_IN_USE_SHARE);
  const full = chance(random, SHELTER_FULL_SHARE);
  const utilisation = between(random, ...SHELTER_UTILISATION);
  const occupancy = !inUse ? 0 : full ? capacity : Math.round(capacity * utilisation);
  return {
    id: seedUuid(`facility:${facility.osmId}`),
    osmId: facility.osmId,
    osmName: facility.name,
    amenity: facility.amenity,
    kind: 'SHELTER',
    name: facilityName(facility),
    location: facility.location,
    capacity,
    occupancy,
    attributes: {
      source: 'OpenStreetMap',
      osmId: facility.osmId,
      osmAmenity: facility.amenity,
      ...(facility.amenity === 'school' ? { schoolLevel: schoolLevel(facility.iscedLevel, facility.name) } : {}),
      capacityRule: rule,
      capacitySource: 'synthetic',
    },
  };
}

function planHospital(random: Random, facility: OsmFacility): FacilitySeed {
  const bedsRule = facility.amenity === 'clinic' ? 'clinic' : 'hospital';
  const beds = HOSPITAL_BEDS[bedsRule];
  return {
    id: seedUuid(`facility:${facility.osmId}`),
    osmId: facility.osmId,
    osmName: facility.name,
    amenity: facility.amenity,
    kind: 'HOSPITAL',
    name: facilityName(facility),
    location: facility.location,
    capacity: beds,
    occupancy: Math.round(beds * between(random, ...HOSPITAL_UTILISATION)),
    attributes: {
      source: 'OpenStreetMap',
      osmId: facility.osmId,
      osmAmenity: facility.amenity,
      beds,
      capacityRule: facility.amenity === 'college' ? 'hospital (OSM college named as a hospital)' : bedsRule,
      capacitySource: 'synthetic',
    },
  };
}

export function planInventory(random: Random, facilities: readonly FacilitySeed[]): InventorySeed[] {
  const items = Object.keys(PER_PERSON_STOCK) as InventoryItem[];
  return facilities.flatMap((facility) =>
    items.map((item) => {
      const fullNeed = PER_PERSON_STOCK[item] * facility.capacity;
      return {
        facilityId: facility.id,
        item,
        quantity: Math.round(fullNeed * between(random, ...STOCK_COVER)),
        lowStockThreshold: Math.max(1, Math.round(fullNeed * LOW_STOCK_COVER)),
      };
    }),
  );
}
