// Mirrors the Postgres enums in infra/migrations; test/schema.int-spec.ts fails if they drift.

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

export const MEDIA_PURPOSES = ['INCIDENT_ATTACHMENT', 'VOLUNTEER_DOCUMENT'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_STATUSES = ['PENDING', 'CONFIRMED'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const RESCUE_AGENCIES = ['NDRF', 'SDRF', 'FIRE', 'POLICE', 'HEALTH', 'OTHER'] as const;
export type RescueAgency = (typeof RESCUE_AGENCIES)[number];

export const MISSION_STATUSES = ['ASSIGNED', 'ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const FACILITY_KINDS = ['SHELTER', 'HOSPITAL'] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

export const INVENTORY_ITEMS = ['FOOD_PACKET', 'WATER_LITRE', 'MEDICAL_KIT', 'BLANKET'] as const;
export type InventoryItem = (typeof INVENTORY_ITEMS)[number];

export const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VOLUNTEER_TASK_STATUSES = ['OPEN', 'ACCEPTED', 'COMPLETED', 'CANCELLED'] as const;
export type VolunteerTaskStatus = (typeof VOLUNTEER_TASK_STATUSES)[number];

export const ALERT_SEVERITIES = ['MINOR', 'MODERATE', 'SEVERE', 'EXTREME'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const DB_ENUMS = {
  user_role: USER_ROLES,
  disaster_type: DISASTER_TYPES,
  incident_status: INCIDENT_STATUSES,
  location_source: LOCATION_SOURCES,
  review_reason: REVIEW_REASONS,
  review_status: REVIEW_STATUSES,
  media_purpose: MEDIA_PURPOSES,
  media_status: MEDIA_STATUSES,
  rescue_agency: RESCUE_AGENCIES,
  mission_status: MISSION_STATUSES,
  facility_kind: FACILITY_KINDS,
  inventory_item: INVENTORY_ITEMS,
  verification_status: VERIFICATION_STATUSES,
  volunteer_task_status: VOLUNTEER_TASK_STATUSES,
  alert_severity: ALERT_SEVERITIES,
} as const;
