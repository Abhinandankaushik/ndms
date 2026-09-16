'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { BaseMap } from '@/components/map/BaseMap';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { updateIncidentDetails } from '@/lib/api/endpoints/incidents';
import type { Incident, LatLon } from '@/lib/api/types';
import { describeError } from '../lib/errors';
import { formatCoordinates } from '../lib/format';
import { locationOf } from '../lib/geo';
import { syncIncidentRecord } from '../realtime/cache-sync';

const PinPickerLayers = dynamic(() => import('./IncidentLocationLayers').then((module) => module.PinPickerLayers), {
  ssr: false,
});

const PIN_ZOOM = 16;

export function SetLocationDialog({
  incident,
  open,
  onOpenChange,
}: {
  incident: Incident;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SetLocationForm incident={incident} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function SetLocationForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const queryClient = useQueryClient();
  const current = locationOf(incident);
  const [pin, setPin] = useState<LatLon | null>(null);

  const mutation = useMutation({
    mutationFn: (manualPin: LatLon) => updateIncidentDetails(incident.id, { manualPin }),
    onSuccess: (updated) => {
      syncIncidentRecord(queryClient, updated);
      toast({ title: 'Location saved', description: 'The incident now uses the pin you placed.', variant: 'success' });
      onDone();
    },
  });

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{current ? 'Move the incident pin' : 'Set the incident location'}</DialogTitle>
        <DialogDescription>
          Click the map where the people who need help are, for example after confirming the place on a call. The pin
          replaces the reported position and is recorded as placed manually.
        </DialogDescription>
      </DialogHeader>
      <BaseMap
        className="h-80 rounded-lg border"
        center={current ? [current.lat, current.lon] : undefined}
        zoom={current ? PIN_ZOOM : undefined}
      >
        <PinPickerLayers pin={pin ?? current} onPick={setPin} frameDistrict={current === null} />
      </BaseMap>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin aria-hidden className="size-4" />
        {pin
          ? `New pin: ${formatCoordinates(pin.lat, pin.lon)}`
          : current
            ? `Current position: ${formatCoordinates(current.lat, current.lon)}`
            : 'No location yet. Click the map to place one.'}
      </p>
      {mutation.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{describeError(mutation.error)}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={() => pin && mutation.mutate(pin)} disabled={!pin || mutation.isPending}>
          {mutation.isPending && <LoaderCircle className="animate-spin" />}
          Save location
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
