// Mirrors the Postgres enums the seed writes; seed/domain.test.ts fails if they drift from
// infra/migrations. Not imported from apps/api: that package is CommonJS, which Node's type
// stripping and this package's verbatimModuleSyntax cannot share.

export const USER_ROLES = ['CITIZEN', 'VOLUNTEER', 'RESCUE_TEAM', 'FACILITY_MANAGER', 'GOVT_OFFICIAL'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DISASTER_TYPES = ['FLOOD', 'EARTHQUAKE', 'FIRE', 'CYCLONE', 'LANDSLIDE', 'BUILDING_COLLAPSE', 'OTHER'] as const;
export type DisasterType = (typeof DISASTER_TYPES)[number];

export const INCIDENT_STATUSES = [
  'REPORTED',
  'VERIFIED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED_DUPLICATE',
  'REJECTED_FAKE',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = ['REPORTED', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS'];

export const LOCATION_SOURCES = ['GPS', 'MANUAL_PIN', 'NONE'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export const REVIEW_REASONS = ['POSSIBLE_DUPLICATE', 'POSSIBLE_FAKE', 'LOCATION_UNCERTAIN', 'OTHER'] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const REVIEW_STATUSES = ['PENDING', 'RESOLVED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const RESCUE_AGENCIES = ['NDRF', 'SDRF', 'FIRE', 'POLICE', 'HEALTH', 'OTHER'] as const;
export type RescueAgency = (typeof RESCUE_AGENCIES)[number];

export const MISSION_STATUSES = ['ASSIGNED', 'ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const OPEN_MISSION_STATUSES: readonly MissionStatus[] = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'];

export const FACILITY_KINDS = ['SHELTER', 'HOSPITAL'] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

export const INVENTORY_ITEMS = ['FOOD_PACKET', 'WATER_LITRE', 'MEDICAL_KIT', 'BLANKET'] as const;
export type InventoryItem = (typeof INVENTORY_ITEMS)[number];

export const DB_ENUMS = {
  user_role: USER_ROLES,
  disaster_type: DISASTER_TYPES,
  incident_status: INCIDENT_STATUSES,
  location_source: LOCATION_SOURCES,
  review_reason: REVIEW_REASONS,
  review_status: REVIEW_STATUSES,
  rescue_agency: RESCUE_AGENCIES,
  mission_status: MISSION_STATUSES,
  facility_kind: FACILITY_KINDS,
  inventory_item: INVENTORY_ITEMS,
} as const;
