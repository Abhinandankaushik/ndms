import { create } from 'zustand';
import type { LatLon } from '@/lib/api/types';

export interface DeviceFix extends LatLon {
  accuracyM: number | null;
  capturedAt: number;
}

export type FixFailureReason = 'UNSUPPORTED' | 'INSECURE_CONTEXT' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'TIMEOUT';

const FAILURE_MESSAGES: Record<FixFailureReason, string> = {
  UNSUPPORTED: 'This browser cannot share your location.',
  INSECURE_CONTEXT: 'Location only works when NDMS is opened over a secure (https) connection.',
  PERMISSION_DENIED: 'Location access is blocked for NDMS. Allow it in your browser settings.',
  UNAVAILABLE: 'Your phone could not work out where you are.',
  TIMEOUT: 'Finding your location took too long.',
};

export class FixFailure extends Error {
  override readonly name = 'FixFailure';
  readonly reason: FixFailureReason;

  constructor(reason: FixFailureReason) {
    super(FAILURE_MESSAGES[reason]);
    this.reason = reason;
  }
}

// Plan A1.2: never wait longer than 8 s, and a fix up to 30 s old is good enough in an emergency.
export const EMERGENCY_FIX_OPTIONS = { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 } as const;

// The browser starts the timeout only after the permission prompt is answered, so an ignored prompt would hold
// an SOS forever without a deadline of our own.
const PERMISSION_PROMPT_GRACE_MS = 4_000;
// The API refuses accuracies above 100 km, and a fix that vague does not locate anyone.
const MAX_USABLE_ACCURACY_M = 100_000;

const useLastFixStore = create<{ fix: DeviceFix | null }>()(() => ({ fix: null }));

export const useLastKnownFix = () => useLastFixStore((state) => state.fix);

export function getLastKnownFix(): DeviceFix | null {
  return useLastFixStore.getState().fix;
}

export function requestDeviceFix(): Promise<DeviceFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new FixFailure('UNSUPPORTED'));
      return;
    }
    if (!window.isSecureContext) {
      reject(new FixFailure('INSECURE_CONTEXT'));
      return;
    }

    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      finish();
    };

    deadline = setTimeout(
      () => settle(() => reject(new FixFailure('TIMEOUT'))),
      EMERGENCY_FIX_OPTIONS.timeout + PERMISSION_PROMPT_GRACE_MS,
    );
    navigator.geolocation.getCurrentPosition(
      (position) =>
        settle(() => {
          const fix = toDeviceFix(position);
          if (!fix) {
            reject(new FixFailure('UNAVAILABLE'));
            return;
          }
          useLastFixStore.setState({ fix });
          resolve(fix);
        }),
      (error) => settle(() => reject(new FixFailure(failureReason(error)))),
      EMERGENCY_FIX_OPTIONS,
    );
  });
}

function toDeviceFix(position: GeolocationPosition): DeviceFix | null {
  const { latitude, longitude, accuracy } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const hasAccuracy = Number.isFinite(accuracy) && accuracy > 0;
  if (hasAccuracy && accuracy > MAX_USABLE_ACCURACY_M) return null;
  return { lat: latitude, lon: longitude, accuracyM: hasAccuracy ? accuracy : null, capturedAt: position.timestamp };
}

function failureReason(error: GeolocationPositionError): FixFailureReason {
  if (error.code === GeolocationPositionError.PERMISSION_DENIED) return 'PERMISSION_DENIED';
  if (error.code === GeolocationPositionError.TIMEOUT) return 'TIMEOUT';
  return 'UNAVAILABLE';
}
