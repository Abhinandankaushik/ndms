import {
  OPEN_MISSION_STATUSES,
  type MissionStatus,
  type MissionWithIncident,
} from '@/lib/api/types';

export type TeamStepStatus = Extract<MissionStatus, 'ACCEPTED' | 'REJECTED' | 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED'>;

export const PROGRESS_STEPS: readonly MissionStatus[] = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'];

const LIVE_LOCATION_STATUSES: readonly MissionStatus[] = ['ACCEPTED', 'EN_ROUTE', 'ON_SITE'];

// The team's half of the API's transition table; cancelling a mission stays with the control room.
const TEAM_STEPS: Record<MissionStatus, readonly TeamStepStatus[]> = {
  ASSIGNED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['EN_ROUTE'],
  EN_ROUTE: ['ON_SITE'],
  ON_SITE: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export const isOpenMission = (status: MissionStatus): boolean => OPEN_MISSION_STATUSES.includes(status);

export const sharesLiveLocation = (status: MissionStatus): boolean => LIVE_LOCATION_STATUSES.includes(status);

export const teamStepsFrom = (status: MissionStatus): readonly TeamStepStatus[] => TEAM_STEPS[status];

export interface StepCopy {
  action: string;
  question: string;
  consequence: string;
  confirm: string;
  pending: string;
  confirmed: string;
}

export const STEP_COPY: Record<TeamStepStatus, StepCopy> = {
  ACCEPTED: {
    action: 'Accept mission',
    question: 'Accept this mission?',
    consequence: 'The control room sees your team as committed, and your live location is shared until the mission ends.',
    confirm: 'Yes, accept',
    pending: 'Accepting…',
    confirmed: 'Mission accepted',
  },
  REJECTED: {
    action: 'Cannot take it',
    question: 'Turn down this mission?',
    consequence: 'Tell the control room why, so they can send another team.',
    confirm: 'Turn down mission',
    pending: 'Turning down…',
    confirmed: 'Mission turned down',
  },
  EN_ROUTE: {
    action: 'Leaving now: en route',
    question: 'Leaving for the incident now?',
    consequence: 'The control room and the person who asked for help see that your team is on the way.',
    confirm: 'Yes, we are en route',
    pending: 'Marking en route…',
    confirmed: 'Marked en route',
  },
  ON_SITE: {
    action: 'Arrived on site',
    question: 'Arrived at the incident?',
    consequence: 'The control room sees your team on site.',
    confirm: 'Yes, we are on site',
    pending: 'Marking on site…',
    confirmed: 'Marked on site',
  },
  COMPLETED: {
    action: 'Complete rescue',
    question: 'Record the rescue outcome',
    consequence: 'Completing closes the mission, resolves the incident and makes your team available again.',
    confirm: 'Complete mission',
    pending: 'Completing…',
    confirmed: 'Mission completed',
  },
};

export type MissionGroup = 'current' | 'awaiting' | 'closed';

export function missionGroupOf(status: MissionStatus): MissionGroup {
  if (sharesLiveLocation(status)) return 'current';
  return status === 'ASSIGNED' ? 'awaiting' : 'closed';
}

// The mission the team is working comes first even when a waiting assignment outranks it: a busy team cannot
// accept another mission until this one ends.
export function groupMissions(missions: readonly MissionWithIncident[]): Record<MissionGroup, MissionWithIncident[]> {
  const groups: Record<MissionGroup, MissionWithIncident[]> = { current: [], awaiting: [], closed: [] };
  for (const mission of missions) groups[missionGroupOf(mission.status)].push(mission);
  groups.current.sort(byIncidentPriority);
  groups.awaiting.sort(byIncidentPriority);
  groups.closed.sort(byMostRecentUpdate);
  return groups;
}

// Same order as the incident queue: highest priority first, unscored after scored, then the longest waiting.
function byIncidentPriority(a: MissionWithIncident, b: MissionWithIncident): number {
  const priorityA = a.incident.priorityScore;
  const priorityB = b.incident.priorityScore;
  if (priorityA !== priorityB) {
    if (priorityA === null) return 1;
    if (priorityB === null) return -1;
    return priorityB - priorityA;
  }
  return Date.parse(a.incident.reportedAt) - Date.parse(b.incident.reportedAt);
}

function byMostRecentUpdate(a: MissionWithIncident, b: MissionWithIncident): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}
