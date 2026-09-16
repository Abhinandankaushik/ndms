'use client';

import dynamic from 'next/dynamic';
import { BaseMap } from '@/components/map/BaseMap';
import type { MapMarker } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const IncidentLocationLayers = dynamic(
  () => import('./IncidentLocationLayers').then((module) => module.IncidentLocationLayers),
  { ssr: false },
);

const DETAIL_ZOOM = 16;

export function IncidentLocationMap({
  incident,
  accuracyM,
  className,
}: {
  incident: Pick<MapMarker, 'id' | 'type' | 'status' | 'isSos' | 'lat' | 'lon'>;
  accuracyM: number | null;
  className?: string;
}) {
  return (
    <BaseMap
      key={`${incident.id}:${incident.lat}:${incident.lon}`}
      className={cn('h-48 rounded-lg border', className)}
      center={[incident.lat, incident.lon]}
      zoom={DETAIL_ZOOM}
      scrollWheelZoom={false}
    >
      <IncidentLocationLayers incident={incident} accuracyM={accuracyM} />
    </BaseMap>
  );
}
