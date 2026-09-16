import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import type {
  Incident,
  IncidentStatusChangedEvent,
  Mission,
  MissionDetail,
  MissionStatus,
  MissionStatusChangedEvent,
  MissionWithIncident,
} from '@/lib/api/types';

type CachedMission = MissionWithIncident | MissionDetail;
type MissionPatch = <T extends CachedMission>(cached: T) => T;

const allMissionDetails = { queryKey: [...queryKeys.missions.all, 'detail'] };

const notOlder = (candidate: string, current: string) => Date.parse(candidate) >= Date.parse(current);

// Socket events and HTTP responses overtake each other on a flaky connection, so an older copy of a mission or
// incident never replaces a newer one.
export function storeConfirmedMission(queryClient: QueryClient, mission: Mission): void {
  patchMission(queryClient, mission.id, (cached) =>
    notOlder(mission.updatedAt, cached.updatedAt) ? { ...cached, ...mission } : cached,
  );
}

/** Returns whether the event told this phone something it did not already know. */
export function storeMissionStatusEvent(queryClient: QueryClient, event: MissionStatusChangedEvent): boolean {
  const knownStatus = cachedMissionStatus(queryClient, event.missionId);
  patchMission(queryClient, event.missionId, (cached) =>
    notOlder(event.at, cached.updatedAt) ? { ...cached, status: event.to, updatedAt: event.at } : cached,
  );
  return knownStatus !== event.to;
}

/** Returns whether the mission was new to this phone. */
export function storeAssignedMission(queryClient: QueryClient, assigned: MissionWithIncident): boolean {
  const missions = queryClient.getQueryData<MissionWithIncident[]>(queryKeys.missions.mine);
  const isNew = !missions?.some((mission) => mission.id === assigned.id);
  if (missions && isNew) {
    queryClient.setQueryData<MissionWithIncident[]>(queryKeys.missions.mine, [assigned, ...missions]);
  }
  return isNew;
}

export function storeIncident(queryClient: QueryClient, incident: Incident): void {
  patchIncidentMissions(queryClient, (cached) =>
    cached.incident.id === incident.id && notOlder(incident.updatedAt, cached.incident.updatedAt)
      ? { ...cached, incident }
      : cached,
  );
}

export function storeIncidentStatusEvent(queryClient: QueryClient, event: IncidentStatusChangedEvent): void {
  patchIncidentMissions(queryClient, (cached) =>
    cached.incident.id === event.id && notOlder(event.at, cached.incident.updatedAt)
      ? { ...cached, incident: { ...cached.incident, status: event.to } }
      : cached,
  );
}

export async function refreshMissionQueries(queryClient: QueryClient, missionId?: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.missions.mine }),
    missionId ? queryClient.invalidateQueries({ queryKey: queryKeys.missions.detail(missionId) }) : null,
  ]);
}

export interface MissionView extends MissionDetail {
  /** False while only the list's copy is available, which never carries the reporter's contact. */
  contactLoaded: boolean;
}

// The detail and the list are refreshed on different schedules (the list also polls while the socket is down), so
// each part of the mission comes from whichever copy is newer.
export function freshestMissionView(
  detail: MissionDetail | undefined,
  summary: MissionWithIncident | undefined,
): MissionView | undefined {
  if (!detail) return summary && { ...summary, reporter: null, contactLoaded: false };
  if (!summary) return { ...detail, contactLoaded: true };
  const mission = notOlder(detail.updatedAt, summary.updatedAt) ? detail : summary;
  const incident = notOlder(detail.incident.updatedAt, summary.incident.updatedAt) ? detail.incident : summary.incident;
  return { ...mission, incident, reporter: detail.reporter, contactLoaded: true };
}

export function cachedMissionSummary(queryClient: QueryClient, missionId: string): MissionWithIncident | undefined {
  return queryClient.getQueryData<MissionWithIncident[]>(queryKeys.missions.mine)?.find((mission) => mission.id === missionId);
}

function cachedMissionStatus(queryClient: QueryClient, missionId: string): MissionStatus | undefined {
  return (
    queryClient.getQueryData<MissionDetail>(queryKeys.missions.detail(missionId))?.status ??
    cachedMissionSummary(queryClient, missionId)?.status
  );
}

function patchMission(queryClient: QueryClient, missionId: string, patch: MissionPatch): void {
  queryClient.setQueryData<MissionWithIncident[]>(queryKeys.missions.mine, (missions) =>
    missions?.map((mission) => (mission.id === missionId ? patch(mission) : mission)),
  );
  queryClient.setQueryData<MissionDetail>(queryKeys.missions.detail(missionId), (detail) => detail && patch(detail));
}

function patchIncidentMissions(queryClient: QueryClient, patch: MissionPatch): void {
  queryClient.setQueryData<MissionWithIncident[]>(queryKeys.missions.mine, (missions) => missions?.map(patch));
  queryClient.setQueriesData<MissionDetail>(allMissionDetails, (detail) => detail && patch(detail));
}
