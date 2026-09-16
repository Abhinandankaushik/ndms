import {
  OPEN_INCIDENT_STATUSES,
  OPEN_MISSION_STATUSES,
  type IncidentStatus,
  type MissionStatus,
  type ReviewOutcomeStatus,
} from '@/lib/api/types';

// Mirrors the official column of the status workflow in docs/API_CONTRACT.md; the API enforces it and answers
// 409 INVALID_TRANSITION, so this table only decides which actions are offered.
const OFFICIAL_INCIDENT_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  REPORTED: ['VERIFIED', 'ASSIGNED', 'RESOLVED', 'REJECTED_DUPLICATE', 'REJECTED_FAKE'],
  VERIFIED: ['ASSIGNED', 'RESOLVED', 'REJECTED_DUPLICATE', 'REJECTED_FAKE'],
  ASSIGNED: ['IN_PROGRESS', 'VERIFIED', 'RESOLVED'],
  IN_PROGRESS: ['ASSIGNED', 'RESOLVED'],
  RESOLVED: ['REPORTED'],
  REJECTED_DUPLICATE: ['REPORTED'],
  REJECTED_FAKE: ['REPORTED'],
};

const REVIEW_OUTCOMES: readonly ReviewOutcomeStatus[] = ['VERIFIED', 'RESOLVED', 'REJECTED_DUPLICATE', 'REJECTED_FAKE'];

export const STATUS_ACTION_LABELS: Record<IncidentStatus, string> = {
  REPORTED: 'Reopen',
  VERIFIED: 'Mark verified',
  ASSIGNED: 'Mark team assigned',
  IN_PROGRESS: 'Mark in progress',
  RESOLVED: 'Resolve',
  REJECTED_DUPLICATE: 'Reject as duplicate',
  REJECTED_FAKE: 'Reject as false report',
};

export function officialStatusTargets(from: IncidentStatus): readonly IncidentStatus[] {
  return OFFICIAL_INCIDENT_TRANSITIONS[from];
}

export function reviewOutcomesFrom(from: IncidentStatus): ReviewOutcomeStatus[] {
  return REVIEW_OUTCOMES.filter((outcome) => OFFICIAL_INCIDENT_TRANSITIONS[from].includes(outcome));
}

export function isRejection(status: IncidentStatus): boolean {
  return status === 'REJECTED_DUPLICATE' || status === 'REJECTED_FAKE';
}

export function isOpenIncident(status: IncidentStatus): boolean {
  return OPEN_INCIDENT_STATUSES.includes(status);
}

export function isOpenMission(status: MissionStatus): boolean {
  return OPEN_MISSION_STATUSES.includes(status);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
