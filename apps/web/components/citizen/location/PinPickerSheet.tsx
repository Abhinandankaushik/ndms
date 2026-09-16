'use client';

import { Check, LoaderCircle, LocateFixed } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { LatLon } from '@/lib/api/types';
import { useDeviceFix } from './use-device-fix';

const PinPickerMapView = dynamic(() => import('./PinPickerMapView').then((module) => module.PinPickerMapView), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});

export interface PinPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialCenter: LatLon | null;
  confirmLabel?: string;
  isConfirming?: boolean;
  onConfirm: (point: LatLon) => void;
}

export function PinPickerSheet({ open, onOpenChange, ...body }: PinPickerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto h-[92dvh] max-w-screen-sm gap-0 rounded-t-xl p-0">
        <PinPickerBody {...body} onCancel={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

type PinPickerBodyProps = Omit<PinPickerSheetProps, 'open' | 'onOpenChange'> & { onCancel: () => void };

// Mounted only while the sheet is open, so every opening starts from the caller's initial centre.
function PinPickerBody({
  title,
  initialCenter,
  confirmLabel = 'Use this location',
  isConfirming = false,
  onConfirm,
  onCancel,
}: PinPickerBodyProps) {
  const [center, setCenter] = useState<LatLon | null>(initialCenter);
  const device = useDeviceFix();

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="text-lg">{title}</SheetTitle>
        <SheetDescription className="text-base text-foreground/80">
          Drag the map until the red pin sits on the spot.
        </SheetDescription>
      </SheetHeader>
      <div className="relative min-h-0 flex-1">
        <PinPickerMapView initialCenter={initialCenter} fix={device.fix} onCenterChange={setCenter} />
        <Button
          type="button"
          variant="outline"
          className="absolute top-3 right-3 z-10 h-11 bg-background shadow-md"
          onClick={device.locate}
          disabled={device.isLocating}
        >
          {device.isLocating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
          Find me
        </Button>
      </div>
      <div className="grid gap-2 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {device.failure && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {device.failure.message}
          </p>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button type="button" size="xl" variant="outline" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            type="button"
            size="xl"
            disabled={!center || isConfirming}
            onClick={() => {
              if (center) onConfirm(center);
            }}
          >
            {isConfirming ? <LoaderCircle className="animate-spin" /> : <Check />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
