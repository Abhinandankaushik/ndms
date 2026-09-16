import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';

export interface RefreshScheduler {
  /**
   * Refetches the queries under `queryKey` now, then at most once per `windowMs`: a burst of requests collapses into
   * one trailing refetch. Inactive queries are only marked stale.
   */
  refresh(queryKey: QueryKey, windowMs: number, options?: { exact?: boolean }): void;
}

interface Slot {
  pending: boolean;
}

// Invalidating on every event would cancel and restart the same request under load (50 incidents/s), so it would
// never finish. A refetch already in flight may have been answered before the latest event, so instead of starting
// another one on top of it the slot stays pending and tries again when the window ends.
function createRefreshScheduler(queryClient: QueryClient): RefreshScheduler {
  const slots = new Map<string, Slot>();

  const run = (slotKey: string, slot: Slot, queryKey: QueryKey, exact: boolean, windowMs: number) => {
    if (queryClient.isFetching({ queryKey, exact }) > 0) {
      slot.pending = true;
    } else {
      slot.pending = false;
      void queryClient.invalidateQueries({ queryKey, exact }, { cancelRefetch: false });
    }
    setTimeout(() => {
      if (slot.pending) run(slotKey, slot, queryKey, exact, windowMs);
      else slots.delete(slotKey);
    }, windowMs);
  };

  return {
    refresh(queryKey, windowMs, { exact = false } = {}) {
      const slotKey = `${exact ? 'exact' : 'prefix'}:${hashKey(queryKey)}`;
      const existing = slots.get(slotKey);
      if (existing) {
        existing.pending = true;
        return;
      }
      const slot: Slot = { pending: false };
      slots.set(slotKey, slot);
      run(slotKey, slot, queryKey, exact, windowMs);
    },
  };
}

const schedulers = new WeakMap<QueryClient, RefreshScheduler>();

export function refreshSchedulerFor(queryClient: QueryClient): RefreshScheduler {
  let scheduler = schedulers.get(queryClient);
  if (!scheduler) {
    scheduler = createRefreshScheduler(queryClient);
    schedulers.set(queryClient, scheduler);
  }
  return scheduler;
}
