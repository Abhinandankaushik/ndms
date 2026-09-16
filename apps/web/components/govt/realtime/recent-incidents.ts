import { create } from 'zustand';

const HIGHLIGHT_MS = 12_000;

const useRecentIncidentStore = create<{ ids: ReadonlySet<string> }>()(() => ({ ids: new Set<string>() }));

/** Marks an incident that arrived over the socket, so the queue can draw the eye to it for a few seconds. */
export function markRecentIncident(incidentId: string): void {
  useRecentIncidentStore.setState((state) => ({ ids: new Set(state.ids).add(incidentId) }));
  setTimeout(() => {
    useRecentIncidentStore.setState((state) => {
      const ids = new Set(state.ids);
      ids.delete(incidentId);
      return { ids };
    });
  }, HIGHLIGHT_MS);
}

export function useIsRecentIncident(incidentId: string): boolean {
  return useRecentIncidentStore((state) => state.ids.has(incidentId));
}
