// Shared with the API by contract, not by import: docs/API_CONTRACT.md (Realtime, Worker) is
// the source of truth for these names, and the enum values mirror the Postgres types in
// infra/migrations.

export const INCIDENT_ENRICHMENT_QUEUE = 'incident-enrichment';
export const ENRICH_JOB_NAME = 'enrich';
export const DOMAIN_EVENTS_CHANNEL = 'ndms:events';

export interface EnrichIncidentJob {
  incidentId: string;
}

export const rooms = {
  district: (districtId: number) => `district:${districtId}`,
  incident: (incidentId: string) => `incident:${incidentId}`,
};

export const DISASTER_TYPES = ['FLOOD', 'EARTHQUAKE', 'FIRE', 'CYCLONE', 'LANDSLIDE', 'BUILDING_COLLAPSE', 'OTHER'] as const;
export type DisasterType = (typeof DISASTER_TYPES)[number];

export type IncidentStatus =
  | 'REPORTED'
  | 'VERIFIED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED_DUPLICATE'
  | 'REJECTED_FAKE';

export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = ['REPORTED', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS'];

export type LocationSource = 'GPS' | 'MANUAL_PIN' | 'NONE';

export type ReviewReason = 'POSSIBLE_DUPLICATE' | 'POSSIBLE_FAKE' | 'LOCATION_UNCERTAIN' | 'OTHER';

export type ReviewStatus = 'PENDING' | 'RESOLVED';
