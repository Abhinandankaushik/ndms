'use client';

import { useEffect, useRef } from 'react';
import type { VolunteerTask } from '@/lib/api/types';
import { useSessionUser } from '@/lib/auth/session';
import { useSocketEvent, useSocketStatus, type SocketStatus } from '@/lib/realtime/socket';
import { dismissCapacityAlert, showCapacityAlert } from './capacity-alert';
import { applyServerHeadcount, applyServerStockLine, requestFacilityResync } from './facility-sync';
import { refreshFacilityTasks, rememberVolunteerTask } from './facility-tasks';

export function FacilityLiveUpdates() {
  const facilityId = useSessionUser()?.facilityId ?? null;

  useSocketEvent('facility:capacity_changed', (event) => {
    if (event.facilityId === facilityId) applyServerHeadcount(event.facilityId, event);
  });

  useSocketEvent('facility:capacity_alert', (event) => {
    if (event.facilityId === facilityId) showCapacityAlert(event);
  });

  useSocketEvent('facility:inventory_changed', (event) => {
    if (event.facilityId === facilityId) applyServerStockLine(event.facilityId, event);
  });

  const rememberOwnFacilityTask = (task: VolunteerTask) => {
    if (task.facilityId !== null && task.facilityId === facilityId) rememberVolunteerTask(task);
  };
  useSocketEvent('volunteer_task:created', rememberOwnFacilityTask);
  useSocketEvent('volunteer_task:updated', rememberOwnFacilityTask);

  useResyncAfterReconnect();

  useEffect(() => dismissCapacityAlert, []);

  return null;
}

// Events emitted while the socket was down are never replayed, so a reconnect re-reads what they would have changed.
function useResyncAfterReconnect(): void {
  const status = useSocketStatus();
  const previousStatus = useRef<SocketStatus | null>(null);
  const hasConnectedBefore = useRef(false);

  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = status;
    if (status !== 'connected' || before === 'connected') return;
    if (hasConnectedBefore.current) {
      requestFacilityResync();
      refreshFacilityTasks();
    }
    hasConnectedBefore.current = true;
  }, [status]);
}
