import type {
  AuditQuery,
  Bbox,
  FacilityKind,
  HeatmapQuery,
  IncidentQueueQuery,
  IncidentSearchQuery,
  MapMarkerQuery,
  MissionListQuery,
  NearbyFacilitiesQuery,
  NearestTeamsQuery,
  VolunteerApplicationsQuery,
  VolunteerTaskListQuery,
} from './types';

// Shared so a socket event handler can invalidate or patch exactly the caches that views read.
export const queryKeys = {
  me: ['auth', 'me'] as const,
  districts: {
    mine: ['districts', 'mine'] as const,
  },
  incidents: {
    all: ['incidents'] as const,
    markers: (query: MapMarkerQuery) => ['incidents', 'markers', query] as const,
    queue: (query: IncidentQueueQuery) => ['incidents', 'queue', query] as const,
    search: (query: IncidentSearchQuery) => ['incidents', 'search', query] as const,
    mine: ['incidents', 'mine'] as const,
    detail: (id: string) => ['incidents', 'detail', id] as const,
    media: (id: string) => ['incidents', 'media', id] as const,
  },
  reviews: {
    pending: ['reviews', 'pending'] as const,
  },
  missions: {
    all: ['missions'] as const,
    list: (query: MissionListQuery) => ['missions', 'list', query] as const,
    mine: ['missions', 'mine'] as const,
    detail: (id: string) => ['missions', 'detail', id] as const,
  },
  teams: {
    all: ['teams'] as const,
    nearest: (query: NearestTeamsQuery) => ['teams', 'nearest', query] as const,
  },
  facilities: {
    all: ['facilities'] as const,
    nearby: (query: NearbyFacilitiesQuery) => ['facilities', 'nearby', query] as const,
    inBbox: (bbox: Bbox, kind?: FacilityKind) => ['facilities', 'bbox', bbox, kind ?? null] as const,
    mine: ['facilities', 'mine'] as const,
    detail: (id: string) => ['facilities', 'detail', id] as const,
  },
  volunteers: {
    all: ['volunteers'] as const,
    me: ['volunteers', 'me'] as const,
    applications: (query: VolunteerApplicationsQuery = {}) => ['volunteers', 'applications', query] as const,
  },
  volunteerTasks: {
    all: ['volunteer-tasks'] as const,
    list: (query: VolunteerTaskListQuery = {}) => ['volunteer-tasks', 'list', query] as const,
    nearby: ['volunteer-tasks', 'nearby'] as const,
    mine: ['volunteer-tasks', 'mine'] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    history: ['alerts', 'history'] as const,
    active: (lat?: number, lon?: number) => ['alerts', 'active', lat ?? null, lon ?? null] as const,
  },
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
    heatmap: (query: HeatmapQuery) => ['dashboard', 'heatmap', query] as const,
    resources: ['dashboard', 'resources'] as const,
  },
  audit: {
    list: (query: AuditQuery = {}) => ['audit', query] as const,
  },
};
