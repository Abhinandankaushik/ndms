'use client';

import { INVENTORY_ITEMS } from '@/lib/api/types';
import { inventoryLineFor } from './facility-cache';
import { FacilityScreen } from './FacilityScreen';
import { StockCard } from './StockCard';

export function InventoryScreen() {
  return (
    <FacilityScreen title="Supplies" description="Record deliveries and use. Changes by other staff appear here as they happen.">
      {(facility) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {INVENTORY_ITEMS.map((item) => (
            <StockCard key={item} facilityId={facility.id} line={inventoryLineFor(facility, item)} />
          ))}
        </div>
      )}
    </FacilityScreen>
  );
}
