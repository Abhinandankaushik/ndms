'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef } from 'react';
import { toast } from '@/components/ui/toaster';
import { queryKeys } from '@/lib/api/query-keys';
import type { Incident } from '@/lib/api/types';
import { useSessionUser } from '@/lib/auth/session';
import { DISASTER_TYPE_LABELS } from '@/lib/labels';
import { useSocketEvent, useSocketStatus } from '@/lib/realtime/socket';
import { formatPeople } from './format';
import {
  refreshMissionQueries,
  storeAssignedMission,
  storeIncident,
  storeIncidentStatusEvent,
  storeMissionStatusEvent,
} from './mission-cache';

const NEW_MISSION_BUZZ = [300, 150, 300, 150, 300];
const CANCELLED_MISSION_BUZZ = [600];

export function useMissionRealtimeSync(): void {
  const queryClient = useQueryClient();
  const teamId = useSessionUser()?.rescueTeamId ?? null;

  // An incident room the team joined also carries other teams' missions for that incident.
  useSocketEvent('mission:assigned', ({ mission, incident }) => {
    if (mission.teamId !== teamId) return;
    if (storeAssignedMission(queryClient, { ...mission, incident })) announceNewMission(incident);
    void refreshMissionQueries(queryClient);
  });

  useSocketEvent('mission:status_changed', (event) => {
    if (event.teamId !== teamId) return;
    if (!storeMissionStatusEvent(queryClient, event)) return;
    if (event.to === 'CANCELLED') announceCancelledMission();
    void refreshMissionQueries(queryClient, event.missionId);
  });

  useSocketEvent('incident:updated', (incident) => storeIncident(queryClient, incident));
  useSocketEvent('incident:status_changed', (event) => storeIncidentStatusEvent(queryClient, event));

  useRefreshAfterReconnect(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.missions.all });
  });
}

// Events emitted while the socket was down are never replayed, so a reconnect is followed by a refetch.
function useRefreshAfterReconnect(refresh: () => void): void {
  const status = useSocketStatus();
  const onReconnect = useEffectEvent(refresh);
  const hasConnected = useRef(false);

  useEffect(() => {
    if (status !== 'connected') return;
    if (hasConnected.current) onReconnect();
    hasConnected.current = true;
  }, [status]);
}

function announceNewMission(incident: Incident): void {
  toast({
    title: incident.isSos ? 'New SOS mission' : 'New mission assigned',
    description: `${DISASTER_TYPE_LABELS[incident.type]} · ${formatPeople(incident.peopleAffected)} affected`,
    durationMs: 10_000,
  });
  buzz(NEW_MISSION_BUZZ);
}

function announceCancelledMission(): void {
  toast({
    title: 'Mission cancelled',
    description: 'The control room cancelled one of your missions.',
    variant: 'destructive',
    durationMs: 10_000,
  });
  buzz(CANCELLED_MISSION_BUZZ);
}

// A phone in a pocket or a gloved hand notices a buzz long before a toast. Browsers without vibration, or that
// refuse it before the user has touched the page, simply stay silent.
function buzz(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is best effort.
  }
}
