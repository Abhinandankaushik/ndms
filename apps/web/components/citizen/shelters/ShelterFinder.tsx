'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { List, LoaderCircle, LocateFixed, Map as MapIcon, MapPinned, Phone, RefreshCw, Tent } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { describeApiError } from '@/components/citizen/common/api-errors';
import { formatAccuracy } from '@/components/citizen/common/format';
import { useNow } from '@/components/citizen/common/hooks';
import { CitizenPage, ErrorPanel, LoadingBlocks, PageHeader } from '@/components/citizen/common/page';
import { PinPickerSheet } from '@/components/citizen/location/PinPickerSheet';
import { useDeviceFix } from '@/components/citizen/location/use-device-fix';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { findNearbyFacilities } from '@/lib/api/endpoints/facilities';
import { queryKeys } from '@/lib/api/query-keys';
import type { LatLon, NearbyFacilitiesQuery } from '@/lib/api/types';
import { ShelterCard } from './ShelterCard';
import type { ShelterMapOrigin } from './ShelterMapView';

const ShelterMap = dynamic(() => import('./ShelterMapView').then((module) => module.ShelterMapView), {
  ssr: false,
  loading: () => <Skeleton className="h-[60dvh] min-h-80 w-full rounded-xl" />,
});

const SHELTER_LIMIT = 10;
// Occupancy changes reach officials live but citizens join no facility room, so the list is re-read regularly.
const OCCUPANCY_REFRESH_MS = 60_000;
// About 11 m: small GPS jitter reuses the cached answer instead of issuing a new query.
const COORDINATE_DECIMALS = 4;

type Origin = ShelterMapOrigin & { kind: 'device' | 'chosen' };

export function ShelterFinder() {
  const device = useDeviceFix({ locateOnMount: true });
  const [chosenPlace, setChosenPlace] = useState<LatLon | null>(null);
  const [isPickerOpen, setPickerOpen] = useState(false);

  const origin: Origin | null = chosenPlace
    ? { ...chosenPlace, accuracyM: null, kind: 'chosen' }
    : device.fix
      ? { lat: device.fix.lat, lon: device.fix.lon, accuracyM: device.fix.accuracyM, kind: 'device' }
      : null;

  const returnToDeviceLocation = () => {
    setChosenPlace(null);
    device.locate();
  };

  return (
    <CitizenPage>
      <PageHeader title="Shelters near you" description="Open shelters that still have space, nearest first." />

      {origin ? (
        <OriginSummary
          origin={origin}
          isLocating={device.isLocating}
          onUseMyLocation={returnToDeviceLocation}
          onChoosePlace={() => setPickerOpen(true)}
        />
      ) : device.isLocating ? (
        <p role="status" className="flex items-center gap-2 text-base font-medium">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          Finding your location…
        </p>
      ) : (
        <Alert variant="warning">
          <MapPinned />
          <AlertTitle className="line-clamp-none text-base">We need a starting point</AlertTitle>
          <AlertDescription className="text-base">
            <p>{device.failure?.message ?? 'Your location is not available.'} You can pick a place on the map instead.</p>
            <div className="mt-2 grid w-full gap-2 min-[400px]:grid-cols-2">
              <Button type="button" size="xl" onClick={() => setPickerOpen(true)}>
                <MapPinned />
                Pick on map
              </Button>
              <Button type="button" size="xl" variant="outline" onClick={device.locate}>
                <LocateFixed />
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {origin && <NearbyShelters origin={origin} />}

      <PinPickerSheet
        open={isPickerOpen}
        onOpenChange={setPickerOpen}
        title="Find shelters near this place"
        initialCenter={origin}
        confirmLabel="Find shelters here"
        onConfirm={(point) => {
          setChosenPlace(point);
          setPickerOpen(false);
        }}
      />
    </CitizenPage>
  );
}

function OriginSummary({
  origin,
  isLocating,
  onUseMyLocation,
  onChoosePlace,
}: {
  origin: Origin;
  isLocating: boolean;
  onUseMyLocation: () => void;
  onChoosePlace: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border-2 p-3">
      <p className="text-base">
        {origin.kind === 'chosen'
          ? 'Distances are measured from the place you picked on the map.'
          : origin.accuracyM === null
            ? 'Distances are measured from your current location.'
            : `Distances are measured from your current location (${formatAccuracy(origin.accuracyM)}).`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={onUseMyLocation} disabled={isLocating}>
          {isLocating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
          {origin.kind === 'chosen' ? 'My location' : 'Refresh'}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onChoosePlace}>
          <MapPinned />
          Pick on map
        </Button>
      </div>
    </div>
  );
}

function NearbyShelters({ origin }: { origin: Origin }) {
  const now = useNow();
  const request: NearbyFacilitiesQuery = {
    lat: roundCoordinate(origin.lat),
    lon: roundCoordinate(origin.lon),
    kind: 'SHELTER',
    withSpaceOnly: true,
    limit: SHELTER_LIMIT,
  };
  const shelters = useQuery({
    queryKey: queryKeys.facilities.nearby(request),
    queryFn: ({ signal }) => findNearbyFacilities(request, { signal }),
    refetchInterval: OCCUPANCY_REFRESH_MS,
    placeholderData: keepPreviousData,
  });

  if (!shelters.data) {
    return shelters.isError ? (
      <ErrorPanel
        title="Shelters could not be loaded"
        message={describeApiError(shelters.error)}
        onRetry={() => void shelters.refetch()}
        isRetrying={shelters.isFetching}
      />
    ) : (
      <LoadingBlocks label="Looking for shelters" />
    );
  }

  if (shelters.data.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center">
        <Tent aria-hidden className="size-10 text-foreground/60" />
        <p className="text-lg font-semibold">No shelter with free space was found</p>
        <p className="text-base text-foreground/80">
          Every nearby shelter is full or closed right now. The district control room can tell you where to go.
        </p>
        <Button asChild size="xl" className="w-full">
          <Link href="/citizen/contacts">
            <Phone />
            Emergency helplines
          </Link>
        </Button>
      </div>
    );
  }

  const distanceFrom = origin.kind === 'chosen' ? 'from the pin' : 'from you';

  return (
    <Tabs defaultValue="list" className="gap-3">
      <div className="flex items-center gap-2">
        <TabsList className="grid h-11 flex-1 grid-cols-2">
          <TabsTrigger value="list" className="text-base">
            <List />
            List
          </TabsTrigger>
          <TabsTrigger value="map" className="text-base">
            <MapIcon />
            Map
          </TabsTrigger>
        </TabsList>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => void shelters.refetch()}
          disabled={shelters.isFetching}
          aria-label="Refresh shelter list"
        >
          <RefreshCw className={shelters.isFetching ? 'size-5 animate-spin' : 'size-5'} />
        </Button>
      </div>
      {shelters.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not refresh. Showing the last list NDMS sent.
        </p>
      )}
      <TabsContent value="list">
        <ul className="grid gap-3">
          {shelters.data.map((shelter) => (
            <li key={shelter.id}>
              <ShelterCard shelter={shelter} now={now} distanceFrom={distanceFrom} />
            </li>
          ))}
        </ul>
      </TabsContent>
      <TabsContent value="map">
        <ShelterMap shelters={shelters.data} origin={origin} />
      </TabsContent>
    </Tabs>
  );
}

function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}
