import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { toast } from '@/components/ui/toaster';
import { adjustInventory, adjustOccupancy, getMyFacility } from '@/lib/api/endpoints/facilities';
import { queryKeys } from '@/lib/api/query-keys';
import type { Facility, FacilityInventoryChangedEvent, InventoryItem, InventoryLine } from '@/lib/api/types';
import { getQueryClient } from '@/lib/query/query-client';
import { capacityFigures, clampOccupancy, isLowStock, type Headcount } from './capacity';
import { createDeltaSync, NO_PENDING_DELTA, type DeltaSync, type PendingDelta } from './delta-sync';
import { describeApiError } from './describe-error';
import { inventoryLineFor, patchInventoryLine, patchMyFacility, readMyFacility } from './facility-cache';

const MAX_OCCUPANCY_DELTA = 10_000;
const MAX_STOCK_DELTA = 1_000_000;
const FAILURE_TOAST_GAP_MS = 4_000;

export interface StockTarget {
  facilityId: string;
  item: InventoryItem;
}

export const occupancySync = createDeltaSync<string, Headcount>({
  keyOf: (facilityId) => facilityId,
  maxDelta: MAX_OCCUPANCY_DELTA,
  readShown: (facilityId) => {
    const facility = readMyFacility(facilityId);
    return facility && { occupancy: facility.occupancy, capacity: facility.capacity };
  },
  show: (facilityId, headcount) => patchMyFacility(facilityId, (facility) => ({ ...facility, ...capacityFigures(headcount) })),
  applyDelta: clampOccupancy,
  sameValue: (a, b) => a.occupancy === b.occupancy && a.capacity === b.capacity,
  send: async (facilityId, delta) => {
    const { occupancy, capacity } = await adjustOccupancy(facilityId, delta);
    return { occupancy, capacity };
  },
  cancelReadsInFlight: cancelFacilityReadsInFlight,
  requestResync: requestFacilityResync,
  onFailure: (error) => reportCounterFailure('Occupancy not updated', error),
  onIdle: resyncWhenCountersIdle,
});

export const stockSync = createDeltaSync<StockTarget, number>({
  keyOf: ({ facilityId, item }) => `${facilityId}:${item}`,
  maxDelta: MAX_STOCK_DELTA,
  readShown: ({ facilityId, item }) => {
    const facility = readMyFacility(facilityId);
    return facility && inventoryLineFor(facility, item).quantity;
  },
  show: ({ facilityId, item }, quantity) =>
    patchInventoryLine(facilityId, item, (line) => ({ ...line, quantity, isLow: isLowStock(quantity, line.lowStockThreshold) })),
  applyDelta: (quantity, delta) => Math.max(0, quantity + delta),
  sameValue: (a, b) => a === b,
  send: async ({ facilityId, item }, delta) => {
    const line = await adjustInventory(facilityId, item, { delta });
    showThreshold(facilityId, line);
    return line.quantity;
  },
  cancelReadsInFlight: cancelFacilityReadsInFlight,
  requestResync: requestFacilityResync,
  onFailure: (error) => reportCounterFailure('Stock not updated', error),
  onIdle: resyncWhenCountersIdle,
});

let resyncRequested = false;
let lastFailureToastAt = 0;

export function facilityCountersBusy(): boolean {
  return occupancySync.hasBusyTargets() || stockSync.hasBusyTargets();
}

// Occupancy and every stock line share one cached response, so a refetch waits until no counter has a change on
// its way; landing earlier it would overwrite optimistic values with a read that may predate them.
export function requestFacilityResync(): void {
  resyncRequested = true;
  resyncWhenCountersIdle();
}

function resyncWhenCountersIdle(): void {
  if (!resyncRequested || facilityCountersBusy()) return;
  resyncRequested = false;
  void getQueryClient().invalidateQueries({ queryKey: queryKeys.facilities.mine });
}

function cancelFacilityReadsInFlight(): boolean {
  const queryClient = getQueryClient();
  const fetchStatus = queryClient.getQueryState(queryKeys.facilities.mine)?.fetchStatus;
  if (!fetchStatus || fetchStatus === 'idle') return false;
  void queryClient.cancelQueries({ queryKey: queryKeys.facilities.mine });
  return true;
}

function reportCounterFailure(title: string, error: unknown): void {
  const now = Date.now();
  if (now - lastFailureToastAt < FAILURE_TOAST_GAP_MS) return;
  lastFailureToastAt = now;
  toast({
    title,
    description: `${describeApiError(error)} The count shows the last value NDMS confirmed.`,
    variant: 'destructive',
  });
}

function showThreshold(facilityId: string, line: Pick<InventoryLine, 'item' | 'lowStockThreshold'>): void {
  patchInventoryLine(facilityId, line.item, (current) => ({
    ...current,
    lowStockThreshold: line.lowStockThreshold,
    isLow: isLowStock(current.quantity, line.lowStockThreshold),
  }));
}

export function applyServerHeadcount(facilityId: string, headcount: Headcount): void {
  occupancySync.offer(facilityId, headcount);
}

export function applyServerStockLine(
  facilityId: string,
  line: Pick<FacilityInventoryChangedEvent, 'item' | 'quantity' | 'lowStockThreshold'>,
): void {
  showThreshold(facilityId, line);
  stockSync.offer({ facilityId, item: line.item }, line.quantity);
}

// Only the descriptive fields are copied: the counters in a PATCH response go through the same reconciliation as
// any other server value, so they cannot undo taps still on their way.
export function applyFacilityUpdate(updated: Facility): void {
  patchMyFacility(updated.id, (facility) => ({
    ...facility,
    name: updated.name,
    address: updated.address,
    contactPhone: updated.contactPhone,
    isOperational: updated.isOperational,
    amenities: updated.amenities,
    attributes: updated.attributes,
    updatedAt: updated.updatedAt,
  }));
  applyServerHeadcount(updated.id, { occupancy: updated.occupancy, capacity: updated.capacity });
}

const refetchUnlessCountersBusy = () => !facilityCountersBusy();

export function useMyFacility() {
  return useQuery({
    queryKey: queryKeys.facilities.mine,
    queryFn: ({ signal }) => getMyFacility({ signal }),
    refetchOnMount: refetchUnlessCountersBusy,
    refetchOnWindowFocus: refetchUnlessCountersBusy,
    refetchOnReconnect: refetchUnlessCountersBusy,
  });
}

export function usePendingDelta<TTarget>(
  sync: Pick<DeltaSync<TTarget, unknown>, 'subscribe' | 'pendingFor'>,
  target: TTarget,
): PendingDelta {
  return useSyncExternalStore(
    sync.subscribe,
    () => sync.pendingFor(target),
    () => NO_PENDING_DELTA,
  );
}
