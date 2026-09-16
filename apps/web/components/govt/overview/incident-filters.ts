import { create } from 'zustand';
import {
  DISASTER_TYPES,
  INCIDENT_STATUSES,
  OPEN_INCIDENT_STATUSES,
  type DisasterType,
  type IncidentStatus,
} from '@/lib/api/types';

// Shared by the map and the queue so both show the same slice, and kept across page changes within the portal.
// Filtering happens on the server (G6); lists stay in canonical order so equal filters produce equal query keys.
export interface IncidentFilters {
  statuses: readonly IncidentStatus[];
  types: readonly DisasterType[];
  sosOnly: boolean;
}

export const DEFAULT_INCIDENT_FILTERS: IncidentFilters = {
  statuses: OPEN_INCIDENT_STATUSES,
  types: [],
  sosOnly: false,
};

export const CLOSED_INCIDENT_STATUSES: readonly IncidentStatus[] = INCIDENT_STATUSES.filter(
  (status) => !OPEN_INCIDENT_STATUSES.includes(status),
);

export const useIncidentFilters = create<IncidentFilters>()(() => DEFAULT_INCIDENT_FILTERS);

export function setStatusFilter(statuses: readonly IncidentStatus[]): void {
  if (statuses.length === 0) return;
  useIncidentFilters.setState({ statuses: INCIDENT_STATUSES.filter((status) => statuses.includes(status)) });
}

// An empty status list would silently fall back to the API default, so the last status cannot be switched off.
export function toggleStatusFilter(status: IncidentStatus): void {
  const { statuses } = useIncidentFilters.getState();
  setStatusFilter(statuses.includes(status) ? statuses.filter((entry) => entry !== status) : [...statuses, status]);
}

export function toggleTypeFilter(type: DisasterType): void {
  const { types } = useIncidentFilters.getState();
  const next = types.includes(type) ? types.filter((entry) => entry !== type) : [...types, type];
  useIncidentFilters.setState({ types: DISASTER_TYPES.filter((entry) => next.includes(entry)) });
}

export function clearTypeFilter(): void {
  useIncidentFilters.setState({ types: [] });
}

export function setSosOnly(sosOnly: boolean): void {
  useIncidentFilters.setState({ sosOnly });
}

export function resetIncidentFilters(): void {
  useIncidentFilters.setState(DEFAULT_INCIDENT_FILTERS);
}

export function isDefaultIncidentFilters(filters: IncidentFilters): boolean {
  return (
    !filters.sosOnly &&
    filters.types.length === 0 &&
    filters.statuses.length === OPEN_INCIDENT_STATUSES.length &&
    OPEN_INCIDENT_STATUSES.every((status) => filters.statuses.includes(status))
  );
}
