import { create } from 'zustand';
import type { LatLon } from '@/lib/api/types';

// The incident drawer and the dispatch dialog are mounted once for the whole portal, so the queue, the map, the
// review list and the missions table all open the same overlays.
interface GovtWorkspaceState {
  drawerIncidentId: string | null;
  dispatchIncidentId: string | null;
  mapFocus: (LatLon & { requestedAt: number }) | null;
}

export const useGovtWorkspace = create<GovtWorkspaceState>()(() => ({
  drawerIncidentId: null,
  dispatchIncidentId: null,
  mapFocus: null,
}));

export function openIncident(incidentId: string): void {
  useGovtWorkspace.setState({ drawerIncidentId: incidentId });
}

export function closeIncident(): void {
  useGovtWorkspace.setState({ drawerIncidentId: null });
}

export function openDispatch(incidentId: string): void {
  useGovtWorkspace.setState({ dispatchIncidentId: incidentId });
}

export function closeDispatch(): void {
  useGovtWorkspace.setState({ dispatchIncidentId: null });
}

export function focusMapOn(location: LatLon): void {
  useGovtWorkspace.setState({ mapFocus: { ...location, requestedAt: Date.now() } });
}

export function clearMapFocus(): void {
  useGovtWorkspace.setState({ mapFocus: null });
}
