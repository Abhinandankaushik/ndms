'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toaster';
import type { IncidentCreatedEvent } from '@/lib/api/types';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import { useSocketEvent, useSocketStatus } from '@/lib/realtime/socket';
import { formatPeople, formatPercent } from '../lib/format';
import { setQueueSort } from '../overview/incident-search';
import { openIncident } from '../workspace-store';
import {
  resyncLiveData,
  syncAlertsChanged,
  syncFacilityCapacity,
  syncFacilityInventory,
  syncIncidentCreated,
  syncIncidentEnriched,
  syncIncidentMediaAdded,
  syncIncidentRecord,
  syncIncidentStatusChanged,
  syncMissionAssigned,
  syncMissionStatusChanged,
  syncReviewCreated,
  syncReviewResolved,
  syncTeamLocation,
} from './cache-sync';
import { markRecentIncident } from './recent-incidents';

const SOS_TOAST_WINDOW_MS = 5_000;

/** Keeps every cached govt view current from the district's socket events; no view polls. */
export function useGovtRealtime(): void {
  const queryClient = useQueryClient();
  const announceSos = useSosAnnouncer();

  useSocketEvent('incident:created', (event) => {
    syncIncidentCreated(queryClient, event);
    markRecentIncident(event.id);
    if (event.isSos) announceSos(event);
  });
  useSocketEvent('incident:updated', (incident) => syncIncidentRecord(queryClient, incident));
  useSocketEvent('incident:status_changed', (event) => syncIncidentStatusChanged(queryClient, event));
  useSocketEvent('incident:enriched', (event) => syncIncidentEnriched(queryClient, event));
  useSocketEvent('incident:media_added', (event) => syncIncidentMediaAdded(queryClient, event.incidentId));
  useSocketEvent('review:created', () => syncReviewCreated(queryClient));
  useSocketEvent('review:resolved', (review) => syncReviewResolved(queryClient, review.id));
  useSocketEvent('mission:assigned', (event) => syncMissionAssigned(queryClient, event));
  useSocketEvent('mission:status_changed', (event) => syncMissionStatusChanged(queryClient, event));
  useSocketEvent('team:location', (event) => syncTeamLocation(queryClient, event));
  useSocketEvent('facility:capacity_changed', (event) => syncFacilityCapacity(queryClient, event));
  useSocketEvent('facility:inventory_changed', (event) => syncFacilityInventory(queryClient, event));
  useSocketEvent('facility:capacity_alert', (event) => {
    toast({
      title: `${event.name} is ${formatPercent(event.utilisation)} full`,
      description: `${event.occupancy} of ${event.capacity} places taken. Direct new arrivals elsewhere.`,
      variant: 'destructive',
      durationMs: 10_000,
    });
  });
  useSocketEvent('alert:broadcast', () => syncAlertsChanged(queryClient));
  useSocketEvent('alert:cancelled', () => syncAlertsChanged(queryClient));

  useResyncAfterReconnect(queryClient);
}

// Events sent while the socket was down are gone for good, so a reconnect refetches everything they would have
// patched.
function useResyncAfterReconnect(queryClient: QueryClient): void {
  const status = useSocketStatus();
  const connection = useRef({ hasConnected: false, lostSinceConnected: false });

  useEffect(() => {
    const state = connection.current;
    if (status === 'connected') {
      if (state.lostSinceConnected) resyncLiveData(queryClient);
      state.hasConnected = true;
      state.lostSinceConnected = false;
    } else if (state.hasConnected) {
      state.lostSinceConnected = true;
    }
  }, [status, queryClient]);
}

// One toast per SOS would bury the screen during a surge; later ones in the same window are summed into one.
function useSosAnnouncer(): (event: IncidentCreatedEvent) => void {
  const burst = useRef<{ open: boolean; suppressed: number; timer?: ReturnType<typeof setTimeout> }>({
    open: false,
    suppressed: 0,
  });

  useEffect(() => () => clearTimeout(burst.current.timer), []);

  return useCallback((event: IncidentCreatedEvent) => {
    const state = burst.current;
    if (state.open) {
      state.suppressed += 1;
      return;
    }

    // Without this the toast was the only trace of a new SOS on screen: a fresh report scores
    // below the seeded ones, so it is nowhere near the top of the priority queue.
    toast({
      title: 'New SOS',
      description: `${DISASTER_TYPE_LABELS[event.type]} · ${formatPeople(event.peopleAffected)} · ${
        event.lat === null ? 'no location shared' : 'location shared'
      }`,
      variant: 'destructive',
      action: { label: 'Open this report', onSelect: () => openIncident(event.id) },
    });
    state.open = true;

    const closeWindow = () => {
      if (state.suppressed === 0) {
        state.open = false;
        return;
      }
      toast({
        title: `${state.suppressed} more SOS ${state.suppressed === 1 ? 'report' : 'reports'}`,
        description: 'Sort the queue by newest to see them together.',
        variant: 'destructive',
        action: { label: 'Show newest first', onSelect: () => setQueueSort('newest') },
      });
      state.suppressed = 0;
      state.timer = setTimeout(closeWindow, SOS_TOAST_WINDOW_MS);
    };
    state.timer = setTimeout(closeWindow, SOS_TOAST_WINDOW_MS);
  }, []);
}
