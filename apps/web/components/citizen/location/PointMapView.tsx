'use client';

import type { LatLngBoundsLiteral } from 'leaflet';
import { useMemo } from 'react';
import { AccuracyCircle } from '@/components/map/AccuracyCircle';
import { BaseMap } from '@/components/map/BaseMap';

const METRES_PER_DEGREE_LATITUDE = 111_320;
const MIN_VIEW_RADIUS_M = 150;
const VIEW_MARGIN = 1.3;

export interface PointMapViewProps {
  lat: number;
  lon: number;
  accuracyM: number | null;
  className?: string;
}

export function PointMapView({ lat, lon, accuracyM, className }: PointMapViewProps) {
  const bounds = useMemo(
    () => boundsAround(lat, lon, Math.max(accuracyM ?? 0, MIN_VIEW_RADIUS_M) * VIEW_MARGIN),
    [lat, lon, accuracyM],
  );

  return (
    <BaseMap key={`${lat},${lon},${accuracyM ?? ''}`} className={className} bounds={bounds} scrollWheelZoom={false}>
      <AccuracyCircle lat={lat} lon={lon} accuracyM={accuracyM} />
    </BaseMap>
  );
}

function boundsAround(lat: number, lon: number, radiusM: number): LatLngBoundsLiteral {
  const latitudeSpan = radiusM / METRES_PER_DEGREE_LATITUDE;
  const longitudeSpan = radiusM / (METRES_PER_DEGREE_LATITUDE * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return [
    [lat - latitudeSpan, lon - longitudeSpan],
    [lat + latitudeSpan, lon + longitudeSpan],
  ];
}
