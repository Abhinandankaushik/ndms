import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { useSocketStatus } from '@/lib/realtime/socket';

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeToConnectivity, () => navigator.onLine, () => true);
}

function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

// Socket.IO does not replay events emitted while a client was disconnected, so data kept fresh by events is
// re-read whenever the connection comes (back) up.
export function useRefetchOnReconnect(queryKey: QueryKey): void {
  const queryClient = useQueryClient();
  const status = useSocketStatus();
  const previousStatus = useRef(status);
  const refetch = useEffectEvent(() => {
    void queryClient.invalidateQueries({ queryKey });
  });

  useEffect(() => {
    if (status === 'connected' && previousStatus.current !== 'connected') refetch();
    previousStatus.current = status;
  }, [status]);
}
