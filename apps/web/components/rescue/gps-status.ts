import type { GpsStatus, PositionFix } from './device-position';

export interface GpsProblem {
  title: string;
  message: string;
  canRetry: boolean;
}

export const GPS_PROBLEMS: Partial<Record<GpsStatus, GpsProblem>> = {
  denied: {
    title: 'Location is blocked',
    message: 'Allow location for this site in your browser settings, then try again.',
    canRetry: true,
  },
  insecure: {
    title: 'Location needs a secure connection',
    message: 'Open NDMS over HTTPS to use your position.',
    canRetry: false,
  },
  unsupported: {
    title: 'This browser cannot give your location',
    message: 'Use an up-to-date Chrome, Edge, Firefox or Safari.',
    canRetry: false,
  },
};

// A fix this old no longer says where the team is: GPS lost the sky or the phone put the page to sleep.
const STALE_FIX_AFTER_MS = 60_000;

export const isStaleFix = (fix: PositionFix, nowMs: number): boolean => nowMs - fix.recordedAtMs > STALE_FIX_AFTER_MS;

export function describeAccuracy(accuracyM: number | null): string {
  if (accuracyM === null) return 'Unknown';
  const radius = accuracyM < 1_000 ? `±${Math.round(accuracyM)} m` : `±${(accuracyM / 1_000).toFixed(1)} km`;
  const quality = accuracyM <= 30 ? 'good' : accuracyM <= 100 ? 'fair' : 'poor';
  return `${radius} (${quality})`;
}
