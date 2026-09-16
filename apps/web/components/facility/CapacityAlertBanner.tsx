'use client';

import { Siren, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessionUser } from '@/lib/auth/session';
import { capacityLevel, utilisationPercent, type Headcount } from './capacity';
import { dismissCapacityAlert, useCapacityAlertStore } from './capacity-alert';
import { useMyFacility } from './facility-sync';
import { formatCount } from './format';

export function CapacityAlertBanner() {
  const facilityId = useSessionUser()?.facilityId ?? null;
  const alert = useCapacityAlertStore((state) => state.alert);
  const { data: facility } = useMyFacility();

  if (!alert || alert.facilityId !== facilityId) return null;
  const current: Headcount = facility?.id === alert.facilityId ? facility : alert;
  if (capacityLevel(current) !== 'critical') return null;

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-destructive/30 bg-destructive/10 backdrop-blur">
      <div role="alert" className="mx-auto flex w-full max-w-screen-md items-start gap-3 px-4 py-3">
        <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="grid flex-1 gap-0.5 text-sm">
          <p className="font-semibold text-destructive">
            {alert.name} is at {utilisationPercent(current)}% of capacity
          </p>
          <p className="text-foreground/80">
            {formatCount(current.occupancy)} of {formatCount(current.capacity)} places are taken. District officials
            are notified too.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-2 shrink-0"
          aria-label="Dismiss capacity alert"
          onClick={dismissCapacityAlert}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
