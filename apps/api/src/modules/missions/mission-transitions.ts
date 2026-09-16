import { ConflictException } from '@nestjs/common';
import type { MissionStatus } from '../../common/domain/enums';
import type { MissionDrivenStatus } from '../incidents/incidents.service';

export type MissionActor = 'TEAM' | 'OFFICIAL';
export type StepDecision = 'APPLY' | 'REPLAY';
export type TeamEffect = 'OCCUPY' | 'RELEASE';

export const OPEN_MISSION_STATUSES: readonly MissionStatus[] = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'];
export const ACCEPTED_MISSION_STATUSES: readonly MissionStatus[] = ['ACCEPTED', 'EN_ROUTE', 'ON_SITE'];

export const isOpenMission = (status: MissionStatus) => OPEN_MISSION_STATUSES.includes(status);

const NEXT_STEPS: Record<MissionStatus, readonly MissionStatus[]> = {
  ASSIGNED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['ON_SITE', 'CANCELLED'],
  ON_SITE: ['COMPLETED', 'CANCELLED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

// The team reports progress from the ground; withdrawing a dispatch stays an official's decision.
const STEPS_BY_ACTOR: Record<MissionActor, readonly MissionStatus[]> = {
  TEAM: ['ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'],
  OFFICIAL: ['CANCELLED'],
};

const ACTOR_LABELS: Record<MissionActor, string> = { TEAM: 'A rescue team', OFFICIAL: 'An official' };

const invalidStep = (message: string) => new ConflictException({ code: 'INVALID_MISSION_TRANSITION', message });

// Repeating the step a mission is already at is a retry from a flaky connection, so it is
// answered as a no-op instead of an error.
export function decideStep(from: MissionStatus, to: MissionStatus, actor: MissionActor): StepDecision {
  if (!STEPS_BY_ACTOR[actor].includes(to)) {
    throw invalidStep(`${ACTOR_LABELS[actor]} cannot move a mission to ${to}`);
  }
  if (from === to) return 'REPLAY';
  if (!NEXT_STEPS[from].includes(to)) {
    throw invalidStep(`A mission cannot move from ${from} to ${to}`);
  }
  return 'APPLY';
}

export const TEAM_EFFECTS: Partial<Record<MissionStatus, TeamEffect>> = {
  ACCEPTED: 'OCCUPY',
  COMPLETED: 'RELEASE',
  REJECTED: 'RELEASE',
  CANCELLED: 'RELEASE',
};

export interface IncidentEffect {
  to: MissionDrivenStatus;
  onlyWithoutOpenMissions: boolean;
  note: (teamName: string) => string;
}

// A completed rescue resolves the incident even while backup missions are still open; those
// are left for an official to cancel, and cancelling them cannot reopen a resolved incident.
export const INCIDENT_EFFECTS: Partial<Record<MissionStatus, IncidentEffect>> = {
  EN_ROUTE: { to: 'IN_PROGRESS', onlyWithoutOpenMissions: false, note: (team) => `Team ${team} is en route` },
  COMPLETED: { to: 'RESOLVED', onlyWithoutOpenMissions: false, note: (team) => `Team ${team} completed the rescue` },
  REJECTED: { to: 'VERIFIED', onlyWithoutOpenMissions: true, note: (team) => `Team ${team} declined the mission` },
  CANCELLED: { to: 'VERIFIED', onlyWithoutOpenMissions: true, note: (team) => `Mission for team ${team} was cancelled` },
};
