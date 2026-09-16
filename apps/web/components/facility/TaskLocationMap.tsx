'use client';

import type { LeafletEventHandlerFnMap, Marker as LeafletMarker, PathOptions } from 'leaflet';
import { useMemo } from 'react';
import { CircleMarker, Marker, Tooltip, useMapEvents } from 'react-leaflet';
import { BaseMap } from '@/components/map/BaseMap';
import { DistrictOutline } from '@/components/map/DistrictOutline';
import type { Facility, LatLon } from '@/lib/api/types';

const TASK_MAP_ZOOM = 15;
const COORDINATE_DECIMALS = 6;
const FACILITY_STYLE: PathOptions = { color: '#ffffff', weight: 3, fillColor: '#0f172a', fillOpacity: 1 };

export interface TaskLocationMapProps {
  facility: Facility;
  point: LatLon;
  onPointChange: (point: LatLon) => void;
}

const roundedPoint = (lat: number, lon: number): LatLon => ({
  lat: Number(lat.toFixed(COORDINATE_DECIMALS)),
  lon: Number(lon.toFixed(COORDINATE_DECIMALS)),
});

export function TaskLocationMap({ facility, point, onPointChange }: TaskLocationMapProps) {
  const markerEvents = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      dragend: (event) => {
        const { lat, lng } = (event.target as LeafletMarker).getLatLng();
        onPointChange(roundedPoint(lat, lng));
      },
    }),
    [onPointChange],
  );

  return (
    <BaseMap className="h-72 rounded-lg border" center={[facility.lat, facility.lon]} zoom={TASK_MAP_ZOOM}>
      <DistrictOutline fitBounds={false} />
      <CircleMarker center={[facility.lat, facility.lon]} radius={8} pathOptions={FACILITY_STYLE}>
        <Tooltip direction="top">{facility.name}</Tooltip>
      </CircleMarker>
      <Marker position={[point.lat, point.lon]} draggable eventHandlers={markerEvents} />
      <MovePinOnMapClick onPick={onPointChange} />
    </BaseMap>
  );
}

function MovePinOnMapClick({ onPick }: { onPick: (point: LatLon) => void }) {
  useMapEvents({
    click: (event) => onPick(roundedPoint(event.latlng.lat, event.latlng.lng)),
  });
  return null;
}
