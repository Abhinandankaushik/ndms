import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import type {
  Alert,
  FacilityCapacityChangedEvent,
  FacilityInventoryChangedEvent,
  Incident,
  IncidentCreatedEvent,
  IncidentDetail,
  IncidentEnrichedEvent,
  IncidentQueueQuery,
  IncidentStatusChangedEvent,
  MapMarker,
  MapMarkerQuery,
  Mission,
  MissionAssignedEvent,
  MissionListQuery,
  MissionStatusChangedEvent,
  PendingReview,
  ResourceRow,
  Facility,
  Team,
  TeamLocationEvent,
  VerificationStatus,
  VolunteerApplication,
  VolunteerApplicationsQuery,
} from '@/lib/api/types';
import {
  alertsWithAlert,
  facilitiesWithCapacity,
  markersWithEnrichment,
  markersWithIncident,
  markersWithStatusChange,
  missionsWithMission,
  missionsWithStatusChange,
  queueWithCreatedIncident,
  queueWithEnrichment,
  queueWithIncident,
  queueWithStatusChange,
  resourcesWithCapacity,
  resourcesWithInventory,
  reviewsWithIncidentStatus,
  reviewsWithout,
  teamsWithLocation,
  type ListChange,
} from './list-updates';
import { refreshSchedulerFor } from './refresh-scheduler';

const RECONCILE_WINDOW_MS = 1_500;
const SUMMARY_WINDOW_MS = 2_000;
const REVIEWS_WINDOW_MS = 2_000;
const TEAMS_WINDOW_MS = 3_000;
const ALERTS_WINDOW_MS = 2_000;
const HEATMAP_WINDOW_MS = 10_000;

const QUEUE_PREFIX: QueryKey = ['incidents', 'queue'];
const MARKERS_PREFIX: QueryKey = ['incidents', 'markers'];
const MISSIONS_PREFIX: QueryKey = ['missions', 'list'];
const FACILITIES_BBOX_PREFIX: QueryKey = ['facilities', 'bbox'];
const HEATMAP_PREFIX: QueryKey = ['dashboard', 'heatmap'];
const VOLUNTEER_APPLICATIONS_PREFIX: QueryKey = ['volunteers', 'applications'];

// Roots whose data the district's realtime events keep current; a reconnect may have missed some of those events.
const LIVE_QUERY_ROOTS = new Set(['incidents', 'reviews', 'missions', 'teams', 'facilities', 'dashboard', 'alerts']);

interface PatchOptions {
  exact?: boolean;
}

function patchLists<TItem, TParams>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  update: (list: readonly TItem[], params: TParams) => ListChange<TItem> | null,
  { exact = false }: PatchOptions = {},
): void {
  const scheduler = refreshSchedulerFor(queryClient);
  for (const query of queryClient.getQueryCache().findAll({ queryKey, exact })) {
    const list = query.state.data as readonly TItem[] | undefined;
    const change = list ? update(list, query.queryKey[queryKey.length] as TParams) : null;
    if (change?.next) queryClient.setQueryData(query.queryKey, change.next);

    // A response still in flight was produced before this event and would overwrite the patch when it lands.
    const inFlight = query.state.fetchStatus === 'fetching' && (change !== null || !list);
    if (change?.stale || inFlight) {
      scheduler.refresh(query.queryKey, RECONCILE_WINDOW_MS, { exact: true });
    }
  }
}

function refreshIncidentAggregates(queryClient: QueryClient): void {
  const scheduler = refreshSchedulerFor(queryClient);
  scheduler.refresh(queryKeys.dashboard.summary, SUMMARY_WINDOW_MS, { exact: true });
  scheduler.refresh(HEATMAP_PREFIX, HEATMAP_WINDOW_MS);
}

function reconcile(queryClient: QueryClient, queryKey: QueryKey): void {
  refreshSchedulerFor(queryClient).refresh(queryKey, RECONCILE_WINDOW_MS, { exact: true });
}

// ---------- Incidents ----------

export function syncIncidentCreated(queryClient: QueryClient, event: IncidentCreatedEvent): void {
  patchLists<Incident, IncidentQueueQuery>(queryClient, QUEUE_PREFIX, (list, query) =>
    queueWithCreatedIncident(list, event, query),
  );
  patchLists<MapMarker, MapMarkerQuery>(queryClient, MARKERS_PREFIX, (list, query) =>
    markersWithIncident(list, event, query),
  );
  refreshIncidentAggregates(queryClient);
}

/** A full incident record from `incident:updated`, `mission:assigned` or one of this official's own writes. */
export function syncIncidentRecord(queryClient: QueryClient, incident: Incident): void {
  patchLists<Incident, IncidentQueueQuery>(queryClient, QUEUE_PREFIX, (list, query) =>
    queueWithIncident(list, incident, query),
  );
  patchLists<MapMarker, MapMarkerQuery>(queryClient, MARKERS_PREFIX, (list, query) =>
    markersWithIncident(list, incident, query),
  );
  queryClient.setQueryData<IncidentDetail>(queryKeys.incidents.detail(incident.id), (detail) =>
    detail ? { ...detail, ...incident } : detail,
  );
  reconcile(queryClient, queryKeys.incidents.detail(incident.id));
  refreshIncidentAggregates(queryClient);
}

export function syncIncidentStatusChanged(queryClient: QueryClient, event: IncidentStatusChangedEvent): void {
  patchLists<Incident, IncidentQueueQuery>(queryClient, QUEUE_PREFIX, (list, query) =>
    queueWithStatusChange(list, event, query),
  );
  patchLists<MapMarker, MapMarkerQuery>(queryClient, MARKERS_PREFIX, (list, query) =>
    markersWithStatusChange(list, event, query),
  );
  patchLists<PendingReview, never>(
    queryClient,
    queryKeys.reviews.pending,
    (list) => reviewsWithIncidentStatus(list, event),
    { exact: true },
  );
  queryClient.setQueryData<IncidentDetail>(queryKeys.incidents.detail(event.id), (detail) =>
    detail ? { ...detail, status: event.to, updatedAt: event.at } : detail,
  );
  reconcile(queryClient, queryKeys.incidents.detail(event.id));
  refreshIncidentAggregates(queryClient);
}

export function syncIncidentEnriched(queryClient: QueryClient, event: IncidentEnrichedEvent): void {
  patchLists<Incident, IncidentQueueQuery>(queryClient, QUEUE_PREFIX, (list, query) =>
    queueWithEnrichment(list, event, query),
  );
  patchLists<MapMarker, MapMarkerQuery>(queryClient, MARKERS_PREFIX, (list) => markersWithEnrichment(list, event));
  queryClient.setQueryData<IncidentDetail>(queryKeys.incidents.detail(event.id), (detail) =>
    detail ? { ...detail, priorityScore: event.priorityScore, severityLevel: event.severityLevel } : detail,
  );
  refreshSchedulerFor(queryClient).refresh(HEATMAP_PREFIX, HEATMAP_WINDOW_MS);
}

export function syncIncidentMediaAdded(queryClient: QueryClient, incidentId: string): void {
  reconcile(queryClient, queryKeys.incidents.media(incidentId));
}

// ---------- Reviews ----------

// A review:created payload has no incident summary, so the pending list is refetched rather than patched.
export function syncReviewCreated(queryClient: QueryClient): void {
  const scheduler = refreshSchedulerFor(queryClient);
  scheduler.refresh(queryKeys.reviews.pending, REVIEWS_WINDOW_MS, { exact: true });
  scheduler.refresh(queryKeys.dashboard.summary, SUMMARY_WINDOW_MS, { exact: true });
}

export function syncReviewResolved(queryClient: QueryClient, reviewId: string): void {
  patchLists<PendingReview, never>(queryClient, queryKeys.reviews.pending, (list) => reviewsWithout(list, reviewId), {
    exact: true,
  });
  refreshSchedulerFor(queryClient).refresh(queryKeys.dashboard.summary, SUMMARY_WINDOW_MS, { exact: true });
}

// ---------- Missions & teams ----------

function refreshTeams(queryClient: QueryClient): void {
  const scheduler = refreshSchedulerFor(queryClient);
  scheduler.refresh(queryKeys.teams.all, TEAMS_WINDOW_MS);
  scheduler.refresh(queryKeys.dashboard.summary, SUMMARY_WINDOW_MS, { exact: true });
}

export function syncMissionRecord(queryClient: QueryClient, mission: Mission): void {
  patchLists<Mission, MissionListQuery>(queryClient, MISSIONS_PREFIX, (list, query) =>
    missionsWithMission(list, mission, query),
  );
  reconcile(queryClient, queryKeys.missions.detail(mission.id));
  refreshTeams(queryClient);
}

export function syncMissionAssigned(queryClient: QueryClient, { mission, incident }: MissionAssignedEvent): void {
  syncMissionRecord(queryClient, mission);
  syncIncidentRecord(queryClient, incident);
}

export function syncMissionStatusChanged(queryClient: QueryClient, event: MissionStatusChangedEvent): void {
  patchLists<Mission, MissionListQuery>(queryClient, MISSIONS_PREFIX, (list, query) =>
    missionsWithStatusChange(list, event, query),
  );
  reconcile(queryClient, queryKeys.missions.detail(event.missionId));
  refreshTeams(queryClient);
}

export function syncTeamLocation(queryClient: QueryClient, event: TeamLocationEvent): void {
  patchLists<Team, never>(queryClient, queryKeys.teams.all, (list) => teamsWithLocation(list, event), { exact: true });
}

// ---------- Facilities ----------

export function syncFacilityCapacity(queryClient: QueryClient, event: FacilityCapacityChangedEvent): void {
  patchLists<ResourceRow, never>(
    queryClient,
    queryKeys.dashboard.resources,
    (list) => resourcesWithCapacity(list, event),
    { exact: true },
  );
  patchLists<Facility, never>(queryClient, FACILITIES_BBOX_PREFIX, (list) => facilitiesWithCapacity(list, event));
  reconcile(queryClient, queryKeys.facilities.detail(event.facilityId));
  refreshSchedulerFor(queryClient).refresh(queryKeys.dashboard.summary, SUMMARY_WINDOW_MS, { exact: true });
}

export function syncFacilityInventory(queryClient: QueryClient, event: FacilityInventoryChangedEvent): void {
  const receivedAt = new Date().toISOString();
  patchLists<ResourceRow, never>(
    queryClient,
    queryKeys.dashboard.resources,
    (list) => resourcesWithInventory(list, event, receivedAt),
    { exact: true },
  );
  reconcile(queryClient, queryKeys.facilities.detail(event.facilityId));
}

// ---------- Alerts & volunteers ----------

// Broadcasts travel by role room and omit the audience and district, so the history is refetched rather than patched.
export function syncAlertsChanged(queryClient: QueryClient): void {
  refreshSchedulerFor(queryClient).refresh(queryKeys.alerts.history, ALERTS_WINDOW_MS, { exact: true });
}

export function rememberAlert(queryClient: QueryClient, alert: Alert): void {
  queryClient.setQueryData<Alert[]>(queryKeys.alerts.history, (history) =>
    history ? alertsWithAlert(history, alert) : history,
  );
}

export function rememberVolunteerDecision(
  queryClient: QueryClient,
  userId: string,
  decision: VerificationStatus,
): void {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: VOLUNTEER_APPLICATIONS_PREFIX })) {
    const params = query.queryKey[VOLUNTEER_APPLICATIONS_PREFIX.length] as VolunteerApplicationsQuery | undefined;
    if (params?.status === decision) {
      void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true, refetchType: 'none' });
      continue;
    }
    queryClient.setQueryData<VolunteerApplication[]>(query.queryKey, (list) =>
      list?.filter((application) => application.userId !== userId),
    );
  }
  refreshSchedulerFor(queryClient).refresh(queryKeys.dashboard.summary, SUMMARY_WINDOW_MS, { exact: true });
}

export function resyncLiveData(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === 'string' && LIVE_QUERY_ROOTS.has(query.queryKey[0]),
  });
}
