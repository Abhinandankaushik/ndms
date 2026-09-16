'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

export type GpsStatus = 'off' | 'locating' | 'tracking' | 'denied' | 'unavailable' | 'unsupported' | 'insecure';

export interface PositionFix {
  lat: number;
  lon: number;
  accuracyM: number | null;
  /** Device clock time of the fix (GeolocationPosition.timestamp). */
  recordedAtMs: number;
}

interface DevicePositionState {
  status: GpsStatus;
  /** Kept after GPS stops so screens can still show the last known position with its age. */
  fix: PositionFix | null;
}

export const useDevicePosition = create<DevicePositionState>()(() => ({ status: 'off', fix: null }));

// A position the phone already holds answers the first request at once; the watch then refines it.
const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000 };

let holders = 0;
let watchId: number | null = null;

// One watch serves every screen that needs the position. GPS drains the battery, so it runs only while
// something holds it.
export function holdDevicePosition(): () => void {
  holders += 1;
  if (holders === 1) startWatch();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) stopWatch();
  };
}

/** Starts GPS again, e.g. after the user unblocked location for the site. */
export function retryDevicePosition(): void {
  if (holders === 0) return;
  stopWatch();
  startWatch();
}

export function useHeldDevicePosition(enabled: boolean): DevicePositionState {
  useEffect(() => (enabled ? holdDevicePosition() : undefined), [enabled]);
  return useDevicePosition();
}

function startWatch(): void {
  const blocker = watchBlocker();
  if (blocker) {
    useDevicePosition.setState({ status: blocker });
    return;
  }
  useDevicePosition.setState({ status: 'locating' });
  const id = navigator.geolocation.watchPosition(
    (position) => {
      if (watchId === id) useDevicePosition.setState({ status: 'tracking', fix: toFix(position) });
    },
    (error) => {
      if (watchId === id) useDevicePosition.setState({ status: statusForError(error) });
    },
    WATCH_OPTIONS,
  );
  watchId = id;
}

function stopWatch(): void {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  useDevicePosition.setState({ status: 'off' });
}

function watchBlocker(): GpsStatus | null {
  if (!('geolocation' in navigator)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return null;
}

function toFix(position: GeolocationPosition): PositionFix {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    lat: latitude,
    lon: longitude,
    accuracyM: Number.isFinite(accuracy) ? accuracy : null,
    recordedAtMs: position.timestamp,
  };
}

// No timeout is requested, so TIMEOUT never arrives; a lost signal shows up as an ageing fix instead.
function statusForError(error: GeolocationPositionError): GpsStatus {
  return error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable';
}
