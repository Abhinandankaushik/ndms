// Mirrors docs/API_CONTRACT.md and apps/api/src/common/domain/enums.ts. Timestamps arrive as
// ISO 8601 strings because they cross JSON.

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

export const MEDIA_STATUSES = ['PENDING', 'CONFIRMED'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const RESCUE_AGENCIES = ['NDRF', 'SDRF', 'FIRE', 'POLICE', 'HEALTH', 'OTHER'] as const;
export type RescueAgency = (typeof RESCUE_AGENCIES)[number];

export const MISSION_STATUSES = ['ASSIGNED', 'ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const OPEN_MISSION_STATUSES: readonly MissionStatus[] = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'];

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

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

export const VOLUNTEER_DOCUMENT_CONTENT_TYPES = [...IMAGE_CONTENT_TYPES, 'application/pdf'] as const;
export type VolunteerDocumentContentType = (typeof VOLUNTEER_DOCUMENT_CONTENT_TYPES)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type IsoDateTime = string;

export type Bbox = readonly [minLon: number, minLat: number, maxLon: number, maxLat: number];

export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type GeoJsonArea = GeoJsonPolygon | GeoJsonMultiPolygon;

// ---------- Envelope ----------

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ApiErrorBody | null;
  meta: Record<string, unknown> | null;
}

// ---------- Auth ----------

export interface SessionUser {
  id: string;
  phone: string;
  fullName: string | null;
  role: UserRole;
  districtId: number | null;
  rescueTeamId: string | null;
  facilityId: string | null;
}

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  user: SessionUser;
}

export interface OtpSent {
  expiresInSeconds: number;
}

export interface LoggedOut {
  loggedOut: true;
}

export interface ProfileUpdate {
  fullName: string;
}

// ---------- Incidents ----------

export interface SosInput {
  clientUuid: string;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  reportedAt: IsoDateTime;
  type?: DisasterType;
  peopleAffected?: number;
}

export interface ReportInput {
  clientUuid: string;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  locationSource?: Exclude<LocationSource, 'NONE'>;
  reportedAt: IsoDateTime;
  type: DisasterType;
  description?: string;
  addressText?: string;
  peopleAffected?: number;
  hasElderly?: boolean;
  hasChildren?: boolean;
  hasInjured?: boolean;
}

export interface ReportReceipt {
  id: string;
  districtId: number;
  status: IncidentStatus;
  reportedAt: IsoDateTime;
  wasInserted: boolean;
}

export interface Incident {
  id: string;
  clientUuid: string;
  districtId: number;
  reporterId: string;
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
  lat: number | null;
  lon: number | null;
  locationSource: LocationSource;
  accuracyM: number | null;
  addressText: string | null;
  description: string | null;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  priorityScore: number | null;
  severityLevel: number | null;
  duplicateOf: string | null;
  reportedAt: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  resolvedAt: IsoDateTime | null;
}

export interface IncidentTimelineEntry {
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus;
  changedBy: string | null;
  note: string | null;
  changedAt: IsoDateTime;
}

export interface IncidentDetail extends Incident {
  timeline: IncidentTimelineEntry[];
}

export interface MapMarker {
  id: string;
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
  lat: number;
  lon: number;
  accuracyM: number | null;
  priorityScore: number | null;
  peopleAffected: number;
  reportedAt: IsoDateTime;
}

export interface MapMarkerQuery {
  bbox: Bbox;
  status?: readonly IncidentStatus[];
  type?: readonly DisasterType[];
  limit?: number;
}

export interface IncidentQueueQuery {
  status?: readonly IncidentStatus[];
  type?: readonly DisasterType[];
  sosOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface IncidentDetailsPatch {
  type?: DisasterType;
  description?: string;
  addressText?: string;
  peopleAffected?: number;
  hasElderly?: boolean;
  hasChildren?: boolean;
  hasInjured?: boolean;
  manualPin?: LatLon;
}

export interface IncidentStatusChange {
  status: IncidentStatus;
  note?: string;
  duplicateOf?: string;
}

// ---------- Reviews ----------

export interface Review {
  id: string;
  incidentId: string;
  reason: ReviewReason;
  relatedIncidentId: string | null;
  details: Record<string, unknown>;
  flaggedBy: string | null;
  status: ReviewStatus;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: IsoDateTime;
  resolvedAt: IsoDateTime | null;
}

export interface PendingReview extends Review {
  incident: {
    districtId: number;
    type: DisasterType;
    status: IncidentStatus;
    isSos: boolean;
    lat: number | null;
    lon: number | null;
    reportedAt: IsoDateTime;
    description: string | null;
  };
}

export interface IncidentFlagInput {
  reason: ReviewReason;
  relatedIncidentId?: string;
  note?: string;
}

export type ReviewOutcomeStatus = Extract<IncidentStatus, 'VERIFIED' | 'RESOLVED' | 'REJECTED_DUPLICATE' | 'REJECTED_FAKE'>;

export interface ReviewResolution {
  resolutionNote: string;
  incidentStatus?: ReviewOutcomeStatus;
  duplicateOf?: string;
}

// ---------- Media ----------

export interface PresignedUpload {
  mediaId: string;
  objectKey: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface IncidentMediaPresignInput {
  incidentId: string;
  contentType: ImageContentType;
  sizeBytes: number;
}

export interface MediaRecord {
  id: string;
  uploadedBy: string;
  incidentId: string | null;
  objectKey: string;
  contentType: string;
  sizeBytes: number | null;
  status: MediaStatus;
  createdAt: IsoDateTime;
  confirmedAt: IsoDateTime | null;
}

export interface IncidentMedia {
  id: string;
  contentType: string;
  sizeBytes: number | null;
  confirmedAt: IsoDateTime | null;
  url: string;
  expiresInSeconds: number;
}

// ---------- Missions & teams ----------

export interface Team {
  id: string;
  name: string;
  agency: RescueAgency;
  teamSize: number;
  capabilities: string[];
  isAvailable: boolean;
  lat: number;
  lon: number;
  locationUpdatedAt: IsoDateTime | null;
  activeMissionId: string | null;
}

export interface NearbyTeam extends Team {
  distanceM: number;
}

export interface NearestTeamsQuery {
  incidentId: string;
  capability?: string;
  limit?: number;
}

export interface Mission {
  id: string;
  incidentId: string;
  teamId: string;
  assignedBy: string;
  status: MissionStatus;
  etaMinutes: number | null;
  rejectionReason: string | null;
  peopleRescued: number | null;
  injuredCount: number | null;
  hospitalRequired: boolean | null;
  outcomeNotes: string | null;
  assignedAt: IsoDateTime;
  acceptedAt: IsoDateTime | null;
  reachedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  updatedAt: IsoDateTime;
}

export interface ReporterContact {
  fullName: string | null;
  phone: string;
}

export interface MissionWithIncident extends Mission {
  incident: Incident;
}

// The reporter's contact is revealed (and audited) only for the assigned team while the mission is open.
export interface MissionDetail extends MissionWithIncident {
  reporter: ReporterContact | null;
}

export interface CreateMissionInput {
  incidentId: string;
  teamId: string;
  etaMinutes?: number;
}

export interface MissionListQuery {
  status?: MissionStatus | readonly MissionStatus[];
  incidentId?: string;
  limit?: number;
}

export interface MissionStatusChange {
  status: MissionStatus;
  rejectionReason?: string;
  peopleRescued?: number;
  injuredCount?: number;
  hospitalRequired?: boolean;
  outcomeNotes?: string;
}

export interface TeamLocationPing {
  lat: number;
  lon: number;
  accuracyM?: number | null;
  recordedAt: IsoDateTime;
}

export interface TeamLocationReceipt {
  accepted: boolean;
}

// ---------- Facilities ----------

export interface Facility {
  id: string;
  districtId: number;
  kind: FacilityKind;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  contactPhone: string | null;
  capacity: number;
  occupancy: number;
  freeCapacity: number;
  utilisation: number;
  isOperational: boolean;
  amenities: string[];
  attributes: Record<string, unknown>;
  updatedAt: IsoDateTime;
}

export interface NearbyFacility extends Facility {
  distanceM: number;
}

export interface InventoryLine {
  item: InventoryItem;
  quantity: number;
  lowStockThreshold: number | null;
  isLow: boolean;
  updatedAt: IsoDateTime;
}

export interface FacilityDetail extends Facility {
  inventory: InventoryLine[];
}

export interface NearbyFacilitiesQuery extends LatLon {
  kind?: FacilityKind;
  withSpaceOnly?: boolean;
  limit?: number;
}

export interface FacilityListQuery {
  bbox: Bbox;
  kind?: FacilityKind;
}

export interface CreateFacilityInput {
  kind: FacilityKind;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  contactPhone?: string;
  capacity: number;
  amenities?: string[];
  attributes?: Record<string, unknown>;
}

export interface FacilityPatch {
  name?: string;
  capacity?: number;
  isOperational?: boolean;
  address?: string | null;
  contactPhone?: string | null;
  amenities?: string[];
  attributes?: Record<string, unknown>;
}

export interface OccupancySnapshot {
  occupancy: number;
  capacity: number;
  freeCapacity: number;
  utilisation: number;
}

export interface InventoryPatch {
  delta?: number;
  lowStockThreshold?: number | null;
}

// ---------- Volunteers ----------

export interface VolunteerProfile {
  userId: string;
  skills: string[];
  isAvailable: boolean;
  serviceRadiusKm: number;
  verificationStatus: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: IsoDateTime | null;
  rejectionReason: string | null;
  lat: number | null;
  lon: number | null;
  locationUpdatedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// The contract guarantees id and url; the rest lets a reviewer tell a PDF from a photo before opening it.
export interface VolunteerDocumentLink {
  id: string;
  url: string;
  contentType?: string;
  sizeBytes?: number | null;
  confirmedAt?: IsoDateTime | null;
  expiresInSeconds?: number;
}

export interface VolunteerApplication extends VolunteerProfile {
  phone: string;
  fullName: string | null;
  documents: VolunteerDocumentLink[];
}

export interface VolunteerApplicationsQuery {
  status?: VerificationStatus;
  limit?: number;
}

export interface VolunteerRegistration extends LatLon {
  skills: string[];
  serviceRadiusKm: number;
}

export interface VolunteerProfilePatch {
  skills?: string[];
  serviceRadiusKm?: number;
  isAvailable?: boolean;
  lat?: number;
  lon?: number;
}

export interface VolunteerDocumentPresignInput {
  contentType: VolunteerDocumentContentType;
  sizeBytes: number;
}

export interface VolunteerReviewDecision {
  decision: Extract<VerificationStatus, 'VERIFIED' | 'REJECTED'>;
  rejectionReason?: string;
}

export interface VolunteerTask {
  id: string;
  districtId: number;
  createdBy: string;
  incidentId: string | null;
  facilityId: string | null;
  title: string;
  description: string | null;
  requiredSkills: string[];
  lat: number;
  lon: number;
  status: VolunteerTaskStatus;
  assignedVolunteerId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  acceptedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}

export interface NearbyVolunteerTask extends VolunteerTask {
  distanceM: number;
}

export interface CreateVolunteerTaskInput extends LatLon {
  title: string;
  description?: string;
  requiredSkills?: string[];
  incidentId?: string;
  facilityId?: string;
}

export interface VolunteerTaskListQuery {
  status?: VolunteerTaskStatus | readonly VolunteerTaskStatus[];
  limit?: number;
}

// ---------- Alerts ----------

export interface Alert {
  id: string;
  districtId: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  targetRoles: UserRole[];
  geofence: GeoJsonArea | null;
  issuedAt: IsoDateTime;
  expiresAt: IsoDateTime | null;
  cancelledAt: IsoDateTime | null;
}

export interface CreateAlertInput {
  severity: AlertSeverity;
  title: string;
  message: string;
  targetRoles?: UserRole[];
  geofence?: GeoJsonArea | null;
  expiresAt?: IsoDateTime;
}

export interface ActiveAlertsQuery {
  lat?: number;
  lon?: number;
}

// ---------- Districts & dashboard ----------

export interface DistrictInfo {
  id: number;
  name: string;
  state: string;
  bbox: Bbox;
  centroid: LatLon;
  boundary: GeoJsonArea;
}

export interface DashboardSummary {
  activeIncidents: number;
  openSos: number;
  peopleAffected: number;
  pendingReviews: number;
  teamsTotal: number;
  teamsAvailable: number;
  teamsOnMission: number;
  shelterCapacity: number;
  shelterOccupancy: number;
  shelterUtilisation: number;
  peopleRescuedToday: number;
  avgResponseMinutes24h: number | null;
  verifiedVolunteers: number;
  generatedAt: IsoDateTime;
}

export interface HeatmapQuery {
  bbox: Bbox;
  hours?: number;
  cellDegrees?: number;
}

export interface HeatmapCell extends LatLon {
  count: number;
  avgPriority: number | null;
}

export interface ResourceRow {
  facilityId: string;
  name: string;
  kind: FacilityKind;
  capacity: number;
  occupancy: number;
  utilisation: number;
  lowStock: InventoryLine[];
}

// ---------- Platform ----------

export interface AuditEntry {
  id: number;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  occurredAt: IsoDateTime;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export type SyncItem = { kind: 'SOS'; body: SosInput } | { kind: 'REPORT'; body: ReportInput };

export const SYNC_OUTCOMES = ['CREATED', 'DUPLICATE', 'CONFLICT', 'INVALID'] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

// clientUuid is null only for an INVALID item whose body carried no usable clientUuid.
export interface SyncItemResult {
  clientUuid: string | null;
  outcome: SyncOutcome;
  id?: string;
  error?: ApiErrorBody;
}

export interface SyncResult {
  results: SyncItemResult[];
}

// ---------- Realtime ----------

export interface IncidentCreatedEvent {
  id: string;
  districtId: number;
  reporterId: string;
  type: DisasterType;
  status: IncidentStatus;
  isSos: boolean;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  locationSource: LocationSource;
  peopleAffected: number;
  hasElderly: boolean;
  hasChildren: boolean;
  hasInjured: boolean;
  priorityScore: number | null;
  reportedAt: IsoDateTime;
}

export interface IncidentStatusChangedEvent {
  id: string;
  from: IncidentStatus;
  to: IncidentStatus;
  by: string;
  at: IsoDateTime;
}

export interface IncidentMediaAddedEvent {
  incidentId: string;
  mediaId: string;
  contentType: string;
}

export interface IncidentEnrichedEvent {
  id: string;
  priorityScore: number | null;
  severityLevel: number | null;
  flags: ReviewReason[];
}

export interface MissionAssignedEvent {
  mission: Mission;
  incident: Incident;
}

export interface MissionStatusChangedEvent {
  missionId: string;
  incidentId: string;
  teamId: string;
  from: MissionStatus;
  to: MissionStatus;
  at: IsoDateTime;
}

export interface TeamLocationEvent extends LatLon {
  teamId: string;
  missionId: string | null;
  accuracyM: number | null;
  recordedAt: IsoDateTime;
}

export interface FacilityCapacityChangedEvent {
  facilityId: string;
  occupancy: number;
  capacity: number;
  utilisation: number;
}

export interface FacilityCapacityAlertEvent extends FacilityCapacityChangedEvent {
  name: string;
}

export interface FacilityInventoryChangedEvent {
  facilityId: string;
  item: InventoryItem;
  quantity: number;
  lowStockThreshold: number | null;
  isLow: boolean;
}

export interface AlertBroadcastEvent {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  geofence: GeoJsonArea | null;
  issuedAt: IsoDateTime;
  expiresAt: IsoDateTime | null;
}

export interface AlertCancelledEvent {
  id: string;
}

export interface VolunteerReviewedEvent {
  userId: string;
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
}

export interface SocketEventPayloads {
  'incident:created': IncidentCreatedEvent;
  'incident:updated': Incident;
  'incident:status_changed': IncidentStatusChangedEvent;
  'incident:media_added': IncidentMediaAddedEvent;
  'incident:enriched': IncidentEnrichedEvent;
  'review:created': Review;
  'review:resolved': Review;
  'mission:assigned': MissionAssignedEvent;
  'mission:status_changed': MissionStatusChangedEvent;
  'team:location': TeamLocationEvent;
  'facility:capacity_changed': FacilityCapacityChangedEvent;
  'facility:capacity_alert': FacilityCapacityAlertEvent;
  'facility:inventory_changed': FacilityInventoryChangedEvent;
  'alert:broadcast': AlertBroadcastEvent;
  'alert:cancelled': AlertCancelledEvent;
  'volunteer:reviewed': VolunteerReviewedEvent;
  'volunteer_task:created': VolunteerTask;
  'volunteer_task:updated': VolunteerTask;
  exception: ApiEnvelope<never>;
}

export type SocketEventName = keyof SocketEventPayloads;

export type ServerToClientEvents = {
  [E in SocketEventName]: (payload: SocketEventPayloads[E]) => void;
};

export interface IncidentSubscriptionAck {
  ok: boolean;
  error?: string;
}

export interface ClientToServerEvents {
  'incident:subscribe': (request: { incidentId: string }, ack: (response: IncidentSubscriptionAck) => void) => void;
}
