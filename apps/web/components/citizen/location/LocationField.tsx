'use client';

import { LoaderCircle, LocateFixed, MapPin, MapPinned, MapPinOff, TriangleAlert } from 'lucide-react';
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatAccuracy } from '@/components/citizen/common/format';
import { cn } from '@/lib/utils';
import type { DeviceFix } from './geolocation';
import { PinPickerSheet } from './PinPickerSheet';
import { useDeviceFix } from './use-device-fix';

export type ChosenLocation =
  | { source: 'GPS'; lat: number; lon: number; accuracyM: number | null }
  | { source: 'MANUAL_PIN'; lat: number; lon: number };

// Beyond this the circle responders search is wide enough that a map pin is usually more useful.
export const APPROXIMATE_ACCURACY_M = 150;

export interface LocationFieldProps {
  value: ChosenLocation | null;
  onChange: (value: ChosenLocation) => void;
  pinTitle: string;
  invalid?: boolean;
}

export function LocationField({ value, onChange, pinTitle, invalid = false }: LocationFieldProps) {
  const device = useDeviceFix({ locateOnMount: value === null });
  const [isPinSheetOpen, setPinSheetOpen] = useState(false);

  const adoptFix = useEffectEvent((fix: DeviceFix) => {
    if (value?.source === 'MANUAL_PIN') return;
    onChange({ source: 'GPS', lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM });
  });

  useEffect(() => {
    if (device.fix) adoptFix(device.fix);
  }, [device.fix]);

  const switchToCurrentLocation = () => {
    if (device.fix) onChange({ source: 'GPS', lat: device.fix.lat, lon: device.fix.lon, accuracyM: device.fix.accuracyM });
    device.locate();
  };

  return (
    <div className={cn('grid gap-3 rounded-lg border-2 p-3', invalid ? 'border-destructive' : 'border-input')}>
      <LocationSummary value={value} isLocating={device.isLocating} failure={device.failure?.message ?? null} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={switchToCurrentLocation} disabled={device.isLocating}>
          {device.isLocating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
          {value?.source === 'GPS' ? 'Refresh' : 'My location'}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => setPinSheetOpen(true)}>
          <MapPinned />
          {value ? 'Adjust on map' : 'Pick on map'}
        </Button>
      </div>
      <PinPickerSheet
        open={isPinSheetOpen}
        onOpenChange={setPinSheetOpen}
        title={pinTitle}
        initialCenter={value ?? device.fix}
        onConfirm={(point) => {
          onChange({ source: 'MANUAL_PIN', lat: point.lat, lon: point.lon });
          setPinSheetOpen(false);
        }}
      />
    </div>
  );
}

function LocationSummary({
  value,
  isLocating,
  failure,
}: {
  value: ChosenLocation | null;
  isLocating: boolean;
  failure: string | null;
}) {
  if (value?.source === 'MANUAL_PIN') {
    return (
      <SummaryLine icon={<MapPin className="text-red-600" />} title="Pin placed on the map">
        {value.lat.toFixed(5)}, {value.lon.toFixed(5)}
      </SummaryLine>
    );
  }

  if (value?.source === 'GPS') {
    const isApproximate = value.accuracyM !== null && value.accuracyM > APPROXIMATE_ACCURACY_M;
    return (
      <SummaryLine
        icon={isApproximate ? <TriangleAlert className="text-amber-600" /> : <LocateFixed className="text-blue-600" />}
        title={isLocating ? 'Updating your location…' : 'Using your current location'}
      >
        {value.accuracyM === null
          ? 'Your phone did not say how accurate this is.'
          : isApproximate
            ? `Approximate, within ${formatAccuracy(value.accuracyM)}. Adjust it on the map if you can.`
            : `Accurate to about ${formatAccuracy(value.accuracyM)}.`}
      </SummaryLine>
    );
  }

  if (isLocating) {
    return (
      <SummaryLine icon={<LoaderCircle className="animate-spin" />} title="Finding your location…">
        This can take a few seconds.
      </SummaryLine>
    );
  }

  return (
    <SummaryLine icon={<MapPinOff className="text-destructive" />} title="No location yet">
      {failure ?? 'Use your location or pick the place on the map.'}
    </SummaryLine>
  );
}

function SummaryLine({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 [&_svg]:size-5">
        {icon}
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-foreground/80">{children}</p>
      </div>
    </div>
  );
}
