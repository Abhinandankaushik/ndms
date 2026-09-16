import { queryKeys } from '@/lib/api/query-keys';
import type { FacilityDetail, InventoryItem, InventoryLine } from '@/lib/api/types';
import { getQueryClient } from '@/lib/query/query-client';

export function readMyFacility(facilityId: string): FacilityDetail | undefined {
  const facility = getQueryClient().getQueryData<FacilityDetail>(queryKeys.facilities.mine);
  return facility?.id === facilityId ? facility : undefined;
}

export function patchMyFacility(facilityId: string, patch: (facility: FacilityDetail) => FacilityDetail): void {
  getQueryClient().setQueryData<FacilityDetail>(queryKeys.facilities.mine, (facility) =>
    facility?.id === facilityId ? patch(facility) : undefined,
  );
}

// The API lists only items that have a stock row, so an item never stocked reads as zero with no threshold.
export function inventoryLineFor(facility: FacilityDetail, item: InventoryItem): InventoryLine {
  return (
    facility.inventory.find((line) => line.item === item) ?? {
      item,
      quantity: 0,
      lowStockThreshold: null,
      isLow: false,
      updatedAt: facility.updatedAt,
    }
  );
}

export function patchInventoryLine(
  facilityId: string,
  item: InventoryItem,
  patch: (line: InventoryLine) => InventoryLine,
): void {
  patchMyFacility(facilityId, (facility) => {
    const updated = patch(inventoryLineFor(facility, item));
    const hasLine = facility.inventory.some((line) => line.item === item);
    const inventory = hasLine
      ? facility.inventory.map((line) => (line.item === item ? updated : line))
      : [...facility.inventory, updated];
    return { ...facility, inventory };
  });
}
