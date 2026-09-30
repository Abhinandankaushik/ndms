import { queryOptions } from '@tanstack/react-query';
import { listAlerts } from '@/lib/api/endpoints/alerts';
import { getDashboardSummary, getIncidentHeatmap, getResourceOverview } from '@/lib/api/endpoints/dashboard';
import { getMyDistrict } from '@/lib/api/endpoints/districts';
import { listFacilities } from '@/lib/api/endpoints/facilities';
import { getIncident, getIncidentQueue, listIncidentMarkers, searchIncidents } from '@/lib/api/endpoints/incidents';
import { listIncidentMedia } from '@/lib/api/endpoints/media';
import { listMissions } from '@/lib/api/endpoints/missions';
import { listPendingReviews } from '@/lib/api/endpoints/reviews';
import { findNearestTeams, listTeams } from '@/lib/api/endpoints/teams';
import { listVolunteerApplications } from '@/lib/api/endpoints/volunteers';
import { queryKeys } from '@/lib/api/query-keys';
import type {
  Bbox,
  HeatmapQuery,
  IncidentQueueQuery,
  IncidentSearchQuery,
  MapMarkerQuery,
  MissionListQuery,
  NearestTeamsQuery,
  VerificationStatus,
} from '@/lib/api/types';

// One factory per cache entry, so every view that shares a key also shares the request behind it; a key read with
// two different fetchers would flip between their answers.

export const PENDING_REVIEWS_LIMIT = 200;
const MEDIA_URL_SAFETY_MARGIN_S = 60;

export const districtQuery = () =>
  queryOptions({
    queryKey: queryKeys.districts.mine,
    queryFn: ({ signal }) => getMyDistrict({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });

export const summaryQuery = () =>
  queryOptions({
    queryKey: queryKeys.dashboard.summary,
    queryFn: ({ signal }) => getDashboardSummary({ signal }),
  });

export const heatmapQuery = (query: HeatmapQuery) =>
  queryOptions({
    queryKey: queryKeys.dashboard.heatmap(query),
    queryFn: ({ signal }) => getIncidentHeatmap(query, { signal }),
  });

export const resourcesQuery = () =>
  queryOptions({
    queryKey: queryKeys.dashboard.resources,
    queryFn: ({ signal }) => getResourceOverview({ signal }),
  });

export const incidentQueueQuery = (query: IncidentQueueQuery) =>
  queryOptions({
    queryKey: queryKeys.incidents.queue(query),
    queryFn: ({ signal }) => getIncidentQueue(query, { signal }),
  });

// Unlike the queue, results are not patched by socket events: a search is a question asked at
// a moment, and silently rewriting the answer underneath the officer would be worse than stale.
export const incidentSearchQuery = (query: IncidentSearchQuery) =>
  queryOptions({
    queryKey: queryKeys.incidents.search(query),
    queryFn: ({ signal }) => searchIncidents(query, { signal }),
    staleTime: 30_000,
  });

export const incidentMarkersQuery = (query: MapMarkerQuery) =>
  queryOptions({
    queryKey: queryKeys.incidents.markers(query),
    queryFn: ({ signal }) => listIncidentMarkers(query, { signal }),
  });

export const incidentDetailQuery = (incidentId: string) =>
  queryOptions({
    queryKey: queryKeys.incidents.detail(incidentId),
    queryFn: ({ signal }) => getIncident(incidentId, { signal }),
  });

// Photo links are presigned and expire; treat them as stale shortly before that so a reopened drawer gets new ones.
export const incidentMediaQuery = (incidentId: string) =>
  queryOptions({
    queryKey: queryKeys.incidents.media(incidentId),
    queryFn: ({ signal }) => listIncidentMedia(incidentId, { signal }),
    staleTime: (query) => {
      const ttlSeconds = query.state.data?.[0]?.expiresInSeconds;
      return ttlSeconds === undefined ? 0 : Math.max(0, ttlSeconds - MEDIA_URL_SAFETY_MARGIN_S) * 1_000;
    },
  });

export const pendingReviewsQuery = () =>
  queryOptions({
    queryKey: queryKeys.reviews.pending,
    queryFn: ({ signal }) => listPendingReviews({ limit: PENDING_REVIEWS_LIMIT }, { signal }),
  });

export const teamsQuery = () =>
  queryOptions({
    queryKey: queryKeys.teams.all,
    queryFn: ({ signal }) => listTeams({ signal }),
  });

export const nearestTeamsQuery = (query: NearestTeamsQuery) =>
  queryOptions({
    queryKey: queryKeys.teams.nearest(query),
    queryFn: ({ signal }) => findNearestTeams(query, { signal }),
    staleTime: 0,
  });

export const missionsQuery = (query: MissionListQuery) =>
  queryOptions({
    queryKey: queryKeys.missions.list(query),
    queryFn: ({ signal }) => listMissions(query, { signal }),
  });

export const facilitiesInBboxQuery = (bbox: Bbox) =>
  queryOptions({
    queryKey: queryKeys.facilities.inBbox(bbox),
    queryFn: ({ signal }) => listFacilities({ bbox }, { signal }),
  });

export const alertHistoryQuery = () =>
  queryOptions({
    queryKey: queryKeys.alerts.history,
    queryFn: ({ signal }) => listAlerts({ signal }),
  });

// Every listing is written to the audit log with the documents it exposed, so it is fetched on purpose only: no
// refetch when the window regains focus.
export const volunteerApplicationsQuery = (status: VerificationStatus) =>
  queryOptions({
    queryKey: queryKeys.volunteers.applications({ status }),
    queryFn: ({ signal }) => listVolunteerApplications({ status }, { signal }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
