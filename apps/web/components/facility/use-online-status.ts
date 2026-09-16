import { useSyncExternalStore } from 'react';

function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

// navigator.onLine can claim a connection that does not reach NDMS, but when it reports offline it is right.
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );
}
