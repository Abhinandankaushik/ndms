'use client';

import type { LatLngTuple } from 'leaflet';
import { useMemo } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import { AccuracyCircle } from '@/components/map/AccuracyCircle';
import { DistrictOutline } from '@/components/map/DistrictOutline';
import { IncidentMarker } from '@/components/map/IncidentMarker';
import type { LatLon, MapMarker } from '@/lib/api/types';
import { pinIcon } from '../map/govt-map-icons';

export function IncidentLocationLayers({
  incident,
  accuracyM,
}: {
  incident: Pick<MapMarker, 'id' | 'type' | 'status' | 'isSos' | 'lat' | 'lon'>;
  accuracyM: number | null;
}) {
  return (
    <>
      <DistrictOutline fitBounds={false} />
      <AccuracyCircle lat={incident.lat} lon={incident.lon} accuracyM={accuracyM} showPosition={false} />
      <IncidentMarker incident={incident} />
    </>
  );
}

export function PinPickerLayers({
  pin,
  onPick,
  frameDistrict,
}: {
  pin: LatLon | null;
  onPick: (pin: LatLon) => void;
  frameDistrict: boolean;
}) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lon: event.latlng.lng }),
  });
  const position = useMemo<LatLngTuple | null>(() => (pin ? [pin.lat, pin.lon] : null), [pin]);

  return (
    <>
      <DistrictOutline fitBounds={frameDistrict} />
      {position && <Marker position={position} icon={pinIcon} interactive={false} keyboard={false} />}
    </>
  );
}
