import type {
  AlertSeverity,
  DisasterType,
  FacilityKind,
  IncidentStatus,
  InventoryItem,
  MissionStatus,
  RescueAgency,
  ReviewReason,
  UserRole,
  VerificationStatus,
  VolunteerTaskStatus,
} from '@/lib/api/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  CITIZEN: 'Citizen',
  VOLUNTEER: 'Volunteer',
  RESCUE_TEAM: 'Rescue team',
  FACILITY_MANAGER: 'Facility manager',
  GOVT_OFFICIAL: 'Government official',
};

export const DISASTER_TYPE_LABELS: Record<DisasterType, string> = {
  FLOOD: 'Flood',
  EARTHQUAKE: 'Earthquake',
  FIRE: 'Fire',
  CYCLONE: 'Cyclone',
  LANDSLIDE: 'Landslide',
  BUILDING_COLLAPSE: 'Building collapse',
  OTHER: 'Other',
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  REPORTED: 'Reported',
  VERIFIED: 'Verified',
  ASSIGNED: 'Team assigned',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  REJECTED_DUPLICATE: 'Duplicate',
  REJECTED_FAKE: 'Rejected',
};

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  ASSIGNED: 'Assigned',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EN_ROUTE: 'En route',
  ON_SITE: 'On site',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const RESCUE_AGENCY_LABELS: Record<RescueAgency, string> = {
  NDRF: 'NDRF',
  SDRF: 'SDRF',
  FIRE: 'Fire service',
  POLICE: 'Police',
  HEALTH: 'Health',
  OTHER: 'Other',
};

export const FACILITY_KIND_LABELS: Record<FacilityKind, string> = {
  SHELTER: 'Shelter',
  HOSPITAL: 'Hospital',
};

export const INVENTORY_ITEM_LABELS: Record<InventoryItem, string> = {
  FOOD_PACKET: 'Food packets',
  WATER_LITRE: 'Water (litres)',
  MEDICAL_KIT: 'Medical kits',
  BLANKET: 'Blankets',
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  MINOR: 'Minor',
  MODERATE: 'Moderate',
  SEVERE: 'Severe',
  EXTREME: 'Extreme',
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  POSSIBLE_DUPLICATE: 'Possible duplicate',
  POSSIBLE_FAKE: 'Possible fake',
  LOCATION_UNCERTAIN: 'Location uncertain',
  OTHER: 'Other',
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  PENDING: 'Pending review',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const VOLUNTEER_TASK_STATUS_LABELS: Record<VolunteerTaskStatus, string> = {
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
