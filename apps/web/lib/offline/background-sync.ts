import { FLUSH_OUTBOX_TAG } from './sw-contract';

interface BackgroundSyncManager {
  register(tag: string): Promise<void>;
}

// Background Sync is not in the DOM typings; it exists in Chromium browsers only.
type SyncCapableRegistration = ServiceWorkerRegistration & { sync?: BackgroundSyncManager };

/**
 * Asks the browser to wake the service worker once connectivity returns. The worker cannot drain the
 * outbox itself, so this only buys an earlier nudge of an open page; `startOutboxRunner` is what
 * actually delivers, and it works in every browser.
 */
export async function requestBackgroundFlush(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return false;
  try {
    // Safe to await: a controller exists, so `ready` has already settled. Without one it never would.
    const registration: SyncCapableRegistration = await navigator.serviceWorker.ready;
    if (!registration.sync) return false;
    await registration.sync.register(FLUSH_OUTBOX_TAG);
    return true;
  } catch {
    // Firefox and Safari have no Background Sync, and Chromium refuses the tag when the user has
    // turned background sync off for the site.
    return false;
  }
}
