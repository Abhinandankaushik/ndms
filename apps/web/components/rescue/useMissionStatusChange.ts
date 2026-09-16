'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toaster';
import { changeMissionStatus } from '@/lib/api/endpoints/missions';
import type { MissionStatusChange } from '@/lib/api/types';
import { refreshMissionQueries, storeConfirmedMission } from './mission-cache';
import { STEP_COPY, type TeamStepStatus } from './mission-flow';
import { failureRevealsNewerState, statusChangeTimeout } from './step-failure';

// On 2G a request can hang for minutes. After this long the screen admits it has no answer and offers a retry;
// a confirmation that arrives later still updates the mission.
const STATUS_CHANGE_TIMEOUT_MS = 20_000;

export interface TeamStatusChange extends MissionStatusChange {
  status: TeamStepStatus;
}

export function useMissionStatusChange(missionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: TeamStatusChange) => {
      const confirmed = changeMissionStatus(missionId, change).then((mission) => {
        storeConfirmedMission(queryClient, mission);
        void refreshMissionQueries(queryClient, missionId);
        return mission;
      });
      return settleWithin(confirmed, STATUS_CHANGE_TIMEOUT_MS);
    },
    onSuccess: (_mission, change) => {
      toast({ title: STEP_COPY[change.status].confirmed, variant: 'success', durationMs: 3_000 });
    },
    onError: (error) => {
      if (failureRevealsNewerState(error)) void refreshMissionQueries(queryClient, missionId);
    },
  });
}

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(statusChangeTimeout()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
