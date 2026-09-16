import { requestBackgroundFlush } from './background-sync';
import { drainOutbox, flushOutboxNow } from './drain';
import { refreshOutbox } from './outbox';
import { getOutboxState } from './store';
import { FLUSH_OUTBOX_MESSAGE } from './sw-contract';

/** Short enough that a backoff that has just expired is acted on while the person is still looking. */
const POLL_INTERVAL_MS = 15_000;

/**
 * Drains the outbox for as long as a page is open. Everything else — Background Sync, the `online`
 * event, a tab becoming visible again — only decides *when* this runs, never where the sending
 * happens, because the access token exists nowhere but this page.
 */
export function startOutboxRunner(): () => void {
  let stopped = false;

  // Three of the four portals never queue anything, so the timer only reaches storage once there is
  // something to send. A reconnection re-reads it anyway, which is what picks up another tab's work.
  const poll = () => {
    if (!stopped && getOutboxState().entries.length > 0) void drainOutbox();
  };
  const flush = () => {
    if (!stopped) void flushOutboxNow();
  };
  const flushWhenVisible = () => {
    if (document.visibilityState === 'visible') flush();
  };
  const onWorkerMessage = (event: MessageEvent<unknown>) => {
    if (isFlushRequest(event.data)) flush();
  };

  void refreshOutbox().then(flush);
  void requestBackgroundFlush();

  const timer = setInterval(poll, POLL_INTERVAL_MS);
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', flushWhenVisible);
  navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
  // A listener added with addEventListener does not release the queued messages on its own.
  navigator.serviceWorker?.startMessages();

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', flush);
    document.removeEventListener('visibilitychange', flushWhenVisible);
    navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
  };
}

function isFlushRequest(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === FLUSH_OUTBOX_MESSAGE;
}
