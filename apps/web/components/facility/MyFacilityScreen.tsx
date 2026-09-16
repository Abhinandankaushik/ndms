'use client';

import { ChevronRight, PackageOpen } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { INVENTORY_ITEMS, type FacilityDetail } from '@/lib/api/types';
import { INVENTORY_ITEM_LABELS } from '@/lib/labels';
import { isLowStock } from './capacity';
import { inventoryLineFor } from './facility-cache';
import { FacilityScreen } from './FacilityScreen';
import { OccupancyCard } from './OccupancyCard';

export function MyFacilityScreen() {
  return (
    <FacilityScreen>
      {(facility) => (
        <>
          <OccupancyCard facility={facility} />
          <LowStockCallout facility={facility} />
        </>
      )}
    </FacilityScreen>
  );
}

function LowStockCallout({ facility }: { facility: FacilityDetail }) {
  const lowItems = INVENTORY_ITEMS.filter((item) => {
    const line = inventoryLineFor(facility, item);
    return isLowStock(line.quantity, line.lowStockThreshold);
  });
  if (lowItems.length === 0) return null;

  return (
    <Alert variant="warning">
      <PackageOpen />
      <AlertTitle>Running low on supplies</AlertTitle>
      <AlertDescription>
        <p>{lowItems.map((item) => INVENTORY_ITEM_LABELS[item]).join(', ')}</p>
        <Link
          href="/facility/inventory"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Update supplies
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </AlertDescription>
    </Alert>
  );
}
