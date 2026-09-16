'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPinned, MapPinOff, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { describeApiError } from '@/components/citizen/common/api-errors';
import { formatAccuracy, formatDistance } from '@/components/citizen/common/format';
import { Panel } from '@/components/citizen/common/page';
import { APPROXIMATE_ACCURACY_M } from '@/components/citizen/location/LocationField';
import { PinPickerSheet } from '@/components/citizen/location/PinPickerSheet';
import { PointMap } from '@/components/citizen/location/PointMap';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { updateIncidentDetails } from '@/lib/api/endpoints/incidents';
import { queryKeys } from '@/lib/api/query-keys';
import type { Incident, IncidentDetail, LatLon } from '@/lib/api/types';

export function IncidentLocationCard({ incident, canEdit }: { incident: IncidentDetail; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [isPinSheetOpen, setPinSheetOpen] = useState(false);
  const point = pointOf(incident);

  const savePin = useMutation({
    mutationFn: (manualPin: LatLon) => updateIncidentDetails(incident.id, { manualPin }),
    onSuccess: (updated) => {
      queryClient.setQueryData<IncidentDetail>(
        queryKeys.incidents.detail(incident.id),
        (current) => current && { ...updated, timeline: current.timeline },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.mine });
      setPinSheetOpen(false);
      toast({ title: 'Location sent', description: 'Responders now see the place you marked.', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Location not sent', description: describeApiError(error), variant: 'destructive' });
    },
  });

  const gpsAccuracyM = incident.locationSource === 'GPS' ? incident.accuracyM : null;
  const isApproximate = gpsAccuracyM !== null && gpsAccuracyM > APPROXIMATE_ACCURACY_M;

  return (
    <Panel title="Location">
      {point ? (
        <>
          <p className="text-base">{describeLocation(incident)}</p>
          {isApproximate && canEdit && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle className="line-clamp-none text-base">This location is approximate</AlertTitle>
              <AlertDescription className="text-base">
                Responders may have to search up to {formatDistance(gpsAccuracyM)} around this point. Mark the exact
                spot if you can.
              </AlertDescription>
            </Alert>
          )}
          <PointMap lat={point.lat} lon={point.lon} accuracyM={gpsAccuracyM} className="h-56 rounded-lg border" />
        </>
      ) : (
        <Alert variant="destructive" className="border-destructive/60">
          <MapPinOff />
          <AlertTitle className="line-clamp-none text-base">Responders do not know where this is</AlertTitle>
          <AlertDescription className="text-base text-foreground">
            {canEdit
              ? 'Your phone could not share a location. Mark the spot on the map so a team can find it.'
              : 'This report was sent without a location.'}
          </AlertDescription>
        </Alert>
      )}
      {incident.addressText && (
        <p className="text-base">
          <span className="font-semibold">Landmark: </span>
          {incident.addressText}
        </p>
      )}
      {canEdit && (
        <Button
          type="button"
          size="xl"
          variant={point ? 'outline' : 'destructive'}
          className="w-full"
          onClick={() => setPinSheetOpen(true)}
        >
          <MapPinned className="size-5" />
          {point ? 'Correct the location on the map' : 'Mark the location on the map'}
        </Button>
      )}
      <PinPickerSheet
        open={isPinSheetOpen}
        onOpenChange={setPinSheetOpen}
        title="Where is help needed?"
        initialCenter={point}
        confirmLabel="Send this location"
        isConfirming={savePin.isPending}
        onConfirm={(manualPin) => savePin.mutate(manualPin)}
      />
    </Panel>
  );
}

function pointOf(incident: Incident): LatLon | null {
  return incident.lat !== null && incident.lon !== null ? { lat: incident.lat, lon: incident.lon } : null;
}

function describeLocation(incident: Incident): string {
  if (incident.locationSource === 'MANUAL_PIN') return 'Marked on the map by the reporter.';
  if (incident.accuracyM === null) return "From the phone's location. The phone did not report how accurate it is.";
  return `From the phone's location, accurate to about ${formatAccuracy(incident.accuracyM)}.`;
}
