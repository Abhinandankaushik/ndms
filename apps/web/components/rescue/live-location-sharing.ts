'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { isApiError } from '@/lib/api/api-error';
import { sendTeamLocation } from '@/lib/api/endpoints/teams';
import { holdDevicePosition, useDevicePosition, type PositionFix } from './device-position';
import { decidePing } from './ping-throttle';

export interface SharingFailure {
  message: string;
  /** Automatic retries stopped because repeating the same request cannot succeed. */
  paused: boolean;
}

interface LiveLocationState {
  sharing: boolean;
  lastSentAtMs: number | null;
  /** The latest fix is within the minimum move of the last position sent, so nothing new needs sending. */
  stationary: boolean;
  failure: SharingFailure | null;
}

const IDLE: LiveLocationState = {
  sharing: false,
  lastSentAtMs: null,
  stationary: false,
  failure: null,
};

export const useLiveLocation = create<LiveLocationState>()(() => IDLE);

let resumeCurrentSharing: (() => void) | null = null;

/** Shares the team's position while `missionId` is set; each new mission starts with a fresh throttle. */
export function useLiveLocationSharing(missionId: string | null): void {
  useEffect(() => (missionId ? startLiveLocationSharing() : undefined), [missionId]);
}

export function resumeLiveLocation(): void {
  resumeCurrentSharing?.();
}

/** Starts GPS and sends throttled pings; call the returned function to stop both. */
export function startLiveLocationSharing(): () => void {
  const sender = createPingSender();
  const unsubscribe = useDevicePosition.subscribe((state, previous) => {
    if (state.fix && state.fix !== previous.fix) sender.offer(state.fix);
  });
  // A watch that is already running may stay silent while the team stands still, so its current fix is sent
  // now. A stopped watch only holds an old fix; restarting it produces a fresh one within seconds.
  const watchWasTracking = useDevicePosition.getState().status === 'tracking';
  const releasePosition = holdDevicePosition();
  resumeCurrentSharing = sender.resume;
  useLiveLocation.setState({ ...IDLE, sharing: true });

  const heldFix = useDevicePosition.getState().fix;
  if (watchWasTracking && heldFix) sender.offer(heldFix);

  return () => {
    unsubscribe();
    sender.stop();
    releasePosition();
    if (resumeCurrentSharing === sender.resume) resumeCurrentSharing = null;
    useLiveLocation.setState(IDLE);
  };
}

interface PingSender {
  offer(fix: PositionFix): void;
  resume(): void;
  stop(): void;
}

function createPingSender(): PingSender {
  let latestFix: PositionFix | null = null;
  let lastAttemptAtMs: number | null = null;
  let lastDelivered: PositionFix | null = null;
  let inFlight = false;
  let paused = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const report = (patch: Partial<LiveLocationState>) => {
    if (!stopped) useLiveLocation.setState(patch);
  };

  const evaluate = () => {
    clearTimeout(timer);
    timer = undefined;
    if (stopped || paused || inFlight || !latestFix) return;
    const decision = decidePing({ lastAttemptAtMs, lastDelivered }, latestFix, Date.now());
    const stationary = decision.action === 'skip';
    if (useLiveLocation.getState().stationary !== stationary) report({ stationary });
    if (decision.action === 'wait') timer = setTimeout(evaluate, decision.delayMs);
    else if (decision.action === 'send') void deliver(latestFix);
  };

  const deliver = async (fix: PositionFix) => {
    inFlight = true;
    lastAttemptAtMs = Date.now();
    try {
      await sendTeamLocation({
        lat: fix.lat,
        lon: fix.lon,
        accuracyM: fix.accuracyM,
        recordedAt: new Date(fix.recordedAtMs).toISOString(),
      });
      // accepted: false means the API already holds a position within its own throttle of this one, so the fix
      // counts as delivered rather than as something to resend.
      lastDelivered = fix;
      report({ lastSentAtMs: Date.now(), failure: null });
    } catch (error) {
      const failure = describeSharingFailure(error);
      paused = failure.paused;
      report({ failure });
    } finally {
      inFlight = false;
    }
    evaluate();
  };

  return {
    offer(fix) {
      latestFix = fix;
      evaluate();
    },
    resume() {
      if (!paused) return;
      paused = false;
      report({ failure: null });
      evaluate();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

function describeSharingFailure(error: unknown): SharingFailure {
  if (!isApiError(error)) return { message: 'Could not send your location. Trying again shortly.', paused: false };
  if (error.isNetworkError) {
    return { message: 'No connection. Your latest position is sent as soon as the network returns.', paused: false };
  }
  if (error.isRetryable) return { message: 'NDMS could not store your location. Trying again shortly.', paused: false };
  return { message: error.message, paused: true };
}
