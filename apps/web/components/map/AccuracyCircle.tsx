'use client';

import type { LatLngTuple, PathOptions } from 'leaflet';
import { useMemo } from 'react';
import { Circle, CircleMarker } from 'react-leaflet';

const ACCURACY_STYLE: PathOptions = { color: '#2563eb', weight: 1, opacity: 0.6, fillColor: '#3b82f6', fillOpacity: 0.12 };
const POSITION_STYLE: PathOptions = { color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 };

export interface AccuracyCircleProps {
  lat: number;
  lon: number;
  /** Radius of the fix's uncertainty in metres; nothing is drawn around the point when it is unknown. */
  accuracyM: number | null | undefined;
  showPosition?: boolean;
}

export function AccuracyCircle({ lat, lon, accuracyM, showPosition = true }: AccuracyCircleProps) {
  const center = useMemo<LatLngTuple>(() => [lat, lon], [lat, lon]);

  return (
    <>
      {accuracyM != null && accuracyM > 0 && (
        <Circle center={center} radius={accuracyM} pathOptions={ACCURACY_STYLE} interactive={false} />
      )}
      {showPosition && <CircleMarker center={center} radius={7} pathOptions={POSITION_STYLE} interactive={false} />}
    </>
  );
}
