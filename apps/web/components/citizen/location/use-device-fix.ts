import { useCallback, useEffect, useRef, useState } from 'react';
import { FixFailure, requestDeviceFix, type DeviceFix } from './geolocation';

export interface DeviceFixState {
  fix: DeviceFix | null;
  failure: FixFailure | null;
  isLocating: boolean;
  locate: () => void;
}

export function useDeviceFix({ locateOnMount = false }: { locateOnMount?: boolean } = {}): DeviceFixState {
  const [shouldLocateOnMount] = useState(locateOnMount);
  const [fix, setFix] = useState<DeviceFix | null>(null);
  const [failure, setFailure] = useState<FixFailure | null>(null);
  const [isLocating, setIsLocating] = useState(locateOnMount);
  const latestRequest = useRef(0);

  const locate = useCallback(() => {
    latestRequest.current += 1;
    const request = latestRequest.current;
    setIsLocating(true);
    setFailure(null);
    requestDeviceFix().then(
      (next) => {
        if (request !== latestRequest.current) return;
        setFix(next);
        setIsLocating(false);
      },
      (error: unknown) => {
        if (request !== latestRequest.current) return;
        setFailure(error instanceof FixFailure ? error : new FixFailure('UNAVAILABLE'));
        setIsLocating(false);
      },
    );
  }, []);

  useEffect(() => {
    if (shouldLocateOnMount) locate();
  }, [shouldLocateOnMount, locate]);

  return { fix, failure, isLocating, locate };
}
