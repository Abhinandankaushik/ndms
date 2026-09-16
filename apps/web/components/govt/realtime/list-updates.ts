import {
  INVENTORY_ITEMS,
  OPEN_INCIDENT_STATUSES,
  type Alert,
  type DisasterType,
  type Facility,
  type FacilityCapacityChangedEvent,
  type FacilityInventoryChangedEvent,
  type Incident,
  type IncidentCreatedEvent,
  type IncidentEnrichedEvent,
  type IncidentQueueQuery,
  type IncidentStatus,
  type IncidentStatusChangedEvent,
  type MapMarker,
  type MapMarkerQuery,
  type Mission,
  type MissionListQuery,
  type MissionStatus,
  type MissionStatusChangedEvent,
  type PendingReview,
  type ResourceRow,
  type Team,
  type TeamLocationEvent,
} from '@/lib/api/types';
import { isInsideBbox } from '../lib/geo';

// Pure list edits that apply one realtime event to one cached response. `next` is the list to store; `stale` means
// the server may now hold rows the event cannot supply (a row entering a filter, a page shortened from the full
// limit), so the cache also needs a refetch.
export interface ListChange<T> {
  next: T[] | null;
  stale: boolean;
}

// Server-side defaults for requests that leave `limit` out.
const QUEUE_DEFAULT_LIMIT = 50;
const MARKER_DEFAULT_LIMIT = 2_000;
const MISSION_DEFAULT_LIMIT = 200;

const staleOnly = <T>(): ListChange<T> => ({ next: null, stale: true });

function insertSorted<T>(list: readonly T[], item: T, compare: (a: T, b: T) => number): T[] {
  const index = list.findIndex((existing) => compare(item, existing) < 0);
  const next = [...list];
  next.splice(index === -1 ? next.length : index, 0, item);
  return next;
}

function withoutIndex<T>(list: readonly T[], index: number): T[] {
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  const next = [...list];
  next[index] = item;
  return next;
}

function statusesOf(statuses: readonly IncidentStatus[] | undefined): readonly IncidentStatus[] {
  return statuses && statuses.length > 0 ? statuses : OPEN_INCIDENT_STATUSES;
}

function allowsType(types: readonly DisasterType[] | undefined, type: DisasterType): boolean {
  return !types || types.length === 0 || types.includes(type);
}

// ---------- Priority queue ----------

export function matchesQueue(incident: Pick<Incident, 'status' | 'type' | 'isSos'>, query: IncidentQueueQuery): boolean {
  return (
    statusesOf(query.status).includes(incident.status) &&
    allowsType(query.type, incident.type) &&
    (!query.sosOnly || incident.isSos)
  );
}

// GET /incidents/queue order: priorityScore DESC NULLS LAST, then the oldest report first. An unscored report sits
// after the scored ones but stays visible.
export function compareQueueOrder(
  a: Pick<Incident, 'priorityScore' | 'reportedAt'>,
  b: Pick<Incident, 'priorityScore' | 'reportedAt'>,
): number {
  if (a.priorityScore !== b.priorityScore) {
    if (a.priorityScore === null) return 1;
    if (b.priorityScore === null) return -1;
    return b.priorityScore - a.priorityScore;
  }
  return Date.parse(a.reportedAt) - Date.parse(b.reportedAt);
}

// The event carries neither the description and address nor the server timestamps; the refetch that follows every
// insert replaces this placeholder row.
export function incidentFromCreatedEvent(event: IncidentCreatedEvent): Incident {
  return {
    id: event.id,
    clientUuid: '',
    districtId: event.districtId,
    reporterId: event.reporterId,
    type: event.type,
    status: event.status,
    isSos: event.isSos,
    lat: event.lat,
    lon: event.lon,
    locationSource: event.locationSource,
    accuracyM: event.accuracyM,
    addressText: null,
    description: null,
    peopleAffected: event.peopleAffected,
    hasElderly: event.hasElderly,
    hasChildren: event.hasChildren,
    hasInjured: event.hasInjured,
    priorityScore: event.priorityScore,
    severityLevel: null,
    duplicateOf: null,
    reportedAt: event.reportedAt,
    createdAt: event.reportedAt,
    updatedAt: event.reportedAt,
    resolvedAt: null,
  };
}

export function queueWithIncident(
  list: readonly Incident[],
  incident: Incident,
  query: IncidentQueueQuery,
): ListChange<Incident> | null {
  const limit = query.limit ?? QUEUE_DEFAULT_LIMIT;
  const index = list.findIndex((entry) => entry.id === incident.id);
  const belongs = matchesQueue(incident, query);

  if (index === -1) {
    if (!belongs) return null;
    if ((query.offset ?? 0) > 0) return staleOnly();
    const next = insertSorted(list, incident, compareQueueOrder).slice(0, limit);
    return next.some((entry) => entry.id === incident.id) ? { next, stale: false } : null;
  }

  const rest = withoutIndex(list, index);
  if (!belongs) return { next: rest, stale: list.length >= limit };
  return { next: insertSorted(rest, incident, compareQueueOrder), stale: false };
}

export function queueWithCreatedIncident(
  list: readonly Incident[],
  event: IncidentCreatedEvent,
  query: IncidentQueueQuery,
): ListChange<Incident> | null {
  if (list.some((entry) => entry.id === event.id)) return null;
  const change = queueWithIncident(list, incidentFromCreatedEvent(event), query);
  return change && { next: change.next, stale: true };
}

export function queueWithStatusChange(
  list: readonly Incident[],
  event: IncidentStatusChangedEvent,
  query: IncidentQueueQuery,
): ListChange<Incident> | null {
  const index = list.findIndex((entry) => entry.id === event.id);
  const current = list[index];
  if (!current) {
    const statuses = statusesOf(query.status);
    return statuses.includes(event.to) && !statuses.includes(event.from) ? staleOnly() : null;
  }
  if (current.status === event.to) return null;
  return queueWithIncident(list, { ...current, status: event.to, updatedAt: event.at }, query);
}

export function queueWithEnrichment(
  list: readonly Incident[],
  event: IncidentEnrichedEvent,
  query: IncidentQueueQuery,
): ListChange<Incident> | null {
  const index = list.findIndex((entry) => entry.id === event.id);
  const current = list[index];
  if (!current) {
    const limit = query.limit ?? QUEUE_DEFAULT_LIMIT;
    const last = list.at(-1);
    if (list.length < limit || !last || event.priorityScore === null) return null;
    const mayOutrankLast = last.priorityScore === null || event.priorityScore >= last.priorityScore;
    return mayOutrankLast ? staleOnly() : null;
  }
  if (current.priorityScore === event.priorityScore && current.severityLevel === event.severityLevel) return null;
  return queueWithIncident(
    list,
    { ...current, priorityScore: event.priorityScore, severityLevel: event.severityLevel },
    query,
  );
}

// ---------- Map markers ----------

export type MarkerSource = Pick<
  Incident,
  'id' | 'type' | 'status' | 'isSos' | 'lat' | 'lon' | 'accuracyM' | 'priorityScore' | 'peopleAffected' | 'reportedAt'
>;

function markerFrom(source: MarkerSource, query: MapMarkerQuery): MapMarker | null {
  if (source.lat === null || source.lon === null) return null;
  if (!isInsideBbox({ lat: source.lat, lon: source.lon }, query.bbox)) return null;
  if (!statusesOf(query.status).includes(source.status) || !allowsType(query.type, source.type)) return null;
  return {
    id: source.id,
    type: source.type,
    status: source.status,
    isSos: source.isSos,
    lat: source.lat,
    lon: source.lon,
    accuracyM: source.accuracyM,
    priorityScore: source.priorityScore,
    peopleAffected: source.peopleAffected,
    reportedAt: source.reportedAt,
  };
}

function sameMarker(a: MapMarker, b: MapMarker): boolean {
  return (
    a.type === b.type &&
    a.status === b.status &&
    a.isSos === b.isSos &&
    a.lat === b.lat &&
    a.lon === b.lon &&
    a.accuracyM === b.accuracyM &&
    a.priorityScore === b.priorityScore &&
    a.peopleAffected === b.peopleAffected
  );
}

// Unchanged markers keep their object identity: IncidentMarker is memoised on it, and a new object would re-render
// every marker on a map of thousands.
export function markersWithIncident(
  list: readonly MapMarker[],
  source: MarkerSource,
  query: MapMarkerQuery,
): ListChange<MapMarker> | null {
  const index = list.findIndex((marker) => marker.id === source.id);
  const current = list[index];
  const marker = markerFrom(source, query);

  if (!current) {
    if (!marker || list.length >= (query.limit ?? MARKER_DEFAULT_LIMIT)) return null;
    return { next: [...list, marker], stale: false };
  }
  if (!marker) return { next: withoutIndex(list, index), stale: false };
  return sameMarker(current, marker) ? null : { next: replaceAt(list, index, marker), stale: false };
}

export function markersWithStatusChange(
  list: readonly MapMarker[],
  event: IncidentStatusChangedEvent,
  query: MapMarkerQuery,
): ListChange<MapMarker> | null {
  const statuses = statusesOf(query.status);
  const index = list.findIndex((marker) => marker.id === event.id);
  const current = list[index];
  if (!current) return statuses.includes(event.to) && !statuses.includes(event.from) ? staleOnly() : null;
  if (current.status === event.to) return null;
  if (!statuses.includes(event.to)) return { next: withoutIndex(list, index), stale: false };
  return { next: replaceAt(list, index, { ...current, status: event.to }), stale: false };
}

export function markersWithEnrichment(
  list: readonly MapMarker[],
  event: IncidentEnrichedEvent,
): ListChange<MapMarker> | null {
  const index = list.findIndex((marker) => marker.id === event.id);
  const current = list[index];
  if (!current || current.priorityScore === event.priorityScore) return null;
  return { next: replaceAt(list, index, { ...current, priorityScore: event.priorityScore }), stale: false };
}

// ---------- Missions ----------

function missionStatusesOf(status: MissionListQuery['status']): readonly MissionStatus[] | null {
  if (status === undefined) return null;
  if (typeof status === 'string') return [status];
  return status.length > 0 ? status : null;
}

export function matchesMissionList(mission: Pick<Mission, 'status' | 'incidentId'>, query: MissionListQuery): boolean {
  const statuses = missionStatusesOf(query.status);
  return (!statuses || statuses.includes(mission.status)) && (!query.incidentId || query.incidentId === mission.incidentId);
}

const compareMissionOrder = (a: Mission, b: Mission) => Date.parse(b.assignedAt) - Date.parse(a.assignedAt);

export function missionsWithMission(
  list: readonly Mission[],
  mission: Mission,
  query: MissionListQuery,
): ListChange<Mission> | null {
  const limit = query.limit ?? MISSION_DEFAULT_LIMIT;
  const index = list.findIndex((entry) => entry.id === mission.id);
  const belongs = matchesMissionList(mission, query);

  if (index === -1) {
    if (!belongs) return null;
    const next = insertSorted(list, mission, compareMissionOrder).slice(0, limit);
    return next.some((entry) => entry.id === mission.id) ? { next, stale: false } : null;
  }
  const rest = withoutIndex(list, index);
  if (!belongs) return { next: rest, stale: list.length >= limit };
  return { next: insertSorted(rest, mission, compareMissionOrder), stale: false };
}

const OUTCOME_STATUSES: readonly MissionStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

export function missionsWithStatusChange(
  list: readonly Mission[],
  event: MissionStatusChangedEvent,
  query: MissionListQuery,
): ListChange<Mission> | null {
  const current = list.find((entry) => entry.id === event.missionId);
  if (!current) {
    if (query.incidentId && query.incidentId !== event.incidentId) return null;
    const statuses = missionStatusesOf(query.status);
    const allows = (status: MissionStatus) => !statuses || statuses.includes(status);
    return allows(event.to) && !allows(event.from) ? staleOnly() : null;
  }
  if (current.status === event.to) return null;

  const updated: Mission = {
    ...current,
    status: event.to,
    updatedAt: event.at,
    acceptedAt: event.to === 'ACCEPTED' ? event.at : current.acceptedAt,
    reachedAt: event.to === 'ON_SITE' ? event.at : current.reachedAt,
    completedAt: event.to === 'COMPLETED' ? event.at : current.completedAt,
  };
  const change = missionsWithMission(list, updated, query);
  // Rescue figures, rejection reasons and outcome notes only arrive with the full record.
  return change && { next: change.next, stale: change.stale || OUTCOME_STATUSES.includes(event.to) };
}

// ---------- Teams ----------

export function teamsWithLocation(list: readonly Team[], event: TeamLocationEvent): ListChange<Team> | null {
  const index = list.findIndex((team) => team.id === event.teamId);
  const current = list[index];
  if (!current) return staleOnly();
  if (current.locationUpdatedAt && Date.parse(current.locationUpdatedAt) >= Date.parse(event.recordedAt)) return null;
  return {
    next: replaceAt(list, index, { ...current, lat: event.lat, lon: event.lon, locationUpdatedAt: event.recordedAt }),
    stale: false,
  };
}

// ---------- Facilities & resources ----------

export function facilitiesWithCapacity(
  list: readonly Facility[],
  event: FacilityCapacityChangedEvent,
): ListChange<Facility> | null {
  const index = list.findIndex((facility) => facility.id === event.facilityId);
  const current = list[index];
  if (!current || (current.occupancy === event.occupancy && current.capacity === event.capacity)) return null;
  return {
    next: replaceAt(list, index, {
      ...current,
      occupancy: event.occupancy,
      capacity: event.capacity,
      utilisation: event.utilisation,
      freeCapacity: event.capacity - event.occupancy,
    }),
    stale: false,
  };
}

const compareResources = (a: ResourceRow, b: ResourceRow) => b.utilisation - a.utilisation || a.name.localeCompare(b.name);

export function resourcesWithCapacity(
  list: readonly ResourceRow[],
  event: FacilityCapacityChangedEvent,
): ListChange<ResourceRow> | null {
  const index = list.findIndex((row) => row.facilityId === event.facilityId);
  const current = list[index];
  if (!current) return staleOnly();
  if (current.occupancy === event.occupancy && current.capacity === event.capacity) return null;
  const updated = { ...current, occupancy: event.occupancy, capacity: event.capacity, utilisation: event.utilisation };
  return { next: insertSorted(withoutIndex(list, index), updated, compareResources), stale: false };
}

export function resourcesWithInventory(
  list: readonly ResourceRow[],
  event: FacilityInventoryChangedEvent,
  receivedAt: string,
): ListChange<ResourceRow> | null {
  const index = list.findIndex((row) => row.facilityId === event.facilityId);
  const current = list[index];
  if (!current) return null;

  const others = current.lowStock.filter((line) => line.item !== event.item);
  if (!event.isLow && others.length === current.lowStock.length) return null;
  const lowStock = event.isLow
    ? [
        ...others,
        {
          item: event.item,
          quantity: event.quantity,
          lowStockThreshold: event.lowStockThreshold,
          isLow: true,
          updatedAt: receivedAt,
        },
      ].sort((a, b) => INVENTORY_ITEMS.indexOf(a.item) - INVENTORY_ITEMS.indexOf(b.item))
    : others;
  return { next: replaceAt(list, index, { ...current, lowStock }), stale: false };
}

// ---------- Reviews & alerts ----------

export function reviewsWithout(list: readonly PendingReview[], reviewId: string): ListChange<PendingReview> | null {
  const index = list.findIndex((review) => review.id === reviewId);
  return index === -1 ? null : { next: withoutIndex(list, index), stale: false };
}

export function reviewsWithIncidentStatus(
  list: readonly PendingReview[],
  event: IncidentStatusChangedEvent,
): ListChange<PendingReview> | null {
  if (!list.some((review) => review.incidentId === event.id && review.incident.status !== event.to)) return null;
  return {
    next: list.map((review) =>
      review.incidentId === event.id ? { ...review, incident: { ...review.incident, status: event.to } } : review,
    ),
    stale: false,
  };
}

export function alertsWithAlert(list: readonly Alert[], alert: Alert): Alert[] {
  return [alert, ...list.filter((entry) => entry.id !== alert.id)].sort(
    (a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt),
  );
}
