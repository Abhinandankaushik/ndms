import { useQueryClient } from '@tanstack/react-query';
import { useRefetchOnReconnect } from '@/components/citizen/common/hooks';
import { queryKeys } from '@/lib/api/query-keys';
import type { Incident, IncidentDetail, IncidentStatusChangedEvent } from '@/lib/api/types';
import { useIncidentSubscription, useSocketEvent } from '@/lib/realtime/socket';

export function useIncidentLiveUpdates(incidentId: string): void {
  const queryClient = useQueryClient();
  const detailKey = queryKeys.incidents.detail(incidentId);
  useIncidentSubscription(incidentId);

  useSocketEvent('incident:status_changed', (event) => {
    if (event.id !== incidentId) return;
    queryClient.setQueryData<IncidentDetail>(detailKey, (current) => current && withStatusChange(current, event));
    // The event carries no note, so the logged entry is read back.
    void queryClient.invalidateQueries({ queryKey: detailKey });
  });

  useSocketEvent('incident:updated', (incident) => {
    if (incident.id !== incidentId) return;
    queryClient.setQueryData<IncidentDetail>(detailKey, (current) => current && { ...incident, timeline: current.timeline });
  });

  useSocketEvent('incident:media_added', (event) => {
    if (event.incidentId === incidentId) void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.media(incidentId) });
  });

  useRefetchOnReconnect(detailKey);
}

// Status changes of the reporter's own incidents reach their user room without any subscription, so one
// listener in the portal layout keeps the "my reports" cache current for every screen.
export function useMyIncidentsLiveUpdates(onStatusChange?: (event: IncidentStatusChangedEvent) => void): void {
  const queryClient = useQueryClient();

  useSocketEvent('incident:status_changed', (event) => {
    queryClient.setQueryData<Incident[]>(queryKeys.incidents.mine, (current) =>
      current?.map((incident) =>
        incident.id === event.id ? { ...incident, status: event.to, updatedAt: event.at } : incident,
      ),
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.mine });
    onStatusChange?.(event);
  });

  useRefetchOnReconnect(queryKeys.incidents.mine);
}

function withStatusChange(detail: IncidentDetail, event: IncidentStatusChangedEvent): IncidentDetail {
  const alreadyLogged = detail.timeline.some((entry) => entry.toStatus === event.to && entry.changedAt === event.at);
  return {
    ...detail,
    status: event.to,
    updatedAt: event.at,
    timeline: alreadyLogged
      ? detail.timeline
      : [...detail.timeline, { fromStatus: event.from, toStatus: event.to, changedBy: event.by, note: null, changedAt: event.at }],
  };
}
